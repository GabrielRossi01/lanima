/**
 * The editor is one address for every page (?pagina=): once opened, the service worker keeps it, so
 * any page opens offline, even one created offline (app/sw.ts).
 */
export function editorHref(pageId: string): string {
  return `/caderno/editar?pagina=${encodeURIComponent(pageId)}`;
}
