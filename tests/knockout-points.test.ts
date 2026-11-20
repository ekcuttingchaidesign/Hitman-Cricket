import { describe, expect, it } from 'vitest';
import { handleOf } from '../src/game/handle';
import { LIVE_RULES, PREVIEW_RULES, pointsFor, weekOf, winCounts, worthOf } from '../src/game/knockout-points';
import { matchBowling, matchPlan, replayMatch, seatBallOf } from '../src/game/knockout-replay';
import { DeliveryGenerator } from '../src/game/DeliveryGenerator';
import { SeededRandom } from '../src/game/SeededRandom';
import { foldName } from '../src/server/board-store';
import {
  EMPTY_KNOCKOUT_CAREER, RAN_AWAY_PLACE, RATE_FROM, creditCareer, creditMatch, knockoutBoards, knockoutStanding, ladderScores, memoryLedger,
  type KnockoutCredit,
} from '../src/server/knockout-ledger';
import { resultOf } from '../src/server/knockout-result';
import {
  POINTS_RULES, backToRoom, cardOf, doneMatch, hostMatch, joinMatch, leaveMatch, matchRefused, memoryKnockouts, parseMatch, readMatch, readyMatch, settleMatch, startMatch,
  type MatchOutcome, type MatchView, type Member,
} from '../src/server/knockout-store';
import { playMatch } from './knockout-play';

/**
 * What a match with friends is worth, and who is paid (`knockout-points.ts`,
 * `knockout-result.ts`, `knockout-ledger.ts`): the table, the store working
 * the result out for itself from the cards it holds, points paid once, and the
 * career and ladders they land on.
 */
const ids = Array.from({ length: 12 }, (_, i) => `abcd${String(i).padStart(2, '0')}-abcdefghijkl${i}`);
const names = ['Mojo', 'Tanvi', 'Farhan', 'Gauri', 'Jatin', 'Leela', 'Nikhil', 'Oviya', 'Pranav', 'Qadir', 'Rekha', 'Sahil'];
const as = (i: number): Member => ({ playerId: ids[i], name: names[i], avatar: i % 5, address: `10.0.1.${i}` });
const T0 = Date.UTC(2026, 10, 18, 18, 0, 0);
const ok = (outcome: MatchOutcome): MatchView => {
  if (matchRefused(outcome)) throw new Error(outcome.reason);
  return outcome.match;
};
function setup() {
  const store = memoryKnockouts();
  const owners = new Map(ids.map((id, i) => [foldName(names[i]), id]));
  const ledger = memoryLedger(folded => owners.get(folded) ?? null);
  return { store, ledger, owners };
}
/** A room of the first `n` players, started. */
async function started(n: number, world = setup()) {
  const { store } = world;
  // The same code and seed every run, so the subs bat the same and the places below are the same.
  const { code } = ok(await hostMatch(store, as(0), T0, () => 0.37));
  for (let i = 1; i < n; i++) { ok(await joinMatch(store, code, as(i), T0 + 10 * i)); ok(await readyMatch(store, code, as(i), true, T0 + 10 * i + 5)); }
  ok(await startMatch(store, code, as(0), T0 + 500));
  return { ...world, code, members: Array.from({ length: n }, (_, i) => as(i)) };
}
/** Player 0 hits every ball for six, so nobody in the room can catch them; the rest block. */
const sixes = (who: number) => (who === 0 ? '6' : '0');

describe('what a match is worth', () => {
  it('pays the top three by how many real players batted, as the product says', () => {
    expect([1, 2].map(n => worthOf(n))).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(worthOf(3)).toEqual([3, 1, 0]);
    expect([4, 5].map(n => worthOf(n))).toEqual([[5, 2, 1], [5, 2, 1]]);
    expect([6, 7].map(n => worthOf(n))).toEqual([[7, 3, 1], [7, 3, 1]]);
    expect([8, 9].map(n => worthOf(n))).toEqual([[8, 4, 2], [8, 4, 2]]);
    expect([10, 11, 12].map(n => worthOf(n))).toEqual([[10, 5, 2], [10, 5, 2], [10, 5, 2]]);
    expect(pointsFor(1, 5)).toBe(5);
    expect(pointsFor(3, 5)).toBe(1);
    expect(pointsFor(4, 12)).toBe(0);
    expect(pointsFor(0, 12)).toBe(0);
  });
  it('counts a win only with four real players or more', () => {
    expect([3, 4, 12].map(n => winCounts(n))).toEqual([false, true, true]);
  });
  it('lets a preview pay from two, so a phone and a computer are enough to see it', () => {
    expect(worthOf(2, PREVIEW_RULES)).toEqual([3, 1, 0]);
    expect(worthOf(1, PREVIEW_RULES)).toEqual([0, 0, 0]);
    expect(winCounts(2, PREVIEW_RULES)).toBe(true);
    expect(LIVE_RULES).toEqual({ pointsFrom: 3, winsFrom: 4 });
    // The tests run as a preview does.
    expect(POINTS_RULES).toBe(PREVIEW_RULES);
  });
  it('turns the week over on Monday morning in India', () => {
    const monday = Date.UTC(2026, 10, 15, 18, 30);
    expect(weekOf(monday)).toBe('2026-11-16');
    expect(weekOf(monday - 60_000)).toBe('2026-11-09');
    expect(weekOf(monday + 7 * 86_400_000 - 60_000)).toBe('2026-11-16');
    expect(weekOf(monday + 7 * 86_400_000)).toBe('2026-11-23');
  });
});

describe('a match played back', () => {
  it('is bowled as the game bowls it: the knockout’s overs off the seed, no yorker owed for sixes', () => {
    const seed = 123456;
    const at = matchBowling(seed), generator = new DeliveryGenerator(new SeededRandom(seed), matchPlan(seed));
    for (let ball = 0; ball < 30; ball++) expect(at(ball)).toEqual(generator.next(0));
    expect(at(30)).toBeNull();
    expect(matchPlan(seed).specials.sixesForYorker).toBe(Infinity);
  });
  it('reads a card’s ball as the room takes it', () => {
    expect(seatBallOf(undefined)).toBeNull();
    expect(seatBallOf('S')).toBe('sub');
    expect(seatBallOf('W')).toMatchObject({ runs: 0, isWicket: true });
    expect(seatBallOf('6')).toMatchObject({ runs: 6, isWicket: false });
  });
  it('comes to the same room from the same cards, and stops where they do', async () => {
    const { store, code, members } = await started(3);
    const part = await playMatch(store, code, members, T0 + 5000, sixes, new Set(), room => room.roomBalls >= 12);
    const seats = part.view.seats.map(handle => { const m = part.view.members.find(one => one.handle === handle)!; return { name: m.name, face: m.avatar, sub: false, handle, card: m.card }; });
    const a = replayMatch(part.view.seed, seats), b = replayMatch(part.view.seed, seats);
    expect(a.done).toBe(false);
    expect(a.table().map(s => `${s.name}:${s.runs}:${s.place}`)).toEqual(b.table().map(s => `${s.name}:${s.runs}:${s.place}`));
    // With every ball never sent a sub's, the same cards come to an end.
    expect(replayMatch(part.view.seed, seats, true).done).toBe(true);
  });
});

describe('the result, worked out by the store', () => {
  const held = async (store: ReturnType<typeof memoryKnockouts>, code: string) => parseMatch(await store.read(code))!;

  it('has none until the match is at its end on the cards it holds', async () => {
    const { store, code, members } = await started(3);
    const match = await held(store, code);
    expect(resultOf(match, id => cardOf(match, id), PREVIEW_RULES, T0)).toBeNull();
    await playMatch(store, code, members, T0 + 5000, sixes, new Set(), room => room.roomBalls >= 6);
    const mid = await held(store, code);
    expect(resultOf(mid, id => cardOf(mid, id), PREVIEW_RULES, T0)).toBeNull();
  });

  it('places all twelve, the winner first, and pays the top three only where a real player took the place', async () => {
    const { store, code, members } = await started(3);
    const { room } = await playMatch(store, code, members, T0 + 5000, sixes);
    const match = await held(store, code);
    const found = resultOf(match, id => cardOf(match, id), PREVIEW_RULES, T0 + 99)!;
    const { result, credits } = found;
    expect(result.rows).toHaveLength(12);
    expect(result.rows.map(r => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.rows[0]).toMatchObject({ name: 'Mojo', handle: handleOf(ids[0]), sub: false, place: 1, runs: 180, points: 3, stood: false, ran: false, over: null });
    expect(room.winner!.name).toBe('Mojo');
    expect(result).toMatchObject({ round: 1, reals: 3, worth: [3, 1, 0], counted: true, at: T0 + 99 });
    // Second and third went to subs: those places pay nobody, and a sub is never paid.
    expect(result.rows[1].sub && result.rows[2].sub).toBe(true);
    expect(result.rows.filter(r => r.points > 0).map(r => r.name)).toEqual(['Mojo']);
    // The two who blocked every ball were cut on their totals, outside the top three, and are told which over took them.
    const blockers = result.rows.filter(r => !r.sub && r.name !== 'Mojo');
    expect(blockers.every(r => r.place > 3 && r.points === 0 && r.runs === 0 && !r.out)).toBe(true);
    expect(blockers.every(r => r.over !== null && r.balls === r.over * 6)).toBe(true);
    // Every real player is credited, by id, for the ledger alone.
    expect(credits.map(c => c.id).sort()).toEqual(ids.slice(0, 3).sort());
    expect(credits.find(c => c.id === ids[0])).toMatchObject({ place: 1, points: 3, win: true, runs: 180 });
    // Nothing a phone is told carries an id.
    for (const id of ids) expect(JSON.stringify(result)).not.toContain(id);
  });

  it('counts a win only where the rules say a win counts, and nothing at all below the least for points', async () => {
    const { store, code, members } = await started(3);
    await playMatch(store, code, members, T0 + 5000, sixes);
    const match = await held(store, code);
    const live = resultOf(match, id => cardOf(match, id), LIVE_RULES, T0)!;
    expect(live.result.rows[0].points).toBe(3);
    expect(live.credits.find(c => c.id === ids[0])!.win).toBe(false);
    const strict = resultOf(match, id => cardOf(match, id), { pointsFrom: 4, winsFrom: 4 }, T0)!;
    expect(strict.result.counted).toBe(false);
    expect(strict.result.worth).toEqual([0, 0, 0]);
    expect(strict.result.rows.every(r => r.points === 0)).toBe(true);
    expect(strict.credits).toEqual([]);
  });

  it('keeps the place of a seat a sub batted to its finish, and pays it nothing', async () => {
    const { store, code, members } = await started(3);
    // Tanvi bats the first over herself, six a ball, then goes quiet: a sub bats her seat from there.
    await playMatch(store, code, members, T0 + 5000, who => (who === 2 ? '0' : '6'), new Set(), room => room.roomBalls >= 6);
    await playMatch(store, code, members, T0 + 60_000, who => (who === 2 ? '0' : '6'), new Set([1]));
    const match = await held(store, code);
    const { result, credits } = resultOf(match, id => cardOf(match, id), PREVIEW_RULES, T0)!;
    const tanvi = result.rows.find(r => r.name === 'Tanvi')!;
    expect(tanvi).toMatchObject({ stood: true, ran: false, points: 0 });
    expect(credits.find(c => c.id === ids[1])).toMatchObject({ stood: true, ran: false, points: 0, win: false, place: tanvi.place });
    // She batted balls of her own, so she still counts among the real players the match is worth by.
    expect(result.reals).toBe(3);
  });

  it('marks somebody who walked out while still batting as ran away', async () => {
    const { store, code, members } = await started(3);
    await playMatch(store, code, members, T0 + 5000, () => '4', new Set(), room => room.roomBalls >= 6);
    ok(await leaveMatch(store, code, as(2), T0 + 20_000));
    await playMatch(store, code, members, T0 + 21_000, () => '4', new Set([2]));
    const match = await held(store, code);
    const { result, credits } = resultOf(match, id => cardOf(match, id), PREVIEW_RULES, T0)!;
    expect(result.rows.find(r => r.name === 'Farhan')).toMatchObject({ stood: true, ran: true, points: 0 });
    expect(credits.find(c => c.id === ids[2])).toMatchObject({ ran: true, points: 0 });
  });
});

describe('points, paid by the store', () => {
  it('pays once when a phone says the match is over, however many say so, and tells every phone the result', async () => {
    const { store, ledger, code, members } = await started(3);
    const played = await playMatch(store, code, members, T0 + 5000, sixes);
    const first = ok(await doneMatch(store, code, as(0), 1, played.at + 100, ledger));
    const again = ok(await doneMatch(store, code, as(1), 1, played.at + 200, ledger));
    expect(first.over && again.over).toBe(true);
    expect(first.result).toMatchObject({ round: 1, reals: 3, counted: true });
    expect(first.result!.rows[0]).toMatchObject({ name: 'Mojo', points: 3 });
    const [mojo, tanvi] = await ledger.many([ids[0], ids[1]]);
    expect(mojo!.career).toMatchObject({ played: 1, wins: 1, top3: 1, points: 3, best: 180, last: [1], weekPoints: 3, weekWins: 1, weekPlayed: 1 });
    expect(tanvi!.career).toMatchObject({ played: 1, wins: 0, top3: 0, points: 0, best: 0 });
    expect(tanvi!.career.last[0]).toBe(first.result!.rows.find(r => r.name === 'Tanvi')!.place);
    expect(mojo!.name).toBe('Mojo');
  });

  it('does not take a phone’s word for it: said before the end, nothing is over and nothing is paid', async () => {
    const { store, ledger, code, members } = await started(3);
    await playMatch(store, code, members, T0 + 5000, sixes, new Set(), room => room.roomBalls >= 12);
    const soon = ok(await doneMatch(store, code, as(0), 1, T0 + 50_000, ledger));
    expect(soon.over).toBe(false);
    expect(soon.result).toBeNull();
    expect(await ledger.many([ids[0]])).toEqual([null]);
  });

  it('keeps the result for the room’s lobby, and pays nothing a second time when the room settles', async () => {
    const { store, ledger, code, members } = await started(3);
    const played = await playMatch(store, code, members, T0 + 5000, sixes);
    ok(await doneMatch(store, code, as(0), 1, played.at + 100, ledger));
    const lobby = ok(await settleMatch(store, code, as(0), played.at + 500, () => 0.5, ledger));
    expect(lobby).toMatchObject({ state: 'lobby', round: 2 });
    expect(lobby.result).toMatchObject({ round: 1 });
    expect(lobby.result!.rows[0].name).toBe('Mojo');
    expect((await ledger.many([ids[0]]))[0]!.career.played).toBe(1);
  });

  it('brings a match everybody has left to its end itself, a sub batting what was never sent, and pays what was settled', async () => {
    const { store, ledger, code, members } = await started(3);
    // Two bat on to the final; nobody says it is over, and all three go back to the room.
    const part = await playMatch(store, code, members, T0 + 5000, sixes, new Set(), room => room.roomBalls >= 12);
    let at = part.at;
    let room!: MatchView;
    for (const i of [0, 1, 2]) room = ok(await backToRoom(store, code, as(i), at += 100, ledger));
    expect(room).toMatchObject({ state: 'lobby', round: 2 });
    expect(room.result).toMatchObject({ round: 1, counted: true });
    // Mojo's seat was finished by a sub: whatever it came to, it pays him nothing, and it is not a win of his.
    const mojo = room.result!.rows.find(r => r.name === 'Mojo')!;
    expect(mojo).toMatchObject({ stood: true, points: 0 });
    const [career] = await ledger.many([ids[0]]);
    expect(career!.career).toMatchObject({ played: 1, wins: 0, points: 0, best: 0 });
    // Settled again off a stale read, it still pays once.
    ok(await settleMatch(store, code, as(0), at + 500, () => 0.5, ledger));
    expect((await ledger.many([ids[0]]))[0]!.career.played).toBe(1);
  });

  it('counts nothing for a match only one real player batted: that is practice', async () => {
    // Two seated, and the friend never sends a ball: a sub bats their seat from the first.
    const { store, ledger, code, members } = await started(2);
    const played = await playMatch(store, code, members, T0 + 60_000, () => '6', new Set([1]));
    const over = ok(await doneMatch(store, code, as(0), 1, played.at + 100, ledger));
    expect(over.over).toBe(true);
    expect(over.result).toMatchObject({ reals: 1, counted: false, worth: [0, 0, 0] });
    expect(over.result!.rows[0]).toMatchObject({ name: 'Mojo', points: 0 });
    expect(await ledger.many([ids[0]])).toEqual([null]);
  });

  it('says in the lobby what the match is worth, by who is in the room', async () => {
    const { store } = setup();
    const alone = ok(await hostMatch(store, as(0), T0));
    expect(alone.worth).toEqual([0, 0, 0]);
    expect(alone.pointsFrom).toBe(PREVIEW_RULES.pointsFrom);
    let room = alone;
    for (const i of [1, 2, 3]) room = ok(await joinMatch(store, alone.code, as(i), T0 + i));
    expect(room.worth).toEqual([5, 2, 1]);
    expect(ok(await readMatch(store, alone.code, T0 + 10)).result).toBeNull();
  });

  it('survives a ledger out of reach: the match is still over and its result kept', async () => {
    const { store, code, members } = await started(3);
    const played = await playMatch(store, code, members, T0 + 5000, sixes);
    const broken = { ...memoryLedger(), many: async () => { throw new Error('down'); } };
    const over = ok(await doneMatch(store, code, as(0), 1, played.at + 100, broken));
    expect(over.over).toBe(true);
    expect(over.result!.rows[0].name).toBe('Mojo');
  });
});

describe('the Knockout career and its ladders', () => {
  const credit = (over: Partial<KnockoutCredit>): KnockoutCredit => ({ id: ids[0], name: names[0], avatar: 0, place: 5, runs: 40, points: 0, win: false, stood: false, ran: false, ...over });

  it('adds a match to a career: finishes, the best total, the last five', () => {
    let career = creditCareer(null, credit({ place: 1, runs: 91, points: 5, win: true }), '2026-11-16');
    expect(career).toMatchObject({ played: 1, wins: 1, top3: 1, places: 1, best: 91, points: 5, last: [1], weekPoints: 5, weekWins: 1, weekPlayed: 1 });
    for (const place of [6, 3, 9, 2, 7]) career = creditCareer(career, credit({ place, runs: 50 + place, points: place <= 3 ? 1 : 0 }), '2026-11-16');
    expect(career).toMatchObject({ played: 6, wins: 1, top3: 3, places: 28, best: 91, points: 7, last: [6, 3, 9, 2, 7] });
  });
  it('starts the week’s figures again in a new week, and keeps the career’s', () => {
    const before = creditCareer(null, credit({ place: 1, points: 5, win: true }), '2026-11-16');
    const after = creditCareer(before, credit({ place: 2, points: 2 }), '2026-11-23');
    expect(after).toMatchObject({ points: 7, wins: 1, played: 2, week: '2026-11-23', weekPoints: 2, weekWins: 0, weekPlayed: 1 });
  });
  it('counts a match run away from as last place, with no best and no top three from a sub’s batting', () => {
    const ran = creditCareer(null, credit({ place: 2, runs: 88, ran: true, stood: true }), '2026-11-16');
    expect(ran).toMatchObject({ played: 1, places: RAN_AWAY_PLACE, best: 0, top3: 0, last: [0] });
    const stood = creditCareer(null, credit({ place: 2, runs: 88, stood: true }), '2026-11-16');
    expect(stood).toMatchObject({ played: 1, places: 2, best: 0, top3: 0, last: [2] });
  });
  it('ranks a win rate only from ten matches', () => {
    expect(ladderScores({ ...EMPTY_KNOCKOUT_CAREER, played: RATE_FROM - 1, wins: 9 }).rate).toBeNull();
    const ten = ladderScores({ ...EMPTY_KNOCKOUT_CAREER, played: RATE_FROM, wins: 5 }).rate!;
    const better = ladderScores({ ...EMPTY_KNOCKOUT_CAREER, played: 20, wins: 12 }).rate!;
    expect(better).toBeGreaterThan(ten);
  });

  it('ranks only a player whose name is theirs, by handle, on every ladder at once', async () => {
    const { ledger } = setup();
    const now = Date.UTC(2026, 10, 18, 12);
    await creditMatch(ledger, [
      credit({ id: ids[0], name: 'Mojo', place: 1, runs: 95, points: 5, win: true }),
      credit({ id: ids[1], name: 'Tanvi', place: 2, runs: 80, points: 2 }),
      credit({ id: ids[2], name: 'Somebody Else', place: 3, runs: 70, points: 1 }),
    ], now);
    const answer = await knockoutBoards(ledger, now);
    expect(answer.week).toBe('2026-11-16');
    expect(answer.boards.points.week.map(r => [r.name, r.points, r.wins, r.played])).toEqual([['Mojo', 5, 1, 1], ['Tanvi', 2, 0, 1]]);
    expect(answer.boards.points.all.map(r => r.name)).toEqual(['Mojo', 'Tanvi']);
    expect(answer.boards.wins.all.map(r => r.name)).toEqual(['Mojo', 'Tanvi']);
    expect(answer.boards.best.map(r => [r.name, r.best])).toEqual([['Mojo', 95], ['Tanvi', 80]]);
    expect(answer.boards.rate).toEqual([]);
    expect(answer.boards.points.week[0].handle).toBe(handleOf(ids[0]));
    for (const id of ids) expect(JSON.stringify(answer)).not.toContain(id);
    // The one whose name is not theirs is counted, and ranked nowhere.
    expect((await ledger.many([ids[2]]))[0]!.career.points).toBe(1);
  });

  it('keeps this week apart from all time', async () => {
    const { ledger } = setup();
    const lastWeek = Date.UTC(2026, 10, 11, 12), now = Date.UTC(2026, 10, 18, 12);
    await creditMatch(ledger, [credit({ id: ids[0], name: 'Mojo', place: 1, points: 10, win: true }), credit({ id: ids[1], name: 'Tanvi', place: 2, points: 5 })], lastWeek);
    await creditMatch(ledger, [credit({ id: ids[1], name: 'Tanvi', place: 1, points: 3, win: true })], now);
    const answer = await knockoutBoards(ledger, now);
    expect(answer.boards.points.week.map(r => [r.name, r.points])).toEqual([['Tanvi', 3]]);
    expect(answer.boards.points.all.map(r => [r.name, r.points])).toEqual([['Mojo', 10], ['Tanvi', 8]]);
  });

  it('says where one player stands: their record, their places, and how far the place above is this week', async () => {
    const { ledger } = setup();
    const now = Date.UTC(2026, 10, 18, 12);
    await creditMatch(ledger, [
      credit({ id: ids[0], name: 'Mojo', place: 1, points: 10, win: true }),
      credit({ id: ids[1], name: 'Tanvi', place: 2, points: 5 }),
      credit({ id: ids[3], name: 'Gauri', place: 9 }),
    ], now);
    const tanvi = await knockoutStanding(ledger, ids[1], now);
    if (!tanvi.ok) throw new Error(tanvi.reason);
    expect(tanvi.career).toMatchObject({ points: 5, played: 1 });
    expect(tanvi.places.points).toEqual({ week: 2, all: 2 });
    expect(tanvi.behind).toBe(5);
    const mojo = await knockoutStanding(ledger, ids[0], now);
    expect(mojo.ok && mojo.behind).toBeNull();
    // A week on with nothing played: the week's figures are told as nothing, the career's stand.
    const later = await knockoutStanding(ledger, ids[1], now + 7 * 86_400_000);
    expect(later.ok && later.career).toMatchObject({ points: 5, weekPoints: 0, weekPlayed: 0 });
    expect(later.ok && later.places.points).toEqual({ week: null, all: 2 });
    const nobody = await knockoutStanding(ledger, ids[9], now);
    expect(nobody.ok && nobody.career).toBeNull();
    const bad = await knockoutStanding(ledger, 'nope', now);
    expect(bad.ok).toBe(false);
  });
});
