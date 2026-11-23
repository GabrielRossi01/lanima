import { expect } from "@playwright/test";
import { localSupabaseEnv } from "./local-supabase";

interface MailpitMessage {
  ID: string;
  Subject: string;
  HTML: string;
  Text: string;
}

/**
 * Waits for the newest e-mail sent to `to` by the local Supabase (Mailpit). Polling is how e-mail
 * delivery works; the wait is bounded and fails with a clear message.
 */
export async function latestEmailTo(to: string, after = 0): Promise<MailpitMessage> {
  const { mailpitUrl } = localSupabaseEnv();
  let found: { ID: string; Created: string } | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
        const body = (await res.json()) as { messages: { ID: string; Created: string }[] };
        found = body.messages.find((m) => Date.parse(m.Created) >= after);
        return Boolean(found);
      },
      { message: `e-mail para ${to}`, timeout: 15_000 },
    )
    .toBe(true);
  const res = await fetch(`${mailpitUrl}/api/v1/message/${found!.ID}`);
  return (await res.json()) as MailpitMessage;
}

export function codeFrom(message: MailpitMessage): string {
  const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
  if (!code) throw new Error(`Código não encontrado no e-mail: ${message.Text}`);
  return code;
}

export function magicLinkFrom(message: MailpitMessage): URL {
  const href = /href="([^"]*\/callback\?token_hash=[^"]+)"/.exec(message.HTML)?.[1];
  if (!href) throw new Error("Link de entrada não encontrado no e-mail.");
  return new URL(href.replaceAll("&amp;", "&"));
}
