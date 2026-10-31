import type { LivePlayer } from '../game/live-api';

/**
 * Who is around, painted onto every face that names a player: a green dot for
 * online and an amber badge with a bat for batting, at the foot of the face on
 * a board row, a podium step, a folded chip and a Rival Matches row; on a
 * profile the photo's own ring takes the colour and a line under the name says
 * which (Figma section 23, A2 and A3).
 *
 * Painted after the fact rather than drawn into each screen's markup: a face
 * carries its player's handle already (`data-handle`, and `data-rival` on a
 * Rival Matches row; `data-mine` is the player's own), so one pass over the
 * page marks every screen, the ones drawn before the list arrived included.
 * The pass changes nothing that is already right, so it settles at once.
 */

const MODE_WORD = { classic: 'The Blast', marathon: 'Test Marathon', survive: 'Test Survival', super10: 'Super10' } as const;

/** The words a profile says under the name, or null for nobody around. */
export function liveLine(player: Pick<LivePlayer, 'state' | 'mode'> | undefined): string | null {
  if (!player) return null;
  if (player.state === 'online') return 'Online';
  return player.mode ? `Batting now · ${MODE_WORD[player.mode]}` : 'Batting now';
}

export function paintLive(root: ParentNode, live: ReadonlyMap<string, LivePlayer>, own: string | null) {
  for (const el of root.querySelectorAll<HTMLElement>('[data-handle], [data-mine], [data-rival]')) {
    const handle = el.dataset.handle ?? el.dataset.rival ?? (el.dataset.mine ? own : null);
    const player = handle ? live.get(handle) : undefined;
    if (el.classList.contains('ps-face')) { paintProfile(el, player); continue; }
    const kit = el.classList.contains('board-kit') ? el : el.querySelector<HTMLElement>('.board-kit');
    if (!kit || kit.classList.contains('is-empty')) continue;
    paintFace(kit, player?.state ?? null);
  }
}

/** A dot or a badge beside a face, outside the face's own clipped circle. */
function paintFace(kit: HTMLElement, state: LivePlayer['state'] | null) {
  let holder = kit.parentElement?.classList.contains('live-face') ? kit.parentElement : null;
  if (!state && !holder) return;
  if (!holder) {
    holder = document.createElement('span');
    holder.className = 'live-face';
    kit.replaceWith(holder);
    holder.append(kit);
  }
  let mark = holder.querySelector<HTMLElement>(':scope > .live-mark');
  if (!state) { mark?.remove(); return; }
  if (!mark) {
    mark = document.createElement('i');
    holder.append(mark);
  }
  const cls = `live-mark is-${state}`;
  if (mark.className !== cls) mark.className = cls;
  const label = state === 'online' ? 'Online' : 'Batting now';
  if (mark.getAttribute('aria-label') !== label) { mark.setAttribute('role', 'img'); mark.setAttribute('aria-label', label); }
}

/** A profile: the photo's ring in the colour, and one line under the name. */
function paintProfile(face: HTMLElement, player: LivePlayer | undefined) {
  face.classList.toggle('is-live-online', player?.state === 'online');
  face.classList.toggle('is-live-batting', player?.state === 'batting');
  const name = face.parentElement?.querySelector<HTMLElement>('.ps-name');
  if (!name) return;
  let line = name.nextElementSibling?.classList.contains('ps-live') ? name.nextElementSibling as HTMLElement : null;
  const words = liveLine(player);
  if (!words) { line?.remove(); return; }
  if (!line) {
    line = document.createElement('p');
    name.after(line);
  }
  const cls = `ps-live is-${player!.state}`;
  if (line.className !== cls) line.className = cls;
  if (line.textContent !== words) line.textContent = words;
}

/**
 * Keeps a part of the page painted: after anything is drawn into it, and
 * whenever `repaint` is called with a new list. Answers the way to stop.
 */
export function watchLive(root: HTMLElement, live: () => ReadonlyMap<string, LivePlayer>, own: () => string | null): { repaint(): void; stop(): void } {
  let queued = 0;
  const run = () => { queued = 0; paintLive(root, live(), own()); };
  const repaint = () => { if (!queued) queued = window.setTimeout(run, 120); };
  const observer = new MutationObserver(repaint);
  observer.observe(root, { childList: true, subtree: true });
  return { repaint, stop() { observer.disconnect(); window.clearTimeout(queued); } };
}
