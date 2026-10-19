import type { OwnActivity, PostExtras, ProfilePayload } from '../server/profile-endpoint';

/**
 * The browser's side of `/api/profile`: somebody's profile by the handle their
 * row carries, and this player's own activity.
 *
 * The answer shapes are the store's own types, imported as types and nothing
 * else, so the two sides cannot drift: an edit to what the store sends is a
 * compile error here rather than a blank tile on a phone.
 */

export type { OwnActivity, PostExtras, ProfilePayload };

const API = import.meta.env.VITE_BOARD_API ?? '';
/** How long a profile gets before the sheet says it could not be reached. */
const TIMEOUT_MS = 5000;
/** A profile opened twice in a minute is the same profile: the second one is drawn at once. */
const FRESH_MS = 60_000;

const cached = new Map<string, { at: number; payload: ProfilePayload }>();

/** A profile already fetched in the last minute, for drawing at once while it is asked again. */
export function cachedProfile(handle: string): ProfilePayload | null {
  const held = cached.get(handle);
  return held && Date.now() - held.at < FRESH_MS ? held.payload : null;
}

/**
 * Somebody's profile. `viewer` is this browser's own handle, so the look is
 * counted for them once today; null for a player with no name, whose look is
 * counted for nobody. Rejects when the store cannot be reached, and answers
 * null when it says nobody bats under that handle.
 */
export async function fetchProfile(handle: string, viewer: string | null): Promise<ProfilePayload | null> {
  const query = new URLSearchParams({ handle });
  if (viewer) query.set('viewer', viewer);
  const response = await timed(`${API}/api/profile?${query}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The profile answered ${response.status}.`);
  const payload = await response.json() as ProfilePayload;
  cached.set(handle, { at: Date.now(), payload });
  if (cached.size > 60) cached.delete(cached.keys().next().value!);
  return payload;
}

/** This player's own activity: views this week, who chased and passed them, their bio. */
export async function fetchActivity(playerId: string): Promise<OwnActivity> {
  const response = await timed(`${API}/api/profile?${new URLSearchParams({ player: playerId })}`);
  if (!response.ok) throw new Error(`The activity answered ${response.status}.`);
  return await response.json() as OwnActivity;
}

/** A bio saved: the bio as it was kept, or the reason it was not. */
export async function saveBio(playerId: string, name: string, bio: string): Promise<{ ok: true; bio: string | null } | { ok: false; reason: string }> {
  const response = await timed(`${API}/api/profile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ playerId, name, bio }),
  });
  const body = await response.json().catch(() => ({})) as { bio?: string | null; error?: string };
  return response.ok ? { ok: true, bio: body.bio ?? null } : { ok: false, reason: body.error ?? 'That could not be saved.' };
}

async function timed(url: string, init: RequestInit = {}): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}
