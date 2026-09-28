/**
 * Whether a Rivals match has to be against a registered name to count on the
 * Rivals board.
 *
 * Off for now, deliberately. With it on, a match counts only when somebody
 * else in the room has a registered name, which is the one thing that stops a
 * player climbing the board by playing themselves on a second phone under a
 * made-up name. But while the game is small, most of the friends a player
 * sends a link to have never registered, and a win over them went on the
 * record and not on the board: players saw their wins vanish and felt the
 * board was ignoring them. So every finished match counts, and the board and
 * Rival Matches say the same thing.
 *
 * Turn it back on when there are enough players that farming is worth
 * guarding against. Nothing needs rewriting: every result is worked out afresh
 * the next time anybody in the room opens Rival Matches, so the board moves
 * over to the stricter count on its own, and a player left with nothing that
 * counts is taken off it.
 *
 * Either way, only a registered name appears on the board. That half is not
 * about farming — a name nobody has claimed can be typed by anybody, and a
 * board that showed them would let two people be the same Rohit.
 */
export const RIVALS_NEED_REGISTERED_RIVAL = false;
