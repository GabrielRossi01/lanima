"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { getSupabase } from "@/lib/supabase/client";
import { subjectsToCreate, type SubjectDraft } from "@/lib/subjects/suggestions";

export const subjectsKey = (userId: string | undefined) => ["subjects", userId] as const;

/** Creates the chosen subjects, skipping names she already has (safe to resubmit). */
export function useCreateSubjects() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: readonly SubjectDraft[]) => {
      if (!user) throw new Error("Entre na sua conta para salvar.");
      const supabase = getSupabase();
      const { data: existing, error: readError } = await supabase.from("subjects").select("name").eq("archived", false);
      if (readError) throw readError;
      const rows = subjectsToCreate(
        drafts,
        existing.map((s) => s.name),
      ).map((d) => ({ name: d.name, color: d.color, icon: d.icon }));
      if (rows.length === 0) return 0;
      const { error } = await supabase.from("subjects").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsKey(user?.id) }),
  });
}
