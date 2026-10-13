import { AVATARS, cleanName, isPlayerId } from './board-store.js';

/**
 * The return ticket: who this browser is, kept in a cookie the server sets.
 *
 * The player id already lives in three places in the browser — localStorage, a
 * cookie and IndexedDB — and all three are written by the page's own script.
 * Safari treats everything a script writes the same way: after seven days of
 * using Safari without visiting the site, it is deleted, and a cookie a script
 * set is capped at seven days however long it asked for. Every browser on an
 * iPhone is Safari underneath, and most of the people who play this are on an
 * iPhone. So a player who comes back after a week away comes back as a
 * stranger, with their name, their board row and their career sitting on the
 * server and nothing on the phone to say they are theirs.
 *
 * A cookie the server sets is not held to those rules. So the game hands the
 * id to `/api/me`, the server hands it straight back as a `Set-Cookie`, and the
 * phone keeps it for a year. When the page's own stores come back empty, the
 * ticket is still there to read, and the player is who they were.
 *
 * Nothing is looked up and nothing is stored. The server only checks the shape
 * of what it was sent and returns it as a cookie on the same browser, so the
 * endpoint costs no database reads at all. It is readable by the page on
 * purpose: reading it needs no request, so a new player's first load waits on
 * nothing, and the id it holds is already sitting in localStorage beside it.
 *
 * The page must never write this cookie itself. A cookie a script writes is a
 * cookie Safari caps at seven days, and writing it from the page would quietly
 * turn the one copy that survives into one more that does not. The page may
 * delete it, which is what starting again as a new player does.
 */

/** The cookie's name. Begins with `hitman-` like everything else the game keeps. */
export const TICKET = 'hitman-back';
/** A year, which is the most this needs and well inside what browsers allow. */
export const TICKET_MAX_AGE = 31_536_000;
/** How old a ticket gets before the page asks for it to be written again. */
export const TICKET_REFRESH_DAYS = 30;

/** What the ticket holds. The name and kit come back with the id. */
export interface Ticket {
  id: string;
  /** The name batted under, or empty when the player has not taken one. */
  name: string;
  avatar: number;
  /** When it was written, in whole days since the epoch, so it can be refreshed. */
  day: number;
}

/** Whole days since the epoch, which is all the precision the ticket wants. */
export function dayOf(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/**
 * What was sent to `/api/me`, made into a ticket or refused.
 *
 * The id has to be an id. The name is cleaned the way the board cleans one and
 * may be empty, because a player who has not named themselves yet still has an
 * id worth keeping. A kit that is not a kit becomes the first one rather than a
 * refusal: losing a kit costs a tap, and losing the id costs a career.
 */
export function ticketFrom(body: unknown, now = Date.now()): Ticket | null {
  if (!body || typeof body !== 'object') return null;
  const held = body as Record<string, unknown>;
  if (!isPlayerId(held.playerId)) return null;
  const avatar = Number(held.avatar);
  return {
    id: held.playerId,
    name: cleanName(held.name),
    avatar: Number.isInteger(avatar) && avatar >= 0 && avatar < AVATARS ? avatar : 0,
    day: dayOf(now),
  };
}

/** The ticket as a cookie value. Encoded whole, so a name in any script survives. */
export function ticketValue(ticket: Ticket): string {
  return encodeURIComponent(JSON.stringify(ticket));
}

/**
 * A cookie value read back into a ticket, or null if it is not one.
 *
 * The same checks as on the way in, because the value has been sitting in a
 * browser for up to a year and anything could have been written over it.
 */
export function ticketIn(raw: string | null | undefined): Ticket | null {
  if (!raw) return null;
  try {
    const held = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    const ticket = ticketFrom({ playerId: held.id, name: held.name, avatar: held.avatar });
    if (!ticket) return null;
    const day = Number(held.day);
    return { ...ticket, day: Number.isInteger(day) ? day : 0 };
  } catch {
    return null;
  }
}

/**
 * The `Set-Cookie` header that keeps a ticket.
 *
 * `Lax` because nothing reads it from another site. `Secure` wherever the
 * request came over https, which is everywhere but a local dev server — where
 * a `Secure` cookie on plain http would be refused and the dev server could
 * not show the feature working.
 */
export function ticketHeader(ticket: Ticket, secure: boolean): string {
  return `${TICKET}=${ticketValue(ticket)}; Path=/; Max-Age=${TICKET_MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** The header that takes a ticket away: the same cookie, expired. */
export function forgetHeader(secure: boolean): string {
  return `${TICKET}=; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/**
 * Whether the request arrived over https. Vercel says so in a header; with no
 * header there is no proxy in front, and the answer is the safe one.
 */
export function overHttps(headers: Record<string, string | string[] | undefined>): boolean {
  const proto = headers['x-forwarded-proto'];
  const first = (Array.isArray(proto) ? proto[0] : proto ?? '').split(',')[0].trim();
  return first !== 'http';
}
