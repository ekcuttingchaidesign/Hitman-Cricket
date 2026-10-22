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
    for (const name of ['spin', 'bouncers', 'express', 'reverse', 'round', 'cover']) expect(practiceSwitches(`?${name}=1`)).toEqual([name]);
    // Version three of the cover drive moves when the swipe is on time; one and two only pick between the two the game plays.
    expect(practiceSwitches('?coverv=3')).toEqual(['coverv']);
    expect(practiceSwitches('?coverv=1&cover=0')).toEqual(['coverv']);
    expect(practiceSwitches('?coverv=2')).toEqual(['coverv']);
    expect(practiceSwitches('?coverv=4')).toEqual([]);
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
    levelup: 'the Level Up screen on demand, over a made-up climb, counting and remembering nothing',
    topspot: 'New #1 on demand, over a made-up board, counting and sending nothing',
    actions: 'what the batter does after a ball, on demand, at no ball and counting nothing',
    demo: 'made-up rows on the boards, in this browser only',
    feedback: 'the feedback sheet',
    fresh: 'clearing this browser, asked first',
    private: 'treating the window as private: it counts less, not more',
    cheer: 'the crowd',
    ground: 'which ground is built',
    screen: "the arena's big screen, or the commentary box in its place",
    stumps: "the arena stumps' colourway",
    lights: 'day or night',
    view: 'which screen opens',
    shot: 'a shot preview page',
    times: 'which moments the rig sheet draws, a dev page that bats nothing',
    pullpen: 'the colour of the pull\'s flash',
    perf: 'the frame-rate readout, measuring and sending nothing',
    profile: 'asks who is batting under ?debug=1, for the check that walks it; the batting is unchanged',
    newcomer: 'lets a newcomer\'s help back in under ?debug=1, by the browser\'s own count: it gives nobody help they are not owed',
    welcome: 'the welcome in each way it can go, on demand, sending and keeping nothing',
    dressing: 'the Dressing Room and its unlocks over a made-up record, earning, wearing and keeping nothing',
    loftv: 'which of the lofted straight drive\'s two finishes is drawn; the six is the same six either way',
    pullv: 'which of the pull\'s two versions is drawn; the swipe is judged and the ball scored the same either way',
    ui: 'the UI kit laid out as a page, instead of the game, reading and sending nothing',
    gloves: 'which pair of gloves the strokes viewer opens with, a dev page that bats nothing',
    stroke: 'which stroke the strokes viewer opens on, a dev page that bats nothing',
    fixed: 'holds the bowler sheet\'s camera still, a dev page that bats nothing',
    tile: 'the size of the bowler sheet\'s frames, a dev page that bats nothing',
    labels: 'leaves the names off the bowler sheet\'s frames, a dev page that bats nothing',
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
