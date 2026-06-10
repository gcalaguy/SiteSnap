import { File } from "@google-cloud/storage";
import { db, userMembershipsTable } from "@workspace/db";
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
}

interface ObjectAccessGroup {
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

function createObjectAccessGroup(
  group: ObjectAccessGroup,
): BaseObjectAccessGroup {
  switch (group.type) {
    case ObjectAccessGroupType.COMPANY_MEMBER:
      return new CompanyMemberAccessGroup(group.id);
    default:
      throw new Error(`Unknown access group type: ${group.type}`);
  }
}

export { ObjectAccessGroupType };

export async function setObjectAclPolicy(
  objectFile: File,
  aclPolicy: ObjectAclPolicy,
): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) {
    throw new Error(`Object not found: ${objectFile.name}`);
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
