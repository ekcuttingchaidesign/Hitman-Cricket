import { browserStores, isPlayerId, pickPlayerId, type IdStore } from './identity';
import { readPlayer, writePlayer, type Player } from './player';
import { track } from './analytics';
import { TICKET, TICKET_REFRESH_DAYS, dayOf, ticketIn, type Ticket } from '../server/return-ticket';

/**
 * The page's half of the return ticket: keeping it written, and reading it when
 * everything else on the phone has been forgotten.
 *
 * `src/server/return-ticket.ts` explains why the ticket exists and why only the
 * server may write it. What is here is when to ask for it and what to do with
 * it once it is the only thing left.
 */

/** The ticket this browser holds, or null. Read straight off the cookie: no request. */
export function readTicket(cookie: string = safeCookie()): Ticket | null {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${TICKET}=([^;]*)`));
  return match ? ticketIn(match[1]) : null;
}

/**
 * Whether the ticket needs writing: there is none, it names somebody else, the
 * name or kit on it has changed, or it is old enough that writing it again is
 * what keeps it from running out.
 */
export function ticketWanted(held: Ticket | null, id: string, player: Player | null, today = dayOf()): boolean {
  if (!held || held.id !== id) return true;
  if (player && (held.name !== player.name || held.avatar !== player.avatar)) return true;
  return today - held.day >= TICKET_REFRESH_DAYS;
}

/** What was last asked for in this page, so an endpoint that is not there is asked once. */
let lastAsked = '';

/**
 * Asks the server to write the ticket, when it needs writing.
 *
 * Only where the endpoints share the game's own address. A build that fetches
 * its board from another site — GitHub Pages — would be asking that site for a
 * cookie it can only set as somebody else's, which Safari refuses outright.
 *
 * A player with no name on this phone keeps the name already on the ticket, if
 * the ticket is theirs: the name is a convenience, and an empty one written
 * over a real one would undo the very thing the ticket is for.
 *
 * Never awaited by anything that matters. If it fails, the ticket is asked for
 * again on the next load, and nothing the player can see depends on it.
 */
export function leaveTicket(id: string | null, player: Player | null): void {
  if (import.meta.env.VITE_BOARD_API || !isPlayerId(id)) return;
  const held = readTicket();
  const who = player ?? (held?.id === id ? { name: held.name, avatar: held.avatar } : null);
  if (!ticketWanted(held, id, who)) return;
  const body = JSON.stringify({ playerId: id, name: who?.name ?? '', avatar: who?.avatar ?? 0 });
  if (body === lastAsked) return;
  lastAsked = body;
  try {
    void fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      // A page being closed still gets its ticket written.
      keepalive: true,
    }).catch(() => { /* Asked again on the next load. */ });
  } catch { /* No fetch at all: asked again on the next load. */ }
}

/**
 * The player, brought back from the ticket when the phone has forgotten them.
 *
 * Run before anything reads who is playing. Only ever acts when the page's own
 * stores hold no id at all and a ticket does: a browser that still knows who it
 * is keeps being that, so nothing here can swap one player for another.
 *
 * The id goes back into all three stores, and the name and kit with it unless
 * the phone has somebody's name already. Everything else about the player —
 * the career, the board row, the card — keys off the id and arrives with the
 * next fetch, the same as after a restore.
 */
export async function comeBack(
  stores: readonly IdStore[] = browserStores(), cookie: string = safeCookie(),
): Promise<boolean> {
  const ticket = readTicket(cookie);
  if (!ticket) return false;
  const found = await Promise.all(stores.map(store => within(800, () => store.read())));
  if (pickPlayerId(found)) return false;
  await Promise.all(stores.map(store => within(1500, () => store.write(ticket.id))));
  if (ticket.name && !readPlayer()) writePlayer({ name: ticket.name, avatar: ticket.avatar });
  track('identity-recovered', 'Player brought back by the return ticket');
  return true;
}

/**
 * Takes the ticket off this phone, for starting again as somebody new.
 *
 * Deleting is the one thing the page does to this cookie. It is not written
 * by script, so a script can expire it: the same name and path, and no age.
 */
export function forgetTicket(): void {
  try {
    const secure = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${TICKET}=;path=/;max-age=0;SameSite=Lax${secure}`;
  } catch { /* Then there was no cookie to take. */ }
}

function safeCookie(): string {
  try { return document.cookie; } catch { return ''; }
}

/** A store's answer, or null if it throws or takes longer than it is given. */
function within<T>(ms: number, act: () => T | Promise<T>): Promise<T | null> {
  return new Promise<T | null>(resolve => {
    const timer = setTimeout(() => resolve(null), ms);
    Promise.resolve().then(act).then(
      value => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(null); },
    );
  });
}
