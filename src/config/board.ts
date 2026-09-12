/**
 * The five kits, in one place, because three screens draw them: the board's
 * rows, the picker on the innings-end card, and eventually the shared picture.
 *
 * The pictures live in `public/avatars/` and are served as files rather than
 * bundled, so the game builds and runs whether or not they are there yet. Until
 * they arrive each kit is a coloured disc with the player's initial in it, and
 * a picture that fails to load falls back to exactly that — so the board never
 * has a broken image on it, only an earlier version of itself.
 *
 * The colours are taken off the kits in the pictures and lightened until navy
 * ink on them clears 6:1, because the initial has to be read rather than merely
 * seen while the picture is still loading.
 */
export const KITS = [
  { name: 'pink', colour: '#f07ba8' },
  { name: 'india blue', colour: '#6fb2e8' },
  { name: 'purple', colour: '#b998e8' },
  { name: 'orange', colour: '#f2874f' },
  { name: 'teal', colour: '#57bcc6' },
] as const;

/** How many kits there are. The store turns down anything outside this. */
export const AVATARS = KITS.length;

/**
 * Where a kit's picture lives.
 *
 * Deliberately a bare relative path, with no leading slash and no
 * `import.meta.env.BASE_URL` in front of it. The browser resolves it against
 * the page's own URL, which is right on both hosts this game can be published
 * to: `…/Hitman-Cricket/avatars/1.webp` under a GitHub Pages subdirectory, and
 * `/avatars/1.webp` at a domain root. A leading slash would look for the file
 * at the top of github.io.
 */
export function avatarSrc(avatar: number): string {
  return `avatars/${(avatar % AVATARS) + 1}.webp`;
}

export function kitColour(avatar: number): string {
  return KITS[avatar % AVATARS].colour;
}
