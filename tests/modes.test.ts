import { describe, expect, it } from 'vitest';
import board from '../api/board';
import career from '../api/career';
import innings from '../api/innings';
import score from '../api/score';
import type { ApiRequest, ApiResponse } from '../src/server/http';
import { modeAsked } from '../src/server/mode';
import { isTest } from '../src/game/modes';

/** A response that remembers what was said rather than saying it. */
const spy = () => {
  const said = { status: 0, body: null as any };
  const res: ApiResponse = {
    status(code) { said.status = code; return res; },
    json(body) { said.body = body; },
    setHeader() {},
    end() {},
  };
  return { res, said };
};

const get = (query: Record<string, string>): ApiRequest =>
  ({ method: 'GET', headers: {}, query, socket: { remoteAddress: '127.0.0.1' } });
const post = (body: unknown): ApiRequest =>
  ({ method: 'POST', headers: {}, body, socket: { remoteAddress: '127.0.0.1' } });

describe('the modes', () => {
  it('calls both Test modes a Test match, and the Blast not', () => {
    expect(isTest('CLASSIC')).toBe(false);
    expect(isTest('SURVIVE')).toBe(true);
    expect(isTest('MARATHON')).toBe(true);
  });
});

describe('which mode a request is about', () => {
  it('reads the three by name, however they are written', () => {
    expect(modeAsked('survive')).toBe('survive');
    expect(modeAsked(' Survive ')).toBe('survive');
    expect(modeAsked('marathon')).toBe('marathon');
    expect(modeAsked('MARATHON')).toBe('marathon');
  });

  it('takes anything else, and nothing, for the Blast, as it always has', () => {
    expect(modeAsked(undefined)).toBe('classic');
    expect(modeAsked('')).toBe('classic');
    expect(modeAsked('classic')).toBe('classic');
    expect(modeAsked('blast')).toBe('classic');
  });
});

/**
 * The reason the reader exists. Every endpoint used to take anything that was
 * not `survive` for the Blast, so a Marathon innings would have gone onto the
 * Blast's board and into the Blast's careers. Its boards and its careers are
 * its own now, so every endpoint takes a Marathon request through to its own
 * store — which, with no database configured here, is as far as it gets: the
 * answer is the missing database, not a refusal of the mode.
 */
describe('a Marathon request', () => {
  const reachedTheStore = (said: { status: number; body: any }) => {
    expect(said.status).toBe(503);
    expect(said.body.error).toBe('The board is not set up yet.');
  };

  it('reaches the board', async () => {
    const { res, said } = spy();
    await board(get({ mode: 'marathon' }), res);
    reachedTheStore(said);
  });

  it('is offered to the Marathon\'s own boards', async () => {
    const { res, said } = spy();
    await score(post({ mode: 'marathon', playerId: 'p', name: 'Somebody', avatar: 0, innings: {} }), res);
    expect(said.status).not.toBe(200);
  });

  it('reaches the careers', async () => {
    const { res, said } = spy();
    await career(get({ mode: 'marathon' }), res);
    reachedTheStore(said);
  });

  it('is counted toward a career of its own', async () => {
    const { res, said } = spy();
    await innings(post({ mode: 'marathon', playerId: 'p', nonce: 'n', innings: {} }), res);
    reachedTheStore(said);
  });
});
