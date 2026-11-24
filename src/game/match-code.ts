/**
 * A Super Knockout match's code, shared by the store and the browser: four
 * characters, nothing a phone's keyboard or a voice across a room gets wrong
 * (no 0, O, 1 or I), and the most a match seats.
 */
export const MATCH_SEATS = 12;
export const MATCH_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MATCH_CODE_LENGTH = 4;

/** A code as typed, raised to capitals, or null. Pasting a whole link works too: the code is read off its end. */
export function cleanMatchCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const linked = /[?&]k=([A-Za-z0-9]+)/.exec(raw)?.[1];
  const code = (linked ?? raw).trim().toUpperCase();
  if (code.length !== MATCH_CODE_LENGTH) return null;
  return [...code].every(char => MATCH_CODE_ALPHABET.includes(char)) ? code : null;
}

/**
 * The code in whatever a player pasted: a link's `?k=`, the line INVITE shares
 * ("… Code K7Q2 https://…"), a code on its own, or the one word in the text
 * that is a code. Null when there is none, or more than one and nothing says
 * which.
 */
export function codeIn(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  const linked = /[?&]k=([A-Za-z0-9]+)/.exec(text)?.[1];
  if (linked) return cleanMatchCode(linked);
  const named = /\bcode\W{0,3}([A-Za-z0-9]{4})\b/i.exec(text)?.[1];
  if (named && cleanMatchCode(named)) return cleanMatchCode(named);
  const whole = cleanMatchCode(text);
  if (whole) return whole;
  const words = new Set(text.split(/[^A-Za-z0-9]+/).map(word => cleanMatchCode(word)).filter((code): code is string => !!code));
  return words.size === 1 ? [...words][0] : null;
}

/** Who is waited for, in so many words: Kabir · Kabir and Meera · Kabir, Meera and 2 more. */
export function namesOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'everybody';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
