/**
 * UI v1's parts, as markup: the components on the handover's Foundations page.
 *
 * Strings, like every other screen here, so a test can hold one to the design
 * without a browser and a screen can drop one into its own template. Each is
 * styled by `src/kit.css` and measured off its Figma master; `?ui=1` lays them
 * all out (`KitGallery.ts`) and `scripts/ui-check.mjs` photographs that.
 *
 * Nothing in the game draws these yet. The screens move onto them one at a
 * time, which is why they live under their own names rather than in place of
 * the keys they will replace.
 */

import type { CareerMode } from '../game/career';
import { type Standing, roadOf } from '../game/tier';
import { escape } from './Leaderboard';
import arrowLeft from '../assets/kit/icon-arrow-left.svg?raw';
import chart from '../assets/kit/icon-chart.svg?raw';
import check from '../assets/kit/icon-check.svg?raw';
import chevronDown from '../assets/kit/chevron-down.svg?raw';
import chevronRight from '../assets/kit/icon-chevron-right.svg?raw';
import grid from '../assets/kit/icon-grid.svg?raw';
import info from '../assets/kit/icon-info.svg?raw';
import key from '../assets/kit/icon-key.svg?raw';
import share from '../assets/kit/icon-share.svg?raw';
import swords from '../assets/kit/icon-swords.svg?raw';
import trophy from '../assets/kit/icon-trophy.svg?raw';
import user from '../assets/kit/icon-user.svg?raw';
import volume from '../assets/kit/icon-volume.svg?raw';
import whatsapp from '../assets/kit/icon-whatsapp.svg?raw';

const ICONS = {
  'arrow-left': arrowLeft, chart, check, 'chevron-down': chevronDown, 'chevron-right': chevronRight, grid, info, key,
  share, swords, trophy, user, volume, whatsapp,
} as const;

export type IconName = keyof typeof ICONS;

/**
 * One of the handover's Lucide icons, inline, its stroke turned to
 * `currentColor` so the part around it decides the colour — the file is the
 * Figma export as it came, with the colour it happened to be drawn in.
 */
export function icon(name: IconName, extra = ''): string {
  return ICONS[name]
    .replace(/<svg[^>]*?(viewBox="[^"]+")[^>]*>/, `<svg class="k-icon${extra ? ` ${extra}` : ''}" $1 fill="none" aria-hidden="true" focusable="false">`)
    .replace(/ id="[^"]*"/g, '')
    .replace(/stroke="(?!none)[^"]*"/g, 'stroke="currentColor"')
    .replace(/ stroke-opacity="[^"]*"/g, '')
    .replace(/\n/g, '');
}

/** The keys: PLAY AGAIN's face on a ledge, in each colour the design has. */
export type CtaKind = 'primary' | 'mode' | 'share' | 'challenge' | 'play-small' | 'secondary' | 'share-wide' | 'save';

export interface Cta {
  kind: CtaKind;
  /** Printed on the face; for the square keys, which print nothing, the accessible name. */
  label: string;
  id?: string;
  icon?: IconName;
  /** Across the column, as on the cover and at the foot of a screen. */
  wide?: boolean;
  /** The face's ink, where a mode card tints PLAY its own colour. */
  ink?: string;
  disabled?: boolean;
  /** The primary's moving face: two faint chevrons crossing it, end to end. */
  moving?: boolean;
}

/** The square keys show only their icon, and say what they are to a screen reader. */
const SQUARE: Partial<Record<CtaKind, IconName>> = { share: 'whatsapp', challenge: 'swords' };
const DEFAULT_ICON: Partial<Record<CtaKind, IconName>> = { mode: 'grid', 'share-wide': 'share', ...SQUARE };

export function cta(view: Cta): string {
  const { kind, label, id, wide = kind === 'secondary' || kind === 'share-wide', ink, disabled = false } = view;
  const glyph = view.icon ?? DEFAULT_ICON[kind];
  const square = kind in SQUARE;
  const attrs = [
    `type="button"`,
    `class="k-cta k-cta--${kind}${wide ? ' is-wide' : ''}"`,
    id ? `id="${escape(id)}"` : '',
    square ? `aria-label="${escape(label)}"` : '',
    ink ? `style="--ink:${escape(ink)}"` : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');
  const chevrons = view.moving ? '<i class="k-cta-chevrons" aria-hidden="true"></i>' : '';
  const face = `${chevrons}${glyph ? icon(glyph) : ''}${square ? '' : `<span>${escape(label)}</span>`}`;
  return `<button ${attrs}><span class="k-cta-face">${face}</span></button>`;
}

/** The 44-square key on every top bar: back, sound, how ranking works. */
export function iconButton(view: { icon: IconName; label: string; id?: string }): string {
  return `<button type="button" class="k-icon-button"${view.id ? ` id="${escape(view.id)}"` : ''} aria-label="${escape(view.label)}">${icon(view.icon)}</button>`;
}

/** The board's mode and ranking switches: a dot in the mode's colour, the choice, a chevron. */
export function dropdownPill(view: { label: string; dot?: string; open?: boolean; id?: string; state?: 'pressed' | 'focus' }): string {
  const { label, dot, open = false, id, state } = view;
  return `<button type="button" class="k-pill${state ? ` is-${state}` : ''}"${id ? ` id="${escape(id)}"` : ''} aria-haspopup="listbox" aria-expanded="${open}"${dot ? ` style="--dot:${escape(dot)}"` : ''}>`
    + `${dot ? '<span class="k-pill-dot" aria-hidden="true"></span>' : ''}<span class="k-pill-label">${escape(label)}</span>${icon('chevron-down')}</button>`;
}

export interface Choice {
  key: string;
  label: string;
}

/** A row of tabs, one chosen: My Stats' modes. */
export function tabs(items: readonly Choice[], chosen: string, label: string): string {
  return `<div class="k-tabs" role="tablist" aria-label="${escape(label)}">${items.map(item =>
    `<button type="button" class="k-tab" role="tab" data-key="${escape(item.key)}" aria-selected="${item.key === chosen}">${escape(item.label)}</button>`,
  ).join('')}</div>`;
}

/** A row of chips, one pressed: the ladder a board is ranked by. */
export function chips(items: readonly Choice[], chosen: string, label: string): string {
  return `<div class="k-chips" role="group" aria-label="${escape(label)}">${items.map(item =>
    `<button type="button" class="k-chip" data-key="${escape(item.key)}" aria-pressed="${item.key === chosen}">${escape(item.label)}</button>`,
  ).join('')}</div>`;
}

export interface RankHeader {
  name: string;
  /** The kit's picture (`avatarSrc`). */
  avatar: string;
  rank: number;
  /** Where this innings is the player's first: the chip beside the name. */
  first?: boolean;
  /** Under the line, for a player who has been here before: "Best still stands · 158". */
  best?: string;
}

/**
 * Where this innings puts the player, in one sentence with only the place in
 * orange. A first innings carries the chip; a returning player's best goes
 * underneath.
 */
export function rankHeader(view: RankHeader): string {
  const { name, avatar, rank, first = false, best } = view;
  return `<div class="k-rank">
    <img class="k-rank-avatar" src="${escape(avatar)}" alt="" width="48" height="48">
    <div class="k-rank-text">
      <div class="k-rank-who k-t-overline"><span>${escape(name)}</span>${first ? '<span class="k-rank-first k-t-tag">First innings</span>' : ''}</div>
      <p class="k-rank-line k-t-lead">You are <b>#${rank}</b> on the leaderboard</p>
      ${best ? `<div class="k-rank-best k-t-small">${icon('trophy')}<span>${escape(best)}</span></div>` : ''}
    </div>
  </div>`;
}

/** The foot of the player card: two equal doors. */
export function cardActions(ids: { board?: string; career?: string } = {}): string {
  const door = (cls: string, glyph: IconName, label: string, id?: string) =>
    `<button type="button" class="k-action ${cls}"${id ? ` id="${escape(id)}"` : ''}>${icon(glyph)}<span>${label}</span>${icon('chevron-right', 'is-chevron')}</button>`;
  return `<div class="k-actions">${door('is-board', 'chart', 'Leaderboard', ids.board)}${door('is-career', 'user', 'Career stats', ids.career)}</div>`;
}

/** The career key as a ticket stub: the key, the perforation, SAVE. */
export function keyTicket(view: { key: string; saveId?: string }): string {
  return `<div class="k-ticket">
    <div class="k-ticket-key">
      <div class="k-ticket-label k-t-overline">${icon('key')}<span>Career key</span></div>
      <div class="k-ticket-pill">${escape(view.key)}</div>
    </div>
    <span class="k-ticket-perf" aria-hidden="true"></span>
    <div class="k-ticket-save">${cta({ kind: 'save', label: 'SAVE', id: view.saveId })}</div>
  </div>`;
}

/** The black strip a pit-wall widget is headed with. */
export function pitHeader(view: { mode: string; label?: string; soundId?: string }): string {
  return `<div class="k-pit">
    <h2 class="k-pit-mode">${escape(view.mode)}</h2>
    ${view.label ? `<span class="k-pit-label">${escape(view.label)}</span>` : ''}
    <button type="button" class="k-pit-sound"${view.soundId ? ` id="${escape(view.soundId)}"` : ''} aria-label="Sound">${icon('volume')}</button>
  </div>`;
}

const BADGES = import.meta.glob<string>('../assets/kit/badge/*.svg', { eager: true, query: '?url', import: 'default' });

/** Where a tier's medallion is drawn, earned or still locked. Debutant is never locked: everybody starts on it. */
export function badgeSrc(tier: string, earned: boolean): string {
  const file = `../assets/kit/badge/${tier}-${earned || tier === 'debutant' ? 'earned' : 'locked'}.svg`;
  const src = BADGES[file];
  if (!src) throw new Error(`No badge for ${tier}`);
  return src;
}

/** A tier's hexagonal medallion. Sized by `--size`, 96 of the design's pixels unless told. */
export function tierBadge(tier: string, earned: boolean, name = tier): string {
  return `<span class="k-badge"><img src="${badgeSrc(tier, earned)}" alt="${escape(name)}${earned ? '' : ' (locked)'}" draggable="false"></span>`;
}

/**
 * Road to Hitman: the four medallions along one track, lit as far as the
 * career has come, the line filled to where it stands, and the next goal over
 * it in one sentence. Where it stands is `roadOf`'s, in the unit tests.
 */
export function roadToHitman(mode: CareerMode, standing: Standing): string {
  const road = roadOf(mode, standing);
  const here = road.rungs.findIndex(rung => rung.key === standing.tier.key);
  const last = road.rungs.length - 1;
  const rungs = road.rungs.map((rung, i) => `
      <div class="k-road-rung${rung.reached ? ' is-reached' : ''}${i === here ? ' is-here' : ''}" style="--x:${i / last}">
        ${tierBadge(rung.key, rung.reached, rung.short)}
        <span class="k-road-name">${escape(rung.short)}</span>
        <span class="k-road-at">${rung.at.toLocaleString('en-US')}</span>
      </div>`).join('');
  // The pin is for somebody on the way: at the first medallion there is
  // nothing behind it to mark, and at the last the track is all theirs.
  const pin = road.position > 0 && road.position < 1
    ? `<div class="k-road-you"><span class="k-t-tag">${standing.measure.toLocaleString('en-US')}</span></div>` : '';
  const goal = escape(road.goal).replace(/^([\d,]+ \w+)/, '<span>$1</span>');
  return `<section class="k-road" aria-label="Road to Hitman: ${escape(road.goal)}">
    <div class="k-road-head"><span class="k-road-title">ROAD TO HITMAN</span><p class="k-road-goal">${goal}</p></div>
    <div class="k-road-track" style="--at:${road.position.toFixed(4)}">
      <span class="k-road-line"></span><span class="k-road-fill"></span>${rungs}${pin}
    </div>
  </section>`;
}
