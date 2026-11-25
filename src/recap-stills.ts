/**
 * The year recap's stills as a dev page (`recap-stills.html`): one still from
 * the link (`?kit=papaya&bat=rage&shot=PULL&age=600&az=35`), on a checker so
 * the transparency shows; `scripts/recap-stills.mjs` asks it for many through
 * `__stills.render` and writes them out as PNGs. The renderer is
 * `src/game/recap-render.ts`, which the recap's posters render through too.
 * Nothing is scored, sent or counted. A dev page.
 */
import { GLOVES } from './entities/gloves';
import { ALL_BATS, ALL_OUTFITS } from './game/dressing';
import { SUPER10_KITS } from './game/super10-kits';
import { createStillRenderer, STILL_STROKES, type StillAsk } from './game/recap-render';

const stills = createStillRenderer();
const render = async (ask: StillAsk = {}) => (await stills.render(ask)).toDataURL('image/png');

// The page: one still from the link (`?kit=papaya&bat=rage&shot=PULL&age=600&az=35`), on a checker so the transparency shows.
const params = new URLSearchParams(location.search);
const num = (k: string) => params.has(k) ? Number(params.get(k)) : undefined;
const img = document.createElement('img'); img.id = 'still'; document.body.append(img);
void render({
  kit: params.get('kit') ?? undefined, bat: params.get('bat') ?? undefined, guard: params.get('guard') ?? undefined,
  shot: params.get('shot') ?? undefined, age: num('age'), az: num('az'), el: num('el'), dist: num('dist'), fov: num('fov'),
  width: num('w'), height: num('h'),
}).then(url => { img.src = url; document.title = 'ready'; });

(window as unknown as { __stills: object }).__stills = {
  render,
  strokes: STILL_STROKES,
  kits: [...ALL_OUTFITS.map(o => o.id), ...SUPER10_KITS.map(k => k.id)],
  bats: ALL_BATS.map(b => b.id),
  guards: GLOVES.map(g => g.id),
};
