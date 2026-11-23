import { execSync } from "node:child_process";

export interface LocalSupabaseEnv {
  url: string;
  publishableKey: string;
  secretKey: string;
  mailpitUrl: string;
}

/**
 * Settings of the local Supabase stack (`npx supabase start`). In CI they come from the
 * environment; locally they are read from `supabase status`. Never a hosted project.
 */
export function localSupabaseEnv(): LocalSupabaseEnv {
  const fromEnv = {
    url: process.env.E2E_SUPABASE_URL,
    publishableKey: process.env.E2E_SUPABASE_PUBLISHABLE_KEY,
    secretKey: process.env.E2E_SUPABASE_SECRET_KEY,
    mailpitUrl: process.env.E2E_MAILPIT_URL,
  };
  if (fromEnv.url && fromEnv.publishableKey && fromEnv.secretKey && fromEnv.mailpitUrl) {
    return fromEnv as LocalSupabaseEnv;
  }

  let output: string;
  try {
    output = execSync("npx supabase status -o env", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    throw new Error("O E2E precisa do Supabase local. Rode `npm run db:start` (com o Docker aberto) e tente de novo.");
  }
  const vars = Object.fromEntries(
    output
      .split(/\r?\n/)
      .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
      .filter((m): m is RegExpExecArray => Boolean(m))
      .map((m) => [m[1], m[2]]),
  );
  const env = {
    url: vars.API_URL,
    publishableKey: vars.PUBLISHABLE_KEY,
    secretKey: vars.SECRET_KEY,
    mailpitUrl: vars.MAILPIT_URL,
  };
  if (!env.url?.startsWith("http://127.0.0.1") || !env.publishableKey || !env.secretKey || !env.mailpitUrl) {
    throw new Error("Não consegui ler o Supabase local com `supabase status`. Ele está rodando?");
  }
  return env;
}
