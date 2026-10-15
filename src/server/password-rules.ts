/**
 * What a career password has to be, said the same way in the browser and on the
 * server: the name gate checks it before a round trip, and the store checks it
 * again, because a rule only the browser keeps is a rule anybody can skip.
 *
 * Why these rules and no more. A password stands where the career key stood —
 * with the name, it opens a career — and the name is public, printed down the
 * board. The store allows twenty tries an hour at one name, which is nothing
 * against a password nobody would guess and everything against "123456". So
 * what is refused is what gets guessed first: too short, one character over and
 * over, the commonest few, and the player's own name with a number on it. Past
 * that, a phone's password manager is welcome to make it as long as it likes.
 */

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;

/**
 * The passwords a stranger tries first, written as the browser folds them
 * (lowercase, letters and numbers only), so "Password!" and "pass word" are
 * caught with "password". Cricket's own words are here because this is a
 * cricket game, and they are the first thing anybody would try on it.
 */
const COMMON = new Set([
  '123456', '1234567', '12345678', '123456789', '1234567890', '0123456789', '012345', '123123', '123321',
  '654321', '987654', '9876543210', '112233', '121212', '123654', '147258', '159753', '696969', '102030',
  'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwerty123', 'qwertyuiop', 'asdfgh', 'zxcvbn',
  'abc123', 'abcdef', 'abcd1234', 'iloveyou', 'letmein', 'welcome', 'monkey', 'dragon', 'football', 'india123',
  'cricket', 'cricket1', 'cricket123', 'hitman', 'hitman45', 'hitman264', 'hitmancricket', 'rohit45', 'sachin',
  'sachin10', 'virat18', 'dhoni7', 'msdhoni', 'msd007', 'india', 'bharat',
]);

/** The password as it is compared against the commonest few: letters and numbers, lowercase. */
const bare = (password: string) => password.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * What is wrong with a password, in one line the player can act on, or null.
 *
 * `folded` is the name it goes with, folded the way the board folds it, so the
 * name with a number on the end is caught however it was typed.
 */
export function passwordProblem(password: string, folded = ''): string | null {
  const said = password.trim();
  if ([...said].length < PASSWORD_MIN) return `At least ${PASSWORD_MIN} characters.`;
  if ([...said].length > PASSWORD_MAX) return `No more than ${PASSWORD_MAX} characters.`;
  if (/^(.)\1+$/u.test(said)) return 'Not one character over and over. Mix it up.';
  const plain = bare(said);
  if (COMMON.has(plain)) return 'That one is too easy to guess. Pick something only you would.';
  if (folded && plain.replace(/\d+$/, '') === folded) return 'Not your name. Everybody can read that on the board.';
  return null;
}

/** The password as it is kept and checked: what was typed, without the space a phone's keyboard adds. */
export function cleanPassword(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}
