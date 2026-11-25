import { describe, expect, it } from 'vitest';
import { emptyRecap, type YearRecap } from '../src/game/recap';
import {
  bandOf, hourLabel, longestStreak, nameLines, recapPosters, sliceOf, typeOf,
  type HitsPoster, type KitPoster, type RankPoster, type RecapInput, type SeasonPoster, type StreakPoster, type TypePoster, type WhenPoster,
} from '../src/game/recap-view';

const NOV = (d: number) => `11-${String(d).padStart(2, '0')}`;
const at = (month: number, day: number) => Date.UTC(2026, month - 1, day, 6);

/** A big season: Kabir's, as the posters were drawn. */
function kabir(): YearRecap {
  const r = emptyRecap(at(9, 8));
  return {
    ...r, innings: 186, first: at(9, 8), last: at(12, 1),
    modes: {
      classic: { innings: 90, runs: 2140, balls: 1100, fours: 260, sixes: 160, best: 148, fifties: 20, hundreds: 5, wins: 0 },
      super10: { innings: 40, runs: 1310, balls: 700, fours: 150, sixes: 110, best: 141, fifties: 6, hundreds: 2, wins: 0 },
      marathon: { innings: 30, runs: 960, balls: 900, fours: 90, sixes: 30, best: 120, fifties: 4, hundreds: 0, wins: 0 },
      survive: { innings: 26, runs: 410, balls: 600, fours: 40, sixes: 12, best: 44, fifties: 1, hundreds: 0, wins: 4 },
    },
    kits: { electric: 121, papaya: 38, home: 27 },
    bats: { rage: 97, boom: 52, plain: 37 },
    days: Object.fromEntries([...Array(11)].map((_, i) => [NOV(11 + i), 4]).concat([['09-08', 3], ['10-02', 5], ['11-01', 2]])),
    hours: { 1: 50, 0: 21, 14: 30, 19: 40, 22: 20, 9: 25 },
  };
}

/** A first fortnight: Arjun's, the "player with little to show". */
function arjun(): YearRecap {
  const r = emptyRecap(at(12, 2));
  return {
    ...r, innings: 10, first: at(12, 2), last: at(12, 9),
    modes: { classic: { innings: 10, runs: 142, balls: 120, fours: 9, sixes: 0, best: 31, fifties: 0, hundreds: 0, wins: 0 } },
    kits: { home: 10 }, bats: { plain: 10 },
    days: { '12-02': 6, '12-09': 4 }, hours: { 14: 7, 13: 3 },
  };
}

const catalogue = {
  kitNames: { electric: 'Electric', papaya: 'Papaya', home: 'OG Navy', crimson: 'Crimson' },
  batNames: { rage: 'Rage', boom: 'Boom', plain: 'Plain' },
  kitColours: { electric: { shirt: '#0A64D6', trim: '#F08A2C', pads: '#1A4A95' } },
};
const input = (record: YearRecap, extra: Partial<RecapInput> = {}): RecapInput => ({
  year: 2026, name: 'Kabir', record, kitNow: 'electric', batNow: 'rage', guardNow: 'sterling', seed: 7, now: at(12, 10), ...catalogue, ...extra,
});

describe('the year recap', () => {
  it('gives a big season all eleven posters, numbered in order', () => {
    const posters = recapPosters(input(kabir(), { standings: { classic: { place: 1204, of: 13480 }, super10: { place: 900, of: 6400 } } }));
    expect(posters.map(p => p.id)).toEqual(['cover', 'runs', 'sixes', 'fours', 'when', 'streak', 'kit', 'bat', 'rank', 'type', 'season']);
    expect(posters.map(p => `${p.n}/${p.of}`)).toEqual([...Array(11)].map((_, i) => `${i + 1}/11`));
  });

  it('leaves out what a short season has nothing to say on, and numbers what is left', () => {
    const posters = recapPosters(input(arjun(), { name: 'Arjun', kitNow: 'home', batNow: 'plain', standings: { classic: { place: 40, of: 120 } } }));
    expect(posters.map(p => p.id)).toEqual(['cover', 'runs', 'fours', 'when', 'streak', 'kit', 'bat', 'type', 'season']);
    expect(posters.at(-1)!.of).toBe(9);
    expect((posters.find(p => p.id === 'type') as TypePoster).type).toBe('newball');
  });

  it('adds the runs up and puts the bail on the mode with the most, a stub for a mode never played', () => {
    const runs = recapPosters(input(arjun())).find(p => p.id === 'runs')!;
    expect(runs).toMatchObject({ runs: 142, average: '14.2', best: 31 });
    if (runs.id !== 'runs') throw new Error();
    expect(runs.stumps.map(s => [s.label, s.runs, s.bail])).toEqual([['BLAST', 142, true], ['SUPER10', null, false], ['MARATHON', null, false], ['SURVIVAL', null, false]]);
  });

  it('measures sixes and fours in kilometres, or in metres against something their size', () => {
    const big = recapPosters(input(kabir()));
    expect((big.find(p => p.id === 'sixes') as HitsPoster).distance).toBe('23.4 KM');
    expect((big.find(p => p.id === 'sixes') as HitsPoster).line).toContain('Marine Drive, six and a half times over');
    expect((big.find(p => p.id === 'sixes') as HitsPoster).word).toBe('बूम बूम');
    const few = recapPosters(input({ ...arjun(), modes: { classic: { ...arjun().modes.classic!, sixes: 3 } } }));
    const sixes = few.find(p => p.id === 'sixes') as HitsPoster;
    expect(sixes).toMatchObject({ distance: '225 M', word: 'बूम' });
    expect(sixes.line).toContain('football pitch');
    const mid = recapPosters(input({ ...arjun(), modes: { classic: { ...arjun().modes.classic!, sixes: 26 } } })).find(p => p.id === 'sixes') as HitsPoster;
    expect(mid).toMatchObject({ distance: '1.9 KM', line: 'of cricket ball in the air. That’s five laps of the rope.' });
  });

  it('names the hour they bat in, by day or by night', () => {
    expect(hourLabel(0)).toBe('12 AM'); expect(hourLabel(13)).toBe('1 PM');
    expect([1, 14, 7, 19].map(h => [bandOf(h).name, bandOf(h).look])).toEqual([
      ['NIGHT OWL', 'night'], ['LUNCH BREAK', 'day'], ['EARLY BIRD', 'day'], ['PRIME TIME', 'night'],
    ]);
    const when = recapPosters(input(kabir())).find(p => p.id === 'when') as WhenPoster;
    expect(when).toMatchObject({ clock: '1 AM', name: 'NIGHT OWL', look: 'night' });
    expect(when.share).toBeCloseTo(91 / 186);
    expect((recapPosters(input(arjun())).find(p => p.id === 'when') as WhenPoster).look).toBe('day');
  });

  it('finds the longest streak, and the big day for a player with none', () => {
    expect(longestStreak(kabir().days, 2026)).toMatchObject({ from: '11-11', to: '11-21', length: 11, innings: 44 });
    const streak = recapPosters(input(kabir())).find(p => p.id === 'streak') as StreakPoster;
    expect(streak).toMatchObject({ kind: 'streak', figure: 11, dates: '11 – 21 NOV' });
    expect(streak.bars).toHaveLength(15);
    expect(streak.bars.filter(b => b.lit).map(b => b.date)).toEqual(['11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21']);
    expect(streak.bars.slice(0, 2).map(b => b.date)).toEqual(['9', '10']);
    const day = recapPosters(input(arjun())).find(p => p.id === 'streak') as StreakPoster;
    expect(day).toMatchObject({ kind: 'day', figure: 6, dates: '2 DEC', line: 'Your busiest day of the season. It was a Wednesday.' });
    expect(day.bars).toHaveLength(15);
    expect(day.bars.filter(b => b.lit).map(b => [b.date, b.innings])).toEqual([['2', 6]]);
    expect(day.bars.filter(b => b.innings).map(b => b.date)).toEqual(['2', '9']);
  });

  it('crosses a month in a streak by naming both', () => {
    const r = { ...arjun(), days: { '10-30': 1, '10-31': 1, '11-01': 1, '11-02': 1 } };
    expect((recapPosters(input(r)).find(p => p.id === 'streak') as StreakPoster).dates).toBe('30 OCT – 2 NOV');
  });

  it('shows the most-worn kit with its runner-up, or the next to put on', () => {
    const kit = recapPosters(input(kabir())).find(p => p.id === 'kit') as KitPoster;
    expect(kit).toMatchObject({ kit: 'electric', name: 'ELECTRIC', innings: 121, colours: ['#0A64D6', '#F08A2C', '#1A4A95'] });
    expect(kit.facts[1]).toEqual({ label: 'RUNNER-UP', value: 'PAPAYA · 38' });
    expect(kit.hero!.kit).toBe('electric');
    const one = recapPosters(input(arjun(), { nextKit: 'crimson' })).find(p => p.id === 'kit') as KitPoster;
    expect(one.facts[1]).toEqual({ label: 'NEXT UP', value: 'CRIMSON' });
  });

  it('puts the cover in their kit, with the disc and arch turned from a kit that fights them', () => {
    const cover = (kitNow: string) => recapPosters(input(kabir(), { kitNow })).find(p => p.id === 'cover')!;
    expect(cover('electric')).toMatchObject({ disc: 'pink', arch: 'lime', hero: { kit: 'electric', bat: 'rage' } });
    expect(cover('crimson')).toMatchObject({ disc: 'cobalt' });
    expect(cover('papaya')).toMatchObject({ disc: 'cobalt' });
    expect(cover('violet')).toMatchObject({ disc: 'marigold' });
    expect(cover('gold')).toMatchObject({ arch: 'cream' });
  });

  it('holds the player’s bat on every batter, and the screens’ own kits', () => {
    const posters = recapPosters(input(kabir()));
    for (const p of posters) if (p.hero && p.id !== 'bat') expect(p.hero.bat).toBe('rage');
    expect(posters.find(p => p.id === 'sixes')!.hero!.kit).toBe('violet');
    expect(['crimson', 'forest']).toContain(posters.find(p => p.id === 'fours')!.hero!.kit);
    expect(['home', 'forest', 'violet']).toContain(posters.find(p => p.id === 'season')!.hero!.kit);
    expect(posters.find(p => p.id === 'bat')!.hero).toMatchObject({ only: 'bat', bat: 'rage' });
  });

  it('leads with the share in the top half and with the batters behind below it, and skips under a hundred behind', () => {
    expect(sliceOf(1204, 13480)).toMatchObject({ slice: 'world' });
    expect(sliceOf(3000, 10000).slice).toBe('club');
    const top = recapPosters(input(kabir(), { standings: { classic: { place: 1204, of: 13480 } } })).find(p => p.id === 'rank') as RankPoster;
    expect(top).toMatchObject({ kind: 'share', slice: 'world', behind: 12276, ahead: 1203, modeName: 'BLAST' });
    expect(top.facts[0]).toEqual({ label: 'BLAST', value: 'TOP 9%' });
    const low = recapPosters(input(kabir(), { standings: { classic: { place: 10514, of: 13480, best: 22, bars: { club: 31 } } } })).find(p => p.id === 'rank') as RankPoster;
    expect(low).toMatchObject({ kind: 'count', slice: 'gully', behind: 2966, next: { slice: 'club', runs: 9 }, callout: ['NEXT STEP: CLUB LEVEL', '9 RUNS AWAY'] });
    expect(low.facts).toEqual([{ label: 'YOUR BEST', value: '22' }, { label: 'CLUB LEVEL AT', value: '31' }, { label: 'TO GO', value: '9 RUNS' }]);
    expect(top.callout).toEqual(['ONLY 1,203', 'AHEAD OF YOU']);
    expect(recapPosters(input(kabir(), { standings: { classic: { place: 30, of: 120 } } })).some(p => p.id === 'rank')).toBe(false);
  });

  it('calls the type a player stands furthest above the average batter on', () => {
    const r = kabir();
    expect(typeOf(r).type).toBe('six');
    const fours = { ...r, modes: { classic: { ...r.modes.classic!, sixes: 10, fours: 500, runs: 2400 } } };
    expect(typeOf(fours).type).toBe('artist');
    const tests = { ...r, modes: { survive: { innings: 40, runs: 900, balls: 2400, fours: 60, sixes: 0, best: 60, fifties: 2, hundreds: 0, wins: 9 } } };
    expect(typeOf(tests).type).toBe('wall');
    expect(typeOf(arjun()).type).toBe('newball');
    const type = recapPosters(input(kabir())).find(p => p.id === 'type') as TypePoster;
    expect(type).toMatchObject({ type: 'six', top: 'SIX', bottom: 'MACHINE' });
    expect(type.facts.at(-1)).toEqual({ label: 'TYPE', value: '1 OF 6' });
  });

  it('fits the season card’s name on one line, or two at the space nearest the middle', () => {
    expect(nameLines('Kabir')).toEqual(['KABIR']);
    expect(nameLines('Chandrashekhar')).toEqual(['CHANDRASHEKHAR']);
    expect(nameLines('Rohit Sharma')).toEqual(['ROHIT', 'SHARMA']);
    expect(nameLines('Big Show 45')).toEqual(['BIG', 'SHOW 45']);
    expect(nameLines('Mr Big')).toEqual(['MR BIG']);
  });

  it('fills the season card’s tiles with what the player has', () => {
    const season = recapPosters(input(arjun())).at(-1) as SeasonPoster;
    expect(season.tiles.map(t => t.label)).toEqual(['RUNS', 'INNINGS', 'FOURS', 'BEST', 'IN ONE DAY', 'DAYS PLAYED']);
    expect(season.set).toHaveLength(season.of - 1);
    const big = recapPosters(input(kabir(), { standings: { classic: { place: 1204, of: 13480 } } })).at(-1) as SeasonPoster;
    expect(big.tiles.map(t => `${t.value} ${t.label}`)).toEqual(['4,820 RUNS', '312 SIXES', '540 FOURS', '148 BEST', '11 DAYS IN A ROW', '9% TOP OF ALL']);
    expect(big.tag).toBe('SIX MACHINE');
  });

  it('calls a player with no name YOU', () => {
    expect(recapPosters(input(arjun(), { name: null }))[0]).toMatchObject({ name: 'YOU', roast: 'YOU' });
  });
});
