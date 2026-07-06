import { File } from "@google-cloud/storage";
import { db, userMembershipsTable, projectMembersTable, rfisTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

// Can be flexibly defined according to the use case.
//
// Examples:
// - COMPANY_MEMBER: any active member of a company;
// - USER_LIST: the users from a list stored in the database;
// - EMAIL_DOMAIN: the users whose email is in a specific domain;
// - GROUP_MEMBER: the users who are members of a specific group;
// - SUBSCRIBER: the users who are subscribers of a specific service / content
//   creator.
enum ObjectAccessGroupType {
  COMPANY_MEMBER = "COMPANY_MEMBER",
  PROJECT_MEMBER = "PROJECT_MEMBER",
}

export interface ObjectAccessGroup {
  type: ObjectAccessGroupType;
  // The logic id that identifies qualified group members. Format depends on the
  // ObjectAccessGroupType — e.g. a company id, a user-list DB id, an email domain.
  id: string;
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclRule {
  group: ObjectAccessGroup;
  permission: ObjectPermission;
}

// Stored as object custom metadata under "custom:aclPolicy" (JSON string).
export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
  aclRules?: Array<ObjectAclRule>;
}

function isPermissionAllowed(
  requested: ObjectPermission,
  granted: ObjectPermission,
): boolean {
  if (requested === ObjectPermission.READ) {
    return [ObjectPermission.READ, ObjectPermission.WRITE].includes(granted);
  }
  return granted === ObjectPermission.WRITE;
}

abstract class BaseObjectAccessGroup implements ObjectAccessGroup {
  constructor(
    public readonly type: ObjectAccessGroupType,
    public readonly id: string,
  ) {}

  public abstract hasMember(userId: string): Promise<boolean>;
}

class CompanyMemberAccessGroup extends BaseObjectAccessGroup {
  constructor(companyId: string) {
    super(ObjectAccessGroupType.COMPANY_MEMBER, companyId);
  }

  async hasMember(userId: string): Promise<boolean> {
    const [membership] = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, parseInt(userId, 10)),
          eq(userMembershipsTable.companyId, parseInt(this.id, 10)),
          eq(userMembershipsTable.isActive, true),
        ),
      )
      .limit(1);
    return !!membership;
  }
}

class ProjectMemberAccessGroup extends BaseObjectAccessGroup {
  constructor(projectId: string) {
    super(ObjectAccessGroupType.PROJECT_MEMBER, projectId);
  }

  async hasMember(userId: string): Promise<boolean> {
    const [assignment] = await db
      .select({ userId: projectMembersTable.userId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.userId, parseInt(userId, 10)),
          eq(projectMembersTable.projectId, parseInt(this.id, 10)),
        ),
      )
      .limit(1);
    return !!assignment;
  }
}

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    case ObjectAccessGroupType.COMPANY_MEMBER:
      return new CompanyMemberAccessGroup(group.id);
    case ObjectAccessGroupType.PROJECT_MEMBER:
      return new ProjectMemberAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

/**
 * Reusable membership check against an access group. Lets API routes apply the
 * same group semantics used for object-storage ACLs (e.g. PROJECT_MEMBER) to
 * database-row authorization, so file access and row access never diverge.
 */
export async function isUserInAccessGroup(
  group: ObjectAccessGroup,
  userId: string,
): Promise<boolean> {
  return createObjectAccessGroup(group).hasMember(userId);
}

export { ObjectAccessGroupType };

/**
 * RFI-specific access check for the standalone workflow endpoints.
 *
 * Rules (evaluated in order — first match wins):
 *  - super_admin:  always allowed
 *  - owner role:   allowed for any RFI that belongs to their company
 *  - foreman role: allowed only when they are a member of the project
 *  - architect:    a user assigned to at least one RFI within the project
 *                  (identified by assignedToUserId, regardless of membership role)
 *
 * Returns true when access is granted.
 */
export async function checkRfiAccess({
  userId,
  companyId,
  projectId,
  role,
  systemRole,
}: {
  userId: number;
  companyId: number;
  projectId: number;
  role: "owner" | "foreman" | "worker" | undefined;
  systemRole?: string | null;
}): Promise<boolean> {
  if (systemRole === "super_admin") return true;

  if (role === "owner") {
    // Owners see all RFIs across their company — verify company membership only
    const [membership] = await db
      .select({ userId: userMembershipsTable.userId })
      .from(userMembershipsTable)
      .where(
        and(
          eq(userMembershipsTable.userId, userId),
          eq(userMembershipsTable.companyId, companyId),
          eq(userMembershipsTable.isActive, true),
        ),
      )
      .limit(1);
    return !!membership;
  }

  if (role === "foreman") {
    // Foremen may only access projects they are assigned to
    const [assignment] = await db
      .select({ userId: projectMembersTable.userId })
      .from(projectMembersTable)
      .where(
        and(
          eq(projectMembersTable.userId, userId),
          eq(projectMembersTable.projectId, projectId),
        ),
      )
      .limit(1);
    return !!assignment;
  }

  // Architect / worker: allowed when the user is assigned to at least one RFI
  // in the project (assignedToUserId matches). This lets external architects
  // view the project feed without requiring a company membership role.
  const [assignedRfi] = await db
    .select({ id: rfisTable.id })
    .from(rfisTable)
    .where(
      and(
        eq(rfisTable.projectId, projectId),
        eq(rfisTable.assignedToUserId, userId),
      ),
    )
    .limit(1);
  return !!assignedRfi;
}

/**
 * Sets the ACL policy on an object. First-write-wins: if the object already
 * carries a policy owned by someone else, the write is rejected rather than
 * silently reassigning ownership. Without this, any route that trusts a
 * client-supplied object path (e.g. to attach it to a new record) would let
 * an attacker hand over an existing object path belonging to another tenant
 * and hijack its ACL to grant themselves access.
 */
export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
  }

  const existingPolicy = await getObjectAclPolicy(objectFile);
  if (existingPolicy && existingPolicy.owner !== aclPolicy.owner) {
    throw new Error(
      `Object ${objectFile.name} already has an ACL policy owned by a different owner`,
    );
  }

  await objectFile.setMetadata({
    metadata: {
      [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy),
    },
  });
}

export async function getObjectAclPolicy(
  objectFile: File,
): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!aclPolicy) {
    return null;
  }
  return JSON.parse(aclPolicy as string);
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}): Promise<boolean> {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) {
    return false;
  }

  if (
    aclPolicy.visibility === "public" &&
    requestedPermission === ObjectPermission.READ
  ) {
    return true;
  }

  if (!userId) {
    return false;
  }

  if (aclPolicy.owner === userId) {
    return true;
  }

  for (const rule of aclPolicy.aclRules || []) {
    const accessGroup = createObjectAccessGroup(rule.group);
    if (
      (await accessGroup.hasMember(userId)) &&
      isPermissionAllowed(requestedPermission, rule.permission)
    ) {
      return true;
    }
  }

  return false;
}
