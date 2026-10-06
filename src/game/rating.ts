/**
 * The star rating, and when it is asked for.
 *
 * The questionnaire waits to be opened; this goes looking. It is one row of five
 * stars on the end of an innings — one tap, sent at once — and the whole of this
 * file is the question of *when*, because a rating asked at the wrong moment is
 * worse than none: asked mid-over it is a wicket nobody played a shot at, asked
 * on a first innings it is an opinion of the tutorial, and asked every innings
 * it is a pop-up people learn to close without reading.
 *
 * So there are two moments and a set of brakes.
 *
 *  - **A new mode, after its first finished innings.** Test Survival, Test
 *    Marathon and Rival Matches each get asked about once, by name, right after
 *    the player has finished one — which is when the opinion is freshest and the
 *    only time it is about the mode rather than about what they remember of it.
 *  - **The game, after the third finished innings.** Enough to have an opinion,
 *    and early enough that the people who are going to leave have not left yet.
 *
 * And the brakes: never on the first innings anybody plays, never on a practice
 * innings, one ask a visit, a week's quiet after the prompt is waved away, and
 * none at all after it has been waved away three times. Rated once is rated —
 * each thing is asked about once per browser, and a new mode added later is a
 * new thing, which is how somebody who rated the game a year ago still gets
 * asked about the mode that came out last week.
 *
 * Pure, and imports nothing from the game, for the reason `feedback.ts` is: the
 * endpoint validates a rating against these same lists.
 */

/** What can be rated: the game as a whole, or one of its modes by name. */
export type RatedThing = 'game' | 'classic' | 'survive' | 'marathon' | 'rivals';

/** Everything an innings can be, for counting. A Rival Match is its own. */
export type RatedMode = Exclude<RatedThing, 'game'>;

/** What prompted it, kept with the stars so the two moments can be compared. */
export type RatingMoment = 'mode' | 'innings' | 'form';

const THINGS: readonly RatedThing[] = ['game', 'classic', 'survive', 'marathon', 'rivals'];
const MOMENTS: readonly RatingMoment[] = ['mode', 'innings', 'form'];

/**
 * The modes asked about by name. The Blast is not among them: it is the game
 * most people have played, so asking about "the game" is already asking about it.
 */
export const NEW_MODES: readonly RatedMode[] = ['survive', 'marathon', 'rivals'];

/** What each is called on the prompt. */
export const RATED_NAME: Record<RatedThing, string> = {
  game: 'Hitman Cricket',
  classic: 'The Blast',
  survive: 'Test Survival',
  marathon: 'Test Marathon',
  rivals: 'Rival Matches',
};

/**
 * The word under the stars, one a star. The fun question's own five labels, so
 * a star means what that question's answer meant and the two columns can be
 * read side by side.
 */
export const STAR_WORDS = ['Not for me', 'It’s okay', 'Good fun', 'Loved it', 'Couldn’t stop'] as const;

/** Finished innings before the game itself is asked about. */
export const GAME_AFTER = 3;
/** How long a waved-away prompt keeps quiet. */
export const QUIET_DAYS = 7;
/** Waved away this many times, and it stops asking for good. */
export const MAX_DISMISSALS = 3;

const DAY_MS = 86_400_000;

/** What this browser remembers about being asked. */
export interface RatingMemory {
  /** When each thing was rated. Absent is not yet. */
  rated: Partial<Record<RatedThing, number>>;
  /** Finished innings, of every kind and of each, practice left out. */
  finished: number;
  played: Partial<Record<RatedMode, number>>;
  /** How often the prompt has been waved away, and when it last was. */
  dismissals: number;
  dismissedAt?: number;
}

export const RATING_KEY = 'hitman-rating';

export function emptyMemory(): RatingMemory {
  return { rated: {}, finished: 0, played: {}, dismissals: 0 };
}

/** One finished innings, counted. Practice is never passed in. */
export function counted(memory: RatingMemory, mode: RatedMode): RatingMemory {
  return {
    ...memory,
    finished: memory.finished + 1,
    played: { ...memory.played, [mode]: (memory.played[mode] ?? 0) + 1 },
  };
}

export function rated(memory: RatingMemory, thing: RatedThing, now: number): RatingMemory {
  return { ...memory, rated: { ...memory.rated, [thing]: now } };
}

export function dismissed(memory: RatingMemory, now: number): RatingMemory {
  return { ...memory, dismissals: memory.dismissals + 1, dismissedAt: now };
}

export interface AskWhen {
  /** The innings that has just finished. */
  mode: RatedMode;
  practice: boolean;
  /** Whether the prompt has already been put up on this visit. */
  askedThisVisit: boolean;
  /**
   * Whether this browser has sent the full questionnaire. Its fun question was
   * a rating of the game in all but stars, so the game is not asked about again.
   */
  formGiven: boolean;
  now: number;
}

/**
 * What to ask about at the end of the innings that has just finished, or null.
 *
 * Reads the memory *after* this innings was counted. The mode comes first: a
 * Marathon finished for the first time is asked about as a Marathon even when
 * the game is also due, because the game will still be due next time and the
 * first Marathon will not.
 */
export function nextAsk(memory: RatingMemory, when: AskWhen): { thing: RatedThing; moment: RatingMoment } | null {
  if (when.practice || when.askedThisVisit) return null;
  if (memory.dismissals >= MAX_DISMISSALS) return null;
  if (memory.dismissedAt !== undefined && when.now - memory.dismissedAt < QUIET_DAYS * DAY_MS) return null;
  // Never on the first innings anybody plays, whatever it was: the opinion
  // would be of the controls they have not learned yet.
  if (memory.finished < 2) return null;
  if (NEW_MODES.includes(when.mode) && !memory.rated[when.mode]) return { thing: when.mode, moment: 'mode' };
  if (memory.finished >= GAME_AFTER && !memory.rated.game && !when.formGiven) return { thing: 'game', moment: 'innings' };
  return null;
}

/** A rating as it is sent and kept. */
export interface Rating {
  stars: number;
  thing: RatedThing;
  moment: RatingMoment;
  /**
   * The same on the tap and on the follow-up questions sent after it, so the two
   * rows can be read as one person's one rating rather than counted twice.
   */
  ref: string;
}

/** A rating that arrived from anywhere, kept only if every part of it is one. */
export function cleanRating(raw: unknown): Rating | null {
  if (!raw || typeof raw !== 'object') return null;
  const from = raw as Record<string, unknown>;
  const stars = Number(from.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return null;
  if (!THINGS.includes(from.thing as RatedThing)) return null;
  const moment = MOMENTS.includes(from.moment as RatingMoment) ? from.moment as RatingMoment : 'form';
  const ref = typeof from.ref === 'string' && /^[0-9a-z]{6,16}$/.test(from.ref) ? from.ref : '';
  return { stars, thing: from.thing as RatedThing, moment, ref };
}

export function mintRef(): string {
  return Math.random().toString(36).slice(2, 12).padEnd(8, '0');
}

/** How the prompt reacts, by what was given: a low mark is not celebrated. */
export function tierOf(stars: number): 'low' | 'mid' | 'high' | 'top' {
  return stars <= 2 ? 'low' : stars === 3 ? 'mid' : stars === 4 ? 'high' : 'top';
}

export function readMemory(): RatingMemory {
  try {
    const held = JSON.parse(localStorage.getItem(RATING_KEY) ?? 'null') as Partial<RatingMemory> | null;
    if (!held || typeof held !== 'object') return emptyMemory();
    return {
      rated: held.rated && typeof held.rated === 'object' ? held.rated : {},
      finished: Number(held.finished) || 0,
      played: held.played && typeof held.played === 'object' ? held.played : {},
      dismissals: Number(held.dismissals) || 0,
      dismissedAt: typeof held.dismissedAt === 'number' ? held.dismissedAt : undefined,
    };
  } catch { return emptyMemory(); }
}

export function writeMemory(memory: RatingMemory) {
  try { localStorage.setItem(RATING_KEY, JSON.stringify(memory)); } catch { /* Then it may ask again one day. */ }
}
