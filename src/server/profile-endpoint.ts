import {
  aroundAfter, foldName, cleanName, isPlayerId, type BoardStore, type MarathonAccepted, type Neighbour,
  type PostStanding, type SubmitAccepted,
} from './board-store.js';
import type { CareerStore } from './career-store.js';
import {
  BLAST_CAREER, MARATHON_CAREER, SURVIVE_CAREER, type BlastCareer, type CareerLadder, type MarathonCareer,
  type SurviveCareer,
} from '../game/career.js';
import type { Granted } from '../game/tier.js';
import type { Innings } from '../game/leaderboard.js';
import type { SurviveInnings } from '../game/survive-board.js';
import type { SoloInnings, TeamInnings } from '../game/marathon-board.js';
import { handleOf, isHandle } from '../game/handle.js';
import { surviveResultOf, type SurviveResult } from '../game/chase.js';
import {
  READ_LIMIT, WINDOW_SECONDS, countView, noteEvent, readActivity, refusedBio, rememberHandle, saveBio,
  type Activity, type ActivityEvent, type PlayerStore, type ProfileMode,
} from './player-store.js';

/**
 * `api/profile.ts`, written once for the deployed endpoint and the dev server,
 * as `challengeRequest` is: only where things are kept stands in.
 *
 *   GET  ?handle=<handle>&viewer=<handle>  somebody's profile, by the handle their row carries
 *   GET  ?player=<id>                      your own activity: views, who chased and passed you, your bio
 *   POST { playerId, name, bio }           your bio, from Your details
 *
 * And `afterPost`, which the score endpoints call once an innings is on the
 * board: who it went past and who is next, the chase it was played as, and the
 * events those leave on other players' profiles. None of that can fail the post.
 *
 * Nothing in an answer is a player id. A profile is opened by a handle and
 * answers with handles; the id behind one is read from the store and never
 * leaves it (`game/handle.ts`).
 */

export interface ProfileStores {
  players: PlayerStore;
  boards: {
    classic: BoardStore<Innings>;
    survive: BoardStore<SurviveInnings>;
    team: BoardStore<TeamInnings>;
    solo: BoardStore<SoloInnings>;
  };
  careers: {
    classic: CareerStore<BlastCareer>;
    survive: CareerStore<SurviveCareer>;
    marathon: CareerStore<MarathonCareer>;
  };
}

/** One mode of somebody's profile: the career card's figures, and where they stand. */
export interface ProfileModeView<C> {
  career: C | null;
  granted: Granted | null;
  /** Their best innings on the mode's board — the Marathon's side total — and its place. */
  best: { runs: number; place: number; total: number; result?: SurviveResult } | null;
  /** The best place they hold on any of the mode's ladders. */
  bestRank: number | null;
  /** The Test Marathon's other target: their best innings by one batter, and its place. */
  solo?: { runs: number; out: boolean; place: number } | null;
}

/** What `GET /api/profile?handle=` answers with. */
export interface ProfilePayload {
  handle: string;
  name: string;
  avatar: number;
  bio: string | null;
  /** When their last innings anywhere was counted, or null. */
  lastAt: number | null;
  modes: {
    classic: ProfileModeView<BlastCareer>;
    survive: ProfileModeView<SurviveCareer>;
    marathon: ProfileModeView<MarathonCareer>;
  };
}

/** A neighbour on the board as it leaves the store. */
export interface PublicNeighbour { handle: string; name: string; avatar: number; runs: number; place: number }

/** What a score post's answer gains. */
export interface PostExtras {
  around: { passed: PublicNeighbour[]; passedCount: number; next: PublicNeighbour | null };
  chase?: { handle: string; name: string; target: number; runs: number; beat: boolean; result?: { mine: SurviveResult; theirs: SurviveResult } };
}

/** Your own events, with whether a beat has been won back since. */
export interface OwnActivity extends Omit<Activity, 'events'> {
  events: (ActivityEvent & { wonBack?: boolean })[];
}

export type ProfileOutcome = { ok: true; body: unknown; cache: string } | ProfileRefusal;
export type ProfileRefusal = { ok: false; status: number; reason: string };
export const profileRefused = (outcome: ProfileOutcome): outcome is ProfileRefusal => !outcome.ok;

export interface ProfileRequest {
  method?: string;
  query: Record<string, string | undefined>;
  body?: unknown;
  address: string;
}

const PRIVATE = 'private, no-store';

export async function profileRequest(stores: ProfileStores, request: ProfileRequest, now = Date.now()): Promise<ProfileOutcome> {
  if (request.method === 'POST') {
    const body = parse(request.body);
    if (!body) return { ok: false, status: 400, reason: 'Send a bio as JSON.' };
    const playerId = body.playerId;
    const named = isPlayerId(playerId) && await holdsName(stores, playerId, body.name);
    const saved = await saveBio(stores.players, { playerId, bio: body.bio, named, address: `bio:${request.address}` }, now);
    if (refusedBio(saved)) return { ok: false, status: saved.status, reason: saved.reason };
    return { ok: true, body: saved, cache: PRIVATE };
  }
  if (request.method && request.method !== 'GET') return { ok: false, status: 405, reason: 'Use GET or POST.' };
  if (await stores.players.hits(`read:${request.address}`, WINDOW_SECONDS) > READ_LIMIT) {
    return { ok: false, status: 429, reason: 'Too many profiles from here. Try again in a while.' };
  }
  const { handle, viewer, player } = request.query;
  if (player !== undefined) {
    const activity = await readOwnActivity(stores, player, now);
    if (!activity) return { ok: false, status: 400, reason: 'That is not a player.' };
    return { ok: true, body: activity, cache: PRIVATE };
  }
  if (!isHandle(handle)) return { ok: false, status: 400, reason: 'That is not a player.' };
  const profile = await readProfile(stores, handle, viewer, now);
  if (!profile) return { ok: false, status: 404, reason: 'Nobody bats under that handle.' };
  return { ok: true, body: profile, cache: PRIVATE };
}

/**
 * Somebody's profile. Only a player with a name has one — their rows are the
 * only way to it — so a handle with no named record behind it is nobody. The
 * look is counted for them (`countView`), and it never fails the read.
 */
export async function readProfile(
  stores: ProfileStores, handle: string, viewer: unknown, now = Date.now(),
): Promise<ProfilePayload | null> {
  const id = await stores.players.idOf(handle) ?? await findHandle(stores, handle);
  if (!id) return null;
  const { boards, careers } = stores;
  const [classic, survive, marathon, bio] = await Promise.all([
    modeView(careers.classic, BLAST_CAREER, [boards.classic], id),
    modeView(careers.survive, SURVIVE_CAREER, [boards.survive], id, row => surviveResultOf(row as unknown as SurviveInnings)),
    modeView(careers.marathon, MARATHON_CAREER, [boards.team, boards.solo], id),
    stores.players.readBio(id),
  ]);
  const held = [classic, survive, marathon].map(one => one.held);
  const named = held.find(one => one?.name) ?? null;
  const row = named ? null : await firstRow(stores, id);
  const name = named?.name ?? row?.name ?? '';
  if (!name) return null;
  const at = held.map(one => one?.at ?? 0).filter(Boolean);
  await countView(stores.players, { playerId: id, viewer }, now).catch(() => false);
  return {
    handle, name, avatar: named?.avatar ?? row?.avatar ?? 0, bio: bio?.text ?? null,
    lastAt: at.length ? Math.max(...at) : null,
    modes: { classic: classic.view, survive: survive.view, marathon: marathon.view },
  };
}

/** How far down each board a handle is looked for: every row a board shows. */
export const FIND_DEPTH = 50;

/**
 * The player behind a handle the store has not noted, found the long way and
 * then noted. A row can only be tapped on a board that shows it, and a board
 * shows its top fifty, so hashing the ids at the top of every innings board
 * and every career ladder finds anybody who can be opened — players who last
 * wrote before handles were kept included — at a few commands and a few
 * hundred hashes, once. Null for a handle on none of them.
 */
export async function findHandle(stores: ProfileStores, handle: string): Promise<string | null> {
  const { boards, careers } = stores;
  const tops = await Promise.all([
    ...[boards.classic, boards.survive, boards.team, boards.solo].map(board => (board as Pick<BoardStore<unknown>, 'top'>).top(FIND_DEPTH)),
    ...BLAST_CAREER.boards.map(board => careers.classic.top(board.key, FIND_DEPTH)),
    ...SURVIVE_CAREER.boards.map(board => careers.survive.top(board.key, FIND_DEPTH)),
    ...MARATHON_CAREER.boards.map(board => careers.marathon.top(board.key, FIND_DEPTH)),
  ]);
  const seen = new Set<string>();
  for (const top of tops) {
    for (const { id } of top) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (handleOf(id) === handle) {
        await stores.players.rememberHandle(handle, id).catch(() => undefined);
        return id;
      }
    }
  }
  return null;
}

/** One mode: the career, the first board's best and place, and the best place on any of its ladders. */
async function modeView<C, T>(
  store: CareerStore<C>, ladder: CareerLadder<C, T>,
  innings: readonly Pick<BoardStore<{ runs: number }>, 'standing' | 'rows'>[], id: string,
  resultOf?: (row: { runs: number }) => SurviveResult,
) {
  const [held, places, standings] = await Promise.all([
    store.read(id),
    Promise.all(ladder.boards.map(board => store.place(board.key, id))),
    Promise.all(innings.map(board => board.standing(id))),
  ]);
  const first = standings[0];
  const [row] = first.rank !== null ? await innings[0].rows([id]) : [null];
  const all = [...places, ...standings.map(one => one.rank)].filter((place): place is number => !!place && place > 0);
  const second = standings[1];
  const [solo] = second && second.rank !== null ? await innings[1].rows([id]) as ({ runs: number; out?: boolean } | null)[] : [null];
  const view: ProfileModeView<C> = {
    career: held ? ladder.figures(held.career) : null,
    granted: held?.granted ?? null,
    best: row && first.rank !== null ? { runs: row.runs, place: first.rank, total: first.total, ...(resultOf ? { result: resultOf(row) } : {}) } : null,
    bestRank: all.length ? Math.min(...all) : null,
    ...(innings.length > 1 ? { solo: solo && second.rank !== null ? { runs: solo.runs, out: !!solo.out, place: second.rank } : null } : {}),
  };
  return { held, view };
}

/** A name and kit off the boards, for a player whose careers carry none. */
async function firstRow(stores: ProfileStores, id: string) {
  for (const board of [stores.boards.classic, stores.boards.survive, stores.boards.team, stores.boards.solo] as Pick<BoardStore<unknown>, 'rows'>[]) {
    const [row] = await board.rows([id]);
    if (row) return row;
  }
  return null;
}

/** Whether this player holds the name they say, as the board's registry has it. */
async function holdsName(stores: ProfileStores, playerId: string, name: unknown): Promise<boolean> {
  const clean = cleanName(name);
  return !!clean && await stores.boards.classic.nameOwner(foldName(clean)) === playerId;
}

const BOARD_OF = { classic: 'classic', survive: 'survive', marathon: 'team' } as const;

/**
 * Your own activity, and for each player who beat you in a chase whether you
 * have gone back above them since — worked out now, from where you both stand,
 * so it is never out of date.
 */
export async function readOwnActivity(stores: ProfileStores, playerId: string, now = Date.now()): Promise<OwnActivity | null> {
  const activity = await readActivity(stores.players, playerId, now);
  if (!activity) return null;
  const mine = new Map<ProfileMode, Promise<PostStanding['score']>>();
  const scoreOf = (mode: ProfileMode, id: string) => stores.boards[BOARD_OF[mode]].standing(id).then(one => one.score);
  const events = await Promise.all(activity.events.map(async event => {
    if (event.kind !== 'beat') return event;
    const them = await stores.players.idOf(event.handle);
    if (!them) return event;
    if (!mine.has(event.mode)) mine.set(event.mode, scoreOf(event.mode, playerId));
    const [yours, theirs] = await Promise.all([mine.get(event.mode)!, scoreOf(event.mode, them)]);
    return { ...event, wonBack: yours !== null && (theirs === null || yours > theirs) };
  }));
  return { ...activity, events };
}

/** The innings a score post took, whatever the mode. */
export interface Posted {
  playerId: string;
  name: string;
  avatar: number;
  mode: ProfileMode;
  /** The runs the innings made: the side's total in a Marathon. */
  runs: number;
  outcome: SubmitAccepted<unknown> | MarathonAccepted;
  /** The handle the innings was played to chase, if it was. */
  chase?: unknown;
  /** `solo`: a Test Marathon chasing their best batter rather than their side. */
  chaseLadder?: unknown;
  /** The innings's best by one batter, for a chase of the Batters ladder. */
  soloRuns?: number;
  /** A Test Survival innings, whose result is what a chase there is judged on. */
  surviveInnings?: SurviveInnings;
}

/** How many of those an innings went past are told so. */
export const PASSED_TOLD = 5;

/**
 * What a post adds to its answer, and to other players' profiles: who it went
 * past and who stands next, and the chase. A chase is judged on runs — make
 * 188 to beat Kabir's 187, as the key said — against the best they hold on the
 * board now, and both ways it is put on their profile; everybody else it went
 * past is told it passed them. Never throws: its failing must not cost the
 * innings it rides on.
 */
export async function afterPost(stores: ProfileStores, posted: Posted, now = Date.now()): Promise<PostExtras> {
  const empty: PostExtras = { around: { passed: [], passedCount: 0, next: null } };
  try {
    await rememberHandle(stores.players, posted.playerId);
    const marathon = posted.mode === 'marathon';
    const board = stores.boards[BOARD_OF[posted.mode]] as Pick<BoardStore<{ runs: number }>, 'slice' | 'rows' | 'standing'>;
    const standing = marathon ? (posted.outcome as MarathonAccepted).standing.team : (posted.outcome as SubmitAccepted<unknown>).standing;
    const improved = marathon ? (posted.outcome as MarathonAccepted).improved.team : (posted.outcome as SubmitAccepted<unknown>).improved;
    const around = await aroundAfter(board, standing, improved);
    const extras: PostExtras = {
      around: { passed: around.passed.slice(0, 2).map(publicOf), passedCount: around.passedCount, next: around.next && publicOf(around.next) },
    };

    const event = (kind: ActivityEvent['kind'], target: number, place: number | null, runs = posted.runs): ActivityEvent => ({
      kind, handle: handleOf(posted.playerId), name: cleanName(posted.name), avatar: posted.avatar,
      mode: posted.mode, runs, target, place, at: now,
    });
    let chased: string | null = null;
    if (isHandle(posted.chase) && posted.chase !== handleOf(posted.playerId)) {
      // A Test Marathon can chase either ladder: the side's total, or the best batter's.
      const solo = marathon && posted.chaseLadder === 'solo' && Number.isFinite(posted.soloRuns);
      const ladder = (solo ? stores.boards.solo : board) as Pick<BoardStore<{ runs: number }>, 'rows' | 'standing'>;
      const runs = solo ? posted.soloRuns! : posted.runs;
      const target = await stores.players.idOf(posted.chase) ?? await findHandle(stores, posted.chase);
      const [row] = target ? await ladder.rows([target]) : [null];
      if (target && row) {
        chased = target;
        const theirs = await ladder.standing(target);
        // Survival is judged on its result, by the board's own packed score:
        // the innings's against the best they hold. Everywhere else, runs.
        const survive = posted.mode === 'survive' && posted.surviveInnings;
        const score = survive ? (posted.outcome as SubmitAccepted<unknown>).score : 0;
        const beat = survive ? theirs.score !== null && score > theirs.score : runs > row.runs;
        const result = survive ? { mine: surviveResultOf(posted.surviveInnings!), theirs: surviveResultOf(row as unknown as SurviveInnings) } : undefined;
        // Passed them, not only beat their best: the chaser is above them now and was not before.
        const mine = solo ? (posted.outcome as MarathonAccepted).standing.solo : standing;
        const dropped = beat && theirs.rank !== null && mine.rank !== null && mine.rank < theirs.rank && (!mine.was || mine.was.rank >= theirs.rank);
        await noteEvent(stores.players, target, {
          ...event(beat ? 'beat' : 'short', row.runs, theirs.rank, runs), ...(result ? { result } : {}), ...(beat ? { dropped } : {}),
        });
        await stores.players.tally(beat ? 'chase-beat' : 'chase-short');
        extras.chase = { handle: posted.chase, name: row.name, target: row.runs, runs, beat, ...(result ? { result } : {}) };
      }
    }
    await Promise.all(around.passed.slice(0, PASSED_TOLD)
      .filter(one => one.id !== chased && one.id !== posted.playerId)
      .map(async one => {
        await noteEvent(stores.players, one.id, event('passed', one.runs, one.place));
        await stores.players.tally('passed');
      }));
    return extras;
  } catch (error) {
    console.error('The profile side of a post did not land.', error);
    return empty;
  }
}

function publicOf(one: Neighbour): PublicNeighbour {
  return { handle: handleOf(one.id), name: one.name, avatar: one.avatar, runs: one.runs, place: one.place };
}

/** Vercel parses a JSON body itself, but a string still arrives on some paths. */
function parse(body: unknown): Record<string, unknown> | null {
  if (typeof body === 'string') {
    try { return parse(JSON.parse(body)); } catch { return null; }
  }
  return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
}

