import type { WalkOnCard } from '../game/walk-on-card';
import { tierBadge } from './Kit';
import { escape, kitMarkup } from './Leaderboard';
import { groundMarkup } from './PlayerSheet';

/**
 * The walk-on's player card, drawn: a broadcast's lower third for the batter
 * walking out, cut from the same cloth as his career card and his profile. It
 * wears his rung's material (`tier-…`: the ground, the light and the mark the
 * player sheet's top half wears, `groundMarkup`, melting to the dark where
 * the figures sit, the Marathon's in its own colours), his face in the rung's
 * ring with its medallion on it, his name in the profile's face (chrome at
 * Star, gold at Hitman), the rung's pill, and four figures as the profile sets
 * its glance. A debut is the one row: his face, FIRST INNINGS, and the pill.
 * What it says is `walkOnCard`'s.
 */
export function walkOnCardMarkup(card: WalkOnCard): string {
  const figures = card.debut ? '' : `<div class="woc-figures">${card.figures.map((one, i) =>
    `<div class="woc-figure" style="--i:${i}"><b>${escape(one.value)}</b><span>${escape(one.label)}</span></div>`).join('')}</div>`;
  const said = card.debut ? 'first innings' : card.figures.map(one => `${one.label} ${one.value}`).join(', ');
  return `
    <div class="woc tier-${escape(card.tier)} is-${escape(card.mode)}${card.debut ? ' is-debut' : ''}" role="status"
      aria-label="${escape(`Now batting: ${card.name}, ${card.rung}, ${card.modeName}, ${said}`)}">
      ${groundMarkup(card.tier)}
      <div class="woc-body">
        <div class="woc-head">
          <span class="woc-face">${kitMarkup(card.avatar, card.name)}<span class="woc-badge">${tierBadge(card.tier, true, card.rung)}</span></span>
          <div class="woc-who">
            <span class="woc-eyebrow">${escape(card.modeName)}${card.debut ? ' · First innings' : ''}</span>
            <span class="woc-name ps-name">${escape(card.name)}</span>
          </div>
          <span class="ps-pill woc-pill">${escape(card.rung)}</span>
        </div>
        ${figures}
      </div>
    </div>`;
}
