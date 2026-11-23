import type { Profile } from "@/lib/profile/profile";

/**
 * Last known profile and avatar URL, kept on the device so the sidebar, the greeting and the
 * routing decision work offline and without a loading flash.
 */
const profileKey = (userId: string) => `lanima:profile:${userId}`;
const avatarKey = (path: string) => `lanima:avatar-url:${path}`;

export function readCachedProfile(userId: string): Profile | undefined {
  try {
    const raw = localStorage.getItem(profileKey(userId));
    return raw ? (JSON.parse(raw) as Profile) : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedProfile(profile: Profile) {
  try {
    localStorage.setItem(profileKey(profile.id), JSON.stringify(profile));
  } catch {
    // Storage full or blocked: the profile simply loads from the network next time.
  }
}

export function clearProfileCache(userId: string) {
  try {
    const profile = readCachedProfile(userId);
    if (profile?.avatar_path) localStorage.removeItem(avatarKey(profile.avatar_path));
    localStorage.removeItem(profileKey(userId));
  } catch {
    // Nothing to clear.
  }
}

interface CachedUrl {
  url: string;
  expiresAt: number;
}

export function readCachedAvatarUrl(path: string): string | undefined {
  try {
    const raw = localStorage.getItem(avatarKey(path));
    const cached = raw ? (JSON.parse(raw) as CachedUrl) : null;
    return cached && cached.expiresAt > Date.now() ? cached.url : undefined;
  } catch {
    return undefined;
  }
}

export function writeCachedAvatarUrl(path: string, url: string, expiresAt: number) {
  try {
    localStorage.setItem(avatarKey(path), JSON.stringify({ url, expiresAt } satisfies CachedUrl));
  } catch {
    // Ignore: a new signed URL is requested next time.
  }
}

export function forgetAvatarUrl(path: string) {
  try {
    localStorage.removeItem(avatarKey(path));
  } catch {
    // Ignore.
  }
}
