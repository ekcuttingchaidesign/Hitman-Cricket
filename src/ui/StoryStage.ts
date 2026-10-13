import { BATS, FREE_BAT, OUTFITS, WELCOME_BAT, batOf, type BatSkin, type Outfit } from '../game/dressing';
import type { StoryStageKind } from '../game/whats-new';
import type { DressingStage } from '../scene/DressingStage';

/**
 * The Dressing Room's stage, playing in a What's new story in place of its
 * picture: every kit on the batter in turn, every bat on the stand, or Boom.
 *
 * It is the room's own stage and the shelves' own catalogue, so it costs
 * nothing to download, shows the colours and stickers the game draws, and a
 * kit or bat added later is in it without anybody making a new picture. One
 * stage is kept for the whole run of stories and moved from card to card,
 * because a card is drawn afresh every time it is shown; it is let go when the
 * stories are put away. Where it cannot be drawn — no WebGL — the picture the
 * story keeps under it is what is seen.
 */
export class StoryStage {
  private stage: DressingStage | null = null;
  private loading: Promise<DressingStage | null> | null = null;
  private timer = 0;
  private stopped = false;
  /** Framed again whenever the picture's box changes, which it does as a card is laid out. */
  private readonly sized = new ResizeObserver(() => this.fit?.());
  private fit: (() => void) | null = null;

  /** Played in `host` (`#whatsnew-stage`), the kind its story asks for. */
  play(host: HTMLElement, kind: StoryStageKind) {
    this.stopped = false;
    window.clearInterval(this.timer);
    void this.ready().then(stage => {
      // Put away, or moved on to another card, while the stage was being made.
      if (!stage || this.stopped || !host.isConnected) return;
      host.prepend(stage.canvas);
      host.classList.add('is-live');
      // Framed in the picture's box, the batter's crown to the pedestal's edge, as the room frames him.
      this.fit = () => { if (host.clientWidth && host.clientHeight) stage.frame(10, host.clientHeight - 10, 0, host.clientWidth); };
      this.sized.disconnect(); this.sized.observe(host);
      this.fit();
      const chip = host.querySelector<HTMLElement>('#whatsnew-chip');
      // The name and what earns it each kept whole, so a long one wraps between them.
      const say = (name: string, what: string) => {
        if (!chip) return;
        const whole = (text: string) => Object.assign(document.createElement('span'), { textContent: text.toUpperCase() });
        chip.replaceChildren(whole(`${name} ·`), ' ', whole(what));
      };
      const kit = (outfit: Outfit) => { stage.dress(outfit, batOf(WELCOME_BAT)); stage.show('kit', outfit.glow); say(outfit.name, outfit.short); };
      const bat = (skin: BatSkin, what = skin.short) => { stage.showcase(skin); stage.show('bat', skin.glow); say(skin.name, what); };
      if (kind === 'boom') { bat(batOf(WELCOME_BAT), 'In your locker'); return; }
      // The whole shelf once in the story's seven seconds.
      const shelf = kind === 'kits' ? OUTFITS : BATS.filter(one => one.id !== FREE_BAT);
      let at = 0;
      const next = () => {
        const item = shelf[at++ % shelf.length];
        if (kind === 'kits') kit(item as Outfit); else bat(item as BatSkin);
      };
      next();
      // Under reduced motion, a change every two seconds rather than a flicker of them.
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.timer = window.setInterval(next, still ? 2000 : kind === 'kits' ? 1000 : 620);
    });
  }

  /** The stories are put away: the stage and its renderer with them. */
  stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    this.sized.disconnect(); this.fit = null;
    this.stage?.dispose();
    this.stage = null; this.loading = null;
  }

  private ready(): Promise<DressingStage | null> {
    if (this.stage) return Promise.resolve(this.stage);
    this.loading ??= import('../scene/DressingStage').then(({ DressingStage }) => {
      if (this.stopped) return null;
      try { this.stage = new DressingStage(); } catch { return null; }
      return this.stage;
    }).catch(() => null);
    return this.loading;
  }
}
