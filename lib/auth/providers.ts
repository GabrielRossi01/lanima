/** Social sign-in, through Supabase Auth. The keys are Supabase's provider names. */
export const SOCIAL_PROVIDERS = ["google", "notion"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<SocialProvider, string> = { google: "Google", notion: "Notion" };

/** Extra parameters Supabase passes on to the provider's authorization page. */
export const PROVIDER_PARAMS: Record<SocialProvider, Record<string, string>> = {
  // Always ask which account: on a shared tablet, the last one isn't necessarily hers.
  google: { prompt: "select_account" },
  // Notion documents it as required; Supabase doesn't send it.
  notion: { owner: "user" },
};

export function isSocialProvider(value: string | null | undefined): value is SocialProvider {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(value ?? "");
}

/**
 * Buttons to show, from NEXT_PUBLIC_AUTH_PROVIDERS ("google,notion"): only providers already set up
 * in Supabase, because a disabled one answers with a raw JSON page.
 */
export function enabledProviders(raw: string | undefined): SocialProvider[] {
  const wanted = new Set((raw ?? "").split(",").map((p) => p.trim().toLowerCase()));
  return SOCIAL_PROVIDERS.filter((p) => wanted.has(p));
}
