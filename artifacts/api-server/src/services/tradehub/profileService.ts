import {
  getUserById,
  getPublicUserById,
  getProfileByUserId,
  updateProfile,
  insertProfile,
  listPublicPostsByUser,
  updateProfileVoiceIntro,
  clearProfileVoiceIntro as clearProfileVoiceIntroRepo,
} from "../../repositories/tradehub";

export async function getPublicProfile(userId: number) {
  const [profile, user, posts] = await Promise.all([
    getProfileByUserId(userId),
    getPublicUserById(userId),
    listPublicPostsByUser(userId, 10),
  ]);

  if (!user) return null;

  if (profile) {
    return { ...profile, user, recentPosts: posts };
  }

  // Synthetic minimal profile for users who haven't set up their TradeHub profile yet
  return {
    id: null,
    userId,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "TradeHub User",
    trade: null,
    location: null,
    province: null,
    bio: null,
    website: null,
    avatarUrl: null,
    isVerified: false,
    memberSince: user.createdAt ?? null,
    createdAt: user.createdAt ?? null,
    updatedAt: null,
    user,
    recentPosts: posts,
  };
}

export async function upsertProfile(
  userId: number,
  companyId: number | null,
  data: {
    displayName: string;
    trade?: string;
    location?: string;
    province?: string;
    bio?: string;
    website?: string;
    avatarUrl?: string;
  },
) {
  const existing = await getProfileByUserId(userId);

  const fields = {
    displayName: data.displayName.trim(),
    trade: data.trade ?? null,
    location: data.location ?? null,
    province: data.province ?? null,
    bio: data.bio ?? null,
    website: data.website ?? null,
    avatarUrl: data.avatarUrl ?? null,
  };

  if (existing) {
    return updateProfile(userId, fields);
  }
  return insertProfile({ userId, companyId, ...fields, complianceStatus: "compliant" });
}

export async function saveVoiceIntro(
  userId: number,
  companyId: number | null,
  objectPath: string,
  duration: number | undefined,
) {
  // Build a serve URL from the objectPath (e.g. /objects/uploads/uuid)
  const voiceIntroUrl = objectPath.startsWith("/objects/")
    ? `/api/storage${objectPath}`
    : objectPath;

  const existing = await getProfileByUserId(userId);

  if (existing) {
    return updateProfileVoiceIntro(userId, {
      voiceIntroUrl,
      voiceIntroObjectPath: objectPath,
      voiceIntroDuration: duration ?? null,
    });
  }

  // Create a minimal profile if none exists yet
  const user = await getUserById(userId);
  return insertProfile({
    userId,
    companyId,
    displayName: `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "TradeHub User",
    voiceIntroUrl,
    voiceIntroObjectPath: objectPath,
    voiceIntroDuration: duration ?? null,
  });
}

export async function clearVoiceIntro(userId: number): Promise<void> {
  await clearProfileVoiceIntroRepo(userId);
}
