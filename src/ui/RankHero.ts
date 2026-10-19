import type { HeroView } from '../game/rank-hero';
import { icon } from './Kit';
import { escape, kitMarkup } from './Leaderboard';

/**
 * The rank hero, drawn: the end card's player card for a named player once
 * the store has placed them (Figma 14E). What it says is `heroView`'s; the
 * chase's near miss is handed in already drawn (`chaseBarMarkup`).
 */
export function rankHeroMarkup(view: HeroView, bar = ''): string {
  const head = view.head.gold && view.head.text.includes(view.head.gold)
    ? escape(view.head.text).replace(escape(view.head.gold), `<b>${escape(view.head.gold)}</b>`)
    : escape(view.head.text);
  const arrow = view.chip.tone === 'holds' ? '' : '<i aria-hidden="true"></i>';
  const left = view.left.kind === 'bar' ? `<div class="rh-bar">${bar}</div>`
    : view.left.kind === 'surpassed' ? `<div class="rh-cell">
          <small>YOU SURPASSED</small>
          <span class="rh-faces">${view.left.faces.map(one => kitMarkup(one.avatar, one.name)).join('')}${view.left.more ? `<em>+${view.left.more}</em>` : ''}</span>
          <span class="rh-names">${view.left.names.map(name => `<b>${escape(name)}</b>`).join('<span>, </span>')}${view.left.more ? `<span> +${view.left.more}</span>` : ''}</span>
        </div>`
    : `<div class="rh-cell">
          <small>THIS INNINGS</small>
          <strong class="rh-figure">${escape(view.left.figure)}</strong>
          <span class="rh-quiet">${escape(view.left.line)}</span>
        </div>`;
  const right = !view.right ? ''
    : view.right.kind === 'top' ? `<div class="rh-cell rh-next is-top">
          <small>NEXT</small>
          <span class="rh-who">${icon('trophy')}<b>Nobody ahead</b></span>
          <span class="rh-goal">Hold the top spot</span>
        </div>`
    : `<button id="rh-next" type="button" class="rh-cell rh-next">
          <small>NEXT · #${view.right.who.place}</small>
          <span class="rh-who">${kitMarkup(view.right.who.avatar, view.right.who.name)}<b>${escape(view.right.who.name)}</b><span>${view.right.who.runs.toLocaleString('en-US')}</span></span>
          <span class="rh-goal">${escape(view.right.line)}</span>
        </button>`;
  return `<div class="rh" data-tone="${view.placeTone}">
      <div class="rh-hero">
        <div class="rh-place-col">
          <strong class="rh-place" data-place="${view.place}">#${view.place}</strong>
          <span class="rh-chip is-${view.chip.tone}">${arrow}${escape(view.chip.text)}</span>
        </div>
        <div class="rh-side">
          <small class="rh-eyebrow">${escape(view.eyebrow)}</small>
          <p class="rh-head">${view.trophy ? icon('trophy') : ''}<span>${head}</span></p>
          <p class="rh-sub">${escape(view.sub)}</p>
        </div>
      </div>
      <div class="rh-split${right ? '' : ' is-one'}">${left}${right}</div>
      <div class="rh-paper" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</div>
    </div>`;
}
