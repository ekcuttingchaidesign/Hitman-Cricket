/**
 * The leaderboard, on its own, full.
 *
 * Every screen this update touches — the three tabs, the ladders under each of
 * them, fifty rows with one of them yours, the career cards on their rail —
 * driven by the real HUD with the real markup and the real stylesheet. The only
 * thing that is not real is the people: fifty of them are made up here, the
 * same way `?demo=1` makes them up in the game.
 *
 * It exists because a leaderboard cannot be judged empty and a deployment
 * cannot be filled without claiming fifty names that are never released.
 */
import '../src/styles.css';
import { HUD } from '../src/ui/HUD';
import { demoBoard, demoCareers, demoSurvive } from '../src/game/demo-board';
import {
  bestStanding, careerBoardOf, placesOf, type AnyCareer, type LadderTab,
} from '../src/ui/CareerBoard';
import { statsCardImage, statsFacts, type StatsFacts } from '../src/game/StatsCard';
import type { BoardTab, SheetTab } from '../src/ui/Leaderboard';
import type { CareerRow } from '../src/server/career-store';
import type { StatsSlide } from '../src/ui/StatsSheet';

/** The id the made-up boards put in seventh place, so one row is yours. */
const ME = 'abc123-defghijklmno';
const LINK = 'hitman-cricket.vercel.app';

const hud = new HUD(document.getElementById('stage')!, 121);
hud.showBoardTabs(true);

let tab: SheetTab = 'classic';
let ladder: LadderTab = 'best';
let actions = false;

function board(mode: BoardTab) {
  const view = { youId: ME, yours: null, actions, state: 'ready' as const };
  if (mode === 'survive') return hud.surviveBoard({ ...view, rows: demoSurvive(ME) });
  hud.board({ ...view, rows: demoBoard(ME) });
}

function careers(mode: BoardTab, key: string) {
  const one = careerBoardOf(mode, key);
  if (!one) return board(mode);
  const payload = demoCareers(mode, ME);
  hud.careerBoard({
    mode, board: one, youId: ME, state: 'ready', actions,
    rows: (payload.boards[key] ?? []) as readonly CareerRow<AnyCareer>[],
    size: payload.size,
  });
}

/** The two career cards, painted, then put on the rail the moment each lands. */
const slides: Partial<Record<BoardTab, StatsSlide>> = {};
function cards() {
  const modes: BoardTab[] = ['classic', 'survive'];
  for (const mode of modes) {
    const payload = demoCareers(mode, ME);
    const mine = payload.boards[mode === 'survive' ? 'balls' : 'runs'].find(row => row.playerId === ME);
    const standing = bestStanding(mode, placesOf(payload.boards, ME));
    const facts = statsFacts(mode, mine!.career, { name: mine!.name, avatar: mine!.avatar }, standing);
    show(mode, modes, { facts });
    void statsCardImage(facts, LINK).then(picture => {
      const url = URL.createObjectURL(picture);
      hud.holdStatsPicture(url);
      show(mode, modes, { facts, picture: url });
    }).catch(() => show(mode, modes, { facts, failed: true }));
  }
}

function show(mode: BoardTab, modes: BoardTab[], slide: StatsSlide) {
  slides[mode] = slide;
  if (tab !== 'mine') return;
  const waiting = (one: BoardTab): StatsSlide => slides[one] ?? { facts: slide.facts as StatsFacts };
  hud.statsTab({ cards: modes.map(waiting), at: 0 });
}

function draw() {
  if (tab === 'mine') return cards();
  if (ladder === 'best') return board(tab);
  careers(tab, ladder);
}

hud.onBoardTab = next => {
  tab = next;
  ladder = 'best';
  draw();
};
hud.onLadderTab = next => {
  ladder = next;
  draw();
};

const keys = document.getElementById('keys')!;
keys.onclick = () => {
  actions = !actions;
  keys.setAttribute('aria-pressed', String(actions));
  keys.textContent = 'Innings-end keys';
  draw();
};
document.getElementById('reopen')!.onclick = () => draw();

// The board is the page: it opens on load and the close key opens it again,
// because there is nothing underneath it here to be handed back to.
draw();
setInterval(() => { if (!hud.boardOpen && !hud.statsOpen) draw(); }, 400);
