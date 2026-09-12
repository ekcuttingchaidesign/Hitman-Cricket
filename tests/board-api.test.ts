import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import board from '../api/board';
import score from '../api/score';
import { failed, type ApiRequest, type ApiResponse } from '../src/server/http';
import { NoDatabase, redisFromEnv } from '../src/server/upstash';
import { fetchBoard, forgetBoard, submitInnings } from '../src/game/board-api';
import { GAME } from '../src/config/gameplay';

/** A response that remembers what was said rather than saying it. */
const spy = () => {
  const said = { status: 0, body: null as any, headers: {} as Record<string, string> };
  const res: ApiResponse = {
    status(code) { said.status = code; return res; },
    json(body) { said.body = body; },
    setHeader(name, value) { said.headers[name] = value; },
    end() {},
  };
  return { res, said };
};

const request = (method: string, body?: unknown): ApiRequest =>
  ({ method, headers: {}, body, socket: { remoteAddress: '127.0.0.1' } });

const innings = { runs: 50, sixes: 2, fours: 3, wickets: 1, dots: 6, balls: GAME.totalBalls };

describe('what a failure says over the wire', () => {
  it('marks the board’s own failures as nothing the player did', () => {
    const { res, said } = spy();
    failed(res, 503, 'The board could not be reached.');
    expect(said.body).toEqual({ error: 'The board could not be reached.', retry: true });
  });

  it('leaves a refusal unmarked, because there is something to do differently', () => {
    const { res, said } = spy();
    failed(res, 409, 'That name is taken.');
    expect(said.body).toEqual({ error: 'That name is taken.', retry: false });
  });
});

/**
 * The live failure this file exists for. With only the read-only token set, the
 * board read perfectly and every submission threw, so the game looked healthy
 * right up until somebody tried to get on it — and the thrown message said the
 * board was unreachable, which sent the search in the wrong direction entirely.
 */
describe('a board with no database behind it', () => {
  const KEYS = ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'KV_REST_API_READ_ONLY_TOKEN'] as const;
  let held: Record<string, string | undefined>;

  beforeEach(() => {
    held = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
    for (const key of KEYS) delete process.env[key];
    // The endpoints log every failure they answer, which is the point of them;
    // a test that provokes six is not a reason to read six stack traces.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of KEYS) {
      if (held[key] === undefined) delete process.env[key];
      else process.env[key] = held[key];
    }
  });

  it('names the missing address rather than reporting an outage', () => {
    expect(() => redisFromEnv()).toThrow(NoDatabase);
    expect(() => redisFromEnv()).toThrow(/KV_REST_API_URL/);
  });

  it('reads with the write token when there is no read-only one', () => {
    process.env.KV_REST_API_URL = 'https://board.example.invalid';
    process.env.KV_REST_API_TOKEN = 'write';
    expect(() => redisFromEnv(true)).not.toThrow();
  });

  it('will not write with a read-only token, and says which one it wanted', () => {
    process.env.KV_REST_API_URL = 'https://board.example.invalid';
    process.env.KV_REST_API_READ_ONLY_TOKEN = 'read';
    // The asymmetry itself: the board reads, and nobody can get on it.
    expect(() => redisFromEnv(true)).not.toThrow();
    expect(() => redisFromEnv()).toThrow(/KV_REST_API_TOKEN/);
  });

  it('tells both endpoints apart from a board that is merely down', async () => {
    const reading = spy();
    await board(request('GET'), reading.res);
    expect(reading.said.status).toBe(503);
    expect(reading.said.body).toEqual({ error: 'The board is not set up yet.', retry: true });

    const writing = spy();
    await score(request('POST', { playerId: 'p', name: 'Rohit', avatar: 0, innings }), writing.res);
    expect(writing.said.status).toBe(503);
    expect(writing.said.body).toEqual({ error: 'The board is not set up yet.', retry: true });
  });

  it('never caches a board it could not read', async () => {
    const { res, said } = spy();
    await board(request('GET'), res);
    expect(said.headers['Cache-Control']).toBeUndefined();
  });
});

describe('what the player is told when the board will not take an innings', () => {
  const answer = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
      status, headers: { 'Content-Type': 'application/json' },
    })));

  beforeEach(() => { forgetBoard(); vi.stubEnv('DEV', false); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); forgetBoard(); });

  it('reads out the reason the board gave rather than one guessed here', async () => {
    answer(503, { error: 'The board is not set up yet.', retry: true });
    const result = await submitInnings('p', 'Rohit', 0, innings);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('The board is not set up yet.');
  });

  it('adds that the innings is not lost, when the failure was the board’s', async () => {
    answer(503, { error: 'The board could not be reached.', retry: true });
    expect((await submitInnings('p', 'Rohit', 0, innings)).reason)
      .toBe('The board could not be reached. Your innings still counts on this device.');
  });

  it('leaves a refusal alone, because the player can act on it', async () => {
    answer(409, { error: 'That name is taken. Try another.', retry: false });
    expect((await submitInnings('p', 'Rohit', 0, innings)).reason).toBe('That name is taken. Try another.');
  });

  it('falls back to its own words when nothing readable comes back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>504</html>', { status: 504 })));
    expect((await submitInnings('p', 'Rohit', 0, innings)).reason)
      .toBe('The board could not be reached. Your innings still counts on this device.');
  });

  it('never mistakes a refusal for a board, nor keeps one', async () => {
    answer(503, { error: 'The board is not set up yet.', retry: true });
    expect(await fetchBoard(true)).toBeNull();
    // And nothing was cached, so the next open asks again rather than drawing it.
    expect(await fetchBoard()).toBeNull();
  });
});
