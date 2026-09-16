import { describe, expect, it } from 'vitest';
import { engineOf, looksPrivate, quotaCeiling, rememberedBefore, type Signals } from '../src/game/private-mode';

const GIB = 1024 ** 3;
const signals = (over: Partial<Signals> = {}): Signals => ({
  engine: 'chromium', quota: 40 * GIB, heapLimit: 2 * GIB, serviceWorker: true, secure: true, remembered: false, ...over,
});

describe('which private mode this might be', () => {
  it('reads the desktop engines off the agent string', () => {
    expect(engineOf('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36')).toBe('chromium');
    expect(engineOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15')).toBe('webkit');
    expect(engineOf('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('gecko');
    expect(engineOf('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0')).toBe('chromium');
  });

  it('reads every iOS browser as WebKit, whatever it is called', () => {
    // Chrome and Firefox on iOS are Safari underneath, so a private tab there is
    // WebKit's and not the one their desktop namesake has.
    expect(engineOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1')).toBe('webkit');
    expect(engineOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/130.0 Mobile/15E148 Safari/605.1.15')).toBe('webkit');
  });

  it('names nothing it does not recognise', () => {
    expect(engineOf('SomeCrawler/1.0')).toBe('unknown');
  });
});

describe('where the quota line is drawn', () => {
  it('follows the heap ceiling, which is what a private allowance is cut from', () => {
    expect(quotaCeiling(0.75 * GIB)).toBe(1.5 * GIB);
  });

  it('holds between one and two gigabytes either way', () => {
    // Low, or a private window on a big machine reports its way past the line;
    // high, and an ordinary window on a nearly full disk gets called private.
    expect(quotaCeiling(64 * 1024 * 1024)).toBe(GIB);
    expect(quotaCeiling(8 * GIB)).toBe(2 * GIB);
  });

  it('falls back to a flat figure where no heap ceiling is published', () => {
    // Safari, which is also the browser whose private quota is smallest.
    expect(quotaCeiling(null)).toBe(GIB);
    expect(quotaCeiling(0)).toBe(GIB);
  });
});

describe('the verdict', () => {
  it('calls a small quota private', () => {
    expect(looksPrivate(signals({ quota: 300 * 1024 * 1024 }))).toBe(true);
    expect(looksPrivate(signals({ engine: 'webkit', heapLimit: null, quota: 200 * 1024 * 1024 }))).toBe(true);
  });

  it('leaves an ordinary tab alone', () => {
    expect(looksPrivate(signals())).toBe(false);
    expect(looksPrivate(signals({ engine: 'webkit', heapLimit: null, quota: 20 * GIB }))).toBe(false);
  });

  it('calls a Firefox with no service workers private', () => {
    expect(looksPrivate(signals({ engine: 'gecko', serviceWorker: false }))).toBe(true);
  });

  it('does not read that tell off an insecure page, where nobody has them', () => {
    expect(looksPrivate(signals({ engine: 'gecko', serviceWorker: false, secure: false }))).toBe(false);
  });

  it('says nothing about a browser it could not name', () => {
    // A guess about an engine whose private mode has not been looked at is a
    // screen shown to somebody for no reason.
    expect(looksPrivate(signals({ engine: 'unknown', quota: 10 * 1024 * 1024 }))).toBe(false);
  });

  it('treats a browser that would not answer as an ordinary one', () => {
    expect(looksPrivate(signals({ quota: null }))).toBe(false);
    expect(looksPrivate(signals({ quota: 0 }))).toBe(false);
  });
});

describe('a browser that has remembered something', () => {
  it('is not private, whatever the quota says', () => {
    // The case this is here for: a phone with a nearly full disk is handed a
    // private window's quota and is not a private window. Having been here on
    // an earlier day settles it.
    expect(looksPrivate(signals({ quota: 200 * 1024 * 1024, remembered: true }))).toBe(false);
    expect(looksPrivate(signals({ engine: 'gecko', serviceWorker: false, remembered: true }))).toBe(false);
  });

  it('proves nothing from today\'s own mark, which a private window also holds', () => {
    expect(rememberedBefore('2026-09-16', '2026-09-16')).toBe(false);
    expect(rememberedBefore('2026-09-15', '2026-09-16')).toBe(true);
  });

  it('proves nothing from junk or from an empty store', () => {
    expect(rememberedBefore(null, '2026-09-16')).toBe(false);
    expect(rememberedBefore('yesterday', '2026-09-16')).toBe(false);
    expect(rememberedBefore('', '2026-09-16')).toBe(false);
  });
});
