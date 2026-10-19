/**
 * The player card at the end of an innings, as the rank hero (Figma section
 * 14E, V1): the place big with a chip under it, what the innings did beside
 * it, and two answers under that — who it surpassed and who is next.
 *
 * What it says is worked out here from the store's answer to the post, so
 * every case the card has (a climb, a best still standing, a chase won or
 * fallen short, a place outside the fifty, the top of the board) is a unit
 * test, and the HUD only draws it.
 */

export interface HeroPerson { name: string; avatar: number; runs: number; place: number }

export interface HeroInput {
  name: string;
  /** The board's name as the card says it: THE BLAST, TEST SURVIVAL… */
  modeName: string;
  place: number;
  /** Where the player stood before the innings; null for a first row on this board. */
  was: number | null;
  total: number;
  /** Whether the innings beat the player's own best. */
  improved: boolean;
  /**
   * What the board is ranked on. Runs say a number (the Blast, the
   * Marathon); Survival is judged on its result, which is said in words.
   */
  measure: 'runs' | 'result';
  /** This innings: its runs, and its result in words where the board ranks on that. */
  innings: { runs: number; line?: string };
  /** The best that holds the place: its runs, and its result in words for Survival. */
  best: { runs: number; line?: string } | null;
  /** The chase this innings was played as, judged. */
  chase: { name: string; target: number; key?: string; beat: boolean; title: string; line: string } | null;
  around: { passed: { name: string; avatar: number; runs: number }[]; passedCount: number; next: HeroPerson | null } | null;
}

export type HeroChip = { text: string; tone: 'up' | 'holds' | 'new' };

export interface HeroView {
  place: number;
  /** Gold at the top, orange for a climb, the text's own colour for a place held. */
  placeTone: 'top' | 'up' | 'holds';
  chip: HeroChip;
  eyebrow: string;
  /** The headline, with the part said in gold. */
  head: { text: string; gold: string | null };
  /** Whether the headline wears the trophy: a best, or a chase won. */
  trophy: boolean;
  sub: string;
  /** Under it on the left: the faces surpassed, the innings itself, or a chase's near miss. */
  left:
    | { kind: 'surpassed'; faces: { name: string; avatar: number }[]; more: number; names: string[] }
    | { kind: 'innings'; figure: string; line: string }
    | { kind: 'bar' };
  /** And on the right: who is next and what it takes, the top of the board, or nothing. */
  right: { kind: 'next'; who: HeroPerson; line: string } | { kind: 'top' } | null;
}

const grouped = (n: number) => n.toLocaleString('en-US');

/** The chip under the place: how far it climbed, a first row, or a place held. */
export function heroChip(place: number, was: number | null): HeroChip {
  if (was === null) return { text: 'NEW', tone: 'new' };
  if (was > place) return { text: `UP ${was - place}`, tone: 'up' };
  return { text: 'HOLDS', tone: 'holds' };
}

export function heroView(input: HeroInput): HeroView {
  const { place, was, measure, chase, around } = input;
  const chip = heroChip(place, was);
  const placeTone = place === 1 ? 'top' : chip.tone === 'holds' ? 'holds' : 'up';
  const runs = measure === 'runs';
  const best = input.best ?? (input.improved ? { runs: input.innings.runs, line: input.innings.line } : null);
  const passed = around && around.passedCount > 0 ? around.passed : [];
  const leader = place === 1 ? passed[0] ?? null : null;

  const eyebrow = chase
    ? (chase.key ?? `CHASE · ${chase.name.toUpperCase()}’S ${grouped(chase.target)}`)
    : `${input.name.toUpperCase()} · ${input.modeName}`;

  let head: HeroView['head'];
  let sub: string;
  if (chase) {
    head = { text: chase.title, gold: chase.beat ? chase.name : null };
    sub = chase.line;
  } else if (input.improved) {
    head = runs ? { text: `New best ${grouped(input.innings.runs)}`, gold: grouped(input.innings.runs) } : { text: 'New best', gold: null };
    sub = place === 1
      ? (leader && runs ? `${grouped(input.innings.runs - leader.runs)} clear of ${leader.name} at the top` : 'Top of the board')
      : runs ? `of ${grouped(input.total)} on the board` : input.innings.line ?? `of ${grouped(input.total)} on the board`;
  } else {
    head = runs && best ? { text: `Best ${grouped(best.runs)} stands`, gold: null } : { text: 'Best still stands', gold: null };
    sub = runs && best ? `This one ${grouped(input.innings.runs)} · ${grouped(Math.max(0, best.runs - input.innings.runs))} short` : `This one: ${input.innings.line ?? grouped(input.innings.runs)}`;
  }
  // An innings at the top says so whatever it was, in the line under the headline.
  if (place === 1 && !chase && !input.improved) sub = 'Still top of the board';

  let left: HeroView['left'];
  if (chase && !chase.beat && !chase.key) left = { kind: 'bar' };
  else if (passed.length) {
    const shown = passed.slice(0, 2);
    left = { kind: 'surpassed', faces: shown.map(({ name, avatar }) => ({ name, avatar })), more: Math.max(0, around!.passedCount - shown.length), names: shown.map(one => one.name) };
  } else {
    const figure = runs ? grouped(input.innings.runs) : input.innings.line ?? grouped(input.innings.runs);
    left = { kind: 'innings', figure, line: was === null ? 'Your first on this board' : 'No places moved' };
  }

  // A chase fallen short has its near miss the whole width: the chase is the next thing.
  let right: HeroView['right'] = null;
  if (place === 1) right = { kind: 'top' };
  else if (around?.next && left.kind !== 'bar') {
    const mark = best?.runs ?? input.innings.runs;
    const need = Math.max(1, around.next.runs - mark + 1);
    const line = runs ? `${grouped(need)} ${need === 1 ? 'run' : 'runs'} to surpass` : 'Next to surpass';
    right = { kind: 'next', who: around.next, line };
  }

  return { place, placeTone, chip, eyebrow, head, trophy: chase ? chase.beat : input.improved, sub, left, right };
}
