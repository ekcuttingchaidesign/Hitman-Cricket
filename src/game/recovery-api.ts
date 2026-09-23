import { API } from './board-api';

/**
 * Asking the store to bring a record back, and to replace a key.
 *
 * Nothing here decides anything. Whether a key is right is a question only the
 * store can answer — it keeps a salted hash, and a check this file could run
 * would be a check anybody could run offline as often as they liked. So every
 * function below carries a name and a key to the endpoint and reads out what
 * comes back, in the words the endpoint chose, because those words are already
 * written for the player.
 */

const TIMEOUT_MS = 8000;

export interface RestoreResult {
  ok: boolean;
  /** The player this browser should become, on success. */
  playerId?: string;
  /** Why not, in words the player can act on. */
  reason?: string;
}

/** A name and a key, offered for the record they open. */
export async function restoreRecord(name: string, key: string): Promise<RestoreResult> {
  const answer = await ask<{ playerId?: string; error?: string }>(`${API}/api/restore`, {
    name, key,
  });
  if (!answer) return { ok: false, reason: 'That could not be checked. Try again in a minute.' };
  if (answer.error || !answer.playerId) {
    return { ok: false, reason: answer.error ?? 'That did not go through.' };
  }
  return { ok: true, playerId: answer.playerId };
}

/** A fresh key for a name this browser already holds the player id for. */
export async function newCareerKey(name: string, playerId: string): Promise<
{ ok: boolean; key?: string; reason?: string }> {
  const answer = await ask<{ key?: string; error?: string }>(`${API}/api/restore?new=1`, {
    name, playerId,
  });
  if (!answer) return { ok: false, reason: 'That could not be done. Try again in a minute.' };
  if (answer.error || !answer.key) return { ok: false, reason: answer.error ?? 'That did not go through.' };
  return { ok: true, key: answer.key };
}

/**
 * One request, with a timeout and no way to throw — the same shape the board
 * uses, and for the same reason: a rejected fetch, a timeout and a body that is
 * not JSON all mean the same thing to the caller. A body carrying `error` comes
 * back whatever the status, because those words are the answer.
 */
async function ask<T>(url: string, body: unknown): Promise<T | null> {
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: stop.signal,
    });
    const answer = await response.json().catch(() => null);
    if (response.ok) return answer as T;
    return answer && typeof answer === 'object' && 'error' in answer ? answer as T : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
