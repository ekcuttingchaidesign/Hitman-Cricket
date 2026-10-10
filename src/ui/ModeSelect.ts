/**
 * Choose a mode, as UI v1 draws it: the hub between the cover and an innings.
 *
 * Two posters, the Test Marathon and the Blast, with the player's best and
 * place on each; Test Survival as a banner under them; then the boards, My
 * Stats in the material of the tier the player is on, and Rivals. A new player
 * sees the same screen with "Not played" on the posters, the Debutant card and
 * the Rivals invitation in place of a record.
 *
 * The keys the game listens on keep the ids the old picker had — `#modes`,
 * `#modes-cancel`, `#mode-marathon`, `#mode-classic`, `#mode-survive`,
 * `#mode-challenge`, `#modes-challenges`, `#modes-board`, the `#mode-key`
 * slot — and are drawn once. What changes with the player is drawn into them
 * by `modeSelectParts`, so a key bound at start-up never goes stale.
 */

import { avatarSrc } from '../config/board';
import type { RivalsRecord } from '../game/challenge-api';
import type { Player } from '../game/player';
import { escape } from './Leaderboard';
import { cta, icon } from './Kit';

const POSTER_MARATHON = new URL('../assets/entry/poster-marathon.webp', import.meta.url).href;
const POSTER_BLAST = new URL('../assets/cover-drive.webp', import.meta.url).href;
const BANNER_SURVIVAL = new URL('../assets/survive-cover.webp', import.meta.url).href;
const art = (file: string) => new URL(`../assets/entry/${file}`, import.meta.url).href;

/** One poster's figures: nothing played yet, or the best and where it stands. */
export interface PosterView {
  best: string | null;
  rank: number | null;
}

export interface ModeSelectView {
  player: Player | null;
  marathon: PosterView;
  blast: PosterView;
  /** Survival's line under its name: its best result, or the rules for somebody who has not played. */
  survive: PosterView;
  /** The top three of the Blast, first to third, as kits. */
  podium: number[];
  /** The player's place on the Blast, for the boards widget. */
  blastRank: number | null;
  stats: { runs: number; tier: { key: string; name: string } };
  rivals: RivalsRecord | null;
}

/** "Best 158 · #2", or "Not played". */
export function posterStat(view: PosterView): string {
  if (!view.best) return 'Not played';
  return `Best ${view.best}${view.rank ? ` · #${view.rank}` : ''}`;
}

/** Survival's banner line. */
export function surviveLine(view: PosterView): string {
  if (!view.best) return '60 balls, one wicket. Chase or hold out.';
  return `${view.best}${view.rank ? ` · #${view.rank}` : ''}`;
}

/** The boards widget's line. */
export function boardNote(rank: number | null): string {
  return rank ? `You are #${rank} in The Blast` : 'Top 50 in every mode';
}

/** Rivals' line: the record, or the invitation. */
export function rivalsLine(record: RivalsRecord | null): string {
  if (!record || record.won + record.lost + record.drawn === 0) return 'Same balls. Best score wins.';
  const parts = [`${record.won} won`, `${record.lost} lost`];
  if (record.drawn) parts.push(`${record.drawn} drawn`);
  return `${parts.join(' · ')} against friends`;
}

const face = (player: Player | null, cls: string) => player
  ? `<img class="${cls}" src="${avatarSrc(player.avatar)}" alt="" width="44" height="44">`
  : `<span class="${cls} is-guest">${icon('user')}</span>`;

/** Everything on the screen that is about this player, by the id it is drawn into. */
export function modeSelectParts(view: ModeSelectView): Record<string, string> {
  // The opponent on the Rivals widget is a kit that is not the player's.
  const rival = ((view.player?.avatar ?? 0) + 3) % 5;
  const podium = [1, 0, 2].map(place => {
    const kit = view.podium[place];
    return kit === undefined ? '' : `<img class="mp-face is-${place + 1}" src="${avatarSrc(kit)}" alt="">`;
  }).join('');
  return {
    'modes-profile': face(view.player, 'modes-profile-face'),
    'mode-marathon-stat': escape(posterStat(view.marathon)),
    'mode-classic-stat': escape(posterStat(view.blast)),
    'mode-survive-line': escape(surviveLine(view.survive)),
    'modes-podium-faces': podium,
    'modes-board-note': escape(boardNote(view.blastRank)),
    'modes-stats-runs': view.stats.runs.toLocaleString('en-US'),
    'modes-stats-tier': escape(view.stats.tier.name),
    'modes-rivals-faces': `${face(view.player, 'mr-face')}<img class="mr-face is-them" src="${avatarSrc(rival)}" alt="">`,
    'modes-rivals-line': escape(rivalsLine(view.rivals)),
  };
}

/** The faint ground under the bento: boundary, the thirty-yard circle, the strip. */
const ground = `<div class="ms-ground" aria-hidden="true">
  <img src="${art('ground-e1.svg')}" alt="" style="--l:-260;--t:-322;--w:1180;--h:944">
  <img src="${art('ground-e1b.svg')}" alt="" style="--l:-140;--t:-226;--w:940;--h:752">
  <img src="${art('ground-circle.webp')}" alt="" style="--l:-20;--t:-130;--w:700;--h:560">
  <img src="${art('ground-e3.svg')}" alt="" style="--l:100;--t:-34;--w:460;--h:368">
  <span class="ms-strip"></span><span class="ms-crease" style="--t:92"></span><span class="ms-crease" style="--t:208"></span>
</div>`;

const play = (ink: string, ledge: string) => `<span class="k-cta k-cta--play-small ms-play" style="--ink:${ink};--ledge:${ledge}" aria-hidden="true"><span class="k-cta-face"><span>PLAY</span></span></span>`;

/** The screen itself, drawn once. The Marathon's NEW tag goes once it has been played (`is-played`). */
export function modeSelectMarkup(): string {
  return `
        <div id="modes" class="modal-overlay ms-screen hidden" role="dialog" aria-modal="true" aria-labelledby="modes-title">
          <div class="ms-glow" aria-hidden="true"><img src="${art('glow-left.svg')}" alt="" class="is-left"><img src="${art('glow-right.svg')}" alt="" class="is-right"></div>
          ${ground}
          <div class="ms-grain" aria-hidden="true"></div>
          <div class="ms-content">
            <div class="ms-top">
              <button id="modes-cancel" class="k-icon-button" aria-label="Back" title="Back">${icon('arrow-left')}</button>
              <h2 id="modes-title" class="ms-title">CHOOSE A MODE</h2>
              <button id="modes-profile" class="ms-profile" type="button" aria-label="My stats"></button>
            </div>
            <div class="ms-posters">
              <button id="mode-marathon" class="ms-poster is-marathon" type="button">
                <img class="ms-art" src="${POSTER_MARATHON}" alt="" decoding="async">
                <span class="ms-tag is-new">NEW</span>
                <span class="ms-name"><span>TEST</span><span>MARATHON</span></span>
                <span class="ms-desc">One long innings, no over limit.</span>
                <span class="ms-foot"><span id="mode-marathon-stat" class="ms-stat">Not played</span>${play('var(--c-marathon)', '#00301a')}</span>
              </button>
              <button id="mode-classic" class="ms-poster is-blast" type="button">
                <img class="ms-art" src="${POSTER_BLAST}" alt="" decoding="async">
                <span class="ms-tag is-blast">5 OVERS</span>
                <span class="ms-name"><span>THE</span><span>BLAST</span></span>
                <span class="ms-desc">5 overs, 3 wickets.</span>
                <span class="ms-foot"><span id="mode-classic-stat" class="ms-stat">Not played</span>${play('#1a4497', '#0f2c68')}</span>
              </button>
            </div>
            <button id="mode-survive" class="ms-banner" type="button">
              <img class="ms-art" src="${BANNER_SURVIVAL}" alt="" decoding="async">
              <span class="ms-tag is-survival">LAST MAN IN</span>
              <span class="ms-banner-foot">
                <span class="ms-banner-text"><span class="ms-banner-name">TEST SURVIVAL</span><span id="mode-survive-line" class="ms-desc">60 balls, one wicket. Chase or hold out.</span></span>
                ${play('#8e1424', '#5e0c17')}
              </span>
            </button>
            <div class="ms-bento">
              <button id="modes-board" class="ms-card ms-boards" type="button">
                <span class="ms-card-head"><span>LEADERBOARDS</span>${icon('chevron-right')}</span>
                <span class="ms-podium" aria-hidden="true">
                  <img class="mp-plinth is-2" src="${art('plinth-2.svg')}" alt=""><b class="mp-n is-2">2</b>
                  <img class="mp-plinth is-3" src="${art('plinth-3.svg')}" alt=""><b class="mp-n is-3">3</b>
                  <img class="mp-plinth is-1" src="${art('plinth-1.svg')}" alt=""><b class="mp-n is-1">1</b>
                  <span id="modes-podium-faces"></span>
                  <img class="mp-crown" src="${art('crown.svg')}" alt="">
                </span>
                <span id="modes-board-note" class="ms-note">Top 50 in every mode</span>
              </button>
              <button id="modes-stats" class="ms-card ms-stats tier-debutant" type="button">
                <span class="ms-card-head"><span>MY STATS</span>${icon('chevron-right')}</span>
                <span class="ms-stats-body"><b id="modes-stats-runs">0</b><span>career runs</span></span>
                <span id="modes-stats-tier" class="ms-stats-tier">DEBUTANT</span>
              </button>
            </div>
            <div class="ms-card ms-rivals">
              <button id="modes-challenges" class="ms-rivals-open" type="button" aria-label="Rival matches"></button>
              <span id="modes-rivals-faces" class="ms-versus" aria-hidden="true"></span>
              <b class="ms-vs" aria-hidden="true">VS</b>
              <span class="ms-rivals-text"><span class="ms-rivals-name">RIVALS <i id="mode-challenge-flag" class="ms-flag hidden"></i></span><span id="modes-rivals-line" class="ms-note">Same balls. Best score wins.</span></span>
              ${cta({ kind: 'challenge', label: 'Challenge a friend', id: 'mode-challenge' })}
            </div>
            <div id="mode-key" class="key-slot hidden"></div>
          </div>
        </div>`;
}
