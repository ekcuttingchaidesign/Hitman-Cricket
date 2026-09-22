/**
 * The career key, in every state and in three skins.
 *
 * The widget is wanted before it is wired: what it says and how it sits are
 * decisions to settle by looking, and looking at it inside the game means
 * playing an innings to reach each state and losing a browser to reach one.
 * So it is built here against nothing, and the game calls it afterwards.
 *
 *   VITE_SHOW_SURVIVE=1 npx vite --port 5204 &
 *   open http://127.0.0.1:5204/tools/key-widget-lab.html
 *
 * The three skins below are fourteen variables each and no structure at all.
 * The first attempt was built in a blue nobody chose and came out monochrome;
 * putting the palette behind variables is what makes a second opinion cost a
 * block of colours rather than a pass over every rule.
 *
 * Words are the right shape and the wrong words: the list is written
 * separately, so these vary in length instead — the shortest key the list can
 * produce, the longest and an ordinary one — because that is what the layout
 * has to survive and the vocabulary is not what is being decided here.
 */

import '../src/styles.css';
import {
  KEY_SUBTEXT, keyAboutMarkup, keyBarMarkup, keyCardMarkup, keyModalMarkup,
  keyPanelMarkup, keyToastMarkup, keyText,
} from '../src/ui/CareerKey';

const SHORT = keyText(['bail', 'reps', 'oval'], 7);
const USUAL = keyText(['yorker', 'sprint', 'cover'], 47);
const LONG = keyText(['stamina', 'sessions', 'boundary'], 93);

/**
 * Three ways to colour the same thing.
 *
 * `card` is the game's own scorecard, unchanged: the widget is furniture on a
 * screen full of furniture and does not announce itself. `ticket` gives the
 * key a cream stub to sit on, so the one thing worth reading is the one thing
 * that is not dark — the delight is in the form rather than in another colour.
 * `night` is the black the STAR card is made of, with the orange kept for the
 * key alone, for a widget that reads as the valuable thing on the screen.
 */
const SKINS: { key: string; name: string; note: string; css: string }[] = [
  {
    key: 'card',
    name: 'Card',
    note: 'The game’s own scorecard navy, one orange mark, orange key. Furniture among furniture.',
    css: '',
  },
  {
    key: 'ticket',
    name: 'Ticket',
    note: 'The key on a cream stub. The one thing worth reading is the one thing that is not dark.',
    css: `
      --key-bg:linear-gradient(#14324a,#0e2536);
      --key-well:#f4ead9;
      --key-well-edge:#00000029;
      --key-code:#16303f;
      --key-ink:#f7f0e5;
      --key-title:#93aabb;`,
  },
  {
    key: 'night',
    name: 'Night',
    note: 'The black the STAR card is made of. Orange spent on the key alone, nowhere else.',
    css: `
      --key-bg:linear-gradient(#191c20,#0d0f11);
      --key-edge:#ffffff1a;
      --key-ledge:#000;
      --key-well:#08090a;
      --key-well-edge:#e9582b4d;
      --key-code:#ffb089;
      --key-ink:#f4f6f8;
      --key-title:#8e98a3;
      --key-say:#98a3ad;
      --key-cta:#f2f4f7;
      --key-cta-edge:#fff;
      --key-cta-ledge:#5d646c;
      --key-cta-ink:#15181b;`,
  },
];

const stage = document.getElementById('stage')!;

/** One example, captioned, at the width a phone gives it. */
function bench(title: string, note: string, markup: string, tall = false): string {
  return `
    <section class="bench">
      <h2>${title}</h2>
      <p>${note}</p>
      <div class="bench-phone${tall ? ' is-tall' : ''}">${markup}</div>
    </section>`;
}

/** Every state, inside one skin. */
function column(skin: typeof SKINS[number]): string {
  return `
    <div class="skin key-skin" style="${skin.css}">
      <header class="skin-head">
        <h2>${skin.name}</h2>
        <p>${skin.note}</p>
      </header>
      ${bench('My Stats · unsaved', 'The permanent home, before anything is saved.', keyCardMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('My Stats · saved', 'Stays put. A saved key still gets lost.', keyCardMarkup({ state: 'saved', code: USUAL }))}
      ${bench('My Stats · not on this phone', 'Shown once, so it cannot be shown again.', keyCardMarkup({ state: 'lost' }))}
      ${bench('Longest key', 'Three eight-letter words.', keyCardMarkup({ state: 'unsaved', code: LONG }))}
      ${bench('Shortest key', 'Three four-letter words.', keyCardMarkup({ state: 'unsaved', code: SHORT }))}
      ${bench('Innings-end card', 'A row, above the keys.', keyPanelMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('Mode picker', 'One line, twice, then never.', keyBarMarkup())}
      ${bench('First key · toast', 'Closed by hand, never on a timer.', keyToastMarkup({ state: 'unsaved', code: USUAL }))}
      ${bench('Career Stats · after saving', 'What is left once the panel has gone.', `<div class="sub-demo"><h3>Career Stats</h3><p>${KEY_SUBTEXT}</p></div>`)}
      ${bench('The modal · saving', 'The only place a key is saved.', keyModalMarkup({ state: 'unsaved', code: USUAL }), true)}
      ${bench('The modal · explaining', 'The same sheet, opened by the i.', keyAboutMarkup(), true)}
    </div>`;
}

stage.innerHTML = `
  <style>
    html,body{height:auto;overflow:auto;background:#07121a}
    body{font-family:Satoshi,'Segoe UI',Arial,sans-serif}
    .lab{padding:28px 20px 80px}
    .lab>h1{margin:0 0 4px;font-family:Display,Impact,sans-serif;font-size:30px;font-weight:400;color:#f7f0e5}
    .lab>p.intro{margin:0 0 26px;font-size:13px;line-height:1.6;color:#8ea6b6;max-width:64ch}
    .skins{display:flex;gap:26px;align-items:flex-start}
    .skin{flex:1;min-width:0;max-width:420px}
    .skin-head{margin:0 0 16px;padding:0 0 12px;border-bottom:1px solid #ffffff1a}
    .skin-head h2{margin:0 0 4px;font-family:Display,Impact,sans-serif;font-size:22px;font-weight:400;color:#f7f0e5}
    .skin-head p{margin:0;font-size:11.5px;line-height:1.55;color:#7e94a4}
    .bench{margin:0 0 20px}
    .bench>h2{margin:0 0 2px;font-size:10.5px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#e9582b}
    .bench>p{margin:0 0 8px;font-size:11px;line-height:1.45;color:#6f8797}
    /* The navy the game draws these on, so nothing is judged against a
       background the player never sees. */
    .bench-phone{padding:13px;border-radius:15px;background:#0f2738;border:1px solid #ffffff14}
    .bench-phone.is-tall{position:relative;height:560px;padding:0;overflow:hidden}
    .bench-phone.is-tall .key-modal{position:absolute}
    .sub-demo{padding:13px 15px;border-radius:13px;background:#122c3f;border:1px solid #ffffff14}
    .sub-demo h3{margin:0;font-size:13px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#cfe3f1}
    .sub-demo p{margin:3px 0 0;font-size:11.5px;color:#8ea6b6}
  </style>
  <div class="lab">
    <h1>Career key</h1>
    <p class="intro">Three skins of the same component, every state, at the width a 390px phone
      gives each one. The structure is identical down all three columns &mdash; only the fourteen
      colour variables differ. Words are placeholders chosen for length, so the layout is judged
      rather than the vocabulary.</p>
    <div class="skins">${SKINS.map(column).join('')}</div>
  </div>`;
