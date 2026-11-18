/**
 * Super Knockout's way in (Figma "Super Knockout · Final", F1): its poster on
 * Choose a mode's rail and its card under the rail (K1, K1b), its home (K2)
 * and how it works (K2b). Until rooms with real players come (stage two) a
 * match is a practice room against eleven subs, which QUICK MATCH walks out
 * into; PLAY WITH FRIENDS is drawn and waits, marked SOON. The home's card
 * of figures is this browser's practice rooms, since practice scores no points.
 */
import { cta, icon } from './Kit';
import { KNOCKOUT } from '../game/knockout';

export const KNOCKOUT_MARK = new URL('../assets/knockout/mark.webp', import.meta.url).href;
export const KNOCKOUT_HERO = new URL('../assets/knockout/hero.webp', import.meta.url).href;
export const KNOCKOUT_FACEOFF = new URL('../assets/knockout/faceoff.webp', import.meta.url).href;

/** The practice rooms this browser has played, for the home's card: how many, the best finish, and how many won. */
export interface KnockoutTally { played: number; best: number | null; wins: number }

const TALLY_KEY = 'hitman-knockout';
export function readTally(): KnockoutTally {
  try {
    const kept = JSON.parse(localStorage.getItem(TALLY_KEY) ?? 'null');
    if (kept && typeof kept.played === 'number') {
      return { played: Math.max(0, kept.played | 0), best: typeof kept.best === 'number' ? kept.best : null, wins: Math.max(0, kept.wins | 0) };
    }
  } catch { /* A fresh tally. */ }
  return { played: 0, best: null, wins: 0 };
}
/** One finished room added to the tally: the place it ended in. */
export function tallyRoom(place: number, kept: KnockoutTally = readTally()): KnockoutTally {
  const next = { played: kept.played + 1, best: kept.best === null ? place : Math.min(kept.best, place), wins: kept.wins + (place === 1 ? 1 : 0) };
  try { localStorage.setItem(TALLY_KEY, JSON.stringify(next)); } catch { /* Kept for this visit only. */ }
  return next;
}

/** Whether a browser has seen how it works: it opens by itself the first time a player chooses Super Knockout. */
const RULES_SEEN_KEY = 'hitman-knockout-rules';
export function rulesSeen(): boolean { try { return localStorage.getItem(RULES_SEEN_KEY) === '1'; } catch { return true; } }
export function markRulesSeen(): void { try { localStorage.setItem(RULES_SEEN_KEY, '1'); } catch { /* Shown again next time. */ } }

/** The poster on the rail (K1b), between the Test Marathon and Test Survival. */
export function knockoutPosterMarkup(play: string): string {
  return `<button id="mode-knockout-poster" class="ms-poster is-knockout hidden" type="button" data-mode="KNOCKOUT">
                <img class="ms-art" src="${KNOCKOUT_HERO}" alt="" decoding="async">
                <span class="ms-tag is-knockout">${KNOCKOUT.seats} PLAYERS</span>
                <img class="ms-logo is-knockout" src="${KNOCKOUT_MARK}" alt="SUPER KNOCKOUT" decoding="async">
                <span class="ms-desc">One wicket. Lowest totals go.</span>
                <span class="ms-foot"><span id="mode-knockout-stat" class="ms-stat">Not played</span>${play}</span>
              </button>`;
}

const TRI = '<svg viewBox="0 0 14 16" aria-hidden="true"><path d="M2 1.5 12.5 8 2 14.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

/** The card under the rail (K1): the face-off, the mark, NEW and the format, and a gold PLAY. A tap anywhere opens the home; the (i) opens how it works. */
export function knockoutCardMarkup(): string {
  return `<div class="ms-knockout hidden" id="mode-knockout-card">
              <button id="mode-knockout" class="ms-knockout-open" type="button" aria-label="Super Knockout"></button>
              <img class="ms-art" src="${KNOCKOUT_FACEOFF}" alt="" decoding="async">
              <img class="ms-knockout-mark" src="${KNOCKOUT_MARK}" alt="" decoding="async">
              <span class="ms-knockout-row"><span id="mode-knockout-tag" class="ms-knockout-tag">NEW</span><span id="mode-knockout-line" class="ms-knockout-line">${KNOCKOUT.seats} players · one wicket</span></span>
              <button id="mode-knockout-info" class="ms-knockout-info" type="button" aria-label="How Super Knockout works"><i></i><b></b></button>
              <span class="ms-knockout-play" aria-hidden="true">${TRI}PLAY</span>
            </div>`;
}

/** What the card and the poster say: NEW and the format, or the best finish so far. */
export function knockoutCardWords(tally: KnockoutTally): { tag: string; line: string; stat: string } {
  if (!tally.played) return { tag: 'NEW', line: `${KNOCKOUT.seats} players · one wicket`, stat: 'Not played' };
  const best = tally.best === 1 ? 'WON' : `BEST #${tally.best}`;
  return { tag: best, line: `${tally.played} ${tally.played === 1 ? 'room' : 'rooms'} played`, stat: tally.best === 1 ? `Won ${tally.wins}` : `Best #${tally.best}` };
}

/** The home (K2): the picture, the mark, the format in two lines, your rooms, and QUICK MATCH and PLAY WITH FRIENDS at the thumb. */
export function knockoutHomeMarkup(): string {
  return `<div id="knockout-home" class="modal-overlay ko-screen hidden" role="dialog" aria-modal="true" aria-label="Super Knockout">
          <div class="ko-scroll">
            <div class="ko-hero" aria-hidden="true"><img src="${KNOCKOUT_HERO}" alt="" decoding="async"></div>
            <div class="ko-grain" aria-hidden="true"></div>
            <div class="ko-top">
              <button id="ko-home-back" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>
              <button id="ko-home-info" class="k-icon-button" type="button" aria-label="How Super Knockout works">${icon('info')}</button>
            </div>
            <div class="ko-home-body">
              <img class="ko-mark" src="${KNOCKOUT_MARK}" alt="Super Knockout" decoding="async">
              <p class="ko-lede">Twelve players. Same balls. One wicket.</p>
              <p class="ko-sub">The lowest totals go after every over, until one is left.</p>
              <div class="ko-card ko-figures" id="ko-home-figures">
                <span><b id="ko-home-played">0</b><i>Practice rooms</i></span>
                <span><b id="ko-home-best" class="is-gold">–</b><i>Best finish</i></span>
                <span><b id="ko-home-wins">0</b><i>Wins</i></span>
              </div>
              <p class="ko-practice">Practice for now: you and eleven subs, no points.</p>
            </div>
          </div>
          <div class="ko-keys">
            ${cta({ kind: 'primary', label: 'QUICK MATCH', id: 'ko-quick', moving: true })}
            <button id="ko-friends" class="ko-friends" type="button" disabled aria-disabled="true">${icon('users')}<span>PLAY WITH FRIENDS</span><i class="ko-soon">SOON</i></button>
          </div>
        </div>`;
}

const LADDER: ReadonlyArray<{ over: string; left: number; note: string; sudden?: boolean }> = (() => {
  let left: number = KNOCKOUT.seats;
  const rows: { over: string; left: number; note: string; sudden?: boolean }[] = KNOCKOUT.cuts.map((go, i) => {
    const row = { over: `Over ${i + 1}`, left, note: `${go} go` };
    left -= go;
    return row;
  });
  rows.push({ over: `Over ${KNOCKOUT.cuts.length + 1}`, left, note: 'Sudden death', sudden: true });
  return rows;
})();

const RULES: ReadonlyArray<[string, string]> = [
  ['Same balls', 'Everybody faces the same deliveries, in the same order. Nobody gets an easier bowler.'],
  ['One wicket', 'Out once and you are out of the match.'],
  ['Wickets go first', 'At the end of an over, anybody out goes before the lowest totals.'],
  ['Level on the line', 'A tie at the knockout line takes both players through.'],
  ['Free hit', 'Finish an over in the top 3 and your next ball is a free hit.'],
  ['Sudden death', 'With three left, last place is out after every ball.'],
  ['Subs', 'Empty seats get subs. A room of only subs is practice: no points.'],
  ['Points', 'With 3 or more real players in the room, the top 3 score: 10, 5 and 2 in a full room, fewer in a smaller one.'],
];

/** How it works (K2b): the promise, the format in three figures, the match as a ladder, the eight rules, and the two things to know while batting. */
export function knockoutRulesMarkup(): string {
  const most = KNOCKOUT.seats;
  return `<div id="knockout-rules" class="modal-overlay ko-screen is-rules hidden" role="dialog" aria-modal="true" aria-label="How Super Knockout works">
          <div class="ko-scroll">
            <div class="ko-hero" aria-hidden="true"><img src="${KNOCKOUT_HERO}" alt="" decoding="async"></div>
            <div class="ko-grain" aria-hidden="true"></div>
            <div class="ko-top">
              <button id="ko-rules-back" class="k-icon-button" type="button" aria-label="Back">${icon('arrow-left')}</button>
            </div>
            <div class="ko-rules-body">
              <img class="ko-mark is-left" src="${KNOCKOUT_MARK}" alt="Super Knockout" decoding="async">
              <h2 class="ko-promise">LAST ONE STANDING WINS.</h2>
              <p class="ko-intro">Twelve players bat the same balls at the same time. One wicket each. After every over, the lowest totals are knocked out.</p>
              <div class="ko-three">
                <span class="ko-card"><b>${KNOCKOUT.seats}</b><i>players</i></span>
                <span class="ko-card"><b class="is-red">1</b><i>wicket</i></span>
                <span class="ko-card"><b>${KNOCKOUT.cuts.length + 1}</b><i>overs</i></span>
              </div>
              <h3 class="ko-head">THE MATCH</h3>
              <ol class="ko-card ko-ladder">${LADDER.map(row => `
                <li${row.sudden ? ' class="is-sudden"' : ''}><span class="ko-over">${row.over}</span><span class="ko-bar" style="--w:${(row.left / most).toFixed(3)}"><b>${row.left}</b></span><span class="ko-note">${row.note}</span></li>`).join('')}
              </ol>
              <h3 class="ko-head">THE RULES</h3>
              <ol class="ko-card ko-rules">${RULES.map(([title, line], i) => `
                <li><b class="ko-n">${i + 1}</b><span><b>${title}</b><span>${line}</span></span></li>`).join('')}
              </ol>
              <h3 class="ko-head">WHILE YOU BAT</h3>
              <div class="ko-card ko-bat">
                <span class="ko-edge-demo" aria-hidden="true"></span>
                <span><b class="ko-see-red">SEE RED? SCORE.</b><span>Red edges mean this over ends you. The bar along the foot says how many you need.</span>
                <b class="ko-hold-line">Hold the scoreboard between balls to see everyone.</b></span>
              </div>
            </div>
          </div>
          <div class="ko-keys is-pinned">
            ${cta({ kind: 'primary', label: 'QUICK MATCH', id: 'ko-rules-quick', moving: true })}
          </div>
        </div>`;
}
