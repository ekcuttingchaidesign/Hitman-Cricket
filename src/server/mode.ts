/**
 * Which mode a request to the board, the career or the innings endpoints is
 * about — read once, here, rather than in each of them.
 *
 * Every endpoint used to ask only "is it `survive`?" and take anything else
 * for the Blast. That was right while there were two modes, and wrong the
 * moment there is a third: a Test Marathon innings would have landed on the
 * Blast's board and in the Blast's careers. So the Marathon is recognised by
 * name. Its boards are open (`docs/MARATHON.md`, step 5) and its careers are
 * not yet (step 6), so a Marathon request to the career or innings endpoints
 * is still turned away rather than counted as the Blast's. Anything else that
 * is not `survive` is still the Blast, as it always was.
 */
export type ModeAsked = 'classic' | 'survive' | 'marathon';

export function modeAsked(value: unknown): ModeAsked {
  const asked = String(value ?? '').trim().toLowerCase();
  if (asked === 'survive') return 'survive';
  if (asked === 'marathon') return 'marathon';
  return 'classic';
}

/** Whether a mode has careers behind it yet. Every mode has a board. */
export const open = (mode: ModeAsked): mode is 'classic' | 'survive' => mode !== 'marathon';

/** What a request for careers in a mode that has none yet is told. */
export const NOT_OPEN = 'Test Marathon has no career yet.';
