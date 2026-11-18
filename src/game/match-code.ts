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
