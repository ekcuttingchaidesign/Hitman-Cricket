import { describe, expect, it } from 'vitest';
import { GAME } from '../src/config/gameplay';
import { plausible, type Innings } from '../src/game/leaderboard';
import { handleOf } from '../src/game/handle';
import { CLASSIC_LADDER, SURVIVE_LADDER, aroundAfter, submitScore, type MarathonAccepted, type SubmitAccepted } from '../src/server/board-store';
import { memoryStore } from '../src/server/memory-store';
import { memoryCareer } from '../src/server/memory-career';
import { memoryPlayers, readActivity, rememberHandle } from '../src/server/player-store';
import {
  afterPost, profileRefused, profileRequest, readOwnActivity, readProfile, type ProfileStores,
} from '../src/server/profile-endpoint';
import type { SurviveInnings } from '../src/game/survive-board';
import { packSolo, type SoloInnings, type TeamInnings } from '../src/game/marathon-board';
import type { BlastCareer, MarathonCareer, SurviveCareer } from '../src/game/career';

/** An innings that adds up, as `board-store.test.ts` builds one: sixes, singles, a wicket, dots. */
const innings = (runs: number): Innings => {
  const sixes = Math.floor(runs / 6), singles = runs % 6, wickets = 1;
  const figures: Innings = { runs, sixes, fours: 0, wickets, dots: GAME.totalBalls - sixes - singles - wickets, balls: GAME.totalBalls };
  if (!plausible(figures)) throw new Error(`fixture could not have happened: ${JSON.stringify(figures)}`);
  return figures;
};

const NAMES = ['Arjun', 'Bela', 'Chirag', 'Dev', 'Esha', 'Farah'];
const idOf = (name: string) => `${name.toLowerCase().padEnd(6, 'x')}-abcdefghijkl`;
const [A, B, C, D, E, F] = NAMES.map(idOf);

function stores(): ProfileStores {
  const names = new Map<string, string>();
  return {
    players: memoryPlayers(),
    boards: {
      classic: memoryStore<Innings>(names), survive: memoryStore<SurviveInnings>(names),
      team: memoryStore<TeamInnings>(names), solo: memoryStore<SoloInnings>(names),
    },
    careers: {
      classic: memoryCareer<BlastCareer>(names), survive: memoryCareer<SurviveCareer>(names),
      marathon: memoryCareer<MarathonCareer>(names),
    },
  };
}

/** A Blast innings posted the way `api/score.ts` posts one, the profile side included. */
async function post(on: ProfileStores, name: string, runs: number, chase?: string) {
  const playerId = idOf(name);
  const outcome = await submitScore(on.boards.classic, CLASSIC_LADDER, {
    playerId, name, avatar: 1, innings: innings(runs), address: `addr-${name}`,
  });
  if (!outcome.ok) throw new Error(outcome.reason);
  const extras = await afterPost(on, { playerId, name, avatar: 1, mode: 'classic', runs, outcome, chase });
  return { outcome: outcome as SubmitAccepted<Innings>, extras };
}

/** Arjun 100, Bela 90, Chirag 80, Dev 70, Esha 60. */
async function board() {
  const on = stores();
  for (const [name, runs] of [['Arjun', 100], ['Bela', 90], ['Chirag', 80], ['Dev', 70], ['Esha', 60]] as const) await post(on, name, runs);
  return on;
}

describe('aroundAfter', () => {
  it('names who an innings went past, best first, and who stands next', async () => {
    const on = await board();
    const { outcome } = await post(on, 'Esha', 85);
    const around = await aroundAfter(on.boards.classic, outcome.standing, outcome.improved);
    expect(around.passedCount).toBe(2);
    expect(around.passed.map(one => [one.name, one.runs, one.place])).toEqual([['Chirag', 80, 4], ['Dev', 70, 5]]);
    expect(around.next).toMatchObject({ name: 'Bela', runs: 90, place: 2 });
  });

  it('goes past nobody on a first innings, and on one that did not beat a best', async () => {
    const on = await board();
    const first = await post(on, 'Farah', 75);
    expect(first.extras.around).toMatchObject({ passed: [], passedCount: 0, next: { name: 'Chirag', place: 3 } });
    const worse = await post(on, 'Bela', 20);
    expect(worse.extras.around).toMatchObject({ passed: [], passedCount: 0, next: { name: 'Arjun', place: 1 } });
  });

  it('has nobody next at the top', async () => {
    const on = await board();
    const { extras } = await post(on, 'Dev', 120);
    expect(extras.around.next).toBeNull();
    expect(extras.around.passedCount).toBe(3);
    // Two named back to the player; the rest is a count.
    expect(extras.around.passed.map(one => one.name)).toEqual(['Arjun', 'Bela']);
  });
});

describe('afterPost', () => {
  it('tells each player passed, with where it left them', async () => {
    const on = await board();
    await post(on, 'Esha', 85);
    const chirag = (await on.players.events(C))[0];
    expect(chirag).toMatchObject({ kind: 'passed', handle: handleOf(E), name: 'Esha', runs: 85, target: 80, place: 4, mode: 'classic' });
    expect((await on.players.events(D))[0]).toMatchObject({ kind: 'passed', place: 5 });
    expect(await on.players.events(A)).toEqual([]);
  });

  it('judges a chase on runs and puts it on the target either way', async () => {
    const on = await board();
    const short = await post(on, 'Esha', 85, handleOf(A));
    expect(short.extras.chase).toEqual({ handle: handleOf(A), name: 'Arjun', target: 100, runs: 85, beat: false });
    expect((await on.players.events(A))[0]).toMatchObject({ kind: 'short', runs: 85, target: 100, place: 1 });

    const level = await post(on, 'Esha', 100, handleOf(A));
    expect(level.extras.chase?.beat).toBe(false);

    const beat = await post(on, 'Esha', 101, handleOf(A));
    expect(beat.extras.chase?.beat).toBe(true);
    const [latest] = await on.players.events(A);
    expect(latest).toMatchObject({ kind: 'beat', runs: 101, target: 100, place: 2 });
    // The target hears about the chase, not a second time that they were passed.
    expect((await on.players.events(A)).filter(one => one.kind === 'passed')).toEqual([]);
  });

  it('keeps whether a beat moved them down: not when the chaser stood above them already', async () => {
    const on = await board();
    const D = idOf('Dev');
    await post(on, 'Bela', 95, handleOf(D));
    expect((await on.players.events(D))[0]).toMatchObject({ kind: 'beat', place: 4, dropped: false });
    await post(on, 'Esha', 75, handleOf(D));
    expect((await on.players.events(D))[0]).toMatchObject({ kind: 'beat', place: 5, dropped: true });
  });

  it('judges a chase of a player whose handle was never noted', async () => {
    const on = await board();
    (on.players as ReturnType<typeof memoryPlayers>).clear();
    const { extras } = await post(on, 'Esha', 101, handleOf(A));
    expect(extras.chase).toMatchObject({ name: 'Arjun', beat: true });
    expect((await on.players.events(A))[0]).toMatchObject({ kind: 'beat' });
  });

  it('ignores a chase of nobody, and of yourself', async () => {
    const on = await board();
    expect((await post(on, 'Esha', 65, '0123456789abcdef')).extras.chase).toBeUndefined();
    expect((await post(on, 'Esha', 66, handleOf(E))).extras.chase).toBeUndefined();
    expect((await post(on, 'Esha', 67, 'not a handle')).extras.chase).toBeUndefined();
  });

  it('tallies each chase by how it ended and each player passed, for the report', async () => {
    const on = await board();
    const { tallied } = on.players as ReturnType<typeof memoryPlayers>;
    expect([...tallied]).toEqual([]);
    await post(on, 'Esha', 85);
    expect(tallied.get('passed')).toBe(2);
    await post(on, 'Esha', 95, handleOf(A));
    expect(tallied.get('chase-short')).toBe(1);
    expect(tallied.get('passed')).toBe(3);
    await post(on, 'Esha', 101, handleOf(A));
    expect(tallied.get('chase-beat')).toBe(1);
    // The one chased is told of the chase, and tallied for it, not as a pass besides.
    expect(tallied.get('passed')).toBe(3);
  });

  it('leaves no player id in what it answers', async () => {
    const on = await board();
    const { extras } = await post(on, 'Esha', 101, handleOf(A));
    const sent = JSON.stringify(extras);
    for (const id of [A, B, C, D, E]) expect(sent).not.toContain(id);
  });

  it('never fails the post it rides on', async () => {
    const on = await board();
    on.players.addEvent = async () => { throw new Error('down'); };
    on.players.rememberHandle = async () => { throw new Error('down'); };
    await expect(post(on, 'Esha', 85, handleOf(A))).resolves.toBeTruthy();
  });
});

describe('readOwnActivity', () => {
  it('says whether a beat has been won back, from where both stand now', async () => {
    const on = await board();
    await post(on, 'Esha', 101, handleOf(A));
    expect((await readOwnActivity(on, A))?.events[0]).toMatchObject({ kind: 'beat', wonBack: false });
    await post(on, 'Arjun', 110);
    expect((await readOwnActivity(on, A))?.events[0]).toMatchObject({ kind: 'beat', wonBack: true });
  });
});

describe('readProfile', () => {
  it('opens a named player by handle with their best and place, and counts the look', async () => {
    const on = await board();
    const profile = await readProfile(on, handleOf(B), handleOf(C));
    expect(profile).toMatchObject({ handle: handleOf(B), name: 'Bela', avatar: 1, bio: null });
    expect(profile?.modes.classic.best).toEqual({ runs: 90, place: 2, total: 5 });
    expect(profile?.modes.classic.bestRank).toBe(2);
    expect(profile?.modes.survive.best).toBeNull();
    expect(JSON.stringify(profile)).not.toContain(B);
    expect((await readActivity(on.players, B))?.views).toBe(1);
  });

  it('counts a viewer once a day, never a stranger, never the player themselves', async () => {
    const on = await board();
    await readProfile(on, handleOf(B), handleOf(C));
    await readProfile(on, handleOf(B), handleOf(C));
    await readProfile(on, handleOf(B), handleOf(B));
    await readProfile(on, handleOf(B), '0123456789abcdef');
    await readProfile(on, handleOf(B), undefined);
    expect((await readActivity(on.players, B))?.views).toBe(1);
    // The store's tally counts the look as the profile does: once.
    expect((on.players as ReturnType<typeof memoryPlayers>).tallied.get('profile-view')).toBe(1);
  });

  it('finds a player on a board whose handle was never noted, and notes it', async () => {
    const on = await board();
    (on.players as ReturnType<typeof memoryPlayers>).clear();
    expect(await on.players.idOf(handleOf(B))).toBeNull();
    expect((await readProfile(on, handleOf(B), undefined))?.name).toBe('Bela');
    expect(await on.players.idOf(handleOf(B))).toBe(B);
  });

  it('is nobody for a handle never seen', async () => {
    const on = await board();
    expect(await readProfile(on, '0123456789abcdef', undefined)).toBeNull();
    await rememberHandle(on.players, F);
    expect(await readProfile(on, handleOf(F), undefined)).toBeNull();
  });
});

describe('profileRequest', () => {
  it('saves a bio for a player holding the name they send, and shows it on their profile', async () => {
    const on = await board();
    const saved = await profileRequest(on, { method: 'POST', query: {}, body: { playerId: B, name: 'Bela', bio: '  Six or   nothing. ' }, address: 'x' });
    expect(saved).toMatchObject({ ok: true, body: { ok: true, bio: 'Six or nothing.' } });
    expect((await readProfile(on, handleOf(B), undefined))?.bio).toBe('Six or nothing.');
    const cleared = await profileRequest(on, { method: 'POST', query: {}, body: { playerId: B, name: 'Bela', bio: '' }, address: 'x' });
    expect(cleared).toMatchObject({ ok: true, body: { bio: null } });
  });

  it('refuses a bio under somebody else\'s name, or one that says how to reach you', async () => {
    const on = await board();
    const theirs = await profileRequest(on, { method: 'POST', query: {}, body: { playerId: B, name: 'Arjun', bio: 'hi' }, address: 'x' });
    expect(profileRefused(theirs) && theirs.status).toBe(403);
    const contact = await profileRequest(on, { method: 'POST', query: {}, body: { playerId: B, name: 'Bela', bio: 'insta @bela_99' }, address: 'x' });
    expect(profileRefused(contact) && contact.status).toBe(422);
  });

  it('answers a profile, your own activity, and nothing for a bad handle', async () => {
    const on = await board();
    expect(await profileRequest(on, { method: 'GET', query: { handle: handleOf(A) }, address: 'x' })).toMatchObject({ ok: true, cache: 'private, no-store' });
    expect(await profileRequest(on, { method: 'GET', query: { player: A }, address: 'x' })).toMatchObject({ ok: true, body: { views: 0, events: [] } });
    const bad = await profileRequest(on, { method: 'GET', query: { handle: A }, address: 'x' });
    expect(profileRefused(bad) && bad.status).toBe(400);
    const missing = await profileRequest(on, { method: 'GET', query: { handle: '0123456789abcdef' }, address: 'x' });
    expect(profileRefused(missing) && missing.status).toBe(404);
  });
});

describe("the Test Marathon's best-batter chase", () => {
  it("is judged on the innings's best batter against their best batter, and says so on the profile", async () => {
    const on = stores();
    const solo = (runs: number) => ({ runs, balls: runs, out: true, order: 1, left: false });
    await on.boards.solo.record(A, packSolo(solo(141), Date.now()), { ...solo(141), name: 'Arjun', avatar: 1, at: Date.now() });
    await rememberHandle(on.players, A);
    const nothing = { rank: null, score: null, total: 0, was: null };
    const outcome = { ok: true, improved: { team: false, solo: false }, score: { team: 0, solo: 0 }, at: Date.now(), board: {} as MarathonAccepted['board'], standing: { team: nothing, solo: nothing } } as MarathonAccepted;
    const extras = await afterPost(on, { playerId: E, name: 'Esha', avatar: 1, mode: 'marathon', runs: 300, soloRuns: 150, outcome, chase: handleOf(A), chaseLadder: 'solo' });
    expect(extras.chase).toEqual({ handle: handleOf(A), name: 'Arjun', target: 141, runs: 150, beat: true });
    expect((await on.players.events(A))[0]).toMatchObject({ kind: 'beat', mode: 'marathon', runs: 150, target: 141 });
    // And their profile offers it, under the Marathon's six.
    expect((await readProfile(on, handleOf(A), undefined))?.modes.marathon.solo).toEqual({ runs: 141, out: true, place: 1 });
  });
});

describe("a Test Survival chase", () => {
  /** A Survival innings bowled out after so many balls, posted the way api/score posts one. */
  async function bat(on: ProfileStores, name: string, balls: number, runs: number, chase?: string) {
    const playerId = idOf(name);
    const innings: SurviveInnings = { runs, balls, wickets: 1, blows: 0, health: 100 };
    const outcome = await submitScore(on.boards.survive, SURVIVE_LADDER, { playerId, name, avatar: 1, innings, address: `addr-${name}` });
    if (!outcome.ok) throw new Error(outcome.reason);
    return afterPost(on, { playerId, name, avatar: 1, mode: 'survive', runs, outcome, chase, surviveInnings: innings });
  }

  it("is judged on the result, as the board ranks it, not on runs", async () => {
    const on = stores();
    await bat(on, 'Arjun', 40, 30);
    // Fewer runs, but lasted longer: outlasted.
    const longer = await bat(on, 'Esha', 46, 20, handleOf(A));
    expect(longer.chase).toMatchObject({ beat: true, result: { mine: { kind: 'lost', balls: 46 }, theirs: { kind: 'lost', balls: 40 } } });
    expect((await on.players.events(A))[0]).toMatchObject({ kind: 'beat', mode: 'survive', result: { theirs: { balls: 40 } } });
    // More runs, but out sooner: short.
    const sooner = await bat(on, 'Farah', 36, 90, handleOf(A));
    expect(sooner.chase?.beat).toBe(false);
  });

  it("carries their result on their profile, for the key", async () => {
    const on = stores();
    await bat(on, 'Arjun', 40, 30);
    expect((await readProfile(on, handleOf(A), undefined))?.modes.survive.best?.result).toEqual({ kind: 'lost', balls: 40, runs: 30 });
  });
});
