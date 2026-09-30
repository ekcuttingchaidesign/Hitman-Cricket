import { describe, expect, it } from 'vitest';
import { HOME, OLD_HOMES, forwardingAddress, gather, moveIn, movingOut, pack, unpack } from '../src/game/new-home';

const ID = 'lq0x2k1a-abcdefghijkl';
const OLD = `https://${OLD_HOMES[0]}/`;

/** localStorage, as a map. */
function storage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed));
  return {
    held,
    get length() { return held.size; },
    key: (i: number) => [...held.keys()][i] ?? null,
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => { held.set(key, value); },
  };
}

describe('the old address', () => {
  it('moves once switched on, and nothing else does', () => {
    expect(movingOut({ hostname: 'hitman-cricket.vercel.app' }, true)).toBe(true);
    expect(movingOut({ hostname: HOME }, true)).toBe(false);
    // A preview is where a change is looked at before it ships.
    expect(movingOut({ hostname: 'hitman-cricket-git-claude-blissful-pascal-2csfhv-ek-cutting-chai-design.vercel.app' }, true)).toBe(false);
    expect(movingOut({ hostname: 'localhost' }, true)).toBe(false);
  });

  it('stays put until the new domain is switched on', () => {
    // The move ships before the domain answers; forwarding to it then would be
    // everybody sent to nothing.
    expect(movingOut({ hostname: 'hitman-cricket.vercel.app' }, false)).toBe(false);
  });

  it('sends the same page, with its query, to the new one', () => {
    const where = { hostname: OLD_HOMES[0], pathname: '/feedback', search: '?room=abc', hash: '' };
    expect(forwardingAddress(where, null)).toBe('https://hitmancricket.in/feedback?room=abc');
    expect(forwardingAddress({ ...where, hash: '#demo' }, null)).toBe('https://hitmancricket.in/feedback?room=abc#demo');
    expect(forwardingAddress(where, 'xyz')).toBe('https://hitmancricket.in/feedback?room=abc#carry=xyz');
  });

  it('packs every key the game keeps, and nothing that is not the game\'s', () => {
    const kept = gather(storage({ 'hitman-player': ID, 'hitman-batter': '{"name":"Rohit"}', 'other-site': 'x' }));
    expect(kept).toEqual({ 'hitman-player': ID, 'hitman-batter': '{"name":"Rohit"}' });
  });
});

describe('what travels', () => {
  it('comes back as it went, names in any script included', () => {
    const carried = { keys: { 'hitman-player': ID, 'hitman-batter': '{"name":"रोहित 🏏"}' }, hash: '#demo' };
    expect(unpack(pack(carried))).toEqual(carried);
  });

  it('is refused when it is not a move this game made', () => {
    expect(unpack('not base64 at all!')).toBe(null);
    expect(unpack(pack({ keys: { 'other-key': 'x' }, hash: '' }))).toBe(null);
    expect(unpack(pack({ keys: { 'hitman-player': 'not-an-id' }, hash: '' }))).toBe(null);
    expect(unpack('A'.repeat(300_000))).toBe(null);
  });
});

describe('the new address', () => {
  const arriving = (keys: Record<string, string>) => ({ hash: `#carry=${pack({ keys, hash: '' })}` });
  const forgot: string[] = [];
  const forget = (hash: string) => { forgot.push(hash); };

  it('takes a player in from the old address, and takes the fragment off', () => {
    const here = storage();
    forgot.length = 0;
    expect(moveIn(arriving({ 'hitman-player': ID, 'hitman-best': '88' }), OLD, here, forget, () => '')).toBe('moved');
    expect(here.held.get('hitman-player')).toBe(ID);
    expect(here.held.get('hitman-best')).toBe('88');
    expect(forgot).toEqual(['']);
  });

  it('refuses a carry that did not come from the old address', () => {
    // Somebody's id in a link handed round: everybody who tapped it would bat
    // as them, and their innings would count towards that one career.
    const here = storage();
    expect(moveIn(arriving({ 'hitman-player': ID }), 'https://example.com/', here, forget, () => '')).toBe('refused');
    expect(moveIn(arriving({ 'hitman-player': ID }), '', here, forget, () => '')).toBe('refused');
    expect(here.held.size).toBe(0);
  });

  it('keeps a player who is already somebody here, whole', () => {
    const here = storage({ 'hitman-player': 'lq0x2k1b-mnopqrstuvwx' });
    expect(moveIn(arriving({ 'hitman-player': ID, 'hitman-best': '88' }), OLD, here, forget, () => '')).toBe('kept');
    expect(here.held.get('hitman-player')).toBe('lq0x2k1b-mnopqrstuvwx');
    expect(here.held.has('hitman-best')).toBe(false);
    // The cookie counts as somebody too.
    expect(moveIn(arriving({ 'hitman-player': ID }), OLD, storage(), forget, () => `hitman-player=${ID}`)).toBe('kept');
  });

  it('does nothing on an ordinary visit', () => {
    expect(moveIn({ hash: '' }, OLD, storage(), forget, () => '')).toBe(null);
    expect(moveIn({ hash: '#demo' }, OLD, storage(), forget, () => '')).toBe(null);
  });
});
