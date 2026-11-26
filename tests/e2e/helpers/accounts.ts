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

/**
 * A file whose text was already read (phase 5), ready for summaries and tests: one chunk per page.
 * No stored object: opening the file itself is covered by files.spec.
 */
export async function seedReading(
  account: TestAccount,
  input: { name: string; subjectId?: string | null; pages: string[] },
): Promise<{ fileId: string; documentId: string }> {
  const admin = adminClient();
  const fileId = crypto.randomUUID();
  const { error: fileError } = await admin.from("files").insert({
    id: fileId,
    user_id: account.id,
    subject_id: input.subjectId ?? null,
    name: input.name,
    kind: "pdf",
    mime_type: "application/pdf",
    size_bytes: 1000,
    storage_path: `${account.id}/${fileId}`,
    sha256: Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""),
    uploaded_at: new Date().toISOString(),
  });
  if (fileError) throw fileError;
  const hash = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { data: doc, error: docError } = await admin
    .from("documents")
    .insert({
      user_id: account.id,
      file_id: fileId,
      status: "pronto",
      content_hash: hash,
      page_count: input.pages.length,
    })
    .select("id")
    .single();
  if (docError) throw docError;
  const { error: chunkError } = await admin
    .from("document_chunks")
    .insert(
      input.pages.map((text, i) => ({ user_id: account.id, document_id: doc.id, position: i, page: i + 1, text })),
    );
  if (chunkError) throw chunkError;
  return { fileId, documentId: doc.id };
}

/** Generations already made today, to reach her daily limit. */
export async function seedAiUsage(account: TestAccount, operation: "resumo" | "questoes", count: number) {
  const now = new Date();
  const day = (timeZone: string) => now.toLocaleDateString("en-CA", { timeZone });
  const rows = Array.from({ length: count }, () => ({
    user_id: account.id,
    day: day("America/Sao_Paulo"),
    app_day: day("America/Los_Angeles"),
    operation,
    status: "ok",
    requests: 0,
  }));
  const { error } = await adminClient().from("ai_usage").insert(rows);
  if (error) throw error;
}

/** Summaries and tests made by the E2E would reach the whole app's daily cap on a busy day. */
export async function liftAppAiCap() {
  const { error } = await adminClient().from("ai_limits").update({ app_daily_requests: 100000 }).eq("id", true);
  if (error) throw error;
}
