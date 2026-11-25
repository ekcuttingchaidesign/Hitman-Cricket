import { handleOf } from '../src/game/handle';
import type { KnockoutRoom } from '../src/game/knockout';
import { replayMatch } from '../src/game/knockout-replay';
import { awayInMatch, ballInMatch, matchRefused, readMatch, type KnockoutStore, type MatchView, type Member } from '../src/server/knockout-store';

/**
 * A match with friends batted to its end against the store, as the phones do
 * it: each player sends their next ball while the room is waiting on them, the
 * room played back from the store's own cards after every one. `bat` says what
 * each ball is worth; anybody in `away` sends nothing, and the first player
 * still batting asks the store to sub them, as a phone waiting on them would.
 */
export async function playMatch(
  store: KnockoutStore, code: string, members: readonly Member[], at: number,
  bat: (who: number, ball: number) => string = () => '1', away: ReadonlySet<number> = new Set(), until: (room: KnockoutRoom) => boolean = () => false,
): Promise<{ at: number; room: KnockoutRoom; view: MatchView }> {
  for (let turn = 0; turn < 600; turn++) {
    const read = await readMatch(store, code, at);
    if (matchRefused(read)) throw new Error(read.reason);
    const view = read.match;
    const seats = view.seats.map(handle => {
      const m = view.members.find(one => one.handle === handle)!;
      return { name: m.name, face: m.avatar, sub: false, handle, card: m.card };
    });
    const room = replayMatch(view.seed, seats);
    if (room.done || until(room)) return { at, room, view };
    const waiting = room.waitingOn().filter(seat => !seat.sub);
    if (!waiting.length) throw new Error('The room is waiting on nobody and is not over.');
    const who = (handle?: string) => members.findIndex(m => handleOf(m.playerId) === handle);
    const asker = members.find((m, i) => !away.has(i) && view.seats.includes(handleOf(m.playerId)));
    for (const seat of waiting) {
      const i = who(seat.handle), card = seats[seat.id].card;
      // The store already holds their next ball (a sub's, or the final waiting on the other finalist): nothing to send.
      if (card.length > seat.played) continue;
      at += 100;
      if (away.has(i)) {
        if (!asker) throw new Error('Nobody is left to ask for a sub.');
        const subbed = await awayInMatch(store, code, asker, seat.handle, Math.floor(card.length / 6), at);
        if (matchRefused(subbed)) throw new Error(`${subbed.reason} (${seat.name}, card ${card}, played ${seat.played})`);
      } else {
        const sent = await ballInMatch(store, code, members[i], card.length, bat(i, card.length), at, view.round);
        if (matchRefused(sent)) throw new Error(sent.reason);
      }
    }
  }
  throw new Error('The match never came to its end.');
}
