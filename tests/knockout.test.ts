import { describe, expect, it } from 'vitest';
import { CLASSIC_PLAN, DeliveryGenerator, knockoutPlan } from '../src/game/DeliveryGenerator';
import { EDGE_RUNS, KNOCKOUT, KnockoutRoom, chipOf, cutLine, cutOf, freeHitOf, knockoutScreen, overLine, oversWord, trackOf, type Seat } from '../src/game/knockout';
import { SeededRandom } from '../src/game/SeededRandom';
import { freeHitBall, swingFourthOf } from '../src/game/free-hit';
import { knockoutCardWords, tallyRoom } from '../src/ui/KnockoutHome';
import { heldMarkup, heldOf } from '../src/ui/KnockoutHeld';
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
  it('takes those out first, and never more than its count: the best of them out stay on their totals', () => {
    const room = [seat(0, 30, true), seat(1, 1), seat(2, 25, true), seat(3, 22, true), seat(4, 3)];
    expect(cutOf(room, 2).gone.map(s => s.id)).toEqual([3, 2]);
  });
  it('in the final, the total comes first: out on more beats not out on fewer', () => {
    const final = (a: Seat, b: Seat) => b.runs - a.runs || Number(a.out) - Number(b.out);
    expect(cutOf([seat(0, 40, true), seat(1, 30)], 1, final).gone.map(s => s.id)).toEqual([1]);
    expect(cutOf([seat(0, 40, true), seat(1, 40)], 1, final).gone.map(s => s.id)).toEqual([0]);
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

  it("cuts at each over's end as K2b's ladder says: those out first, then the lowest totals, the count and no more", () => {
    for (const seed of [3, 11, 29, 41, 58]) {
      const room = new KnockoutRoom(seed, { name: 'You', face: 0 }), next = bowler(seed);
      let left: number = KNOCKOUT.seats;
      for (let over = 1; over <= 4; over++) {
        for (let b = 0; b < 5; b++) room.ball(next(), ball(6));
        const news = room.ball(next(), ball(6));
        const survivors = room.alive;
        // Exactly the count, or fewer for a tie at the line.
        expect(news.gone.length).toBeLessThanOrEqual(KNOCKOUT.cuts[over - 1]);
        if (news.gone.length < KNOCKOUT.cuts[over - 1]) expect(survivors.length).toBeGreaterThan(left - KNOCKOUT.cuts[over - 1]);
        left = survivors.length;
        // Nobody survives out while somebody not out goes.
        if (survivors.some(s => s.out)) expect(news.gone.every(g => g.out)).toBe(true);
        // Nobody standing goes while somebody with fewer runs stays standing.
        for (const g of news.gone.filter(g => !g.out)) expect(g.runs).toBeLessThanOrEqual(Math.min(...survivors.filter(s => !s.out).map(s => s.runs)));
        expect(room.winner).toBeNull();
      }
      expect(room.alive.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('always leaves two or more for the final, and settles the match only in it', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const room = new KnockoutRoom(seed, { name: 'You', face: 0 }), next = bowler(seed);
      // The player out early, so the room is the subs' alone, collapses and all.
      room.ball(next(), ball(0, true));
      const news = room.playOut(next);
      const at = news.findIndex(n => n.winner);
      if (room.winner) expect(room.bowled).toBeGreaterThan(KNOCKOUT.cuts.length * KNOCKOUT.ballsPerOver);
      if (at >= 0) expect(news[at].kind).toBe('final');
      if (room.bowled === KNOCKOUT.cuts.length * KNOCKOUT.ballsPerOver) expect(room.alive.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('plays the final after the fourth over, the two left batting it out, and ends on one', () => {
    const room = new KnockoutRoom(5, { name: 'You', face: 0 }), next = bowler(5);
    while (!room.final) room.ball(next(), ball(6));
    expect(room.alive.length).toBe(2);
    expect(room.winner).toBeNull();
    while (!room.winner && room.bowled < KNOCKOUT.maxBalls) room.ball(next(), ball(6));
    expect(room.winner?.id).toBe(0);
    expect(room.you.place).toBe(1);
    const places = room.seats.map(s => s.place).sort((a, b) => a! - b!);
    expect(places).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('settles the final early once the one behind is out', () => {
    const room = new KnockoutRoom(5, { name: 'You', face: 0 }), next = bowler(5);
    while (!room.final) room.ball(next(), ball(6));
    const [other] = room.alive.filter(s => s.id !== 0);
    other.out = true; other.runs = room.you.runs - 1;
    const news = room.ball(next(), ball(1));
    expect(news).toMatchObject({ kind: 'final' });
    expect(room.winner?.id).toBe(0);
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
    expect(cutLine({ ...news, gone: [seat(0, 1), seat(4, 2), seat(7, 3)], over: 4 }, 2)).toBe('END OF OVER 4 · 3 PLAYERS OUT · THE FINAL IS ON');
  });
  it('chips the scoreboard with the place and how many are left', () => {
    const base = { place: 4, left: 10, drop: false, level: false, need: 0, final: false, over: 2, ball: 3 };
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
    expect(trackOf(room)).toMatchObject({ eyebrow: 'BOTTOM 2 KNOCKED OUT IN 6 BALLS', ballsLeft: 6, of: 12 });
    for (let b = 0; b < 4; b++) room.ball(next(), ball(6));
    expect(trackOf(room)).toMatchObject({ ballsLeft: 2, eyebrow: 'BOTTOM 2 KNOCKED OUT IN 2 BALLS' });
    room.ball(next(), ball(6));
    expect(trackOf(room).eyebrow).toBe('BOTTOM 2 KNOCKED OUT AFTER THIS BALL');
    while (!room.final) room.ball(next(), ball(6));
    expect(trackOf(room)).toMatchObject({ eyebrow: 'THE FINAL · HIGHER TOTAL WINS · 6 BALLS LEFT', final: true });
  });
  it('heads the scoreboard with the over of five, then the final', () => {
    expect(overLine(0)).toBe('OVER 1 OF 5');
    expect(overLine(10)).toBe('OVER 2 OF 5');
    expect(overLine(23)).toBe('OVER 4 OF 5');
    expect(overLine(24)).toBe('THE FINAL');
    expect([0, 23, 24].map(oversWord)).toEqual(['OVERS', 'OVERS', 'FINAL']);
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
  const freeOnes = (room: KnockoutRoom) => room.seats.filter(s => room.freeHitAhead(s.id));

  it("goes to the over's top three, then two, then one, and none in the final", () => {
    for (const seed of [3, 11, 29, 41]) {
      for (const [overs, most] of [[1, 3], [2, 2], [3, 1], [4, 0]] as const) {
        const { room } = played(seed, overs);
        if (room.winner) continue;
        const free = freeOnes(room);
        expect(room.freeHitAhead()).toBe(most > 0);
        // Anybody level with the last of them gets one too.
        const line = [...room.alive].sort((a, b) => b.runs - a.runs)[most - 1]?.runs;
        expect(free.length).toBe(most ? room.alive.filter(s => s.runs >= line).length : 0);
        expect(free.every(s => s.place === null && !s.out)).toBe(true);
      }
    }
  });

  it('comes on the over\'s free hit ball, never its first, and only then: a wicket on it does not count, its runs do', () => {
    for (const seed of [11, 12, 13, 14, 15]) {
      const { room, next } = played(seed, 1);
      const slot = freeHitBall(seed, 1)!;
      expect(slot.ball).toBeGreaterThanOrEqual(1);
      expect(room.freeHit()).toBe(false);
      for (let b = 0; b < slot.ball; b++) room.ball(next(), ball(1));
      expect(room.freeHit()).toBe(true);
      expect(room.freeBallNext).toEqual(slot);
      const before = room.you.runs;
      room.ball(next(), ball(4, true));
      expect(room.you).toMatchObject({ out: false, runs: before + 4 });
      // Spent, unless that was the over's last ball and the cut has handed out the next over's.
      if (room.bowled % KNOCKOUT.ballsPerOver) {
        expect(room.freeHitAhead()).toBe(false);
        room.ball(next(), ball(0, true)); expect(room.you.out).toBe(true);
      }
    }
  });

  it('is a hard ball for the over\'s bowler, the same for every seat, and bowled by the plan where the room says', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const over of [1, 2, 3]) {
        const hard = freeHitBall(seed, over)!;
        expect(hard).toEqual(freeHitBall(seed, over));
        expect(hard.ball).toBeGreaterThanOrEqual(1);
        expect(hard.ball).toBeLessThanOrEqual(5);
        seen.add(`${over}:${hard.style}${hard.full ? '+full' : ''}`);
      }
      for (const over of [0, 4]) expect(freeHitBall(seed, over)).toBeNull();
    }
    // The seamer's six kinds, the spinner's three, the swing or sling bowler's.
    expect([...seen].filter(k => k.startsWith('1:')).sort()).toEqual(['1:NORMAL+full', '1:SHORT', '1:SLOWER', '1:SWING_IN', '1:SWING_OUT', '1:YORKER']);
    expect([...seen].filter(k => k.startsWith('2:')).sort()).toEqual(['2:ARM_BALL', '2:LEG_SPIN', '2:OFF_SPIN']);
    for (const seed of [7, 8, 9, 10]) {
      const g = new DeliveryGenerator(new SeededRandom(seed), knockoutPlan(swingFourthOf(seed), seed));
      const balls = Array.from({ length: 30 }, () => g.next(0));
      for (const over of [1, 2, 3]) {
        const hard = freeHitBall(seed, over)!, bowled = balls[over * 6 + hard.ball];
        expect(bowled.style).toBe(hard.style);
        if (hard.full) expect(bowled.full).toBe(true);
        if (over === 2 && hard.style !== 'ARM_BALL') expect(bowled.flighted).toBe(true);
      }
    }
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

describe('holding the scoreboard', () => {
  it('lists everyone still in, best first, the player as You, the line over the drop', () => {
    const room = new KnockoutRoom(29, { name: 'Shashank', face: 1 }), next = bowler(29);
    for (let i = 0; i < 9; i++) room.ball(next(), ball(i % 3 === 0 ? 0 : 1));
    const held = heldOf(room);
    expect(held.rows).toHaveLength(room.alive.length);
    expect(held.rows.map(r => r.place)).toEqual(held.rows.map((_, i) => i + 1));
    expect(held.rows.find(r => r.you)?.name).toBe('You');
    // Not out before out, then more runs.
    const batting = held.rows.filter(r => !r.out);
    expect(held.rows.slice(0, batting.length).every(r => !r.out)).toBe(true);
    for (let i = 1; i < batting.length; i++) expect(batting[i - 1].runs).toBeGreaterThanOrEqual(batting[i].runs);
    // Those the cut would take are at the foot, under the line.
    const first = held.rows.findIndex(r => r.drop);
    expect(first).toBeGreaterThan(0);
    expect(held.cutAt).toBe(first);
    expect(held.rows.slice(first).every(r => r.drop)).toBe(true);
    const html = heldMarkup(held);
    expect(html.match(/ko-held-cut/g)).toHaveLength(1);
    expect(html.match(/is-you/g)).toHaveLength(1);
  });
  it('marks who has the free hit', () => {
    const room = new KnockoutRoom(11, { name: 'You', face: 0 }), next = bowler(11);
    for (let i = 0; i < 6; i++) room.ball(next(), ball(6));
    const held = heldOf(room);
    // The player has one to come this over.
    expect(held.rows[0]).toMatchObject({ you: true, free: true });
    expect(heldMarkup(held)).toContain('<em>FH</em>');
  });
});

describe('the ground\'s screen', () => {
  it('between balls, the line: the player and the nearest across it, the knockout between', () => {
    const room = new KnockoutRoom(29, { name: 'You', face: 0 }), next = bowler(29);
    for (let i = 0; i < 4; i++) room.ball(next(), ball(6));
    const screen = knockoutScreen(room, null);
    expect(screen?.kind).toBe('line');
    if (screen?.kind !== 'line') return;
    expect(screen.rows).toHaveLength(2);
    expect(screen.rows[0].you).toBe(true);
    expect(screen.cutAfter).toBe(0);
    expect(screen.rows[1].place).toBeGreaterThan(screen.rows[0].place);
  });
  it('in the drop, the player is under the line with the lowest still safe over it', () => {
    const room = new KnockoutRoom(29, { name: 'You', face: 0 }), next = bowler(29);
    for (let i = 0; i < 4; i++) room.ball(next(), ball(0));
    const screen = knockoutScreen(room, null);
    if (room.standing().drop && screen?.kind === 'line') expect(screen.rows[1].you).toBe(true);
  });
  it("at an over's end, who went and how many are left", () => {
    const room = new KnockoutRoom(3, { name: 'You', face: 0 }), next = bowler(3);
    let gone: Seat[] = [];
    for (let i = 0; i < 6; i++) gone = room.ball(next(), ball(6)).gone;
    expect(knockoutScreen(room, gone)).toEqual({ kind: 'cut', out: gone.length, left: room.alive.length, names: gone.map(s => s.name) });
  });
});
