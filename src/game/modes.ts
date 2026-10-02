/**
 * The modes the game plays.
 *
 * - **CLASSIC** — The Blast: five overs, three wickets, coloured kit, and the
 *   floodlights after dark by the player's clock.
 * - **SURVIVE** — Test Survival: a tailender, one wicket, a hundred to chase in
 *   ten overs.
 * - **MARATHON** — Test Marathon: three wickets, as many balls as they last
 *   (`docs/MARATHON.md`). Not playable yet: the type is here so that the code
 *   can say "a Test match" and mean both Test modes, ahead of the rules.
 *
 * Two questions get asked of a mode, and they are not the same question.
 * "Is this a Test match?" decides how it looks — whites, the Test field, a
 * day game — and both Test modes answer yes. "Is this Test Survival?" decides
 * its rules — the chase, its board, its injury note — and only one does.
 */
export type GameMode = 'CLASSIC' | 'SURVIVE' | 'MARATHON';

/** A Test match: played in whites, to the Test field, by day. */
export const isTest = (mode: GameMode) => mode === 'SURVIVE' || mode === 'MARATHON';
