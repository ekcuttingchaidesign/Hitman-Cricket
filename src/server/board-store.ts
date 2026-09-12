import { BOARD_SIZE, packScore, plausible, type BoardRow, type Innings } from '../game/leaderboard.js';

/**
 * What the board is, on the store's side of the wire.
 *
 * The ladder itself lives in `game/leaderboard.ts` and is imported here rather
 * than restated, which is the whole reason that file imports no three.js. If the
 * browser and the store ever disagreed about who is fiftieth, the board would be
 * wrong in a way that is miserable to find.
 *
 * Every command this needs is named on `BoardStore` below rather than reached
 * for through a Redis client, so the submit path can be tested end to end with
 * no network and no database — and so the day this moves off Redis, one adapter
 * changes and none of the rules do.
 */

/** How long a name may be. A row is built to hold fourteen without wrapping. */
export const NAME_MAX = 14;
/** How many kits there are to pick from. */
export const AVATARS = 5;
/**
 * Submissions allowed from one address an hour. An innings cannot be played in
 * under a minute, so this is far above what a person can reach and far below
 * what a script wants — and it is deliberately generous because an address is
 * shared: a school, an office and anyone behind CGNAT all arrive as one.
 */
export const RATE_LIMIT = 120;
export const RATE_WINDOW_SECONDS = 3600;

/** A row as it is kept: the six figures, plus who owns them and when. */
export interface StoredRow extends Innings {
  name: string;
  avatar: number;
  /** When the store stamped it. Never the browser's clock. */
  at: number;
}

/** Everything the board needs from whatever is keeping it. */
export interface BoardStore {
  /** The best `n` player ids with their packed scores, best first. */
  top(n: number): Promise<{ id: string; score: number }[]>;
  /** The rows for these ids, in the order asked; anything missing comes back null. */
  rows(ids: string[]): Promise<(StoredRow | null)[]>;
  /**
   * Records a score only if it beats the one already standing, and says whether
   * it did. The row must only be written when it did: the ranking and the
   * figures beside it have to describe the same innings, or the board will show
   * a player's best score next to their latest innings' boundaries.
   */
  record(id: string, score: number, row: StoredRow): Promise<boolean>;
  /**
   * Claims the folded name for this player if nobody holds it, and answers with
   * whoever holds it once that is done. One call rather than a read then a
   * write, because two players claiming the same name in the same second would
   * both read "free" and both write.
   */
  claimName(folded: string, id: string): Promise<string>;
  /** How many submissions this address has made inside the window, counting this one. */
  hits(address: string, windowSeconds: number): Promise<number>;
}

/** What `GET /api/board` answers with. */
export interface BoardPayload {
  rows: BoardRow[];
  /** The packed score the fiftieth row is holding, or null while the board fills. */
  cutoff: number | null;
  size: number;
}

/**
 * The board, and nothing about who is asking.
 *
 * That is deliberate: an answer that is the same for everybody can sit in the
 * edge cache, so a hundred people opening the board in the same minute cost one
 * pair of Redis commands rather than a hundred. Where the player stands is
 * worked out in their own browser from the packed score — the same number from
 * the same function — which is what the shared ladder was for.
 *
 * Two commands: the ids in order, then every row in one go. Not fifty.
 */
export async function readBoard(store: BoardStore, size = BOARD_SIZE): Promise<BoardPayload> {
  const ranked = await store.top(size);
  if (!ranked.length) return { rows: [], cutoff: null, size };
  const stored = await store.rows(ranked.map(entry => entry.id));
  const rows = ranked.flatMap((entry, i) => {
    const row = stored[i];
    // A ranked id with no row behind it is a half-written submission, not a
    // player. Leaving it out is better than drawing a blank line.
    return row
      ? [{ ...figuresOf(row), playerId: entry.id, name: row.name, avatar: row.avatar, score: entry.score }]
      : [];
  });
  return { rows, cutoff: rows.length >= size ? rows[size - 1].score : null, size };
}

/** An innings the board took, and where it landed. */
export interface SubmitAccepted {
  ok: true;
  improved: boolean;
  score: number;
  at: number;
  board: BoardPayload;
}

/** An innings the board turned down, and what to tell the player. */
export interface SubmitRefusal {
  ok: false;
  status: number;
  reason: string;
}

/**
 * Both halves are named rather than written inline, and `refused` below is a
 * real type predicate rather than an `if (!outcome.ok)` that leans on
 * inference. TypeScript only narrows a `true | false` discriminant under
 * `strictNullChecks`, and these types are read by a compiler this repository
 * does not configure — Vercel builds `api/` with its own settings, and this
 * union not narrowing there failed three deployments while `tsc --noEmit`
 * passed every time locally.
 */
export type SubmitOutcome = SubmitAccepted | SubmitRefusal;

/** Whether the board turned this innings down. */
export function refused(outcome: SubmitOutcome): outcome is SubmitRefusal {
  return !outcome.ok;
}

export interface Submission {
  playerId: string;
  name: string;
  avatar: number;
  innings: Innings;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
}

/**
 * A submitted innings, checked and written.
 *
 * The order matters. The rate limit comes first so a script pays nothing to be
 * turned away. Then the shape, then whether the innings could have happened at
 * all, then the name. The clock is read here and nowhere else: a browser's clock
 * is wrong often enough that letting it stamp its own submission would hand a
 * tiebreak to whoever's laptop is running fast.
 */
export async function submitScore(store: BoardStore, input: Submission, now = Date.now()): Promise<SubmitOutcome> {
  if (await store.hits(input.address, RATE_WINDOW_SECONDS) > RATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many innings from here. Try again in an hour.' };
  }
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!Number.isInteger(input.avatar) || input.avatar < 0 || input.avatar >= AVATARS) {
    return { ok: false, status: 400, reason: 'Pick one of the kits.' };
  }
  const name = cleanName(input.name);
  if (!name) return { ok: false, status: 400, reason: `A name, up to ${NAME_MAX} characters.` };
  // Not an anti-cheat measure and not to be mistaken for one: the game is a
  // static page, so a determined person can post any innings that passes. This
  // turns down the ones that could not have happened, which is the floor.
  if (!plausible(input.innings)) return { ok: false, status: 400, reason: 'That innings could not have happened.' };

  // The name is claimed before the score is written, and it is claimed whether
  // or not the innings improves, so a player keeps their name across a bad day.
  // A name once held is never released either: letting one go free would let the
  // next person pick up somebody else's reputation.
  const folded = foldName(name);
  if (await store.claimName(folded, input.playerId) !== input.playerId) {
    return { ok: false, status: 409, reason: 'Somebody already bats under that name.' };
  }

  const score = packScore(input.innings, now);
  const improved = await store.record(input.playerId, score, {
    ...figuresOf(input.innings), name, avatar: input.avatar, at: now,
  });

  return { ok: true, improved, score, at: now, board: await readBoard(store) };
}

/**
 * A name as it will be shown: trimmed, collapsed, and cut to what a row holds.
 * Control characters go, and so do the invisible formatting marks — zero-width
 * joiners, directional overrides — that let one name be written to look like
 * another, or to turn the rest of a row around.
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const stripped = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Cut by character rather than by code unit, or a name ending in an emoji
  // comes back with half of one on the end.
  return [...stripped].slice(0, NAME_MAX).join('').trim();
}

/**
 * The form a name is compared in. Case, spacing and punctuation are thrown away,
 * so "Big Show", "bigshow" and "B.i.g Show" are one name and the second person
 * to want it is told so. Accents fold too, or an accent becomes a way to wear
 * somebody else's name.
 */
export function foldName(name: string): string {
  return name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The ids this game mints: a base-36 stamp, a dash, and a random tail. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(value);
}

/** The six figures on their own, so a row never carries a field nobody ranks on. */
function figuresOf(from: Innings): Innings {
  return {
    runs: from.runs, sixes: from.sixes, fours: from.fours,
    wickets: from.wickets, dots: from.dots, balls: from.balls,
  };
}
