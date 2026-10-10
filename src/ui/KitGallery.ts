/**
 * `?ui=1`: every part of UI v1 on one page, in every state it has, for holding
 * against the handover's Foundations page on a phone.
 *
 * A page rather than a mode of the game, like the feedback link: it is decided
 * in main.ts before the game is imported, so it builds no ground, opens no
 * audio and reads nobody's career. The figures on it are made up. It changes
 * nothing about the batting, so it is not practice (`tests/practice.test.ts`
 * names it), and `scripts/ui-check.mjs` photographs it.
 */

import { avatarSrc } from '../config/board';
import type { CareerMode } from '../game/career';
import { TIERS, standingOf } from '../game/tier';
import {
  cardActions, chips, cta, dropdownPill, iconButton, keyTicket, pitHeader, rankHeader, roadToHitman, tabs, tierBadge,
} from './Kit';

const SWATCHES: [string, string][] = [
  ['Page', '--c-page'], ['Card top', '--c-card-top'], ['Card bottom', '--c-card-bottom'], ['Surface', '--c-surface'],
  ['Text primary', '--c-text'], ['Text secondary', '--c-text-2'], ['Text muted', '--c-text-3'], ['You / accent', '--c-accent'],
  ['CTA ledge', '--c-cta-ledge'], ['The Blast', '--c-blast'], ['Test Marathon', '--c-marathon'], ['Test Survival', '--c-survival'],
  ['Win', '--c-win'], ['Draw', '--c-draw'], ['Loss / danger', '--c-loss'], ['Gold', '--c-gold'], ['Share green', '--c-share'],
];

const TYPE: [string, string][] = [
  ['k-t-num-xl', 'Satoshi Black 80'], ['k-t-num', 'Satoshi Black 30'], ['k-t-lead', 'Satoshi Bold 18'],
  ['k-t-label', 'Satoshi Bold 14'], ['k-t-overline', 'Satoshi Bold 11 caps'], ['k-t-tag', 'Satoshi Bold 9 caps'],
  ['k-t-body', 'Satoshi Medium 14'], ['k-t-small', 'Satoshi Medium 12'], ['k-t-title', 'Jaro 30'],
];

const MODES = [{ key: 'classic', label: 'The Blast' }, { key: 'survive', label: 'Survival' }, { key: 'marathon', label: 'Marathon' }];
const LADDERS = [{ key: 'best', label: 'Top score' }, { key: 'runs', label: 'Runs' }, { key: 'boundaries', label: 'Boundaries' }];

/** A career with only the figure a tier is read off: enough for the road. */
function road(mode: CareerMode, measure: number): string {
  const career = { runs: measure, balls: measure } as Parameters<typeof standingOf>[1];
  return roadToHitman(mode, standingOf(mode, career));
}

const section = (id: string, title: string, body: string) =>
  `<section class="kg-section" id="kg-${id}"><h2 class="kg-head k-t-overline">${title}</h2>${body}</section>`;

export function galleryMarkup(): string {
  const swatches = SWATCHES.map(([name, token]) =>
    `<figure class="kg-swatch"><span style="background:var(${token})"></span><figcaption class="k-t-small">${name}<br><code>${token}</code></figcaption></figure>`).join('');
  const type = TYPE.map(([cls, name]) => `<p class="${cls}">${name} · 158</p>`).join('');
  const ctas = [
    cta({ kind: 'primary', label: 'PLAY AGAIN', id: 'kg-play-again' }),
    cta({ kind: 'primary', label: 'PLAY AGAIN', id: 'kg-play-again-moving', moving: true }),
    cta({ kind: 'mode', label: 'MODE' }),
    cta({ kind: 'share', label: 'Share on WhatsApp' }),
    cta({ kind: 'challenge', label: 'Challenge a friend' }),
    cta({ kind: 'play-small', label: 'PLAY' }),
    cta({ kind: 'play-small', label: 'PLAY', ink: 'var(--c-marathon)' }),
    cta({ kind: 'primary', label: 'PLAY AGAIN', disabled: true }),
  ].join('');
  const wide = [
    cta({ kind: 'primary', label: 'PLAY', wide: true }),
    cta({ kind: 'secondary', label: 'HOW TO PLAY' }),
    cta({ kind: 'share-wide', label: 'BRAG ABOUT MY STATS' }),
  ].join('');
  const controls = `
    <div class="kg-row">${dropdownPill({ label: 'The Blast', dot: 'var(--c-blast)' })}${dropdownPill({ label: 'The Blast', dot: 'var(--c-blast)', state: 'pressed' })}</div>
    <div class="kg-row">${dropdownPill({ label: 'The Blast', dot: 'var(--c-blast)', state: 'focus' })}${dropdownPill({ label: 'The Blast', dot: 'var(--c-blast)', open: true })}</div>
    <div class="kg-row">${dropdownPill({ label: 'Test Marathon', dot: 'var(--c-marathon)' })}${dropdownPill({ label: 'Top score' })}</div>
    ${tabs(MODES, 'classic', 'Mode')}
    ${chips(LADDERS, 'best', 'Rank by')}
    <div class="kg-row">${iconButton({ icon: 'arrow-left', label: 'Back' })}${iconButton({ icon: 'volume', label: 'Sound on' })}</div>`;
  const player = `
    <div class="kg-card">${rankHeader({ name: 'Shashank', avatar: avatarSrc(0), rank: 2, first: true })}</div>
    <div class="kg-card">${rankHeader({ name: 'Shashank', avatar: avatarSrc(0), rank: 2, best: 'Best still stands  ·  158' })}</div>
    <div class="kg-card">${rankHeader({ name: 'Abhimanyu Rath', avatar: avatarSrc(3), rank: 12, best: 'New best  ·  was 118' })}${cardActions()}</div>
    ${keyTicket({ key: 'stamina-lofted-fielder-30' })}
    ${pitHeader({ mode: 'TEST MARATHON', label: 'INNINGS' })}
    ${pitHeader({ mode: 'THE BLAST', label: '5 OVERS' })}`;
  const badges = TIERS.map(tier => tierBadge(tier.key, true, tier.short)).join('')
    + TIERS.slice(1).map(tier => tierBadge(tier.key, false, tier.short)).join('');
  const roads = [road('classic', 0), road('classic', 2140), road('classic', 16450), road('survive', 420), road('marathon', 9000)].join('');
  return `<main class="kg" aria-label="UI kit">
    <h1 class="kg-title">FOUNDATIONS</h1>
    <p class="kg-note k-t-small">UI v1 · every part, every state · figures made up</p>
    ${section('colour', 'Colour', `<div class="kg-swatches">${swatches}</div>`)}
    ${section('type', 'Type', type)}
    ${section('ctas', 'CTAs', `<div class="kg-row kg-wrap">${ctas}</div><div class="kg-stack">${wide}</div>`)}
    ${section('controls', 'Controls', controls)}
    ${section('player', 'Player card, rank and key', player)}
    ${section('badges', 'Tier badges', `<div class="kg-row kg-wrap">${badges}</div>`)}
    ${section('road', 'Road to Hitman', `<div class="kg-stack">${roads}</div>`)}
  </main>`;
}

export function kitGallery(root: HTMLElement): void {
  document.title = 'UI kit · Hitman Cricket';
  root.innerHTML = galleryMarkup();
  // Pressing a pill opens it, and a tab or a chip takes the choice: enough to
  // feel each one under a thumb. Nothing is kept.
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest('button');
    if (!target) return;
    if (target.classList.contains('k-pill')) target.setAttribute('aria-expanded', String(target.getAttribute('aria-expanded') !== 'true'));
    if (target.classList.contains('k-tab')) {
      target.parentElement?.querySelectorAll('.k-tab').forEach(tab => tab.setAttribute('aria-selected', String(tab === target)));
    }
    if (target.classList.contains('k-chip')) {
      target.parentElement?.querySelectorAll('.k-chip').forEach(chip => chip.setAttribute('aria-pressed', String(chip === target)));
    }
  });
}
