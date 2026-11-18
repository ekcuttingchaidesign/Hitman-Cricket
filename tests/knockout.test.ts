import { describe, expect, it } from 'vitest';
import { CLASSIC_PLAN, DeliveryGenerator, knockoutPlan } from '../src/game/DeliveryGenerator';
import { EDGE_RUNS, KNOCKOUT, KnockoutRoom, chipOf, cutLine, cutOf, freeHitOf, overLine, trackOf, type Seat } from '../src/game/knockout';
import { SeededRandom } from '../src/game/SeededRandom';
import { knockoutCardWords, tallyRoom } from '../src/ui/KnockoutHome';
import type { ShotOutcome } from '../src/game/types';

const seat = (id: number, runs: number, out = false): Seat =>
  ({ id, name: `P${id}`, sub: id > 0, face: 0, runs, balls: 6, fours: 0, sixes: 0, out, place: null, wentAt: null });
const ball = (runs: ShotOutcome['runs'], isWicket = false) =>
  ({ runs, isWicket, quality: 0, feedback: '', timingGrade: 'GOOD', timingDeltaMs: 0, compatibility: 1, madeBatContact: true, aerial: false }) as ShotOutcome;
const bowler = (seed: number) => { const g = new DeliveryGenerator(new SeededRandom(seed), CLASSIC_PLAN); return () => g.next(0); };

describe('the cut', () => {
  it('takes the lowest totals', () => {
    const room = [seat(0, 10), seat(1, 4), seat(2, 7), seat(3, 2)];
    expect(cutOf(room, 2).gone.map(s => s.id)).toEqual([3, 1]);
  });
  it('takes everybody out first, however many that is', () => {
    const room = [seat(0, 30, true), seat(1, 1), seat(2, 25, true), seat(3, 22, true), seat(4, 3)];
    expect(cutOf(room, 2).gone.map(s => s.id).sort()).toEqual([0, 2, 3]);
  });
  it('fills the count with the lowest totals once the outs are taken', () => {
    const room = [seat(0, 30, true), seat(1, 1), seat(2, 9), seat(3, 5)];
    expect(cutOf(room, 2).gone.map(s => s.id).sort()).toEqual([0, 1]);
  });
  it('lets a tie at the line take both through', () => {
    const room = [seat(0, 10), seat(1, 4), seat(2, 6), seat(3, 6), seat(4, 12)];
    const { gone, level } = cutOf(room, 2);
    expect(gone.map(s => s.id)).toEqual([1]);
    expect([...level].map(s => s.id).sort()).toEqual([2, 3]);
  });
  it('never takes the whole room: the best of those out stays', () => {
    const room = [seat(0, 9, true), seat(1, 14, true), seat(2, 3, true)];
    expect(cutOf(room, 2).gone.map(s => s.id)).toEqual([2, 0]);
  });
});

describe('a room', () => {
  it('seats the player and eleven subs', () => {
    const room = new KnockoutRoom(1, { name: 'Shashank', face: 2 });
    expect(room.seats).toHaveLength(KNOCKOUT.seats);
    expect(room.you).toMatchObject({ id: 0, name: 'Shashank', sub: false });
    expect(room.seats.slice(1).every(s => s.sub)).toBe(true);
  });

  it('is the same room for the same seed and the same balls', () => {
    const play = () => {
      const room = new KnockoutRoom(77, { name: 'You', face: 0 }), next = bowler(77);
      for (let i = 0; i < 12; i++) room.ball(next(), ball(1));
      return room.seats.map(s => `${s.runs}${s.out ? 'w' : ''}${s.place ?? ''}`).join(',');
    };
    expect(play()).toEqual(play());
  });

  it("cuts at each over's end as K2b's ladder says: every out, then the lowest totals", () => {
    for (const seed of [3, 11, 29, 41, 58]) {
      const room = new KnockoutRoom(seed, { name: 'You', face: 0 }), next = bowler(seed);
      for (let over = 1; over <= 4; over++) {
        for (let b = 0; b < 5; b++) room.ball(next(), ball(6));
        const before = room.alive.map(s => ({ ...s }));
        const news = room.ball(next(), ball(6));
        const outs = before.filter(s => s.out || room.seats[s.id].out);
        const survivors = room.alive.filter(s => s !== room.winner);
        // Nobody out survives a cut.
        expect(survivors.some(s => s.out)).toBe(false);
        // Nobody standing goes while somebody with fewer runs stays.
        const lowest = Math.min(...survivors.map(s => s.runs));
        for (const s of news.gone.filter(g => !g.out)) expect(s.runs).toBeLessThanOrEqual(lowest);
        // The count: the outs and enough more to make it up, fewer only for a tie at the line.
        const standingGone = news.gone.filter(g => !g.out).length;
        expect(standingGone).toBeLessThanOrEqual(Math.max(0, KNOCKOUT.cuts[over - 1] - outs.length));
        if (standingGone < Math.max(0, KNOCKOUT.cuts[over - 1] - outs.length) && !room.winner)
          expect(survivors.filter(s => s.runs === lowest).length).toBeGreaterThan(1);
        if (room.winner) break;
      }
    }
  });

  it('plays sudden death after the fourth over, and ends on one left', () => {
    const room = new KnockoutRoom(5, { name: 'You', face: 0 }), next = bowler(5);
    while (!room.winner && room.bowled < KNOCKOUT.maxBalls) room.ball(next(), ball(6));
    expect(room.winner?.id).toBe(0);
    expect(room.you.place).toBe(1);
    const places = room.seats.map(s => s.place).sort((a, b) => a! - b!);
    expect(places).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('knocks the player out at the over\'s end once bowled, and plays on to their place', () => {
    const room = new KnockoutRoom(9, { name: 'You', face: 0 }), next = bowler(9);
    room.ball(next(), ball(0, true));
    expect(room.finished).toBe(false);
    expect(room.standing().drop).toBe(true);
    room.playOut(next);
    expect(room.finished).toBe(true);
    expect(room.you.wentAt).toBe(6);
    expect(room.you.place).toBeGreaterThan(1);
  });

  it('puts the player in the drop with what it takes to be safe', () => {
    const room = new KnockoutRoom(4, { name: 'You', face: 0 }), next = bowler(4);
    room.ball(next(), ball(0));
    // Set the room by hand: the player on 2, everybody else on 5 or more, nobody out.
    room.seats.forEach((s, i) => { s.out = false; s.runs = i === 0 ? 2 : 5 + i; });
    const s = room.standing();
    // Two go: the player on 2 and the sub on 6. The lowest safe is on 7.
    expect(s).toMatchObject({ place: 12, left: 12, drop: true, need: 5 });
    expect(chipOf(s)).toEqual({ place: '#12', line: 'OF 12', drop: true });
    expect(trackOf(room).say).toEqual({ words: 'NEED 5 RUNS TO BE SAFE', tone: 'drop' });
    expect(trackOf(room).mood).toBe('drop');
    // Level with the lowest who would be safe is enough: a tie at the line takes both through.
    room.you.runs = 7;
    expect(room.standing()).toMatchObject({ drop: false, level: true });
    expect(trackOf(room).say).toEqual({ words: 'LEVEL ON THE LINE · SAFE', tone: 'level' });
    expect(trackOf(room).mood).toBe('level');
  });
});

describe('the words', () => {
  it('says who went and how many are left', () => {
    const news = { gone: [seat(3, 1), seat(5, 2)], kind: 'cut' as const, over: 1, winner: null };
    expect(cutLine(news, 10)).toBe('END OF OVER 1 · P3 AND P5 OUT · 10 LEFT');
    expect(cutLine({ ...news, gone: [seat(0, 1)], kind: 'sudden', over: null }, 2)).toBe('SUDDEN DEATH · YOU OUT · 2 LEFT');
  });
  it('chips the scoreboard with the place and how many are left', () => {
    const base = { place: 4, left: 10, drop: false, level: false, need: 0, sudden: false, over: 2, ball: 3 };
    expect(chipOf(base)).toEqual({ place: '#4', line: 'OF 10', drop: false });
    expect(chipOf({ ...base, drop: true, need: 3 }).drop).toBe(true);
  });

});

describe('the bar', () => {
  it('holds every seat, worst on the left: the gone, then the drop, then the safe', () => {
    const room = new KnockoutRoom(3, { name: 'You', face: 0 }), next = bowler(3);
    for (let b = 0; b < 15; b++) room.ball(next(), ball(6));
    const track = trackOf(room);
    expect(track.seats).toBe(12);
    const zones = track.pips.map(p => p.zone);
    const order = ['gone', 'drop', 'safe'];
    for (let i = 1; i < zones.length; i++) expect(order.indexOf(zones[i])).toBeGreaterThanOrEqual(order.indexOf(zones[i - 1]));
    expect(zones.filter(z => z === 'gone')).toHaveLength(track.gone);
    expect(zones.filter(z => z === 'drop')).toHaveLength(track.drop);
    expect(track.pips[track.you].you).toBe(true);
  });
  it('shrinks the safe stretch as the match goes on', () => {
    const room = new KnockoutRoom(8, { name: 'You', face: 0 }), next = bowler(8);
    let last = Infinity;
    for (let over = 0; over < 4 && !room.winner; over++) {
      for (let b = 0; b < 6 && !room.winner; b++) room.ball(next(), ball(6));
      const t = trackOf(room), safe = t.seats - t.gone - t.drop;
      expect(safe).toBeLessThanOrEqual(last);
      last = safe;
    }
  });

  it('reads its mood off how far the player is from the line', () => {
    const room = new KnockoutRoom(4, { name: 'You', face: 0 }), next = bowler(4);
    room.ball(next(), ball(0));
    // Two go at the end of over 1: the subs on 3 and 4. The best of them still batting is on 4.
    room.seats.forEach((s, i) => { s.out = false; s.runs = i === 0 ? 0 : i + 2; });
    const at = (runs: number) => { room.you.runs = runs; return trackOf(room); };
    expect(at(4 + EDGE_RUNS + 1)).toMatchObject({ mood: 'calm', say: null });
    expect(at(4 + EDGE_RUNS)).toMatchObject({ mood: 'edge', clear: EDGE_RUNS, say: { words: `${EDGE_RUNS} RUNS CLEAR`, tone: 'edge' } });
    expect(at(5).say?.words).toBe('1 RUN CLEAR');
    // Somebody out in the drop cannot pass anybody: nobody batting there, nothing to be close to.
    room.seats[2].out = true; room.seats[1].out = true;
    expect(at(5)).toMatchObject({ mood: 'calm', clear: null });
  });
  it('says when the cut falls, and how many balls are left before it', () => {
    const room = new KnockoutRoom(6, { name: 'You', face: 0 }), next = bowler(6);
    expect(trackOf(room)).toMatchObject({ eyebrow: 'END OF OVER 1 · 2 GO', ballsLeft: 6, of: 12 });
    for (let b = 0; b < 4; b++) room.ball(next(), ball(6));
    expect(trackOf(room)).toMatchObject({ ballsLeft: 2 });
    while (!room.sudden && !room.winner) room.ball(next(), ball(6));
    if (!room.winner) expect(trackOf(room).eyebrow).toBe('SUDDEN DEATH · LAST PLACE GOES EVERY BALL');
  });
  it('heads the scoreboard with the over of five, then sudden death', () => {
    expect(overLine(0)).toBe('OVER 1 OF 5');
    expect(overLine(10)).toBe('OVER 2 OF 5');
    expect(overLine(23)).toBe('OVER 4 OF 5');
    expect(overLine(24)).toBe('SUDDEN DEATH');
  });
});

describe('the bowling', () => {
  const overs = (seed: number, swing: boolean) => {
    const g = new DeliveryGenerator(new SeededRandom(seed), knockoutPlan(swing));
    return Array.from({ length: 5 }, (_, over) => ({ kind: g.overKind(over), level: g.levelAt(over), balls: Array.from({ length: 6 }, () => g.next(0)) }));
  };
  it('is five overs: the seamer twice, the spinner, the swing or sling bowler, then the death bowler', () => {
    for (const swing of [true, false]) {
      const bowled = overs(3, swing);
      expect(bowled.map(o => o.kind)).toEqual(['PACE', 'PACE', 'SPIN', swing ? 'PACE' : 'EXPRESS', 'DEATH']);
      expect(bowled[3].level?.swingShare !== undefined).toBe(swing);
      expect(bowled[2].balls.every(b => ['OFF_SPIN', 'LEG_SPIN', 'ARM_BALL'].includes(b.style))).toBe(true);
      expect(bowled.slice(4).every(o => o.balls.every(b => b.death))).toBe(true);
    }
  });
  it('keeps the first over pitched up: no yorker, no bouncer, nothing quick, and the fuller ball three times', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [first, second] = overs(seed, seed % 2 === 0);
      expect(first.balls.every(b => ['NORMAL', 'SWING_IN', 'SWING_OUT'].includes(b.style))).toBe(true);
      expect(first.balls.filter(b => b.full)).toHaveLength(3);
      expect(second.balls.some(b => b.style === 'YORKER')).toBe(false);
    }
  });
  it('lets the bouncer back in the second over', () => {
    let shorts = 0;
    for (let seed = 1; seed <= 200; seed++) shorts += overs(seed, true)[1].balls.filter(b => b.style === 'SHORT').length;
    expect(shorts).toBeGreaterThan(50);
  });
  it('holds a yorker owed for sixes through the first two overs', () => {
    const g = new DeliveryGenerator(new SeededRandom(9), knockoutPlan(true));
    const six = { runs: 6, isWicket: false } as ShotOutcome;
    const styles: string[] = [];
    for (let b = 0; b < 12; b++) { styles.push(g.next(0).style); g.record(six); }
    expect(styles.includes('YORKER')).toBe(false);
  });
});

describe('the way in', () => {
  it('says NEW and the format until a room is played, then the best finish', () => {
    expect(knockoutCardWords({ played: 0, best: null, wins: 0 })).toEqual({ tag: 'NEW', line: '12 players · one wicket', stat: 'Not played' });
    expect(knockoutCardWords({ played: 3, best: 4, wins: 0 })).toEqual({ tag: 'BEST #4', line: '3 rooms played', stat: 'Best #4' });
    expect(knockoutCardWords({ played: 1, best: 1, wins: 1 })).toEqual({ tag: 'WON', line: '1 room played', stat: 'Won 1' });
  });
  it('tallies a finished room: played, the best place and the wins', () => {
    const one = tallyRoom(5, { played: 0, best: null, wins: 0 });
    expect(one).toEqual({ played: 1, best: 5, wins: 0 });
    expect(tallyRoom(1, one)).toEqual({ played: 2, best: 1, wins: 1 });
    expect(tallyRoom(8, { played: 2, best: 1, wins: 1 })).toEqual({ played: 3, best: 1, wins: 1 });
  });
});

describe('the free hit', () => {
  /** The player hits a six a ball, so they are always top; the subs bat as they will. */
  const played = (seed: number, overs: number) => {
    const room = new KnockoutRoom(seed, { name: 'You', face: 0 }), next = bowler(seed);
    for (let i = 0; i < overs * KNOCKOUT.ballsPerOver; i++) room.ball(next(), ball(6));
    return { room, next };
  };
  const freeOnes = (room: KnockoutRoom) => room.seats.filter(s => room.freeHit(s.id));

  it("goes to the over's top three, then two, then one, and none in sudden death", () => {
    for (const seed of [3, 11, 29, 41]) {
      for (const [overs, most] of [[1, 3], [2, 2], [3, 1], [4, 0]] as const) {
        const { room } = played(seed, overs);
        if (room.winner) continue;
        const free = freeOnes(room);
        expect(room.freeHit()).toBe(most > 0);
        // Anybody level with the last of them gets one too.
        const line = [...room.alive].sort((a, b) => b.runs - a.runs)[most - 1]?.runs;
        expect(free.length).toBe(most ? room.alive.filter(s => s.runs >= line).length : 0);
        expect(free.every(s => s.place === null && !s.out)).toBe(true);
      }
    }
  });

  it('is the next ball only: a wicket on it does not count, and its runs do', () => {
    const { room, next } = played(11, 1);
    const before = room.you.runs;
    room.ball(next(), ball(0, true));
    expect(room.you.out).toBe(false);
    expect(room.you.runs).toBe(before);
    expect(room.freeHit()).toBe(false);
    room.ball(next(), ball(4, true));
    expect(room.you.out).toBe(true);
  });

  it("never in the middle of an over: nobody has one before the first over's cut", () => {
    const room = new KnockoutRoom(5, { name: 'You', face: 0 }), next = bowler(5);
    for (let i = 0; i < 5; i++) { room.ball(next(), ball(6)); expect(freeOnes(room)).toHaveLength(0); }
  });

  it("turns the player's wicket not out and keeps how it would have gone for the picture", () => {
    const out = { ...ball(0, true), wicketType: 'BOWLED' as const };
    expect(freeHitOf(out)).toMatchObject({ isWicket: false, wicketType: 'BOWLED', feedback: 'FREE HIT · NOT OUT' });
    expect(freeHitOf(ball(4))).toEqual(ball(4));
  });
});

