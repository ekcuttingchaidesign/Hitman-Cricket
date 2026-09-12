/**
 * The innings-end card, on its own, in every state it can reach. Driving a real
 * innings to see it takes thirty balls; this takes a page load, so the card can
 * be looked at properly.
 */
import '../src/styles.css';
import { HUD } from '../src/ui/HUD';
import { ScoreManager } from '../src/game/ScoreManager';
import type { ShotOutcome } from '../src/game/types';
import { inventedBoard } from '../src/game/board-fixture';
import type { Innings } from '../src/game/leaderboard';
import { placeOf } from '../src/ui/Leaderboard';

const hud = new HUD(document.getElementById('stage')!, 214);
hud.start();
/** A believable ball-by-ball innings that adds up to the totals asked for. */
const innings = (runs: number, wickets: number, balls: number, fours: number, sixes: number) => {
  const history: ShotOutcome[] = [];
  let left = runs - fours * 4 - sixes * 6;
  for (let i = 0; i < balls; i++) {
    const isWicket = i >= balls - wickets;
    const boundary = !isWicket && i % 3 === 1 && history.filter(b => b.runs === 4).length < fours ? 4
      : !isWicket && i % 5 === 2 && history.filter(b => b.runs === 6).length < sixes ? 6 : 0;
    const single = boundary || isWicket ? 0 : Math.min(Math.max(0, left), i % 4 === 0 ? 0 : i % 7 === 3 ? 2 : 1);
    if (!boundary) left -= single;
    history.push({ runs: boundary || single, isWicket } as ShotOutcome);
  }
  return Object.assign(new ScoreManager(), { runs, wickets, balls, fours, sixes, history });
};

/* A board to sit inside, so the strip has real rows above and below it. The
   place is asked of the board rather than written down: 101 runs is not 6th on
   a board topped at 107, and a peek built from a made-up place shows the
   player sitting between two rows that do not bracket them. */
const fullBoard = inventedBoard();
const played: Innings = { runs: 101, sixes: 9, fours: 8, wickets: 2, dots: 6, balls: 30 };
const place = placeOf(fullBoard, played, Date.now());
const top: Innings = { runs: 148, sixes: 14, fours: 9, wickets: 1, dots: 6, balls: 30 };

const states: Record<string, () => void> = {
  record: () => hud.end(innings(148, 1, 30, 14, 9), 121, true),
  first: () => hud.end(innings(93, 2, 30, 9, 4), 0, true),
  complete: () => hud.end(innings(87, 2, 30, 8, 3), 214, false),
  allout: () => hud.end(innings(6, 3, 13, 1, 0), 214, false),
  big: () => hud.end(innings(180, 0, 30, 21, 14), 214, false),
  /* The claim step, in each of the states it passes through. Driving these off a
     real innings needs a board behind it as well as thirty balls. */
  offer: () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(place, null, fullBoard, played); },
  'offer-known': () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(place, { name: 'Rohit', avatar: 2 }, fullBoard, played); },
  'offer-top': () => { hud.end(innings(148, 1, 30, 14, 9), 121, true); hud.offerClaim(placeOf(fullBoard, top, Date.now()), null, fullBoard, top); },
  'offer-blind': () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(null, null, [], played); },
  form: () => { states.offer(); hud.openClaim(); },
  'form-error': () => { states.form(); hud.claimFailed('Somebody already bats under that name.'); },
  sending: () => { states.form(); hud.claimSending(true); },
  board: () => { states.offer(); hud.claimDone(); hud.board({ rows: fullBoard, youId: fullBoard[place - 1].playerId, state: 'ready', actions: true }); },
};
const show = (name: string) => {
  // The board sheet sits over the card, so it has to come down before the next
  // state is drawn — otherwise every state after "full board" is reviewed with
  // the board still on top of it.
  hud.closeBoard();
  states[name]?.();
  document.querySelectorAll<HTMLButtonElement>('#lab button')
    .forEach(b => b.setAttribute('aria-pressed', String(b.dataset.state === name)));
};
document.querySelectorAll<HTMLButtonElement>('#lab button')
  .forEach(b => b.onclick = () => show(b.dataset.state!));
(window as unknown as { showCard: (n: string) => void }).showCard = show;
show('complete');
