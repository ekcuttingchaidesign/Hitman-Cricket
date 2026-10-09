import { BOARD_SIZE, packScore, plausible, type Innings } from '../game/leaderboard.js';
import {
  SURVIVE_BOARD_SIZE, packSurvive, survivePlausible, type SurviveInnings,
} from '../game/survive-board.js';
import {
  ENDINGS, MARATHON_BOARD_SIZE, marathonPlausible, packSolo, packTeam, soloOf, teamOf,
  type MarathonFigures, type SoloInnings, type TeamInnings,
} from '../game/marathon-board.js';
import { MARATHON } from '../config/marathon.js';
import {
  nameProblem, renameReason, RENAME_WINDOW_MS, siblingBase, siblingReason, SIBLING_WINDOW_MS,
} from './name-rules.js';

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

/**
 * What separates one board from another, and it is only ever these four things.
 *
 * Everything else the store does — the rate limit, claiming a name, writing only
 * when the score improves, reading fifty rows in two commands — is the same
 * whichever innings was played. So the plumbing is written once and the ladder
 * is handed to it, rather than a second copy of the store growing beside the
 * first and drifting from it a fix at a time.
 */
export interface Ladder<I> {
  /** How many rows this board holds. */
  size: number;
  /** The whole ladder as one number. The store stamps it, never the browser. */
  pack(innings: I, atMs: number): number;
  /** Whether the innings could have happened at all. */
  plausible(innings: I): boolean;
  /** The figures alone, so a row never carries a field nobody ranks on. */
  figures(from: I): I;
  /** Where this board's keys live. Empty for the five-over innings, which was
      here first and whose keys are already written. */
  scope: string;
}

export const CLASSIC_LADDER: Ladder<Innings> = {
  size: BOARD_SIZE,
  pack: packScore,
  plausible,
  scope: '',
  figures: from => ({
    runs: from.runs, sixes: from.sixes, fours: from.fours,
    wickets: from.wickets, dots: from.dots, balls: from.balls,
  }),
};

export const SURVIVE_LADDER: Ladder<SurviveInnings> = {
  size: SURVIVE_BOARD_SIZE,
  pack: packSurvive,
  plausible: survivePlausible,
  scope: 'survive:',
  figures: from => ({
    runs: from.runs, balls: from.balls, wickets: from.wickets, blows: from.blows, health: from.health,
  }),
};

/**
 * The Test Marathon's two ladders. Neither is ever handed an innings of its
 * own: `submitMarathon` checks the whole innings once and writes both rows from
 * it. Their `plausible` is only the floor a row read back must stand on.
 */
export const MARATHON_TEAM_LADDER: Ladder<TeamInnings> = {
  size: MARATHON_BOARD_SIZE,
  pack: packTeam,
  plausible: i => [i.runs, i.balls, i.boundaries].every(n => Number.isInteger(n) && n >= 0)
    && i.balls <= MARATHON.maxBalls && ENDINGS.includes(i.ending),
  scope: 'marathon:',
  figures: from => ({ runs: from.runs, balls: from.balls, boundaries: from.boundaries, ending: from.ending }),
};
export const MARATHON_SOLO_LADDER: Ladder<SoloInnings> = {
  size: MARATHON_BOARD_SIZE,
  pack: packSolo,
  plausible: i => [i.runs, i.balls].every(n => Number.isInteger(n) && n >= 0) && i.balls <= MARATHON.maxBalls
    && i.order >= 1 && i.order <= MARATHON.batters,
  scope: 'marathonone:',
  figures: from => ({ runs: from.runs, balls: from.balls, out: from.out, order: from.order, left: from.left }),
};

/** A row as it is kept: the figures that board ranks, plus who owns them and when. */
export type StoredRow<I = Innings> = I & {
  name: string;
  avatar: number;
  /** When the store stamped it. Never the browser's clock. */
  at: number;
};

/** Everything the board needs from whatever is keeping it. */
export interface BoardStore<I = Innings> {
  /** The best `n` player ids with their packed scores, best first. */
  top(n: number): Promise<{ id: string; score: number }[]>;
  /** The rows for these ids, in the order asked; anything missing comes back null. */
  rows(ids: string[]): Promise<(StoredRow<I> | null)[]>;
  /**
   * Records a score only if it beats the one already standing, and says whether
   * it did. The row must only be written when it did: the ranking and the
   * figures beside it have to describe the same innings, or the board will show
   * a player's best score next to their latest innings' boundaries.
   */
  record(id: string, score: number, row: StoredRow<I>): Promise<boolean>;
  /**
   * Claims the folded name for this player if nobody holds it, and answers with
   * whoever holds it once that is done. One call rather than a read then a
   * write, because two players claiming the same name in the same second would
   * both read "free" and both write.
   */
  claimName(folded: string, id: string): Promise<string>;
  /** Who holds this folded name, or null when nobody does. */
  nameOwner(folded: string): Promise<string | null>;
  /**
   * The sibling claimed most recently under this base, inside the last day, or
   * null: see `name-rules.ts`. Kept for the day and then forgotten by itself.
   */
  recentSibling(base: string): Promise<{ id: string; name: string } | null>;
  /** Notes a name newly claimed under this base, for `windowSeconds`. */
  markSibling(base: string, id: string, name: string, windowSeconds: number): Promise<void>;
  /**
   * The last new name this player took, and when, or null for a player who
   * has taken none since this was kept: see `RENAME_WINDOW_MS`.
   */
  lastNamed(id: string): Promise<{ name: string; at: number } | null>;
  /** Notes a new name taken by this player. */
  markNamed(id: string, name: string, at: number): Promise<void>;
  /**
   * Puts a new name on the row this player holds, where they hold one, and
   * leaves the figures and the ranking alone. Nothing is written for a player
   * with no row.
   */
  rename(id: string, name: string): Promise<void>;
  /** How many submissions this address has made inside the window, counting this one. */
  hits(address: string, windowSeconds: number): Promise<number>;
}

/** What `GET /api/board` answers with. */
export interface BoardPayload<I = Innings> {
  rows: (I & { playerId: string; name: string; avatar: number; score: number })[];
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
export async function readBoard<I>(
  store: BoardStore<I>, ladder: Ladder<I>, size = ladder.size,
): Promise<BoardPayload<I>> {
  const ranked = await store.top(size);
  if (!ranked.length) return { rows: [], cutoff: null, size };
  const stored = await store.rows(ranked.map(entry => entry.id));
  const rows = ranked.flatMap((entry, i) => {
    const row = stored[i];
    // A ranked id with no row behind it is a half-written submission, not a
    // player. Leaving it out is better than drawing a blank line.
    return row
      ? [{ ...ladder.figures(row), playerId: entry.id, name: row.name, avatar: row.avatar, score: entry.score }]
      : [];
  });
  return { rows, cutoff: rows.length >= size ? rows[size - 1].score : null, size };
}

/** An innings the board took, and where it landed. */
export interface SubmitAccepted<I = Innings> {
  ok: true;
  improved: boolean;
  score: number;
  at: number;
  board: BoardPayload<I>;
}

/** An innings the board turned down, and what to tell the player. */
export interface SubmitRefusal {
  ok: false;
  status: number;
  reason: string;
  /** For a name refused as somebody else's: the name that is held, so restoring starts from it. */
  held?: string;
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
export type SubmitOutcome<I = Innings> = SubmitAccepted<I> | SubmitRefusal;

/**
 * Whether the board turned this innings down.
 *
 * Takes the outcome at its widest, the way `refusedCareer` does. Written
 * generically it forced callers to have picked a ladder already — and the two
 * endpoints have not: they hand it whichever of the two outcomes the mode
 * chose, and inference settled on one of them and then rejected the other.
 */
export function refused(outcome: SubmitOutcome<unknown> | MarathonOutcome): outcome is SubmitRefusal {
  return !outcome.ok;
}

export interface Submission<I = Innings> {
  playerId: string;
  name: string;
  avatar: number;
  innings: I;
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
export async function submitScore<I>(
  store: BoardStore<I>, ladder: Ladder<I>, input: Submission<I>, now = Date.now(),
): Promise<SubmitOutcome<I>> {
  const admitted = await admit(store, ladder.plausible, input, now);
  if (turnedAway(admitted)) return admitted;
  const score = ladder.pack(input.innings, now);
  const improved = await store.record(input.playerId, score, {
    ...ladder.figures(input.innings), name: (admitted as Admitted).name, avatar: input.avatar, at: now,
  });

  return { ok: true, improved, score, at: now, board: await readBoard(store, ladder) };
}

/**
 * Everything a submission must get past before anything is written, in the
 * order that matters: the rate limit first, so a script pays nothing to be
 * turned away, then the shape, then whether the innings could have happened,
 * then the name. Answers with the name as it will be kept.
 */
interface Admitted { ok: true; name: string }
/**
 * A predicate rather than `if (!admitted.ok)`, for the reason `refused` is one:
 * the compiler Vercel builds `api/` with does not narrow on the flag.
 */
function turnedAway(admitted: Admitted | SubmitRefusal): admitted is SubmitRefusal { return !admitted.ok; }
/** What of a board the gate for a name needs. */
type NameGate = Pick<BoardStore<unknown>,
  'hits' | 'claimName' | 'nameOwner' | 'recentSibling' | 'markSibling' | 'lastNamed' | 'markNamed'>;
async function admit<I>(
  store: NameGate, plausibleInnings: (innings: I) => boolean, input: Submission<I>, now: number,
): Promise<Admitted | SubmitRefusal> {
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
  if (!plausibleInnings(input.innings)) return { ok: false, status: 400, reason: 'That innings could not have happened.' };

  // The name is claimed before the score is written, and it is claimed whether
  // or not the innings improves, so a player keeps their name across a bad day.
  // A name once held is never released either: letting one go free would let the
  // next person pick up somebody else's reputation.
  const folded = foldName(name);
  const owner = await store.nameOwner(folded);
  if (owner && owner !== input.playerId) {
    return { ok: false, status: 409, reason: 'Somebody already bats under that name.', held: name };
  }
  // A name this player already holds is theirs whatever the rules have become
  // since. Only a name being claimed for the first time is held to them, and to
  // the day a sibling of it waits: "Rohit 2" ten minutes after somebody else's
  // "Rohit" is the same person standing on the board twice, or the same person
  // who has lost their phone — and either way the answer is their key.
  const fresh = !owner;
  if (fresh) {
    const problem = nameProblem(name, folded);
    if (problem) return { ok: false, status: 400, reason: problem };
    // A new name once a month. A player's first is never held back — the store
    // has no record of one — and nor is going back to a name already theirs,
    // which is not fresh and never reaches here.
    const last = await store.lastNamed(input.playerId);
    if (last && now - last.at < RENAME_WINDOW_MS) return { ok: false, status: 429, reason: renameReason(last.at) };
    const recent = await store.recentSibling(siblingBase(folded));
    if (recent && recent.id !== input.playerId) {
      return { ok: false, status: 409, reason: siblingReason(recent.name), held: recent.name };
    }
  }
  if (await store.claimName(folded, input.playerId) !== input.playerId) {
    return { ok: false, status: 409, reason: 'Somebody already bats under that name.', held: name };
  }
  if (fresh) {
    await Promise.all([
      store.markSibling(siblingBase(folded), input.playerId, name, SIBLING_WINDOW_MS / 1000),
      store.markNamed(input.playerId, name, now),
    ]);
  }
  return { ok: true, name };
}

/** A name asked for on its own, with no innings to put on a board. */
export interface NameClaim {
  playerId: string;
  name: string;
  avatar: number;
  /** Whoever the edge says is asking. Used to rate limit, never as identity. */
  address: string;
}

/**
 * A name claimed without an innings: the end card's "Claim your name", for a
 * player whose innings earned no place. The same gate a board claim passes —
 * the rate limit, the player, the kit, the rules for a new name, the day a
 * sibling waits, one name to one player — with nothing written but the name.
 * Answers with the name as it will be kept.
 */
export async function claimOnly(
  store: NameGate, input: NameClaim, now = Date.now(),
): Promise<{ ok: true; name: string } | SubmitRefusal> {
  return admit(store, () => true, { ...input, innings: null }, now);
}

/** Whether a name claim was turned down — a predicate, for the reason `refused` is one. */
export function nameRefused(outcome: { ok: true; name: string } | SubmitRefusal): outcome is SubmitRefusal {
  return !outcome.ok;
}

/** The two Marathon boards, as one answer. */
export interface MarathonBoards {
  team: BoardPayload<TeamInnings>;
  solo: BoardPayload<SoloInnings>;
}

/** Both Marathon boards, read side by side. */
export async function readMarathon(
  stores: { team: BoardStore<TeamInnings>; solo: BoardStore<SoloInnings> },
): Promise<MarathonBoards> {
  const [team, solo] = await Promise.all([
    readBoard(stores.team, MARATHON_TEAM_LADDER), readBoard(stores.solo, MARATHON_SOLO_LADDER),
  ]);
  return { team, solo };
}

/** A Marathon innings the boards took: where it landed on each. */
export interface MarathonAccepted {
  ok: true;
  improved: { team: boolean; solo: boolean };
  score: { team: number; solo: number };
  at: number;
  board: MarathonBoards;
}
/** Named for the same reason `SubmitOutcome` is: see above. */
export type MarathonOutcome = MarathonAccepted | SubmitRefusal;

/**
 * A Marathon innings, checked once as a whole and written to both ladders: the
 * side's total to the team board, and the best of its three batters to the
 * individual one. One submission and one rate-limit hit, so the two rows can
 * never describe two different innings, and a refusal refuses both.
 */
export async function submitMarathon(
  stores: { team: BoardStore<TeamInnings>; solo: BoardStore<SoloInnings> },
  input: Submission<MarathonFigures>, now = Date.now(),
): Promise<MarathonOutcome> {
  const admitted = await admit(stores.team, marathonPlausible, input, now);
  if (turnedAway(admitted)) return admitted;
  const owner = { name: (admitted as Admitted).name, avatar: input.avatar, at: now };
  const team = teamOf(input.innings), solo = soloOf(input.innings);
  const score = { team: packTeam(team, now), solo: packSolo(solo, now) };
  const [teamImproved, soloImproved] = await Promise.all([
    stores.team.record(input.playerId, score.team, { ...MARATHON_TEAM_LADDER.figures(team), ...owner }),
    stores.solo.record(input.playerId, score.solo, { ...MARATHON_SOLO_LADDER.figures(solo), ...owner }),
  ]);
  return { ok: true, improved: { team: teamImproved, solo: soloImproved }, score, at: now, board: await readMarathon(stores) };
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

