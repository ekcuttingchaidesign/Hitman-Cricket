import { SeededRandom } from '../game/SeededRandom';

/**
 * The five kits, in one place, because three screens draw them: the board's
 * rows, the picker on the innings-end card, and eventually the shared picture.
 *
 * Each colour is sampled off the ring in its own picture rather than chosen, so
 * the disc that shows while a picture is still loading is the same colour as the
 * picture that lands on top of it. That is the whole job the colour has now: a
 * continuous load rather than a pop.
 *
 * The file names are the ones the pictures were uploaded under. They are
 * recorded here rather than the files being renamed to match an index, so the
 * mapping from kit to picture is written down in one readable place and the
 * gap in their numbering (1, 2, 3, 6, 7) costs nothing.
 */
export const KITS = [
  { name: 'pink', colour: '#d31e6e', file: 'avatar_7.webp' },
  { name: 'india blue', colour: '#0248c8', file: 'avatar_1.webp' },
  { name: 'purple', colour: '#3f0884', file: 'avatar_2.webp' },
  { name: 'orange', colour: '#f55b11', file: 'avatar_3.webp' },
  { name: 'teal', colour: '#018ea3', file: 'avatar_6.webp' },
] as const;

/** How many kits there are. The store turns down anything outside this. */
export const AVATARS = KITS.length;

/**
 * Where a kit's picture lives.
 *
 * Deliberately a bare relative path, with no leading slash and no
 * `import.meta.env.BASE_URL` in front of it. The browser resolves it against
 * the page's own URL, which is right on both hosts this game can be published
 * to: `…/Hitman-Cricket/avatars/avatar_7.webp` under a GitHub Pages
 * subdirectory, and `/avatars/avatar_7.webp` at a domain root. A leading slash
 * would look for the file at the top of github.io.
 */
export function avatarSrc(avatar: number): string {
  return `avatars/${KITS[avatar % AVATARS].file}`;
}

export function kitColour(avatar: number): string {
  return KITS[avatar % AVATARS].colour;
}

/** What a kit is called, for the label under its disc and for a screen reader. */
export function kitName(avatar: number): string {
  return KITS[avatar % AVATARS].name;
}

/**
 * The order the five kits are offered in, and which one the form opens on.
 *
 * Both are shuffled, and both are shuffled off the player's own id rather than
 * off the clock. That distinction is the whole of this function.
 *
 * The picker used to open on kit zero with the ring already on it, which reads
 * as an answer rather than a question — so almost nobody moved it, and the board
 * filled up with one colour. Dealing the kits out differently to different
 * people fixes that without costing anybody a tap.
 *
 * Seeding it off the id is what keeps it from being maddening. A fresh roll each
 * time the form opened would hand a player a different kit for closing the form
 * and opening it again, and rearrange the row underneath them while they looked
 * at it. Off the id, one browser sees one arrangement for as long as it keeps
 * its id, and two browsers see different ones — which is the only thing the
 * board cares about.
 */
export function kitDeal(playerId: string | null): { order: number[]; opening: number } {
  const order = new SeededRandom(seedOf(playerId)).shuffle([...KITS.keys()]);
  return { order, opening: order[0] };
}

/**
 * An id as a number. Any spread will do — this picks one of five kits and
 * shuffles five things, and is not asked to be anything more than that.
 */
function seedOf(playerId: string | null): number {
  let hash = 0x811c9dc5;
  for (const character of playerId ?? '') {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
