import { cleanDressing, type SavedDressing } from './dressing-sync';

/**
 * The Dressing Room, fetched from the store and sent to it. The same rules as
 * the career's calls: nothing waits on these, and a failure is an answer —
 * `undefined` for "could not ask", which is not the same as `null`, "nothing
 * kept", and must not be taken for it, or a phone offline for a moment would
 * think its player had never picked anything.
 */
const API = import.meta.env.VITE_BOARD_API ?? '';
/** Longer than the career's calls: nothing on screen waits on these, and giving up early only means asking again next load. */
const TIMEOUT_MS = 10_000;

export async function fetchSaved(playerId: string): Promise<SavedDressing | null | undefined> {
  const answer = await ask(`${API}/api/dressing?player=${encodeURIComponent(playerId)}`);
  if (!answer || 'error' in answer) return undefined;
  return answer.dressing == null ? null : cleanDressing(answer.dressing) ?? undefined;
}

/** This device's copy, sent; what the store holds now, merged, or `undefined` if it could not be sent. */
export async function sendSaved(playerId: string, dressing: SavedDressing): Promise<SavedDressing | undefined> {
  const answer = await ask(`${API}/api/dressing`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, dressing }),
  });
  if (!answer || 'error' in answer) return undefined;
  return cleanDressing(answer.dressing) ?? undefined;
}

async function ask(url: string, init: RequestInit = {}): Promise<{ dressing?: unknown; error?: string } | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: stop.signal });
    const body = await response.json().catch(() => null) as { dressing?: unknown; error?: string } | null;
    if (response.ok) return body;
    return { error: body?.error ?? String(response.status) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
