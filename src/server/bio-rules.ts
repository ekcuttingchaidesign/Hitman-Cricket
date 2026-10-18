import { nameBlocked, wordBlocked } from './name-filter.js';

/**
 * The one line a player writes about themselves, and what it may not say.
 *
 * Eighty characters: at the narrowest phone it is two lines on a profile and
 * never cut, long enough for some personality and short enough to read in a
 * glance on a sheet people open for figures. Counted as they look, so an emoji
 * is one.
 *
 * Many players are young, and a bio must never be a way to reach somebody: no
 * links, no emails, no @handles, no phone numbers. Those are caught as the
 * player types, half a second after they stop, by the same function the store
 * runs again on save. The word filter is the names' one, run a word at a time
 * — folded as a whole line it finds words across the gaps between words — and
 * once more over any run of single letters, so `f u c k` is still the word.
 *
 * Shared by the browser and the store, as `name-rules.ts` is: a refusal the
 * screen has already said costs no round trip, and the store holds whatever
 * the screen did.
 */

export const BIO_MAX = 80;
/** From here the counter says what is left, rather than "76/80". */
export const BIO_NEAR = 70;

/** What the screen says for each refusal, in one line. */
export const BIO_CONTACT_REASON = 'Keep contact details and links out of your bio.';
export const BIO_BLOCKED_REASON = 'That isn’t allowed in a bio. Try saying it another way.';

/** A bio's characters as they look: grapheme clusters where the runtime can split them, code points where it cannot. */
export function bioChars(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map(one => one.segment);
  return [...text];
}

/**
 * A bio as it will be kept: control and invisible characters gone (the ones a
 * name loses too), every run of spaces and line breaks one space, trimmed, and
 * cut to eighty as it looks. Empty means no bio.
 */
export function cleanBio(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const flat = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return bioChars(flat).slice(0, BIO_MAX).join('').trim();
}

const LINK = /\b(?:https?:\/\/|www\.)|\b[a-z0-9-]{2,}\.(?:com|in|net|org|io|me|co|app|gg|ly|link|xyz|info|tv|be|to|site|online|store|shop)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const HANDLE = /(?:^|[\s(])@[a-z0-9_.]{2,}/i;
/** Seven or more digits, however they are spaced or dashed: a phone number, or the start of one. */
const PHONE = /(?:\+?\d[\s.\-()]*){7,}/;
const SOCIAL = /\b(?:insta(?:gram)?|snap(?:chat)?|whats ?app|telegram|tele|discord|dm me|text me|call me)\b/i;

/** Whether a bio says how to reach somebody. */
export function bioContact(text: string): boolean {
  return LINK.test(text) || EMAIL.test(text) || HANDLE.test(text) || PHONE.test(text) || SOCIAL.test(text);
}

/** Whether a bio carries a word the names' filter refuses. */
export function bioBlocked(text: string): boolean {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.some(word => wordBlocked(word))) return true;
  // Single letters spaced out are one word in disguise.
  let run = '';
  for (const word of [...words, '']) {
    if (/^[\p{L}\p{N}][.\-_*]?$/u.test(word)) { run += word; continue; }
    if (run.length >= 3 && nameBlocked(run)) return true;
    run = '';
  }
  return false;
}

/** What is wrong with a bio, in the words the screen shows, or null when it may be kept. An empty bio is fine: it removes the one held. */
export function bioProblem(raw: unknown): string | null {
  const text = cleanBio(raw);
  if (!text) return null;
  if (bioContact(text)) return BIO_CONTACT_REASON;
  if (bioBlocked(text)) return BIO_BLOCKED_REASON;
  return null;
}
