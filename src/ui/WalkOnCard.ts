import type { WalkOnCard } from '../game/walk-on-card';
import { avatarSrc } from '../config/board';
import { escape } from './Leaderboard';

/** Each mode's colour, as My Stats' switch draws it. */
const COLOUR: Record<string, string> = { classic: '#3f88f2', marathon: '#1f8a55', survive: '#ff5a4e' };

/**
 * The walk-on's player card, drawn: a broadcast's lower third for the batter
 * walking out. His face in a ring of the mode's colour, the mode and his rung
 * over his name, and four figures under it — or, where he has never batted in
 * this mode, DEBUTANT in gold beside his name on a card no wider than that.
 * What it says is `walkOnCard`'s.
 */
export function walkOnCardMarkup(card: WalkOnCard): string {
  // A debutant has no figures, so his card is the one row, the tag beside his
  // name and the panel only as wide as that: a row of nothing under it was a
  // panel of empty space.
  const figures = card.debut ? '' : `<div class="woc-figures">${card.figures.map((one, i) =>
    `<div class="woc-figure" style="--i:${i}"><b>${escape(one.value)}</b><span>${escape(one.label)}</span></div>`).join('')}</div>`;
  return `
    <div class="woc is-${escape(card.mode)}${card.debut ? ' is-debut' : ''}" style="--woc:${COLOUR[card.mode] ?? COLOUR.classic}"
      role="status" aria-label="${escape(`Now batting: ${card.name}, ${card.modeName}${card.debut ? ', debutant' : `, ${card.figures.map(one => `${one.label} ${one.value}`).join(', ')}`}`)}">
      <div class="woc-head">
        <span class="woc-face"><img src="${avatarSrc(card.avatar)}" alt="" decoding="async" onerror="this.remove()"></span>
        <div class="woc-who">
          <div class="woc-eyebrow"><span class="woc-mode">${escape(card.modeName)}</span>${card.debut ? '' : `<span class="woc-tier">${escape(card.tier)}</span>`}</div>
          <div class="woc-name">${escape(card.name)}</div>
        </div>
        ${card.debut ? '<div class="woc-debut">Debutant</div>' : ''}
      </div>
      ${figures}
    </div>`;
}
