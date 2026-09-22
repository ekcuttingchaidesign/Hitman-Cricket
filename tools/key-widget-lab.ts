/**
 * Every state the career key is ever drawn in, on one page.
 *
 * The widget is wanted before it is wired: what it says and how it sits are
 * decisions to settle by looking, and looking at it inside the game means
 * playing an innings to reach each state. So it is built here first, against
 * nothing, and the game calls it afterwards.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5203 &
 *   open http://127.0.0.1:5203/tools/key-widget-lab.html
 *
 * The keys below are the right shape and the wrong words: the list is written
 * separately, so these vary in length instead — the shortest a key can be, the
 * longest, and something ordinary — because that is what the layout has to
 * survive and the vocabulary is not what is being decided here.
 */

import '../src/styles.css';
import {
  KEY_SUBTEXT, keyAboutMarkup, keyBarMarkup, keyCardMarkup, keyModalMarkup,
  keyPanelMarkup, keyToastMarkup, keyText,
} from '../src/ui/CareerKey';

const SHORT = keyText(['bail', 'reps', 'oval'], 7);
const USUAL = keyText(['yorker', 'sprint', 'cover'], 47);
const LONG = keyText(['stamina', 'sessions', 'boundary'], 93);

const stage = document.getElementById('stage')!;

/** One example, captioned, at the width a phone gives it. */
function bench(title: string, note: string, markup: string, width = 358): string {
  return `
    <section class="bench">
      <h2>${title}</h2>
      <p>${note}</p>
      <div class="bench-phone" style="width:${width}px">${markup}</div>
    </section>`;
}

stage.innerHTML = `
  <style>
    html,body{height:auto;overflow:auto;background:#07121a}
    body{font-family:Satoshi,'Segoe UI',Arial,sans-serif}
    .lab{max-width:1180px;margin:0 auto;padding:28px 20px 80px}
    .lab>h1{margin:0 0 4px;font-family:Display,Impact,sans-serif;font-size:30px;font-weight:400;color:#f7f0e5}
    .lab>p.intro{margin:0 0 26px;font-size:13px;line-height:1.6;color:#8ea6b6;max-width:60ch}
    .benches{display:flex;flex-wrap:wrap;gap:22px;align-items:flex-start}
    .bench{flex:none}
    .bench>h2{margin:0 0 3px;font-size:12px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:#e9582b}
    .bench>p{margin:0 0 10px;font-size:11.5px;line-height:1.5;color:#7e94a4;max-width:36ch}
    /* The navy the game draws these on, so nothing here is judged against a
       background the player never sees. */
    .bench-phone{padding:14px;border-radius:16px;background:#0f2738;border:1px solid #ffffff14}
    .bench-phone.is-ground{background:#12222e}
    .bench-phone.is-modal{position:relative;height:620px;padding:0;overflow:hidden}
    .bench-phone.is-modal .key-modal{position:absolute}
    .sub-demo{padding:13px 15px;border-radius:13px;background:#122c3f;border:1px solid #ffffff14}
    .sub-demo h3{margin:0;font-family:Satoshi,sans-serif;font-size:13px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#cfe3f1}
    .sub-demo p{margin:3px 0 0;font-size:11.5px;color:#8ea6b6;max-width:none}
  </style>
  <div class="lab">
    <h1>Career key</h1>
    <p class="intro">Every state, at the width a 390px phone gives each one. Words are
      placeholders chosen for length — the shortest key the list can produce, the longest,
      and an ordinary one — so the layout is judged rather than the vocabulary.</p>
    <div class="benches">
      ${bench('My Stats · unsaved', 'The permanent home, before anything has been saved. The state that has to do the persuading.', keyCardMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('My Stats · saved', 'Stays put. A saved key still gets lost, and a way in that vanishes once used reads as a screen that moved.', keyCardMarkup({ state: 'saved', code: USUAL }))}
      ${bench('My Stats · not on this phone', 'Restored on a new device, or saved long ago elsewhere. A key is shown once and cannot be shown again — so it says so.', keyCardMarkup({ state: 'lost' }))}
      ${bench('My Stats · longest key', 'Three eight-letter words. What the layout has to survive rather than shrink to fit.', keyCardMarkup({ state: 'unsaved', code: LONG }))}
      ${bench('My Stats · shortest key', 'Three four-letter words, for the other end of the range.', keyCardMarkup({ state: 'unsaved', code: SHORT }))}
      ${bench('Innings-end card', 'Above the keys, under Career Stats. A row, not a stack — it may not push Play Again off a short screen.', keyPanelMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('Innings-end card · longest', 'The same row with the longest key in it.', keyPanelMarkup({ state: 'unsaved', code: LONG }))}
      ${bench('Mode picker', 'One line, twice, then never. Every tap of Play comes through this screen.', keyBarMarkup())}
      ${bench('First key · toast', 'The moment a name is claimed. Closed by hand, never on a timer.', keyToastMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('Career Stats · after saving', 'What is left under the heading once the panel has gone.', `<div class="sub-demo"><h3>Career Stats</h3><p>${KEY_SUBTEXT}</p></div>`)}
    </div>
    <div class="benches" style="margin-top:30px">
      ${bench('The modal · saving', 'Where a key is actually saved, and the only place it is. Reached from all four above.', keyModalMarkup({ state: 'unsaved', code: USUAL }), 390).replace('bench-phone', 'bench-phone is-modal')}
      ${bench('The modal · explaining', 'The same sheet opened by the i, for somebody asking what this is rather than saving it.', keyAboutMarkup(), 390).replace('bench-phone', 'bench-phone is-modal')}
    </div>
  </div>`;
