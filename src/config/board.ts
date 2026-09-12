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
  { name: 'pink', colour: '#d31e6e', file: 'avatar_7.png' },
  { name: 'india blue', colour: '#0248c8', file: 'avatar_1.png' },
  { name: 'purple', colour: '#3f0884', file: 'avatar_2.png' },
  { name: 'orange', colour: '#f55b11', file: 'avatar_3.png' },
  { name: 'teal', colour: '#018ea3', file: 'avatar_6.png' },
] as const;

/** How many kits there are. The store turns down anything outside this. */
export const AVATARS = KITS.length;

/**
 * Where a kit's picture lives.
 *
 * Deliberately a bare relative path, with no leading slash and no
 * `import.meta.env.BASE_URL` in front of it. The browser resolves it against
 * the page's own URL, which is right on both hosts this game can be published
 * to: `…/Hitman-Cricket/avatars/avatar_7.png` under a GitHub Pages
 * subdirectory, and `/avatars/avatar_7.png` at a domain root. A leading slash
 * would look for the file at the top of github.io.
 */
export function avatarSrc(avatar: number): string {
  return `avatars/${KITS[avatar % AVATARS].file}`;
}

export function kitColour(avatar: number): string {
  return KITS[avatar % AVATARS].colour;
}
