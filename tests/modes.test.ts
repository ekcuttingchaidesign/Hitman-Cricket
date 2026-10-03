import { describe, expect, it } from 'vitest';
import board from '../api/board';
import career from '../api/career';
import innings from '../api/innings';
import score from '../api/score';
import type { ApiRequest, ApiResponse } from '../src/server/http';
import { NOT_OPEN, modeAsked, open } from '../src/server/mode';
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

  it('keeps the Marathon\'s careers shut until it has careers of its own', () => {
    expect(open('classic')).toBe(true);
    expect(open('survive')).toBe(true);
    expect(open('marathon')).toBe(false);
  });
});

/**
 * The reason the reader exists. Every endpoint used to take anything that was
 * not `survive` for the Blast, so a Marathon innings would have gone onto the
 * Blast's board and into the Blast's careers. Its boards are its own now; its
 * careers are not built yet (step 6), so those endpoints still turn it away —
 * before they reach a database, so these run with none configured.
 */
describe('a Marathon request', () => {
  const refused = (said: { status: number; body: any }) => {
    expect(said.status).toBe(400);
    expect(said.body.error).toBe(NOT_OPEN);
  };

  it('reaches the board, rather than being turned away', async () => {
    const { res, said } = spy();
    await board(get({ mode: 'marathon' }), res);
    expect(said.body?.error).not.toBe(NOT_OPEN);
  });

  it('is offered to the Marathon\'s own boards, rather than turned away or put on the Blast\'s', async () => {
    const { res, said } = spy();
    await score(post({ mode: 'marathon', playerId: 'p', name: 'Somebody', avatar: 0, innings: {} }), res);
    expect(said.body?.error).not.toBe(NOT_OPEN);
  });

  it('is turned away by the careers', async () => {
    const { res, said } = spy();
    await career(get({ mode: 'marathon' }), res);
    refused(said);
  });

  it('is not counted toward a Blast career', async () => {
    const { res, said } = spy();
    await innings(post({ mode: 'marathon', playerId: 'p', nonce: 'n', innings: {} }), res);
    refused(said);
  });
});
