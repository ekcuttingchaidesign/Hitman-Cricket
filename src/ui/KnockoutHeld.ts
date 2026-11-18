/**
 * Super Knockout's held scoreboard (Figma "Super Knockout · Final", P8 and H1
 * to H3): hold the scoreboard between balls and everyone still in the room
 * drops down under it, best first, the knockout line dashed red over the drop,
 * the player's row outlined. The bowler waits at his mark while it is held, up
 * to `HOLD_MS`, a ring round the scoreboard draining as he does; let go, or
 * the ring runs out, and the list is gone, a tick says the bowler is ready,
 * and he runs in `READY_MS` later. With a ball live a touch here does nothing.
 */
import { cutOf, type KnockoutRoom } from '../game/knockout';
import { avatarSrc } from '../config/board';

/** The longest the bowler waits on a hold, a ball. */
export const HOLD_MS = 5000;
/** From the list going to the bowler running in: the ready beat. */
export const READY_MS = 800;

export interface HeldRow { place: number; name: string; runs: number; face: number; you: boolean; drop: boolean; free: boolean; out: boolean }
export interface Held { rows: HeldRow[]; /** The row the dashed line stands over: the first in the drop, or null. */ cutAt: number | null }

/** Everyone still in, as the room stands, with the cut as it would fall now. */
export function heldOf(room: KnockoutRoom): Held {
  const { count, by } = room.nextCut;
  const alive = room.ranked;
  const drop = new Set(cutOf(alive, count, by).gone);
  const rows = alive.map((seat, i) => ({ place: i + 1, name: seat.id === 0 ? 'You' : seat.name, runs: seat.runs, face: seat.face,
    you: seat.id === 0, drop: drop.has(seat), free: room.freeHitAhead(seat.id), out: seat.out }));
  const first = rows.findIndex(row => row.drop);
  return { rows, cutAt: first > 0 ? first : null };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function heldMarkup(held: Held): string {
  return held.rows.map((row, i) => `${i === held.cutAt ? '<li class="ko-held-cut" aria-hidden="true"></li>' : ''}
    <li class="ko-held-row${row.you ? ' is-you' : ''}${row.drop ? ' is-drop' : ''}"><i>${row.place}</i><img src="${avatarSrc(row.face)}" alt="" decoding="async"><b>${esc(row.name)}${row.free ? '<em>FH</em>' : ''}${row.out ? '<em class="is-out">OUT</em>' : ''}</b><span>${row.runs}</span></li>`).join('');
}

/** The panel under the scoreboard and the ring round it, drawn once into the HUD. */
export function heldPanelMarkup(): string {
  return `<div id="ko-held" class="ko-held" hidden aria-label="Everyone in the room"><ol id="ko-held-list"></ol></div>
        <svg id="ko-wait" class="ko-wait" hidden aria-hidden="true"><rect pathLength="100" rx="18" ry="18"></rect></svg>`;
}
