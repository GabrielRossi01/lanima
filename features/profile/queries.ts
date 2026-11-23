"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { avatarExtension } from "@/lib/images/avatar";
import { toProfile, type Profile } from "@/lib/profile/profile";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";
import {
  forgetAvatarUrl,
  readCachedAvatarUrl,
  readCachedProfile,
  writeCachedAvatarUrl,
  writeCachedProfile,
} from "./cache";

export type ProfilePatch = Omit<Database["public"]["Tables"]["profiles"]["Update"], "id" | "created_at" | "updated_at">;

export const profileKey = (userId: string | undefined) => ["profile", userId] as const;

/** The signed-in user's profile. Starts from the copy saved on the device, then refreshes. */
export function useProfile() {
  const { user } = useAuth();
  const userId = user?.id;
  return useQuery({
    queryKey: profileKey(userId),
    enabled: Boolean(userId),
    queryFn: async (): Promise<Profile> => {
      const { data, error, status } = await getSupabase().from("profiles").select("*").eq("id", userId!).single();
      // Keeps the HTTP status and Supabase code ("404 · PGRST205") for the error screen.
      if (error) throw new DataError(error.message, { status, code: error.code });
      const profile = toProfile(data);
      writeCachedProfile(profile);
      return profile;
    },
    initialData: () => (userId ? readCachedProfile(userId) : undefined),
    // The cached copy counts as old, so it is refreshed right away.
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
  });
}

/** Partial update with an optimistic cache write; rolls back if the server refuses. */
export function useUpdateProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = profileKey(user?.id);
  return useMutation({
    mutationFn: async (patch: ProfilePatch): Promise<Profile> => {
      if (!user) throw new Error("Entre na sua conta para salvar.");
      const { data, error } = await getSupabase().from("profiles").update(patch).eq("id", user.id).select().single();
      if (error) throw error;
      return toProfile(data);
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Profile>(key);
      if (previous) queryClient.setQueryData<Profile>(key, { ...previous, ...patch } as Profile);
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: (profile) => {
      writeCachedProfile(profile);
      queryClient.setQueryData(key, profile);
    },
  });
}

const SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;

/** Signed URL for a photo in the private "avatars" bucket, reused while it is valid. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar-url", path],
    enabled: Boolean(path),
    queryFn: async () => {
      const { data, error } = await getSupabase().storage.from("avatars").createSignedUrl(path!, SIGNED_URL_SECONDS);
      if (error) throw error;
      // Refresh a day before it expires.
      writeCachedAvatarUrl(path!, data.signedUrl, Date.now() + (SIGNED_URL_SECONDS - 86_400) * 1000);
      return data.signedUrl;
    },
    initialData: () => (path ? readCachedAvatarUrl(path) : undefined),
    staleTime: (SIGNED_URL_SECONDS - 86_400) * 1000,
    retry: false,
  });
}

/** Uploads a new photo (already cropped and compressed), points the profile to it, removes the old one. */
export function useUploadAvatar() {
  const { user } = useAuth();
  const update = useUpdateProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (blob: Blob) => {
      if (!user) throw new Error("Entre na sua conta para trocar a foto.");
      const previous = queryClient.getQueryData<Profile>(profileKey(user.id))?.avatar_path ?? null;
      // A new name each time, so no cache (browser, service worker, CDN) shows the old photo.
      const path = `${user.id}/avatar-${Date.now()}.${avatarExtension(blob)}`;
      const storage = getSupabase().storage.from("avatars");
      const { error } = await storage.upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
      if (error) throw error;
      await update.mutateAsync({ avatar_path: path });
      if (previous && previous !== path) {
        forgetAvatarUrl(previous);
        // Best effort: an orphaned old photo only costs a few KB.
        void storage.remove([previous]);
      }
      return path;
    },
  });
}
