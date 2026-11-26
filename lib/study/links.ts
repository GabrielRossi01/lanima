/**
 * Where "Resumir em tópicos" and "Criar teste" lead (section 7.5, starting points): Resumos e testes
 * with the new-summary sheet open, or the test wizard, with the files already chosen.
 */

export function summarizeHref(fileIds: readonly string[]): string {
  return `/estudo?${new URLSearchParams({ resumir: fileIds.join(",") }).toString()}`;
}

export function newTestHref(input: { fileIds?: readonly string[]; subjectId?: string | null }): string {
  const params = new URLSearchParams();
  if (input.subjectId) params.set("materia", input.subjectId);
  if (input.fileIds?.length) params.set("arquivo", input.fileIds.join(","));
  const query = params.toString();
  return query ? `/estudo/novo-teste?${query}` : "/estudo/novo-teste";
}

/** The ids of a "resumir" parameter: uuids only. */
export function parseIds(value: string | null): string[] {
  return (value ?? "").split(",").filter((id) => /^[0-9a-f-]{36}$/.test(id));
}
