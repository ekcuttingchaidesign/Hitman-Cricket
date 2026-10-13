import { BATS, FREE_BAT, OUTFITS, WELCOME_BAT, batOf, type BatSkin, type Outfit } from '../game/dressing';
import type { StoryStageKind } from '../game/whats-new';
import type { DressingStage } from '../scene/DressingStage';

/**
 * The Dressing Room's stage, the whole screen of a What's new story behind its
 * words: every kit on the batter in turn, every bat on the stand, or Boom.
 *
 * It is the room's own stage and the shelves' own catalogue, so it costs
 * nothing to download, shows the colours and stickers the game draws, and a
 * kit or bat added later is in it without anybody making a new picture. One
 * stage is kept for the whole run of stories and moved from card to card,
 * because a card is drawn afresh every time it is shown; it is let go when the
 * stories are put away. Where it cannot be drawn — no WebGL — the story is its
 * words on the sheet's own dark, as it is while the stage is being made.
 */
/**
 * How much nearer than the Dressing Room the camera may come. A story has the
 * whole screen and nothing down its side, so the batter is let fill it; any
 * nearer and his bat starts to reach the edges of a phone.
 */
const NEARER = 1.5;

export class StoryStage {
  private stage: DressingStage | null = null;
  private loading: Promise<DressingStage | null> | null = null;
  private timer = 0;
  private stopped = false;
  /** Framed again whenever the screen or the room in it changes, which they do as a card is laid out. */
  private readonly sized = new ResizeObserver(() => this.fit?.());
  private fit: (() => void) | null = null;

  /**
   * Played in `host` (`#whatsnew-stage`, the whole sheet), the kind its story
   * asks for, the batter or the bat stood in `room` (`#whatsnew-room`, the
   * space left between the title and the words under it).
   */
  play(host: HTMLElement, room: HTMLElement, kind: StoryStageKind) {
    this.stopped = false;
    window.clearInterval(this.timer);
    void this.ready().then(stage => {
      // Put away, or moved on to another card, while the stage was being made.
      if (!stage || this.stopped || !host.isConnected) return;
      host.prepend(stage.canvas);
      host.classList.add('is-live');
      // The batter's crown to the pedestal's edge in the room, as the Dressing Room frames him.
      this.fit = () => {
        const screen = host.getBoundingClientRect(), space = room.getBoundingClientRect();
        if (screen.width && space.height > 40) stage.frame(space.top - screen.top, space.bottom - screen.top, 0, screen.width, NEARER);
      };
      this.sized.disconnect(); this.sized.observe(host); this.sized.observe(room);
      this.fit();
      const kit = (outfit: Outfit) => { stage.dress(outfit, batOf(WELCOME_BAT)); stage.show('kit', outfit.glow); };
      const bat = (skin: BatSkin) => { stage.showcase(skin); stage.show('bat', skin.glow); };
      if (kind === 'boom') { bat(batOf(WELCOME_BAT)); return; }
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
