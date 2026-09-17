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
import { cutoff, placeOf, type CardOffer } from '../src/ui/Leaderboard';

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
/* Eleven short of the fiftieth, taken off the board rather than written down, so
   the shortfall on the card stays eleven whatever the invented fifty come out
   at. The states below it are the two ways an innings arrives with nothing: a
   nought against a full board, and a nought against one still filling. */
const edge = cutoff(fullBoard);
const short: Innings = { runs: (edge?.runs ?? 50) - 11, sixes: 6, fours: 7, wickets: 3, dots: 9, balls: 30 };
const duck: Innings = { runs: 0, sixes: 0, fours: 0, wickets: 3, dots: 5, balls: 8 };

/** The offer the strip is given, for the states that are about claiming one. */
const claim = (place: number): CardOffer => ({ kind: 'claim', place });

const states: Record<string, () => void> = {
  record: () => hud.end(innings(148, 1, 30, 14, 9), 121, true),
  first: () => hud.end(innings(93, 2, 30, 9, 4), 0, true),
  complete: () => hud.end(innings(87, 2, 30, 8, 3), 214, false),
  allout: () => hud.end(innings(6, 3, 13, 1, 0), 214, false),
  big: () => hud.end(innings(180, 0, 30, 21, 14), 214, false),
  /* The claim step, in each of the states it passes through. Driving these off a
     real innings needs a board behind it as well as thirty balls. */
  offer: () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(claim(place), null, fullBoard, played); },
  'offer-known': () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(claim(place), { name: 'Rohit', avatar: 2 }, fullBoard, played); },
  'offer-top': () => { hud.end(innings(148, 1, 30, 14, 9), 121, true); hud.offerClaim(claim(placeOf(fullBoard, top, Date.now())), null, fullBoard, top); },
  'offer-blind': () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim(claim(0), null, [], played); },
  /* Already on the board, above what was just played: the one state where the
     strip has nothing to register and says what still stands instead. */
  standing: () => {
    hud.end(innings(120, 2, 30, 9, 7), fullBoard[0].runs, false);
    hud.offerClaim({ kind: 'standing', runs: fullBoard[0].runs, place: 1 }, { name: fullBoard[0].name, avatar: fullBoard[0].avatar }, fullBoard, played);
  },
  'standing-mid': () => {
    hud.end(innings(40, 3, 24, 2, 3), fullBoard[6].runs, false);
    hud.offerClaim({ kind: 'standing', runs: fullBoard[6].runs, place: 7 }, { name: fullBoard[6].name, avatar: fullBoard[6].avatar }, fullBoard, played);
  },
  /* Short of the fiftieth. The strip used to be hidden here — for most innings,
     in other words — which is the whole of what this change is about, so these
     three are the ones to look at. */
  missed: () => {
    hud.end(innings(short.runs, 3, 30, short.fours, short.sixes), 96, false);
    hud.offerClaim({ kind: 'missed' }, null, fullBoard, short);
  },
  'missed-duck': () => {
    hud.end(innings(0, 3, 8, 0, 0), 96, false);
    hud.offerClaim({ kind: 'missed' }, null, fullBoard, duck);
  },
  /* The same nought against a board still filling, where there is no fiftieth
     row to be short of and the price is one run. */
  'missed-room': () => {
    hud.end(innings(0, 3, 8, 0, 0), 0, false);
    hud.offerClaim({ kind: 'missed' }, null, [], duck);
  },
  /* A board that never answered. Silent before, which taught a player whose
     connection blinked that the game has no board at all. */
  offline: () => {
    hud.end(innings(101, 2, 30, 8, 9), 96, true);
    hud.offerClaim({ kind: 'offline' }, null, [], played);
  },
  /* A private window: the innings was worth a place and there is no player id
     to give it to, so the strip says so and offers the board instead. */
  private: () => { hud.end(innings(101, 2, 30, 8, 9), 96, true); hud.offerClaim({ kind: 'private' }, null, fullBoard, played); },
  /* The form a returning player who has just beaten their own best now gets:
     their name and kit are in it, and the key says so. */
  'form-update': () => { states['offer-known'](); hud.onTheBoard(true); hud.openClaim(); },
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
