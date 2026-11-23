"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

let client: SupabaseClient<Database> | undefined;

/** Browser client. The session lives in cookies, so the proxy and route handlers see it too. */
export function getSupabase(): SupabaseClient<Database> {
  if (!client) {
    const { url, key } = supabaseEnv();
    client = createBrowserClient<Database>(url, key);
  }
  return client;
}
