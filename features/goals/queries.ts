"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/auth-provider";
import type { IsoDate } from "@/lib/dates/calendar";
import { goalsRange, type GoalForm, type GoalRow } from "@/lib/goals/goals";
import { getSupabase } from "@/lib/supabase/client";
import { DataError } from "@/lib/supabase/errors";

/** All goals of the loaded range share this prefix, so invalidating it refreshes every range. */
export const goalsKey = (userId: string | undefined, from?: IsoDate, to?: IsoDate) =>
  (from ? ["goals", userId, from, to] : ["goals", userId]) as readonly unknown[];

function check<T>(result: {
  data: T | null;
  error: { message: string; code?: string } | null;
  status: number;
}): NonNullable<T> {
  if (result.error) throw new DataError(result.error.message, { status: result.status, code: result.error.code });
  return result.data as NonNullable<T>;
}

/** Goals from the overdue window up to the end of this week (São Paulo calendar). */
export function useGoals(today: IsoDate | null) {
  const { user } = useAuth();
  const range = today ? goalsRange(today) : null;
  return useQuery({
    queryKey: goalsKey(user?.id, range?.from, range?.to),
    enabled: Boolean(user && range),
    queryFn: async () =>
      check(
        await getSupabase()
          .from("goals")
          .select("*")
          .gte("date", range!.from)
          .lte("date", range!.to)
          .order("date")
          .order("created_at"),
      ),
  });
}

type GoalPatch = Partial<
  Pick<GoalRow, "completed_at" | "date" | "title" | "subject_id" | "duration_min" | "time_of_day">
>;

/** Optimistic patch on every cached range (checking a goal must feel instant), rolled back on error. */
export function useUpdateGoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prefix = goalsKey(user?.id);
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: GoalPatch }) =>
      check(await getSupabase().from("goals").update(patch).eq("id", id)),
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshots = queryClient.getQueriesData<GoalRow[]>({ queryKey: prefix });
      for (const [key, list] of snapshots) {
        if (list)
          queryClient.setQueryData<GoalRow[]>(
            key,
            list.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          );
      }
      return { snapshots };
    },
    onError: (_error, _vars, context) => {
      for (const [key, list] of context?.snapshots ?? []) queryClient.setQueryData(key, list);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefix }),
  });
}

export function useSaveGoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, form }: { id?: string; form: GoalForm }) => {
      if (!user) throw new Error("Entre na sua conta para salvar.");
      const supabase = getSupabase();
      return id
        ? check(await supabase.from("goals").update(form).eq("id", id).select().single())
        : check(await supabase.from("goals").insert(form).select().single());
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: goalsKey(user?.id) }),
  });
}

export function useDeleteGoal() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const prefix = goalsKey(user?.id);
  return useMutation({
    mutationFn: async (id: string) => check(await getSupabase().from("goals").delete().eq("id", id)),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshots = queryClient.getQueriesData<GoalRow[]>({ queryKey: prefix });
      for (const [key, list] of snapshots) {
        if (list)
          queryClient.setQueryData<GoalRow[]>(
            key,
            list.filter((g) => g.id !== id),
          );
      }
      return { snapshots };
    },
    onError: (_error, _id, context) => {
      for (const [key, list] of context?.snapshots ?? []) queryClient.setQueryData(key, list);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefix }),
  });
}
