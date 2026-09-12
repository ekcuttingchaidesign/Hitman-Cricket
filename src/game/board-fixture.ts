import { GAME } from '../config/gameplay';
import { SeededRandom } from './SeededRandom';
import { BOARD_SIZE, LAUNCH_MS, compareRows, packScore, rankKey, type BoardRow, type Innings } from './leaderboard';

/**
 * Fifty innings nobody played, so the board can be designed before there is a
 * database behind it.
 *
 * The board is the part of this feature that needs to be reacted to, and the
 * part that needs least to exist first: a table of fifty rows looks right or
 * wrong on a phone long before anything is stored anywhere. So the screen is
 * built against these, and the day the endpoints land the same screen is handed
 * real rows and nothing about it changes.
 *
 * Every innings here is played out ball by ball rather than written down as
 * figures, which is what keeps them honest — the runs add up out of the balls
 * that produced them, so `plausible` passes on all fifty and the ladder is
 * being exercised by innings the game could actually have dealt.
 */

/** Fourteen characters, which is what a row holds without wrapping. */
const NAMES = [
  'Rohit', 'Sharmaji', 'Big Show', 'Kohli Jr', 'Hitman', 'Gilly', 'Pandu', 'Sixer Singh',
  'Baba', 'Kaka', 'Chotu', 'Dada', 'Jaddu', 'Rinku', 'Mahi', 'Boom',
  'Tendlya', 'Vero', 'Nita', 'Smriti', 'Harman', 'Jemi', 'Shafali', 'Renu',
  'Gaurav', 'Pinky', 'Munna', 'Bhai', 'Sunny', 'Pintu', 'Guru', 'Raju',
  'Anna', 'Chinna', 'Thala', 'Thalapathy', 'Bablu', 'Golu', 'Nawab', 'Sardar',
  'Ustaad', 'Tiger', 'Cheeku', 'Jimmy', 'Lala', 'Billa', 'Rango', 'Titu',
  'Deepu', 'Shona', 'Mintu', 'Bunty', 'Toppo', 'Kalu', 'Chhote', 'Gullu',
];

/** Five kits to pick from. The board draws a disc until there are pictures. */
const AVATARS = 5;

/**
 * How many innings are played to fill fifty rows.
 *
 * This is the number that makes the fixture look like a board rather than like
 * fifty strangers. A board is the top fifty of everything anybody has played,
 * not a sample of fifty, so its fiftieth row is a decent innings — pick fifty at
 * random and the worst of them is whoever was bowled in the first over, and the
 * cut-off line reads four runs. A hundred and ten is a game a few weeks old:
 * wide enough that the tail is respectable, tight enough that the board still
 * runs from a hundred down to the sixties rather than being fifty near-equals.
 */
const FIELD = 110;

/**
 * How good a player is, as the odds of each thing happening off one ball. The
 * field is not fifty of the same innings: the top of the board is people who
 * middled nearly everything and the bottom is people who hung on, so the
 * generator is handed a strength between 0 and 1 and leans the same seven
 * outcomes with it.
 */
function ballOdds(strength: number) {
  return [
    { runs: 6, isWicket: false, weight: 0.04 + strength * 0.30 },
    { runs: 4, isWicket: false, weight: 0.07 + strength * 0.22 },
    { runs: 3, isWicket: false, weight: 0.03 + strength * 0.02 },
    { runs: 2, isWicket: false, weight: 0.09 + strength * 0.04 },
    { runs: 1, isWicket: false, weight: 0.24 - strength * 0.06 },
    { runs: 0, isWicket: false, weight: 0.38 - strength * 0.26 },
    { runs: 0, isWicket: true, weight: 0.15 - strength * 0.11 },
  ];
}

/** One innings, played out to thirty balls or three wickets, whichever comes. */
export function inventInnings(random: SeededRandom, strength: number): Innings {
  const odds = ballOdds(strength);
  const total = odds.reduce((sum, o) => sum + o.weight, 0);
  const figures: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 0, dots: 0, balls: 0 };
  while (figures.balls < GAME.totalBalls && figures.wickets < GAME.maxWickets) {
    let pick = random.next() * total;
    const ball = odds.find(o => (pick -= o.weight) <= 0) ?? odds[odds.length - 1];
    figures.balls++;
    figures.runs += ball.runs;
    figures.sixes += Number(ball.runs === 6);
    figures.fours += Number(ball.runs === 4);
    figures.wickets += Number(ball.isWicket);
    // A dot is a ball that scored nothing and was not a wicket, which is what
    // keeps it independent of the rung above it on the ladder.
    figures.dots += Number(ball.runs === 0 && !ball.isWicket);
  }
  return figures;
}

/**
 * Fifty rows, in board order, from one seed: a whole field is played out and
 * the best fifty of it are kept, which is what a board is.
 *
 * Two of the fifty are then planted: a pair that agree on runs, sixes and fours
 * so the board has a tie to point at, and a pair that agree on every playing key
 * so it has one that only the clock split. Both are rare enough in fifty innings
 * to go unseen until they turn up on the real board, which is the wrong time to
 * find out what they look like.
 */
export function inventedBoard(seed = 0x1CC, size = BOARD_SIZE): BoardRow[] {
  const random = new SeededRandom(seed);
  const field = Array.from({ length: Math.max(FIELD, size) }, () =>
    inventInnings(random, random.range(0.1, 1)));
  // The cut, on the same ladder the board itself is sorted on. The stamps come
  // afterwards because only the fifty that survived it need one.
  const kept = field
    .map(figures => ({ figures, key: rankKey(figures) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, size)
    .map(entry => entry.figures);
  const names = random.shuffle(NAMES).slice(0, size);
  const rows = kept.map((figures, i) => ({
    ...figures,
    playerId: `demo-${i.toString(36).padStart(3, '0')}`,
    name: names[i] ?? `Player ${i + 1}`,
    avatar: Math.floor(random.next() * AVATARS),
    score: packScore(figures, atMs(i)),
  }));
  if (size >= 8) {
    // Laid over rows that were already neighbours, so a planted tie is a tie
    // between two innings that were about as good as each other anyway.
    const half = Math.floor(size / 2);
    plant(rows, half + 1, rows[half]);
    // The same innings with one more wicket down — and one dot fewer, because
    // the wicket has to be a ball that was already bowled. Add one without
    // taking one away and the figures stop adding up, which `plausible` will
    // say so about and a test will catch.
    const source = rows.findIndex((row, i) =>
      i > 0 && i < half - 1 && row.dots >= 1 && row.wickets < GAME.maxWickets);
    if (source >= 0) {
      plant(rows, source + 1, { ...rows[source], wickets: rows[source].wickets + 1, dots: rows[source].dots - 1 });
    }
  }
  return rows.sort(compareRows);
}

/**
 * Copies one row's playing figures onto another, keeping its own name, kit and
 * stamp. The stamp is the point: the row being written over was already below
 * the one being copied, so it was already submitted later, and a pair that now
 * agree on every playing key are left in the order the clock puts them in.
 */
function plant(rows: BoardRow[], onto: number, figures: Innings) {
  Object.assign(rows[onto], {
    runs: figures.runs, sixes: figures.sixes, fours: figures.fours,
    wickets: figures.wickets, dots: figures.dots, balls: figures.balls,
  });
  rows[onto].score = packScore(rows[onto], atMs(onto));
}

/** Submissions spread over the days since launch, one to a minute of its own. */
function atMs(i: number) {
  return LAUNCH_MS + i * 977 * 60_000;
}
