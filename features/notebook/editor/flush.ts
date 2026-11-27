/**
 * The open editor saves 500 ms after the last change. Actions that read the page from the device
 * ("Usar no resumo", PDF, share) ask it to save what waits first.
 */
const flushers = new Map<string, () => Promise<void>>();

export function registerFlush(pageId: string, flush: () => Promise<void>): () => void {
  flushers.set(pageId, flush);
  return () => {
    if (flushers.get(pageId) === flush) flushers.delete(pageId);
  };
}

export async function flushPage(pageId: string): Promise<void> {
  await flushers.get(pageId)?.();
}
