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

/**
 * The key a name never had, asked for on sight of the game.
 *
 * `ok` with no key is the ordinary answer and not a failure: it means the name
 * already has one, which cannot be shown twice and must not be replaced. The
 * caller does nothing in that case, and the widget goes on saying `lost` —
 * which is true.
 */
export async function firstCareerKey(name: string, playerId: string): Promise<string | null> {
  const answer = await ask<{ key?: string | null; error?: string }>(
    `${API}/api/restore?first=1`, { name, playerId },
  );
  return answer && !answer.error && answer.key ? answer.key : null;
}

/** One name a restore can pick, as the store lists it. */
export interface FoundPlayer {
  name: string;
  avatar: number;
  innings: number;
}

/**
 * The names that begin with what has been typed, for a player to pick
 * themselves from. Null where the store could not be asked, which the sheet
 * says differently from an empty list.
 */
export async function findPlayers(name: string): Promise<{ players: FoundPlayer[] } | { reason: string } | null> {
  const answer = await ask<{ players?: FoundPlayer[]; error?: string }>(`${API}/api/restore?find=1`, { name });
  if (!answer) return null;
  if (answer.error || !Array.isArray(answer.players)) return { reason: answer.error ?? 'That could not be searched.' };
  return { players: answer.players };
}

/** A name and a password, offered for the record they open. */
export async function restoreByPassword(name: string, password: string): Promise<RestoreResult> {
  const answer = await ask<{ playerId?: string; error?: string }>(`${API}/api/restore`, { name, password });
  if (!answer) return { ok: false, reason: 'That could not be checked. Try again in a minute.' };
  if (answer.error || !answer.playerId) return { ok: false, reason: answer.error ?? 'That did not go through.' };
  return { ok: true, playerId: answer.playerId };
}

/** A password set or changed for a name this browser holds the player id for. */
export async function setCareerPassword(name: string, playerId: string, password: string): Promise<
{ ok: boolean; reason?: string }> {
  const answer = await ask<{ ok?: boolean; error?: string }>(`${API}/api/restore?password=1`, { name, playerId, password });
  if (!answer) return { ok: false, reason: 'That could not be saved. Try again in a minute.' };
  if (answer.error || !answer.ok) return { ok: false, reason: answer.error ?? 'That did not go through.' };
  return { ok: true };
}

/** Whether this player has set a password, or null where the store could not say. */
export async function passwordStatus(name: string, playerId: string): Promise<boolean | null> {
  const answer = await ask<{ password?: boolean; error?: string }>(`${API}/api/restore?status=1`, { name, playerId });
  return answer && !answer.error && typeof answer.password === 'boolean' ? answer.password : null;
}
