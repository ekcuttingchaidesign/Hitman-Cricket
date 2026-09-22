import { AVATARS } from '../config/board';
import { LAUNCH_MS, rankKey, type BoardRow, type Innings } from './leaderboard';
import { packSurvive, type SurviveInnings, type SurviveRow } from './survive-board';
import {
  BLAST_BOARDS, SURVIVE_BOARDS, emptyBlast, emptySurvive, rankCareer,
  type BlastCareer, type CareerMode, type SurviveCareer,
} from './career';
import type { CareerRow } from '../server/career-store';

/**
 * A board with fifty people on it, made up on the spot.
 *
 * `?demo=1` and nothing else. It exists because a leaderboard is a screen you
 * cannot judge empty — the scroll, the cut-off line, the lit row with rows
 * above and below it, what fifty names do to the ladder pills — and the only
 * other way to see it full is to write fifty real rows to a real board, which
 * claims fifty names that are never released.
 *
 * So nothing here is written, sent or kept. The rows are built in the browser
 * that asked for them, live for as long as the sheet is open, and the moment
 * the flag is off none of this runs at all. It is a way of looking at the
 * screen, not a way of filling the board.
 *
 * The figures are put together the way the ladders rank them, so the order on
 * screen is the order the real thing would produce rather than the order this
 * file happened to write them in.
 */

const NAMES = [
  'Rohit', 'Bumrah', 'Hardik', 'Ishan', 'Shreyas', 'Surya', 'Axar', 'Kuldeep', 'Arshdeep', 'Shubman',
  'Rinku', 'Tilak', 'Jitesh', 'Sanju', 'Ruturaj', 'Washington', 'Avesh', 'Mukesh', 'Prasidh', 'Yashasvi',
  'Dhruv', 'Nikhil', 'Kabir', 'Manav', 'Omkar', 'Pranav', 'Rehan', 'Sagar', 'Tanmay', 'Varun',
  'Aditya', 'Chetan', 'Deepak', 'Girish', 'Hemant', 'Jaideep', 'Karan', 'Mohit', 'Naveen', 'Parth',
  'Rakesh', 'Tarun', 'Vikram', 'Yogesh', 'Amit', 'Bharat', 'Danish', 'Gaurav', 'Kunal', 'Nitin',
];

/** How many rows the made-up boards carry: the whole of what a board holds. */
export const DEMO_ROWS = 50;

/** Where in the fifty the player's own row is put, so it has rows both sides. */
const MINE = 6;

const idOf = (i: number) => `demo${String(i).padStart(2, '0')}-aaaabbbbcccc`;

/** A Blast innings that adds up, somewhere down a ladder of fifty. */
function innings(i: number): Innings {
  const runs = Math.max(4, 148 - i * 3 - (i % 3));
  const sixes = Math.floor(runs / 9);
  const fours = Math.floor((runs - sixes * 6) / 8);
  const singles = runs - sixes * 6 - fours * 4;
  const wickets = i % 4 === 0 ? 0 : i % 3;
  const balls = 30;
  return { runs, sixes, fours, wickets, dots: Math.max(0, balls - sixes - fours - singles - wickets), balls };
}

/** A Test innings: chases, draws and wickets, in that order down the ladder. */
function survived(i: number): SurviveInnings {
  const blows = 1 + (i % 6);
  const health = Math.max(0, 100 - blows * 9);
  if (i < 12) return { runs: 100, balls: 30 + i * 2, wickets: 0, blows, health };
  if (i < 30) return { runs: 95 - i, balls: 60, wickets: 0, blows, health };
  return { runs: Math.max(2, 70 - i), balls: Math.min(60, 58 - (i - 30)), wickets: 1, blows, health };
}

/** The fifty as the Blast board ranks them, with one of them yours. */
export function demoBoard(youId: string | null): BoardRow[] {
  return NAMES.slice(0, DEMO_ROWS).map((name, i) => {
    const figures = innings(i);
    return {
      ...figures,
      playerId: i === MINE && youId ? youId : idOf(i),
      name,
      avatar: i % AVATARS,
      score: rankKey(figures),
    };
  });
}

/** The same, over the Test ladder, which ranks a chase by how few balls it took. */
export function demoSurvive(youId: string | null, atMs = LAUNCH_MS): SurviveRow[] {
  return NAMES.slice(0, DEMO_ROWS).map((name, i) => {
    const figures = survived(i);
    return {
      ...figures,
      playerId: i === MINE && youId ? youId : idOf(i),
      name,
      avatar: i % AVATARS,
      score: packSurvive(figures, atMs),
    };
  });
}

/** A career behind each of them, so the all-time ladders have rows too. */
function blastCareer(i: number): BlastCareer {
  const runs = 4200 - i * 78;
  return {
    ...emptyBlast(),
    innings: 60 - Math.floor(i / 2),
    runs,
    balls: 1100 - i * 18,
    sixes: 210 - i * 4,
    fours: 96 - i * 2,
    highest: 148 - i * 3,
    notOut: 132 - i * 2,
    individual: 132 - i * 2,
    hundreds: Math.max(0, 6 - Math.floor(i / 6)),
  };
}

function surviveCareer(i: number): SurviveCareer {
  return {
    ...emptySurvive(),
    innings: 48 - Math.floor(i / 2),
    runs: 2600 - i * 46,
    balls: 2200 - i * 38,
    sixes: 120 - i * 2,
    fours: 150 - i * 3,
    blows: 260 - i * 5,
    wins: 22 - Math.floor(i / 3),
    draws: 14 - Math.floor(i / 5),
    losses: 9 + Math.floor(i / 8),
  };
}

/**
 * Every career ladder of one mode, filled — the same shape `/api/career`
 * answers with, so the screen cannot tell the difference.
 */
export function demoCareers(mode: CareerMode, youId: string | null, atMs = Date.now()) {
  const boards: Record<string, CareerRow<BlastCareer | SurviveCareer>[]> = {};
  const ladders = mode === 'survive' ? SURVIVE_BOARDS : BLAST_BOARDS;
  for (const board of ladders) {
    boards[board.key] = NAMES.slice(0, DEMO_ROWS)
      .map((name, i) => {
        const career = mode === 'survive' ? surviveCareer(i) : blastCareer(i);
        return {
          playerId: i === MINE && youId ? youId : idOf(i),
          name,
          avatar: i % AVATARS,
          career,
          // Ranked by the board's own key, so a ladder about sixes is in the
          // order sixes put it in rather than in the order runs did.
          score: rankCareer(board as never, career as never, atMs),
        };
      })
      .filter(row => (board as never as { counts(c: unknown): boolean }).counts(row.career))
      .sort((a, b) => b.score - a.score);
  }
  return { boards, size: DEMO_ROWS };
}

/** Where the flag is remembered for the rest of the tab's life. */
const DEMO_KEY = 'hitman-demo';

/**
 * Whether this session is looking at a made-up board.
 *
 * Read from the query, the hash, or the fact that it was read once already.
 * Three ways in because there is only one way to get this wrong and it is
 * silent: a flag that has to survive being typed on a phone, pasted into a
 * chat, and opened again from a link that dropped its query string. Once it
 * has been asked for, it holds for the tab.
 *
 * `?demo=1`, `?demo`, or `#demo`, and `?demo=0` turns it off again.
 */
export function demoWanted(): boolean {
  try {
    const asked = new URLSearchParams(location.search).get('demo');
    const hashed = location.hash.replace('#', '').toLowerCase() === 'demo';
    if (asked !== null || hashed) {
      const on = hashed || asked === '' || asked === '1' || asked?.toLowerCase() === 'true';
      sessionStorage.setItem(DEMO_KEY, on ? '1' : '0');
      return on;
    }
    return sessionStorage.getItem(DEMO_KEY) === '1';
  } catch {
    // No storage: the flag still works, it just does not survive a link.
    const asked = new URLSearchParams(location.search).get('demo');
    return asked === '' || asked === '1';
  }
}

/**
 * A career key for looking at, and for nothing else.
 *
 * The store does not issue keys yet, so every placement would draw nothing and
 * the widget could only be reviewed in the lab, away from the screens it has
 * to share room with. This hands one over under the same flag the made-up
 * board rides on: it is built in the browser that asked, it opens nothing, and
 * with the flag off none of it runs.
 *
 * It is deliberately the longest shape the wordlist will be allowed to
 * produce. A key that fits is not news; a key that is about to wrap is.
 */
export function demoKey(): { state: 'unsaved'; code: string } {
  return { state: 'unsaved', code: 'yorker-sprint-cover-47' };
}

/**
 * Whether a name and a key would open a record, for the demo alone.
 *
 * Nothing here is the real check and none of it is a stand-in for one: the
 * store keeps a salted hash and answers this over the wire, so what a browser
 * thinks about a key can never be the thing that decides. This exists so the
 * screens can be walked end to end — the right key, a wrong one, and a name
 * left empty — before there is a store to walk them against.
 */
export function demoRestore(name: string, key: string): { ok: boolean; reason?: string } {
  if (!name.trim()) return { ok: false, reason: 'The name you bat under, as you typed it on the board.' };
  const typed = key.trim().toLowerCase().replace(/\s+/g, '');
  if (!typed) return { ok: false, reason: 'Paste the key you saved.' };
  // Wrong in a way the player can fix, told apart from wrong in a way they
  // cannot: a key of the wrong shape is a typo or a half-paste, and saying so
  // is kinder than "that did not match" to somebody holding the right key.
  if (!/^[a-z]+-[a-z]+-[a-z]+-\d{2}$/.test(typed)) {
    return { ok: false, reason: 'A key is three words and two numbers, like yorker-sprint-cover-47.' };
  }
  if (typed !== demoKey().code) {
    return { ok: false, reason: 'That name and key do not go together. Check both and try again.' };
  }
  return { ok: true };
}
