/**
 * The security questions a player can pick from, for the day they forget their
 * password. Kept by position, so the order is part of the store's format: add
 * new ones on the end, never in the middle, and never reword one into a
 * different question.
 *
 * Each has an answer a player will give the same way in a year, that a
 * stranger cannot look up or guess from their profile, and that has many
 * possible answers. What is left out, and why: a favourite cricketer, team or
 * IPL side (half the country answers Virat, Dhoni or CSK); a mother's maiden
 * name or a city of birth (often public on social media); a favourite colour,
 * food or number (too few answers to guess between).
 */
export const QUESTIONS = [
  'Who did you first play gully cricket with?',
  'What did you call the place you first played cricket?',
  'What nickname did your friends call you as a kid?',
  'What was the name of your childhood best friend?',
  'What was the name of your first school?',
  'What was the first phone you owned?',
  'What was the first film you watched in a cinema?',
  'What was the name of the street you grew up on?',
] as const;

/** Whether this is the position of a question on the list. */
export function isQuestion(q: unknown): q is number {
  return typeof q === 'number' && Number.isInteger(q) && q >= 0 && q < QUESTIONS.length;
}
