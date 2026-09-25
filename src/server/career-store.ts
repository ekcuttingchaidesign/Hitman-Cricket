import {
  AVATARS, RATE_LIMIT, RATE_WINDOW_SECONDS, cleanName, foldName,
} from './board-store.js';
import { rankCareer, type CareerLadder } from '../game/career.js';
import type { Granted } from '../game/tier.js';

/**
 * Careers, on the store's side of the wire.
 *
 * The arithmetic all lives in `game/career.ts` and is imported here rather than
 * restated, exactly as the innings boards do it: one merge function, run by the
 * store, so a total shown on a card and a total ranked on a board can never be
 * two different numbers.
 *
 * What is written here instead is everything a *sum* needs that a maximum did
 * not. An innings board is self-limiting — the worst a bad submission can do is
 * claim one innings of 180, and the mode's own ceiling caps it. A career board
 * adds up every submission, so the same request sent a thousand times is a
 * thousand times the damage. Three rules answer that, and all three are cheap
 * because the record is being read and written anyway:
 *
 *   the nonce   — an innings counted once, however many times it arrives
 *   the gap     — no two counted innings closer together than an innings takes
 *   the day     — a ceiling on how many innings one player counts in a day
 *
 * None of them is an anti-cheat measure and none should be mistaken for one.
 * They bound what a script can accumulate to roughly what a person could play,
 * which is the floor; the ceiling would need accounts, and this game has none.
 */

/** How many rows a career board holds. The same fifty as the innings boards. */
export const CAREER_BOARD_SIZE = 50;

/**
 * The least time an innings can take, in milliseconds.
 *
 * Deliberately far below what anybody actually plays. The shortest innings the
 * game can produce is a Test batter carried off inside the first over, which is
 * still a run-up and a delivery a ball; thirty balls of the Blast is the better
 * part of a minute. Ten seconds refuses nothing a person could do and turns a
 * tight submission loop into something that has to wait.
 */
export const MIN_INNINGS_MS = 10_000;

/**
 * Innings counted toward a career in one day. Well above a long evening of
 * play — it is a ceiling on a script, not a budget for a player — and the
 * innings past it are simply not counted rather than refused, because a player
 * who somehow reached it is not doing anything wrong and should not be shown an
 * error in the middle of their game.
 */
export const DAILY_INNINGS = 120;

/** A career as it is kept, with everything the boards and the card need. */
export interface StoredCareer<C> {
  career: C;
  /**
   * The name this player bats under, once they have claimed one, and empty
   * until then. A career with no name is counted but never ranked: the name
   * registry is what makes a name one person's, and a row on a board under a
   * name nobody verified is somebody else's reputation.
   */
  name: string;
  avatar: number;
  /** When the last innings was counted. The gap is measured from here. */
  at: number;
  /** The last innings counted, so a retried request does not count it twice. */
  nonce: string;
  /** The day `today` is counting, as whole days since the epoch. */
  day: number;
  /** Innings counted on that day. */
  today: number;
  /**
   * A tier this player holds whatever their figures say, and why.
   *
   * Written once, by the seed that opened the board's first careers, and never
   * by the counting path — so an innings can raise a player above it and
   * nothing can take it away. See `foundingGrant` in `game/tier.ts`.
   */
  granted?: { key: string; reason: string } | null;
}

/** Everything a career needs from whatever is keeping it. */
export interface CareerStore<C> {
  /** One player's record, or null where they have never finished an innings. */
  read(id: string): Promise<StoredCareer<C> | null>;
  write(id: string, held: StoredCareer<C>): Promise<void>;
  /** Puts a player's packed score on one board. Career totals only ever rise. */
  rank(board: string, id: string, score: number): Promise<void>;
  /** The best `n` ids on one board with their packed scores, best first. */
  top(board: string, n: number): Promise<{ id: string; score: number }[]>;
  /** The records for these ids, in the order asked; anything missing is null. */
  many(ids: string[]): Promise<(StoredCareer<C> | null)[]>;
  /** Who holds this folded name, or null. Read only: claiming is the board's. */
  nameHolder(folded: string): Promise<string | null>;
  /** How many submissions this address has made inside the window. */
  hits(address: string, windowSeconds: number): Promise<number>;
}

/** A row on a career board. */
export interface CareerRow<C> {
  playerId: string;
  name: string;
  avatar: number;
  career: C;
  /** The packed number this row is sorted on. */
  score: number;
}

/** What `GET /api/career` answers with: every board of one mode, at once. */
export interface CareerPayload<C> {
  /** Keyed by the board's own key, in the order the ladders are declared. */
  boards: Record<string, CareerRow<C>[]>;
  size: number;
}

/**
 * Every career board of one mode, in as few commands as it can be done in.
 *
 * One `top` a board and then a single `many` for the union of everybody who
 * appears on any of them — so four boards cost five commands rather than eight,
 * and the same player standing on three of them is fetched once. The answer is
 * the same for everybody and carries nothing personal, so it sits in the edge
 * cache the way the innings board already does.
 */
export async function readCareerBoards<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>, size = CAREER_BOARD_SIZE,
): Promise<CareerPayload<C>> {
  const ranked = await Promise.all(ladder.boards.map(board => store.top(board.key, size)));
  const ids = [...new Set(ranked.flat().map(entry => entry.id))];
  const found = await store.many(ids);
  const held = new Map(ids.map((id, i) => [id, found[i]]));
  const boards: Record<string, CareerRow<C>[]> = {};
  ladder.boards.forEach((board, i) => {
    boards[board.key] = ranked[i].flatMap(entry => {
      const record = held.get(entry.id);
      // A ranked id with no record behind it is a half-written submission, not
      // a player, and a blank row is worse than a missing one.
      if (!record || !record.name) return [];
      return [{
        playerId: entry.id,
        name: record.name,
        avatar: record.avatar,
        career: ladder.figures(record.career),
        score: entry.score,
      }];
    });
  });
  return { boards, size };
}

/** One player's own figures, for their card. Never cached: it is theirs alone. */
export async function readCareer<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>, playerId: string,
): Promise<{ career: C | null; name: string; avatar: number; granted?: Granted | null }> {
  if (!isPlayerId(playerId)) return { career: null, name: '', avatar: 0 };
  const held = await store.read(playerId);
  if (!held) return { career: null, name: '', avatar: 0 };
  return {
    career: ladder.figures(held.career),
    name: held.name,
    avatar: held.avatar,
    granted: held.granted ?? null,
  };
}

/** An innings the career took, and what it comes to now. */
export interface CareerAccepted<C> {
  ok: true;
  /** A tier held whatever the figures say, so the card can print it. */
  granted?: Granted | null;
  /**
   * Whether this innings actually moved the totals. False for a request the
   * store has already seen, one that arrived too soon after the last, and one
   * past the day's count — none of which is a failure, and all of which leave
   * the career exactly as it was.
   */
  counted: boolean;
  career: C;
  name: string;
  avatar: number;
}

export interface CareerRefusal {
  ok: false;
  status: number;
  reason: string;
}

export type CareerOutcome<C> = CareerAccepted<C> | CareerRefusal;

/**
 * Whether the career turned this innings down.
 *
 * Widened to `unknown` rather than left generic, and for the reason spelled out
 * over `refused` in `board-store.ts`: an endpoint hands this a union of two
 * modes' outcomes, and inference picks one of them as `C` rather than uniting
 * them — so the generic form refuses the Blast's answer while typechecking the
 * Test's. Nothing here reads the career, only the discriminant.
 */
export function refusedCareer(outcome: CareerOutcome<unknown>): outcome is CareerRefusal {
  return !outcome.ok;
}

export interface CareerSubmission<T> {
  playerId: string;
  /** What this browser last batted under, or empty where it has not yet. */
  name: string;
  avatar: number;
  tally: T;
  /** This innings' own id, minted by the browser once and resent on a retry. */
  nonce: string;
  address: string;
}

/**
 * An innings, counted.
 *
 * Read, merge, write, rank — and every guard above the merge is answered from
 * the record that was going to be read anyway, so the whole path is two
 * commands plus one `ZADD` per board the player actually stands on.
 *
 * The name is the one thing here that can cost an extra command, and only
 * once. The browser sends whatever it last batted under; where that already
 * matches the record, nothing is looked up. Where it differs, the name
 * registry is asked who holds it, and it is written only if that is this
 * player — so an unclaimed name cannot put somebody on a board, and a player
 * who claims a name on one ladder carries it onto the other's career the next
 * innings they finish, with no second registry and no second claim.
 */
export async function countInnings<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>, input: CareerSubmission<T>, now = Date.now(),
): Promise<CareerOutcome<C>> {
  if (await store.hits(input.address, RATE_WINDOW_SECONDS) > RATE_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many innings from here. Try again in an hour.' };
  }
  if (!isPlayerId(input.playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  if (!isNonce(input.nonce)) return { ok: false, status: 400, reason: 'That innings has no id.' };
  if (!ladder.plausible(input.tally)) {
    return { ok: false, status: 400, reason: 'That innings could not have happened.' };
  }

  const held = await store.read(input.playerId);
  const name = await settleName(store, held, input);
  const day = Math.floor(now / 86_400_000);

  // Already counted, arrived too soon, or past the day's ceiling. All three
  // answer with the career as it stands rather than an error: the player did
  // nothing wrong in any of them, and the card behind this call only wants to
  // know what their figures are now. All three also need a record to be true
  // of, which is why they are asked inside it rather than beside it.
  if (held) {
    const repeat = held.nonce === input.nonce;
    const tooSoon = now - held.at < MIN_INNINGS_MS;
    const spent = held.day === day && held.today >= DAILY_INNINGS;
    if (repeat || tooSoon || spent) {
      // A name that has just been settled is worth writing even when the
      // innings is not counted, or a player whose first innings back is a
      // duplicate would stay off the boards until they played another. The
      // rank is stamped with when the total was reached rather than now: the
      // total has not moved, so neither may its place in a tie.
      if (name.name !== held.name || name.avatar !== held.avatar) {
        await store.write(input.playerId, { ...held, ...name });
        await rankAll(store, ladder, input.playerId, held.career, name.name, held.at);
      }
        return { ok: true, counted: false, career: ladder.figures(held.career), granted: held.granted ?? null, ...name };
    }
  }

  const career = ladder.merge(held?.career ?? null, input.tally);
  await store.write(input.playerId, {
    career: ladder.figures(career),
    ...name,
    at: now,
    nonce: input.nonce,
    day,
    today: held && held.day === day ? held.today + 1 : 1,
    // Carried rather than recomputed. Counting an innings must never be able to
    // take away something a player was given.
    granted: held?.granted ?? null,
  });
  await rankAll(store, ladder, input.playerId, career, name.name, now);
  return { ok: true, counted: true, career: ladder.figures(career), granted: held?.granted ?? null, ...name };
}

/**
 * A name, stamped onto a career that has already been counted.
 *
 * Run after a place is claimed on an innings board, and it exists to close a
 * gap that is at its worst for exactly the player it matters most to. An
 * innings is counted the moment it ends — before the card is on screen, and so
 * before anybody has registered — which means a first-time player's career is
 * already there and nameless when they claim their place. Without this they
 * would register, open the career tab, and not be on it: the boards would wait
 * for their *next* innings to carry the name across.
 *
 * It is only reached on the claim path, which is rare, so the two commands and
 * the handful of `ZADD`s it costs are paid once a player rather than once an
 * innings. The name is not checked here: the caller has just claimed it
 * through the registry, which is the only thing that can say it is theirs.
 *
 * The rank is stamped with the day the career reached its total — the record's
 * own `at` — and never with the moment the name was claimed. A career board is
 * tied on who got to a figure first, and stamping it now would move a player
 * who has been quietly piling up runs for a month below somebody who passed
 * them this morning, on the strength of having registered later.
 */
export async function nameCareer<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>,
  playerId: string, name: string, avatar: number,
): Promise<void> {
  if (!isPlayerId(playerId) || !name) return;
  const held = await store.read(playerId);
  // Nothing counted yet is not an error and not something to invent a record
  // for. The next innings they finish opens one, with the name already on it.
  if (!held) return;
  if (held.name === name && held.avatar === avatar) {
    // Already named and already ranked. The boards are written anyway, because
    // this is also the path a player who was ranked before a board existed
    // comes back onto it, and a `ZADD GT` that changes nothing costs one
    // command and cannot go wrong.
    return rankAll(store, ladder, playerId, held.career, held.name, held.at);
  }
  await store.write(playerId, { ...held, name, avatar });
  await rankAll(store, ladder, playerId, held.career, name, held.at);
}

/**
 * The boards this career stands on, written.
 *
 * Nothing is written for a player with no claimed name — they are counted and
 * kept, and the innings they played before registering are all still there the
 * moment they do — and nothing is written for a board they have nothing on, so
 * a Blast player never touches the boundaries ranking until they hit one.
 */
/**
 * A note on what `GT` means here, because it looks like a bug and is not.
 *
 * A packed career key falls as well as rises: the clock underneath it counts
 * *down* — it is `MAX_DAYS - days`, so that whoever reached a total first stays
 * above whoever matched it later — and the innings tiebreak is stored as room
 * left rather than innings used, so one more innings lowers it. An innings that
 * scores nothing therefore produces a key below the one already written, and
 * `GT` refuses it.
 *
 * That is the point. The rank records how a career got to the total it is on,
 * stamped at the moment it got there: a thousand runs in fifty innings on day
 * ten stays ranked as a thousand in fifty on day ten, and a hundred barren
 * innings afterwards do not push it below somebody who arrived later. The row
 * shows the innings count now, which is a different true number, and the two
 * can read as disagreeing on a tie — which is the price, and it is only ever
 * payable between two careers level on a twenty-bit total.
 *
 * Drop the `GT` and both halves of that go: reaching a total first would stop
 * counting for anything the moment you played again.
 */
async function rankAll<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>, id: string, career: C, name: string, now: number,
) {
  if (!name) return;
  await Promise.all(ladder.boards
    .filter(board => board.counts(career))
    .map(board => store.rank(board.key, id, rankCareer(board, career, now))));
}

/**
 * The name and kit to keep: the one already on the record, unless the browser
 * sent a different one that the registry says belongs to this player.
 */
async function settleName<C, T>(
  store: CareerStore<C>, held: StoredCareer<C> | null, input: CareerSubmission<T>,
): Promise<{ name: string; avatar: number }> {
  const avatar = Number.isInteger(input.avatar) && input.avatar >= 0 && input.avatar < AVATARS
    ? input.avatar
    : held?.avatar ?? 0;
  const sent = cleanName(input.name);
  if (!sent) return { name: held?.name ?? '', avatar };
  if (held && foldName(held.name) === foldName(sent)) return { name: sent, avatar };
  const holder = await store.nameHolder(foldName(sent));
  return holder === input.playerId ? { name: sent, avatar } : { name: held?.name ?? '', avatar };
}

/** The ids this game mints: a base-36 stamp, a dash, and a random tail. */
function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z]{6,10}-[0-9a-z]{12,}$/.test(value);
}

/**
 * An innings id. Only ever compared with the last one, never parsed, so the
 * shape here is a bound on what will be stored rather than a meaning.
 */
function isNonce(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-z-]{8,40}$/.test(value);
}
