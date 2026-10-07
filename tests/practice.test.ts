import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PRACTICE_SWITCHES, practiceSwitches } from '../src/game/practice';

describe('a practice innings', () => {
  it('is nothing for an ordinary link', () => {
    expect(practiceSwitches('')).toEqual([]);
    expect(practiceSwitches('?mode=marathon&debug=1&seed=4242&lefty=0&moments=1')).toEqual([]);
  });

  it('is any of the switches that change the game, turned on', () => {
    expect(practiceSwitches('?mode=marathon&nets=1')).toEqual(['nets']);
    expect(practiceSwitches('?mode=marathon&settled=1&swing=1')).toEqual(['swing', 'settled']);
    expect(practiceSwitches('?charge=ball')).toEqual(['charge']);
    expect(practiceSwitches('?slowmo=0.65')).toEqual(['slowmo']);
    expect(practiceSwitches('?mode=marathon&wear=fast')).toEqual(['wear']);
    for (const name of ['spin', 'bouncers', 'express', 'reverse', 'round']) expect(practiceSwitches(`?${name}=1`)).toEqual([name]);
  });

  it('is not a link that only mentions one', () => {
    expect(practiceSwitches('?nets=0&wear=slow&round=no&slowmo=0&charge=')).toEqual([]);
  });

  it('counts the switches a preview build can set as well as the link', () => {
    expect(practiceSwitches('', { spinOnly: true })).toEqual(['spin']);
    expect(practiceSwitches('?spin=1', { spinOnly: true, chargeOnly: '1' })).toEqual(['spin', 'charge']);
  });
});

describe('every switch the game reads', () => {
  // The parameters that change nothing about how an innings is batted, each
  // with the reason it is not practice. A new switch has to be put in one
  // list or the other, or this fails: a switch nobody thought about is how a
  // tool ends up on the leaderboard.
  const NOT_PRACTICE: Record<string, string> = {
    mode: 'which mode, as the picker chooses it',
    debug: 'the debug panel; the browser checks claim places with it',
    seed: 'the innings seed; the browser checks claim places with it',
    lefty: 'where the left-hander bats; the browser checks claim places with it',
    moments: 'celebrations on demand, adding no runs and counting nothing',
    rate: 'the star rating on demand, sending and remembering nothing',
    actions: 'what the batter does after a ball, on demand, at no ball and counting nothing',
    demo: 'made-up rows on the boards, in this browser only',
    feedback: 'the feedback sheet',
    fresh: 'clearing this browser, asked first',
    private: 'treating the window as private: it counts less, not more',
    cheer: 'the crowd',
    ground: 'which ground is built',
    lights: 'day or night',
    view: 'which screen opens',
    shot: 'a shot preview page',
    pullpen: 'the colour of the pull\'s flash',
    perf: 'the frame-rate readout, measuring and sending nothing',
  };

  it('is either practice or named as not practice', () => {
    const read = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) { if (name !== 'server') walk(path); continue; }
        if (!name.endsWith('.ts')) continue;
        for (const match of readFileSync(path, 'utf8').matchAll(/\.get\('([a-z]+)'\)/g)) read.add(match[1]);
      }
    };
    walk(join(__dirname, '../src'));
    const unsorted = [...read].filter(name => !PRACTICE_SWITCHES.includes(name) && !(name in NOT_PRACTICE));
    expect(unsorted).toEqual([]);
  });
});
