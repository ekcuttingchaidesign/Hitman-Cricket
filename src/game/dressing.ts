import type { BlastCareer, CareerMode, MarathonCareer, SurviveCareer } from './career';
import { TIERS, tierMeasure } from './tier';

/**
 * The Dressing Room's shelves: seven kits and twelve bats.
 *
 * "Kit" already means the avatar picture elsewhere in the game (`KITS` in
 * `config/board.ts`), so what the batter wears is an outfit here. Nothing on
 * these shelves plays differently; they are looks, earned by playing.
 */
import { FREE_BAT, FREE_GUARD, FREE_OUTFIT, isBat, isGuard, isOutfit, type BatId, type GuardId, type OutfitId } from './dressing-ids';

export { isBat, isGuard, isOutfit, type BatId, type GuardId, type OutfitId };

export interface Outfit {
  id: OutfitId;
  name: string;
  shirt: string; helmet: string; trousers: string; pads: string;
  /** The straps, cuffs and collar. */
  trim: string;
  /** The number on his back. */
  number: string;
  /** The light the room is lit in while it is on show. */
  glow: string;
  /** What earned it, once it has been. */
  line: string;
  /** What it takes, in a few words, for a chip. */
  short: string;
}

export interface BatSkin {
  id: BatId;
  name: string;
  grip: string;
  glow: string;
  line: string;
  short: string;
  /** Whether it wears a sticker sheet (`src/assets/bats/<id>.webp`); Plain is bare willow. */
  stickers: boolean;
}

export const OUTFITS: readonly Outfit[] = [
  // Production's kit to the last colour (`BATTER_KITS.home`): the room is where it is shown off, not changed.
  { id: 'home', name: 'OG Navy', shirt: '#2F5A88', helmet: '#2A527C', trousers: '#F4F0E4', pads: '#FDFCF4', trim: '#ED7044', number: '#ED7044', glow: '#ED7044', line: 'Your kit from day one.', short: 'Free' },
  { id: 'crimson', name: 'Crimson', shirt: '#C51C25', helmet: '#B8171D', trousers: '#EFE3CF', pads: '#E9DCC6', trim: '#8F1D22', number: '#FFFFFF', glow: '#FF3B3B', line: '25 finished innings.', short: '25 innings' },
  { id: 'forest', name: 'British Racing Green', shirt: '#0A4A3E', helmet: '#135045', trousers: '#F1E5D5', pads: '#ECE0CC', trim: '#0A4A3E', number: '#FFFFFF', glow: '#25C28A', line: 'Emerging Player in all three modes.', short: 'Emerging in every mode' },
  { id: 'gold', name: 'Bumblebee', shirt: '#F2A31B', helmet: '#F2A31B', trousers: '#13284A', pads: '#1E3560', trim: '#F2A31B', number: '#13284A', glow: '#FFB52E', line: '10 Rival wins against 5 different players.', short: '10 Rival wins' },
  { id: 'violet', name: 'Thanos Eclipse', shirt: '#5232A6', helmet: '#5435A8', trousers: '#ECE8E3', pads: '#E9E4DE', trim: '#5232A6', number: '#FFFFFF', glow: '#8B5CFF', line: 'A double hundred in a Test Marathon.', short: 'A Test double hundred' },
  { id: 'electric', name: 'Electric', shirt: '#0A64D6', helmet: '#176DD3', trousers: '#0B56C0', pads: '#1A4A95', trim: '#F08A2C', number: '#FFFFFF', glow: '#2F8BFF', line: '50 Test Survival wins.', short: '50 Survival wins' },
  { id: 'lagoon', name: 'Lagoon', shirt: '#0597B0', helmet: '#0197B0', trousers: '#0F2A52', pads: '#183868', trim: '#2B4F86', number: '#FFFFFF', glow: '#1FD1E6', line: '500 finished innings.', short: '500 innings' },
];

export const BATS: readonly BatSkin[] = [
  { id: 'plain', name: 'Plain', grip: '#777E80', glow: '#E0B77A', line: 'Bare English willow.', short: 'Free', stickers: false },
  { id: 'boom', name: 'Boom', grip: '#FF2E88', glow: '#FF2E88', line: 'Yours for walking in. Every batter starts with a Boom.', short: 'Unlock it in the Dressing Room', stickers: true },
  // The six from the second set of skins, ranked among the first by what they take.
  { id: 'rage', name: 'Rage', grip: '#B8327E', glow: '#B347FF', line: '100 career sixes. Head down, horns out.', short: '100 sixes', stickers: true },
  { id: 'venom', name: 'Venom', grip: '#6FE02A', glow: '#57E31F', line: '1,000 career runs. One bite is all it takes.', short: '1,000 runs', stickers: true },
  { id: 'lonewolf', name: 'Lone Wolf', grip: '#2FD8C8', glow: '#22D3C5', line: '10 Test Survival wins. Out there on your own.', short: '10 Survival wins', stickers: true },
  { id: 'meg', name: 'Meg', grip: '#3FDDB2', glow: '#8E5CFF', line: '5 Rival Match wins. Something big in the water.', short: '5 Rival wins', stickers: true },
  { id: 'icecold', name: 'Ice Cold', grip: '#46D2FF', glow: '#46D2FF', line: '250 career sixes. Cool head, hot hands.', short: '250 sixes', stickers: true },
  { id: 'roar', name: 'Roar', grip: '#D4A23A', glow: '#FFB02E', line: 'Star in a mode. King Edition.', short: 'Star in any mode', stickers: true },
  { id: 'savage', name: 'Savage', grip: '#FF2BD6', glow: '#C04BFF', line: 'A hundred in every mode. Nobody messes with Savage.', short: 'A hundred in every mode', stickers: true },
  { id: 'reign', name: 'Reign', grip: '#1E3A8A', glow: '#F5C542', line: '10,000 career runs. Long may it last.', short: '10,000 runs', stickers: true },
  { id: 'inferno', name: 'Inferno', grip: '#FF5A1F', glow: '#FF6A1F', line: 'Star everywhere. Then prove it again.', short: 'Star in every mode', stickers: true },
  { id: 'hitman', name: 'Hitman', grip: '#C8FF1E', glow: '#B6FF2E', line: 'Top of the game.', short: 'Hitman tier', stickers: true },
];

export { FREE_OUTFIT, FREE_BAT, FREE_GUARD };
/**
 * The bat waiting in the Dressing Room for every player. Nothing has to be
 * played for it: it is unlocked in the room, by its own key, so the player
 * finds it there and sets off its unlock rather than having it go off at them.
 */
export const WELCOME_BAT: BatId = 'boom';

/**
 * Whether an item is waiting in the room for its key: Boom until it is
 * unlocked, and anything earned before the room arrived until its moment has
 * played (`waiting`).
 */
export const ready = (shelf: 'kit' | 'bat', id: string, r: DressingRecord) =>
  (shelf === 'bat' && id === WELCOME_BAT && !r.welcomed) || !!r.waiting?.includes(`${shelf}:${id}`);

export const outfitOf = (id: string | null | undefined): Outfit => OUTFITS.find(o => o.id === id) ?? OUTFITS[0];
export const batOf = (id: string | null | undefined): BatSkin => BATS.find(b => b.id === id) ?? BATS.find(b => b.id === FREE_BAT)!;

/** The game a step is played in, for the key under the list. */
export type StepMode = 'blast' | 'survival' | 'marathon' | 'rivals';

/**
 * One line of what an item takes. `best`: `now` is the best score so far, for
 * a one-off (a hundred, a double) where adding up means nothing; it is done
 * when the best reaches `of`.
 */
export interface Step { text: string; now: number; of: number; best?: true; mode?: StepMode }

/** Everything an unlock is read off. */
export interface DressingRecord {
  careers: { classic: BlastCareer; survive: SurviveCareer; marathon: MarathonCareer };
  /** Rival Matches won, and how many different players were beaten in them. */
  rivals: { won: number; beaten: number };
  /**
   * Each mode's tier figure when the Dressing Room arrived. "A quarter more
   * since launch" is measured from here, so a career built before it counts
   * for the tier itself but not twice. A new player's are all nought.
   */
  launch: Record<CareerMode, number>;
  /** Whether Boom has been unlocked, which is done in the Dressing Room itself with its key. */
  welcomed: boolean;
  /**
   * Earned, and known to be, but never shown: a career's worth won before the
   * room arrived. Each waits in the room for its key, so it gets its moment
   * when the player comes for it rather than all at once after an innings.
   */
  waiting?: readonly string[];
}

const MODES: readonly CareerMode[] = ['classic', 'survive', 'marathon'];
const STEP_MODE: Record<CareerMode, StepMode> = { classic: 'blast', survive: 'survival', marathon: 'marathon' };
const MODE_NAME: Record<CareerMode, string> = { classic: 'the Blast', survive: 'Test Survival', marathon: 'Test Marathon' };
const at = (key: string, mode: CareerMode) => TIERS.find(t => t.key === key)!.at[mode];
const measure = (r: DressingRecord, mode: CareerMode) => Math.max(0, Math.floor(tierMeasure(mode, r.careers[mode])));
/** How far past launch a mode's figure has come. */
const since = (r: DressingRecord, mode: CareerMode) => Math.max(0, measure(r, mode) - Math.max(0, r.launch[mode] ?? 0));
const innings = (r: DressingRecord) => r.careers.classic.innings + r.careers.survive.innings + r.careers.marathon.innings;
const sixes = (r: DressingRecord) => r.careers.classic.sixes + r.careers.survive.sixes + r.careers.marathon.sixes;
const runs = (r: DressingRecord) => r.careers.classic.runs + r.careers.survive.runs + r.careers.marathon.runs;

export const done = (s: Step) => s.now >= s.of;
/** How far along a list is, all its lines together, nought to one. */
export const shareOf = (steps: readonly Step[]) => steps.length ? steps.reduce((a, s) => a + Math.min(1, s.now / s.of), 0) / steps.length : 1;

/** What a kit takes; null for the one that comes free. */
export function outfitSteps(id: OutfitId, r: DressingRecord): Step[] | null {
  switch (id) {
    case 'home': return null;
    case 'crimson': return [{ text: 'Play 25 finished innings', now: innings(r), of: 25 }];
    case 'forest': return MODES.map(m => ({ text: `Emerging Player in ${MODE_NAME[m]}`, now: measure(r, m), of: at('emerging', m), mode: STEP_MODE[m] }));
    case 'gold': return [
      { text: 'Win 10 Rival Matches', now: r.rivals.won, of: 10, mode: 'rivals' },
      { text: 'Beat 5 different players', now: r.rivals.beaten, of: 5, mode: 'rivals' },
    ];
    case 'violet': return [{ text: 'Make 200 in a Test Marathon', now: r.careers.marathon.highest, of: 200, best: true, mode: 'marathon' }];
    case 'electric': return [{ text: 'Win 50 Test Survivals', now: r.careers.survive.wins, of: 50, mode: 'survival' }];
    case 'lagoon': return [{ text: 'Play 500 finished innings', now: innings(r), of: 500 }];
  }
}

/** What a bat takes; null for the one that comes free. Boom takes its key in the room: see `WELCOME_BAT`. */
export function batSteps(id: BatId, r: DressingRecord): Step[] | null {
  const c = r.careers;
  switch (id) {
    case 'plain': return null;
    case 'boom': return [{ text: 'Unlock it here, in the Dressing Room', now: r.welcomed ? 1 : 0, of: 1 }];
    case 'rage': return [{ text: 'Hit 100 career sixes', now: sixes(r), of: 100, mode: 'blast' }];
    case 'venom': return [{ text: 'Score 1,000 career runs', now: runs(r), of: 1000, mode: 'blast' }];
    case 'lonewolf': return [{ text: 'Win 10 Test Survivals', now: c.survive.wins, of: 10, mode: 'survival' }];
    case 'meg': return [{ text: 'Win 5 Rival Matches', now: r.rivals.won, of: 5, mode: 'rivals' }];
    case 'icecold': return [{ text: 'Hit 250 career sixes', now: sixes(r), of: 250, mode: 'blast' }];
    case 'roar': {
      // Any one mode will do, shown in the one nearest its Star.
      const m = [...MODES].sort((a, b) => measure(r, b) / at('star', b) - measure(r, a) / at('star', a))[0];
      return [{ text: `Reach Star in ${MODE_NAME[m]}`, now: measure(r, m), of: at('star', m), mode: STEP_MODE[m] }];
    }
    case 'reign': return [{ text: 'Score 10,000 career runs', now: runs(r), of: 10000, mode: 'blast' }];
    case 'savage': return [
      { text: 'A hundred in the Blast', now: c.classic.highest, of: 100, best: true, mode: 'blast' },
      // Survival keeps no top score: a hundred there is a chase completed, a win.
      { text: 'A hundred in Test Survival', now: Math.min(1, c.survive.wins), of: 1, mode: 'survival' },
      { text: 'A hundred in Test Marathon', now: c.marathon.highest, of: 100, best: true, mode: 'marathon' },
    ];
    case 'inferno': {
      const star = MODES.filter(m => measure(r, m) >= at('star', m)).length;
      const quarter = MODES.filter(m => since(r, m) >= at('star', m) / 4).length;
      // The key goes to the mode furthest from its Star.
      const behind = [...MODES].sort((a, b) => measure(r, a) / at('star', a) - measure(r, b) / at('star', b))[0];
      return [
        { text: 'Reach Star in all three modes', now: star, of: 3, mode: STEP_MODE[behind] },
        { text: 'Then a quarter more in each', now: quarter, of: 3, mode: STEP_MODE[behind] },
      ];
    }
    case 'hitman': {
      // Any one mode will do: it is shown in the one nearest done.
      const progress = (m: CareerMode) => (Math.min(1, measure(r, m) / at('hitman', m)) + Math.min(1, since(r, m) / (at('hitman', m) / 4))) / 2;
      const m = [...MODES].sort((a, b) => progress(b) - progress(a))[0];
      return [
        { text: `Reach Hitman in ${MODE_NAME[m]}`, now: measure(r, m), of: at('hitman', m), mode: STEP_MODE[m] },
        { text: 'Then a quarter more, since launch', now: since(r, m), of: Math.round(at('hitman', m) / 4), mode: STEP_MODE[m] },
      ];
    }
  }
}

export const outfitOwned = (id: OutfitId, r: DressingRecord) => (outfitSteps(id, r) ?? []).every(done);
export const batOwned = (id: BatId, r: DressingRecord) => (batSteps(id, r) ?? []).every(done);

/** Everything on both shelves this record has earned, the free ones included. */
export function earned(r: DressingRecord): { outfits: OutfitId[]; bats: BatId[] } {
  return { outfits: OUTFITS.filter(o => outfitOwned(o.id, r)).map(o => o.id), bats: BATS.filter(b => batOwned(b.id, r)).map(b => b.id) };
}

/** The locked one on a shelf nearest done, for Next up; null once the shelf is full. */
export function nextUp<T extends string>(ids: readonly T[], steps: (id: T) => Step[] | null): T | null {
  const open = ids.filter(id => !(steps(id) ?? []).every(done));
  return open.sort((a, b) => shareOf(steps(b)!) - shareOf(steps(a)!))[0] ?? null;
}
