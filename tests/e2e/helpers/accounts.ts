import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../../lib/supabase/database.types";
import { localSupabaseEnv } from "./local-supabase";

let admin: SupabaseClient<Database> | undefined;

/** Service client for the LOCAL stack only: creates users and checks rows, bypassing RLS. */
export function adminClient(): SupabaseClient<Database> {
  if (!admin) {
    const { url, secretKey } = localSupabaseEnv();
    admin = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}@e2e.lanima.test`;
}

export interface TestAccount {
  id: string;
  email: string;
  name: string;
}

/** A confirmed user. With `onboarded`, the profile is filled in and the onboarding is done. */
export async function createAccount(options: { prefix?: string; onboarded?: boolean; name?: string } = {}) {
  const email = uniqueEmail(options.prefix ?? "user");
  const name = options.name ?? "Maria";
  const { data, error } = await adminClient().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  if (options.onboarded ?? true) {
    const { error: profileError } = await adminClient()
      .from("profiles")
      .update({
        name,
        semester: 3,
        institution: "Universidade Exemplo",
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq("id", data.user.id);
    if (profileError) throw profileError;
  }
  return { id: data.user.id, email, name } satisfies TestAccount;
}

/**
 * Signs the page in the way a magic link does: a one-time token_hash sent to our own /callback,
 * which sets the session cookies. No e-mail round trip, so it is fast enough for every test.
 */
export async function signIn(page: Page, account: TestAccount, next = "/inicio") {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: "magiclink", email: account.email });
  if (error) throw error;
  const hash = data.properties.hashed_token;
  await page.goto(`/callback?token_hash=${hash}&type=email&proxima=${encodeURIComponent(next)}`);
  await page.waitForURL((url) => url.pathname === next);
}

type Tables = Database["public"]["Tables"];

/** Inserts rows owned by `account` (service role: the test sets user_id explicitly). */
export async function seedSubject(
  account: TestAccount,
  row: Omit<Tables["subjects"]["Insert"], "user_id">,
): Promise<Tables["subjects"]["Row"]> {
  const { data, error } = await adminClient()
    .from("subjects")
    .insert({ ...row, user_id: account.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function seedTopics(account: TestAccount, subjectId: string, titles: string[]) {
  const rows = titles.map((title, i) => ({ user_id: account.id, subject_id: subjectId, title, position: i + 1 }));
  const { error } = await adminClient().from("subject_topics").insert(rows);
  if (error) throw error;
}

export async function seedAssessment(account: TestAccount, row: Omit<Tables["assessments"]["Insert"], "user_id">) {
  const { error } = await adminClient()
    .from("assessments")
    .insert({ ...row, user_id: account.id });
  if (error) throw error;
}

export async function seedGoal(account: TestAccount, row: Omit<Tables["goals"]["Insert"], "user_id">) {
  const { error } = await adminClient()
    .from("goals")
    .insert({ ...row, user_id: account.id });
  if (error) throw error;
}
