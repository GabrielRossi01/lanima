"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";
import type { Database } from "@/lib/supabase/database.types";
import {
  positionAt,
  sortTopics,
  toSubject,
  type AssessmentForm,
  type AssessmentRow,
  type Subject,
  type SubjectForm,
  type TopicRow,
} from "@/lib/subjects/subjects";
import { subjectsToCreate, type SubjectDraft } from "@/lib/subjects/suggestions";

type Tables = Database["public"]["Tables"];

export const subjectsKey = (userId: string | undefined) => ["subjects", userId] as const;
export const topicsKey = (userId: string | undefined) => ["topics", userId] as const;
export const assessmentsKey = (userId: string | undefined) => ["assessments", userId] as const;

/** Throws a DataError (status + Supabase code) so screens can show the technical tag. */
function check<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}): NonNullable<T> {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

function useUserId() {
  const { user } = useAuth();
  return user?.id;
}

function requireUser(userId: string | undefined): string {
  if (!userId) throw new Error("Entre na sua conta para salvar.");
  return userId;
}

// ---------------------------------------------------------------------------------------------
// Reads. Small tables, loaded whole and kept in the persisted cache, so screens open offline.
// ---------------------------------------------------------------------------------------------

export function useSubjects() {
  const userId = useUserId();
  return useQuery({
    queryKey: subjectsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => check(await getSupabase().from("subjects").select("*").order("created_at")).map(toSubject),
  });
}

export function useTopics() {
  const userId = useUserId();
  return useQuery({
    queryKey: topicsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => check(await getSupabase().from("subject_topics").select("*")),
  });
}

export function useAssessments() {
  const userId = useUserId();
  return useQuery({
    queryKey: assessmentsKey(userId),
    enabled: Boolean(userId),
    queryFn: async () => check(await getSupabase().from("assessments").select("*").order("date")),
  });
}

// ---------------------------------------------------------------------------------------------
// Optimistic helpers: write the cache first, roll back if the server refuses, then refetch.
// ---------------------------------------------------------------------------------------------

function useOptimistic<TVars, TItem>(
  key: QueryKey,
  apply: (list: TItem[], vars: TVars) => TItem[],
  mutationFn: (vars: TVars) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onMutate: async (vars: TVars) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<TItem[]>(key);
      if (previous) queryClient.setQueryData<TItem[]>(key, apply(previous, vars));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

// ---------------------------------------------------------------------------------------------
// Subjects
// ---------------------------------------------------------------------------------------------

/** Creates the onboarding subjects, skipping names that already exist (safe to resubmit). */
export function useCreateSubjects() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (drafts: readonly SubjectDraft[]) => {
      requireUser(userId);
      const supabase = getSupabase();
      const existing = check(await supabase.from("subjects").select("name").eq("archived", false));
      const rows = subjectsToCreate(
        drafts,
        existing.map((s) => s.name),
      ).map((d) => ({ name: d.name, color: d.color, icon: d.icon }));
      if (rows.length === 0) return 0;
      check(await supabase.from("subjects").insert(rows));
      return rows.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsKey(userId) }),
  });
}

/** Creates (without id) or updates a subject; returns it. */
export function useSaveSubject() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: SubjectForm }): Promise<Subject> => {
      requireUser(userId);
      const row = {
        name: form.name,
        color: form.color,
        icon: form.icon,
        professor: form.professor || null,
        schedule_slots: form.schedule_slots.map((s) => ({ ...s, room: s.room?.trim() || undefined })),
      };
      const supabase = getSupabase();
      const saved = id
        ? check(await supabase.from("subjects").update(row).eq("id", id).select().single())
        : check(await supabase.from("subjects").insert(row).select().single());
      return toSubject(saved);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subjectsKey(userId) }),
  });
}

export function useSetArchived() {
  const userId = useUserId();
  return useOptimistic<{ id: string; archived: boolean }, Subject>(
    subjectsKey(userId),
    (list, { id, archived }) => list.map((s) => (s.id === id ? { ...s, archived } : s)),
    async ({ id, archived }) => check(await getSupabase().from("subjects").update({ archived }).eq("id", id)),
  );
}

/** Deletes a subject with its topics and assessments; its goals stay, without subject. */
export function useDeleteSubject() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => check(await getSupabase().from("subjects").delete().eq("id", id)),
    onSuccess: () =>
      Promise.all(
        [subjectsKey(userId), topicsKey(userId), assessmentsKey(userId), ["goals", userId]].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

// ---------------------------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------------------------

/** Appends topics (one or many, e.g. a pasted syllabus) after the subject's last topic. */
export function useAddTopics() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ subjectId, titles }: { subjectId: string; titles: string[] }) => {
      requireUser(userId);
      const current = sortTopics(
        (queryClient.getQueryData<TopicRow[]>(topicsKey(userId)) ?? []).filter((t) => t.subject_id === subjectId),
      );
      const last = current.at(-1)?.position ?? 0;
      const rows: Tables["subject_topics"]["Insert"][] = titles.map((title, i) => ({
        subject_id: subjectId,
        title,
        position: last + i + 1,
      }));
      return check(await getSupabase().from("subject_topics").insert(rows).select());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: topicsKey(userId) }),
  });
}

export function useUpdateTopic() {
  const userId = useUserId();
  return useOptimistic<
    { id: string; patch: Pick<Tables["subject_topics"]["Update"], "done" | "title" | "position"> },
    TopicRow
  >(
    topicsKey(userId),
    (list, { id, patch }) =>
      list.map((t) => (t.id === id ? { ...t, ...patch, updated_at: new Date().toISOString() } : t)),
    async ({ id, patch }) => check(await getSupabase().from("subject_topics").update(patch).eq("id", id)),
  );
}

/** Moves a topic to `toIndex` within its subject: writes only its new position. */
export function useMoveTopic() {
  const update = useUpdateTopic();
  return {
    ...update,
    move: (ordered: readonly TopicRow[], id: string, toIndex: number) => {
      const without = ordered.filter((t) => t.id !== id);
      update.mutate({ id, patch: { position: positionAt(without, toIndex) } });
    },
  };
}

export function useDeleteTopic() {
  const userId = useUserId();
  return useOptimistic<string, TopicRow>(
    topicsKey(userId),
    (list, id) => list.filter((t) => t.id !== id),
    async (id) => check(await getSupabase().from("subject_topics").delete().eq("id", id)),
  );
}

// ---------------------------------------------------------------------------------------------
// Assessments
// ---------------------------------------------------------------------------------------------

export function useSaveAssessment() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, subjectId, form }: { id?: string; subjectId: string; form: AssessmentForm }) => {
      requireUser(userId);
      const row = { ...form, description: form.description || null };
      const supabase = getSupabase();
      return id
        ? check(await supabase.from("assessments").update(row).eq("id", id).select().single())
        : check(
            await supabase
              .from("assessments")
              .insert({ ...row, subject_id: subjectId })
              .select()
              .single(),
          );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: assessmentsKey(userId) }),
  });
}

/** Checks an assessment as done, or unchecks it. */
export function useCompleteAssessment() {
  const userId = useUserId();
  return useOptimistic<{ id: string; completed_at: string | null }, AssessmentRow>(
    assessmentsKey(userId),
    (list, { id, completed_at }) => list.map((a) => (a.id === id ? { ...a, completed_at } : a)),
    async ({ id, completed_at }) =>
      check(await getSupabase().from("assessments").update({ completed_at }).eq("id", id)),
  );
}

export function useDeleteAssessment() {
  const userId = useUserId();
  return useOptimistic<string, AssessmentRow>(
    assessmentsKey(userId),
    (list, id) => list.filter((a) => a.id !== id),
    async (id) => check(await getSupabase().from("assessments").delete().eq("id", id)),
  );
}
