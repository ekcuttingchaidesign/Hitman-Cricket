import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { cleanPassword } from './password-rules.js';

/**
 * Keeping a career password, and checking one.
 *
 * The career key's hash, for the same reasons (`career-key.ts`): a salt of its
 * own, scrypt at Node's defaults so a stolen store is slow to work through on a
 * graphics card, and a comparison in constant time. Unlike a key it is never
 * sealed. A key is the game's to hand out, so the owner reading one back for a
 * friend gives away nothing the friend did not already have; a password is the
 * player's, and is often the one they use everywhere else. Nobody reads it back.
 * A player who forgets theirs comes back with a key and sets another.
 *
 * Case is kept. A key is read off paper and its case is whoever wrote it down;
 * a password is typed by the person who chose it, or filled in by their phone.
 */

/** What is kept against a player. Never the password. */
export interface StoredPassword {
  salt: string;
  hash: string;
  /** When it was set, so the player can be told. */
  at: number;
}

const COST = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const LENGTH = 32;

export function keepPassword(password: string, now = Date.now()): StoredPassword {
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: scryptSync(cleanPassword(password), salt, LENGTH, COST).toString('hex'), at: now };
}

/**
 * A security question's answer, kept the same way: a slow hash, never the words.
 * The question itself is only a position on the list (`QUESTIONS`), and is no
 * secret: it is shown to whoever asks to answer it.
 */
export interface StoredAnswer extends StoredPassword {
  q: number;
}

/**
 * The form an answer is compared in. Capitals, spaces, punctuation and accents
 * go, because an answer is typed from memory a year later: "Rahul S." and
 * "rahul s" are one answer.
 */
export function foldAnswer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function keepAnswer(q: number, answer: string, now = Date.now()): StoredAnswer {
  const salt = randomBytes(16).toString('hex');
  return { q, salt, hash: scryptSync(foldAnswer(answer), salt, LENGTH, COST).toString('hex'), at: now };
}

export function answerMatches(answer: unknown, held: StoredAnswer): boolean {
  const said = foldAnswer(answer);
  if (!said) return false;
  let mine: Buffer;
  try {
    mine = scryptSync(said, held.salt, LENGTH, COST);
  } catch {
    return false;
  }
  const theirs = Buffer.from(held.hash, 'hex');
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}

/** Whether a password is the one that was kept. A record this build cannot read is a no, not a crash. */
export function passwordMatches(password: unknown, held: StoredPassword): boolean {
  const said = cleanPassword(password);
  if (!said) return false;
  let mine: Buffer;
  try {
    mine = scryptSync(said, held.salt, LENGTH, COST);
  } catch {
    return false;
  }
  const theirs = Buffer.from(held.hash, 'hex');
  return mine.length === theirs.length && timingSafeEqual(mine, theirs);
}
