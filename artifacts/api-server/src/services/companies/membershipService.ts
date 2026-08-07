import {
  removeMemberCascade,
  updateMemberRole as updateMemberRoleRepo,
  getUserById,
  getMembership,
  updateMemberName as updateMemberNameRepo,
  getMemberPermissions as getMemberPermissionsRepo,
  updateMemberPermissions as updateMemberPermissionsRepo,
} from "../../repositories/companies";
import { invalidateAuthCache } from "../../lib/auth";

export async function removeMember(companyId: number, targetUserId: number): Promise<void> {
  const user = await getUserById(targetUserId);
  await removeMemberCascade(companyId, targetUserId);
  if (user) invalidateAuthCache(user.clerkUserId);
}

export async function updateMemberRole(companyId: number, targetUserId: number, role: string) {
  await updateMemberRoleRepo(companyId, targetUserId, role);
  const user = await getUserById(targetUserId);
  if (user) invalidateAuthCache(user.clerkUserId);
  return user;
}

export async function renameMember(
  companyId: number,
  targetUserId: number,
  firstName: string,
  lastName: string,
) {
  const membership = await getMembership(companyId, targetUserId);
  if (!membership) return null;
  const updated = await updateMemberNameRepo(targetUserId, firstName, lastName);
  return updated ?? null;
}

export async function getMemberPermissions(companyId: number, targetUserId: number) {
  return getMemberPermissionsRepo(companyId, targetUserId);
}

export async function updateMemberPermissions(
  companyId: number,
  targetUserId: number,
  permissions: Record<string, unknown>,
) {
  const membership = await getMemberPermissions(companyId, targetUserId);
  if (!membership) return null;
  const updated = await updateMemberPermissionsRepo(companyId, targetUserId, permissions);
  const user = await getUserById(targetUserId);
  if (user) invalidateAuthCache(user.clerkUserId);
  return updated?.permissions ?? {};
}
