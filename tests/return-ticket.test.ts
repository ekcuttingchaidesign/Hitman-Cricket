import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/me';
import {
  TICKET, TICKET_MAX_AGE, TICKET_REFRESH_DAYS, dayOf, forgetHeader, overHttps, ticketFrom, ticketHeader, ticketIn,
  ticketValue, type Ticket,
} from '../src/server/return-ticket';
import { comeBack, leaveTicket, readTicket, ticketWanted } from '../src/game/return-ticket';
import type { IdStore } from '../src/game/identity';

const ID = 'mf3k2a1b-abcdefghijkl';
const OTHER = 'mf3k2a1c-zyxwvutsrqpo';
const NOW = Date.UTC(2026, 9, 13, 12);
const ticket = (over: Partial<Ticket> = {}): Ticket => ({ id: ID, name: 'Rohit', avatar: 2, day: dayOf(NOW), ...over });
const cookieFor = (held: Ticket) => `other=1; ${TICKET}=${ticketValue(held)}; hitman-player=${held.id}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('what the server will make a ticket of', () => {
  it('needs a real player id, and nothing else', () => {
    expect(ticketFrom({ playerId: 'nope', name: 'Rohit', avatar: 1 })).toBeNull();
    expect(ticketFrom(null)).toBeNull();
    expect(ticketFrom('mf3k2a1b-abcdefghijkl')).toBeNull();
    expect(ticketFrom({ playerId: ID }, NOW)).toEqual({ id: ID, name: '', avatar: 0, day: dayOf(NOW) });
  });

  it('cleans the name the way the board cleans one', () => {
    expect(ticketFrom({ playerId: ID, name: '  Rohit​   Sharma the Great  ' })?.name).toBe('Rohit Sharma t');
  });

  /** Losing a kit costs a tap; refusing the ticket over one would cost the id. */
  it('turns a kit that is not a kit into the first one rather than refusing', () => {
    expect(ticketFrom({ playerId: ID, avatar: 99 })?.avatar).toBe(0);
    expect(ticketFrom({ playerId: ID, avatar: -1 })?.avatar).toBe(0);
    expect(ticketFrom({ playerId: ID, avatar: 'x' })?.avatar).toBe(0);
    expect(ticketFrom({ playerId: ID, avatar: 3 })?.avatar).toBe(3);
  });

  it('reads back exactly what it wrote, a name in any script included', () => {
    const held = ticket({ name: 'रोहित 🏏' });
    expect(ticketIn(ticketValue(held))).toEqual(held);
  });

  /** It has sat in a browser for up to a year: anything could be in it. */
  it('reads anything that is not a ticket as no ticket', () => {
    expect(ticketIn('')).toBeNull();
    expect(ticketIn(null)).toBeNull();
    expect(ticketIn('not%20json')).toBeNull();
    expect(ticketIn('%E0%A4')).toBeNull();
    expect(ticketIn(encodeURIComponent(JSON.stringify({ id: 'nope', name: 'x' })))).toBeNull();
  });
});

describe('the cookie the server sets', () => {
  it('lasts a year, for the whole site, and never travels cross-site', () => {
    const header = ticketHeader(ticket(), true);
    expect(header.startsWith(`${TICKET}=`)).toBe(true);
    expect(header).toContain(`Max-Age=${TICKET_MAX_AGE}`);
    expect(TICKET_MAX_AGE).toBe(365 * 24 * 60 * 60);
    expect(header).toContain('Path=/');
    expect(header).toContain('SameSite=Lax');
    expect(header).toContain('Secure');
  });

  /**
   * Readable by the page on purpose: reading it needs no request, so a new
   * player's first load waits on nothing.
   */
  it('is not HttpOnly, so the page can read it without asking anybody', () => {
    expect(ticketHeader(ticket(), true)).not.toContain('HttpOnly');
  });

  it('drops Secure only for plain http, which is a dev server', () => {
    expect(ticketHeader(ticket(), false)).not.toContain('Secure');
    expect(overHttps({ 'x-forwarded-proto': 'https' })).toBe(true);
    expect(overHttps({ 'x-forwarded-proto': 'http' })).toBe(false);
    expect(overHttps({})).toBe(true);
  });

  it('is taken away by the same cookie with no age', () => {
    expect(forgetHeader(true)).toBe(`${TICKET}=; Path=/; Max-Age=0; SameSite=Lax; Secure`);
  });
});

describe('POST /api/me', () => {
  const call = async (req: { method?: string; body?: unknown; query?: Record<string, string> }) => {
    const headers: Record<string, string> = {};
    const answer = { status: 0, body: undefined as unknown };
    const res = {
      status(code: number) { answer.status = code; return res; },
      json(body: unknown) { answer.body = body; },
      setHeader(name: string, value: string) { headers[name] = value; },
      end() { /* A preflight. */ },
    };
    await handler({ headers: { 'x-forwarded-proto': 'https' }, ...req }, res);
    return { ...answer, headers };
  };

  it('hands the id, name and kit back as the ticket', async () => {
    const { status, headers } = await call({ method: 'POST', body: { playerId: ID, name: 'Rohit', avatar: 2 } });
    expect(status).toBe(200);
    const value = headers['Set-Cookie'].split(';')[0].slice(TICKET.length + 1);
    expect(ticketIn(value)).toMatchObject({ id: ID, name: 'Rohit', avatar: 2 });
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('takes a body that arrived as a string, as Vercel sometimes hands it over', async () => {
    const { status, headers } = await call({ method: 'POST', body: JSON.stringify({ playerId: ID }) });
    expect(status).toBe(200);
    expect(headers['Set-Cookie']).toContain(`${TICKET}=`);
  });

  it('sets nothing for something that is not a player', async () => {
    const { status, headers } = await call({ method: 'POST', body: { playerId: 'nope' } });
    expect(status).toBe(400);
    expect(headers['Set-Cookie']).toBeUndefined();
  });

  it('takes the ticket away when asked to forget', async () => {
    const { status, headers } = await call({ method: 'POST', query: { forget: '1' } });
    expect(status).toBe(200);
    expect(headers['Set-Cookie']).toContain('Max-Age=0');
  });

  it('answers only a POST', async () => {
    expect((await call({ method: 'GET' })).status).toBe(405);
  });
});

describe('reading the ticket on the phone', () => {
  it('finds it among the other cookies', () => {
    expect(readTicket(cookieFor(ticket()))).toEqual(ticket());
    expect(readTicket('hitman-player=x; other=1')).toBeNull();
    expect(readTicket('')).toBeNull();
  });
});

describe('when the ticket wants writing', () => {
  const today = dayOf(NOW);
  const me = { name: 'Rohit', avatar: 2 };

  it('when there is none, or it names somebody else', () => {
    expect(ticketWanted(null, ID, me, today)).toBe(true);
    expect(ticketWanted(ticket({ id: OTHER }), ID, me, today)).toBe(true);
  });

  it('when the name or the kit has changed', () => {
    expect(ticketWanted(ticket(), ID, { name: 'Virat', avatar: 2 }, today)).toBe(true);
    expect(ticketWanted(ticket(), ID, { name: 'Rohit', avatar: 4 }, today)).toBe(true);
  });

  /** A year runs out. Writing it again a month in is what keeps it from doing so. */
  it('when it is a month old, and not before', () => {
    expect(ticketWanted(ticket(), ID, me, today)).toBe(false);
    expect(ticketWanted(ticket({ day: today - TICKET_REFRESH_DAYS + 1 }), ID, me, today)).toBe(false);
    expect(ticketWanted(ticket({ day: today - TICKET_REFRESH_DAYS }), ID, me, today)).toBe(true);
  });
});

describe('asking the server to write it', () => {
  let sent: { url: string; body: Record<string, unknown> }[];
  let cookie: string;

  beforeEach(() => {
    sent = [];
    cookie = '';
    vi.stubGlobal('document', { get cookie() { return cookie; } });
    vi.stubGlobal('fetch', (url: string, init: { body: string }) => {
      sent.push({ url, body: JSON.parse(init.body) });
      return Promise.resolve(new Response('{}'));
    });
  });

  it('asks when there is no ticket', () => {
    leaveTicket(ID, { name: 'Rohit', avatar: 2 });
    expect(sent).toEqual([{ url: '/api/me', body: { playerId: ID, name: 'Rohit', avatar: 2 } }]);
  });

  it('does not ask when the ticket already says the same thing', () => {
    cookie = cookieFor(ticket({ day: dayOf() }));
    leaveTicket(ID, { name: 'Rohit', avatar: 2 });
    expect(sent).toEqual([]);
  });

  /** An empty name written over a real one would undo the very thing the ticket is for. */
  it('keeps the name on the ticket when the phone has none for the same player', () => {
    cookie = cookieFor(ticket({ day: dayOf() - TICKET_REFRESH_DAYS - 1, name: 'Bumrah', avatar: 4 }));
    leaveTicket(ID, null);
    expect(sent[0]?.body).toEqual({ playerId: ID, name: 'Bumrah', avatar: 4 });
  });

  it('never asks for something that is not an id', () => {
    leaveTicket(null, null);
    leaveTicket('nope', { name: 'Rohit', avatar: 0 });
    expect(sent).toEqual([]);
  });

  /** From another site the cookie would be a third party's, which Safari refuses. */
  it('does not ask where the endpoints live on another site', () => {
    vi.stubEnv('VITE_BOARD_API', 'https://hitman-cricket.vercel.app');
    leaveTicket(OTHER, { name: 'Elsewhere', avatar: 1 });
    expect(sent).toEqual([]);
  });
});

describe('coming back on a phone that has forgotten', () => {
  const store = (held: string | null = null): IdStore & { held: string | null } => ({
    held,
    instant: true,
    read() { return this.held; },
    write(id: string) { this.held = id; },
  });
  let local: Map<string, string>;

  beforeEach(() => {
    local = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => { local.set(key, value); },
    });
  });

  it('puts the id back in every store, and the name and kit with it', async () => {
    const stores = [store(), store(), store()];
    expect(await comeBack(stores, cookieFor(ticket()))).toBe(true);
    expect(stores.map(one => one.held)).toEqual([ID, ID, ID]);
    expect(JSON.parse(local.get('hitman-batter')!)).toEqual({ name: 'Rohit', avatar: 2 });
  });

  /** A browser that still knows who it is keeps being that: nothing here swaps players. */
  it('does nothing while any store still holds an id', async () => {
    const stores = [store(), store(OTHER), store()];
    expect(await comeBack(stores, cookieFor(ticket()))).toBe(false);
    expect(stores.map(one => one.held)).toEqual([null, OTHER, null]);
    expect(local.has('hitman-batter')).toBe(false);
  });

  it('does nothing without a ticket', async () => {
    const stores = [store(), store(), store()];
    expect(await comeBack(stores, 'other=1')).toBe(false);
    expect(stores.map(one => one.held)).toEqual([null, null, null]);
  });

  it('leaves a name the phone already has alone', async () => {
    local.set('hitman-batter', JSON.stringify({ name: 'Virat', avatar: 1 }));
    expect(await comeBack([store()], cookieFor(ticket()))).toBe(true);
    expect(JSON.parse(local.get('hitman-batter')!)).toEqual({ name: 'Virat', avatar: 1 });
  });

  it('brings back an id with no name, for a player who never took one', async () => {
    const stores = [store()];
    expect(await comeBack(stores, cookieFor(ticket({ name: '' })))).toBe(true);
    expect(stores[0].held).toBe(ID);
    expect(local.has('hitman-batter')).toBe(false);
  });

  /** A store that hangs is IndexedDB on a bad day; the player is not kept waiting on it. */
  it('does not wait forever on a store that never answers', async () => {
    vi.useFakeTimers();
    const hangs: IdStore = { read: () => new Promise(() => {}), write: () => new Promise(() => {}) };
    const coming = comeBack([hangs, store()], cookieFor(ticket()));
    await vi.advanceTimersByTimeAsync(3000);
    await expect(coming).resolves.toBe(true);
    vi.useRealTimers();
  });
});
