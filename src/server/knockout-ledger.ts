import { foldName, isPlayerId } from './board-store.js';
import { handleOf } from '../game/handle.js';
import { weekOf } from '../game/knockout-points.js';

/**
 * Super Knockout's careers and ladders: what matches with friends add up to.
 *
 * A match is paid once, by the store, from the result it worked out itself
 * (`knockout-result.ts`); this is where that lands. One record a player, filed
 * under the player id as every career is, and six ladders read off it: points
 * and wins this week and all time, the highest total, and the win rate for
 * anybody with ten matches or more (`PRODUCT.md`). No tiers: the Knockout card
 * is points and wins.
 *
 * A row on a ladder carries a handle and never an id, and only a player whose
 * name the registry says is theirs is ranked at all, as on every other board.
 */

/** A player's Super Knockout record: only matches that counted (enough real players) are in it. */
export interface KnockoutCareer {
  played: number;
  /** Wins that counted: first place in a match with enough real players for a win to. */
  wins: number;
  /** Finishes in the top three, batted to the end by the player. */
  top3: number;
  /** Every finish added up, for the average; a match run away from counts as last place. */
  places: number;
  /** The highest total made in a match batted to its end. */
  best: number;
  /** The best finish in a match batted to its end, 1 to 12; 0 while there is none. */
  bestPlace: number;
  points: number;
  /** The last five finishes, oldest first; 0 is a match run away from. */
  last: number[];
  /** The week the three below are counting (`weekOf`): a new week starts them again. */
  week: string;
  weekPoints: number;
  weekWins: number;
  weekPlayed: number;
}

export interface StoredKnockoutCareer { career: KnockoutCareer; name: string; avatar: number; at: number }

export const EMPTY_KNOCKOUT_CAREER: KnockoutCareer = {
  played: 0, wins: 0, top3: 0, places: 0, best: 0, bestPlace: 0, points: 0, last: [], week: '', weekPoints: 0, weekWins: 0, weekPlayed: 0,
};

/** The ladders, as the board's picker names them. The two with a week keep one sorted set a week beside the all-time one. */
export const KNOCKOUT_LADDERS = ['points', 'wins', 'best', 'rate'] as const;
export type KnockoutLadder = typeof KNOCKOUT_LADDERS[number];
/** Matches before a win rate is ranked: one win in one match is not a rate. */
export const RATE_FROM = 10;
export const KNOCKOUT_BOARD_SIZE = 50;
/** A week's sorted sets are kept three weeks, then go. */
export const WEEK_TTL_SECONDS = 21 * 86_400;
/** A finish counted for a match run away from: last of the twelve. */
export const RAN_AWAY_PLACE = 12;

export interface LedgerRank { board: string; id: string; score: number; ttlSeconds?: number }

export interface KnockoutLedger {
  many(ids: string[]): Promise<(StoredKnockoutCareer | null)[]>;
  /** Who holds each folded name, in the order asked. Read only: claiming is the board's. */
  owners(folded: string[]): Promise<(string | null)[]>;
  /** Records written and ladder scores set, together. */
  save(records: Record<string, StoredKnockoutCareer>, ranks: LedgerRank[]): Promise<void>;
  /** A stretch of one ladder, best first, from this place (0 is the top). */
  slice(board: string, from: number, count: number): Promise<{ id: string; score: number }[]>;
  /** One player's place on a ladder, from 1, or null where they are not on it. */
  place(board: string, id: string): Promise<number | null>;
}

/** What one real player takes from a match that counted. */
export interface KnockoutCredit {
  id: string;
  name: string;
  avatar: number;
  /** Where the seat finished, 1 to 12. */
  place: number;
  runs: number;
  points: number;
  /** First place, in a match big enough for the win to count. */
  win: boolean;
  /** A sub batted the seat to its finish: the place stands, and pays nothing. */
  stood: boolean;
  /** Walked out of the match while still batting. */
  ran: boolean;
}

/** The board a ladder is kept under: the all-time one, or one week's. */
export function ladderKey(ladder: KnockoutLadder, week?: string): string {
  return week ? `${ladder}:${week}` : ladder;
}

/** The number each ladder sorts on, packed so a tie goes to the next thing that should decide it. */
export function ladderScores(career: KnockoutCareer): Record<KnockoutLadder | 'weekPoints' | 'weekWins', number | null> {
  const cap = (n: number, most: number) => Math.max(0, Math.min(most, Math.round(n)));
  return {
    points: career.points * 1000 + cap(career.wins, 999),
    wins: career.wins * 100_000 + cap(career.points, 99_999),
    best: career.best * 1000 + cap(career.wins, 999),
    rate: career.played >= RATE_FROM ? Math.round(career.wins / career.played * 10_000) * 10_000 + cap(career.played, 9999) : null,
    weekPoints: career.weekPoints * 1000 + cap(career.weekWins, 999),
    weekWins: career.weekWins * 100_000 + cap(career.weekPoints, 99_999),
  };
}

/** One match added to a career. */
export function creditCareer(held: KnockoutCareer | null, credit: KnockoutCredit, week: string): KnockoutCareer {
  const was = { ...EMPTY_KNOCKOUT_CAREER, ...held };
  const same = was.week === week;
  const own = !credit.stood && !credit.ran;
  return {
    played: was.played + 1,
    wins: was.wins + Number(credit.win),
    top3: was.top3 + Number(own && credit.place <= 3),
    places: was.places + (credit.ran ? RAN_AWAY_PLACE : credit.place),
    best: own ? Math.max(was.best, credit.runs) : was.best,
    bestPlace: own && (!was.bestPlace || credit.place < was.bestPlace) ? credit.place : was.bestPlace,
    points: was.points + credit.points,
    last: [...was.last, credit.ran ? 0 : credit.place].slice(-5),
    week,
    weekPoints: (same ? was.weekPoints : 0) + credit.points,
    weekWins: (same ? was.weekWins : 0) + Number(credit.win),
    weekPlayed: (same ? was.weekPlayed : 0) + 1,
  };
}

/**
 * A match's credits written: every player's record, and their ladders where
 * the name they batted under is theirs. Never throws past the match it rides
 * on: the caller decides what a failure means.
 */
export async function creditMatch(ledger: KnockoutLedger, credits: readonly KnockoutCredit[], now = Date.now()): Promise<void> {
  const real = credits.filter(c => isPlayerId(c.id));
  if (!real.length) return;
  const week = weekOf(now);
  const [held, owners] = await Promise.all([ledger.many(real.map(c => c.id)), ledger.owners(real.map(c => foldName(c.name)))]);
  const records: Record<string, StoredKnockoutCareer> = {};
  const ranks: LedgerRank[] = [];
  real.forEach((credit, i) => {
    const career = creditCareer(held[i]?.career ?? null, credit, week);
    records[credit.id] = { career, name: credit.name, avatar: credit.avatar, at: now };
    if (owners[i] !== credit.id) return;
    const scores = ladderScores(career);
    ranks.push({ board: ladderKey('points'), id: credit.id, score: scores.points! });
    ranks.push({ board: ladderKey('wins'), id: credit.id, score: scores.wins! });
    ranks.push({ board: ladderKey('best'), id: credit.id, score: scores.best! });
    if (scores.rate !== null) ranks.push({ board: ladderKey('rate'), id: credit.id, score: scores.rate });
    ranks.push({ board: ladderKey('points', week), id: credit.id, score: scores.weekPoints!, ttlSeconds: WEEK_TTL_SECONDS });
    ranks.push({ board: ladderKey('wins', week), id: credit.id, score: scores.weekWins!, ttlSeconds: WEEK_TTL_SECONDS });
  });
  await ledger.save(records, ranks);
}

/** A row on a Knockout ladder: the week's figures on a week's ladder, the career's on the rest. */
export interface KnockoutRow {
  handle: string;
  name: string;
  avatar: number;
  points: number;
  wins: number;
  played: number;
  best: number;
}

/** What `GET /api/challenge?knockout=1&board=1` answers: every ladder at once, as the career boards do. */
export interface KnockoutBoards {
  ok: true;
  week: string;
  size: number;
  /** How many real players a match needs before it pays, as the store's rules have it (the endpoint adds it). */
  pointsFrom?: number;
  boards: { points: { week: KnockoutRow[]; all: KnockoutRow[] }; wins: { week: KnockoutRow[]; all: KnockoutRow[] }; best: KnockoutRow[]; rate: KnockoutRow[] };
}

function rowOf(id: string, held: StoredKnockoutCareer, week: string | null): KnockoutRow {
  const c = held.career;
  const weekly = week !== null;
  const inWeek = weekly && c.week === week;
  return {
    handle: handleOf(id), name: held.name, avatar: held.avatar,
    points: weekly ? (inWeek ? c.weekPoints : 0) : c.points,
    wins: weekly ? (inWeek ? c.weekWins : 0) : c.wins,
    played: weekly ? (inWeek ? c.weekPlayed : 0) : c.played,
    best: c.best,
  };
}

export async function knockoutBoards(ledger: KnockoutLedger, now = Date.now()): Promise<KnockoutBoards> {
  const week = weekOf(now);
  const keys = [ladderKey('points', week), ladderKey('points'), ladderKey('wins', week), ladderKey('wins'), ladderKey('best'), ladderKey('rate')];
  const tops = await Promise.all(keys.map(key => ledger.slice(key, 0, KNOCKOUT_BOARD_SIZE)));
  const ids = [...new Set(tops.flat().map(row => row.id))];
  const held = ids.length ? await ledger.many(ids) : [];
  const by = new Map(ids.map((id, i) => [id, held[i]]));
  const rows = (list: { id: string }[], weekly: boolean) =>
    list.flatMap(({ id }) => { const one = by.get(id); return one && one.name ? [rowOf(id, one, weekly ? week : null)] : []; });
  return {
    ok: true, week, size: KNOCKOUT_BOARD_SIZE,
    boards: {
      points: { week: rows(tops[0], true), all: rows(tops[1], false) },
      wins: { week: rows(tops[2], true), all: rows(tops[3], false) },
      best: rows(tops[4], false), rate: rows(tops[5], false),
    },
  };
}

/** Where one player stands: their record, their place on every ladder, and how far the next place up on this week's points is. */
export interface KnockoutStanding {
  ok: true;
  week: string;
  career: KnockoutCareer | null;
  places: { points: { week: number | null; all: number | null }; wins: { week: number | null; all: number | null }; best: number | null; rate: number | null };
  /** Points behind the place above on this week's points ladder; null at the top or off it. */
  behind: number | null;
}

export async function knockoutStanding(ledger: KnockoutLedger, playerId: string, now = Date.now()): Promise<KnockoutStanding | { ok: false; status: number; reason: string }> {
  if (!isPlayerId(playerId)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const week = weekOf(now);
  const [[held], pw, pa, ww, wa, best, rate] = await Promise.all([
    ledger.many([playerId]),
    ledger.place(ladderKey('points', week), playerId), ledger.place(ladderKey('points'), playerId),
    ledger.place(ladderKey('wins', week), playerId), ledger.place(ladderKey('wins'), playerId),
    ledger.place(ladderKey('best'), playerId), ledger.place(ladderKey('rate'), playerId),
  ]);
  let behind: number | null = null;
  if (held && pw !== null && pw > 1) {
    const [above] = await ledger.slice(ladderKey('points', week), pw - 2, 1);
    const mine = held.career.week === week ? held.career.weekPoints : 0;
    if (above) behind = Math.max(0, Math.floor(above.score / 1000) - mine);
  }
  // A week gone by: the record still holds last week's figures until the next match, so they are told as nothing.
  const career = held ? (held.career.week === week ? held.career : { ...held.career, week, weekPoints: 0, weekWins: 0, weekPlayed: 0 }) : null;
  return { ok: true, week, career, places: { points: { week: pw, all: pa }, wins: { week: ww, all: wa }, best, rate }, behind };
}

/** The ledger in memory, for the tests and the dev server, kept the way Redis keeps it. */
export function memoryLedger(nameOwner: (folded: string) => string | null | Promise<string | null> = () => null): KnockoutLedger & { clear(): void } {
  const records = new Map<string, StoredKnockoutCareer>();
  const boards = new Map<string, Map<string, number>>();
  const sorted = (board: string) => [...(boards.get(board) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
  return {
    async many(ids) { return ids.map(id => { const held = records.get(id); return held ? structuredClone(held) : null; }); },
    async owners(folded) { return Promise.all(folded.map(async name => (await nameOwner(name)) ?? null)); },
    async save(written, ranks) {
      for (const [id, held] of Object.entries(written)) records.set(id, structuredClone(held));
      for (const { board, id, score } of ranks) { const b = boards.get(board) ?? new Map<string, number>(); b.set(id, score); boards.set(board, b); }
    },
    async slice(board, from, count) { return sorted(board).slice(from, from + count).map(([id, score]) => ({ id, score })); },
    async place(board, id) { const at = sorted(board).findIndex(([one]) => one === id); return at < 0 ? null : at + 1; },
    clear() { records.clear(); boards.clear(); },
  };
}
