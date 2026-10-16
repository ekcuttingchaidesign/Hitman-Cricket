import { BATS, FREE_BAT, OUTFITS, WELCOME_BAT, batOf, type BatSkin, type Outfit } from '../game/dressing';
import type { StoryStageKind } from '../game/whats-new';
import type { DressingStage } from '../scene/DressingStage';

/**
 * The Dressing Room's stage, the whole screen of a What's new story behind its
 * words: every kit on the batter in turn, or every bat on the stand.
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
 * nearer and, as he turns, his bat's toe and the pedestal reach the edges of
 * the phone. The camera's limit is in the screen's width, so this holds on
 * every phone.
 */
const NEARER = 1.25;

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

  /**
   * Made ahead, where the stories are due to open: the stage built, the batter
   * dressed in the first kit and drawn off the page, so his shaders are
   * compiled before the first story asks for him. Made on demand, the first
   * story stood empty for a second or two on a phone while that happened.
   */
  warm() {
    this.stopped = false;
    void this.ready().then(stage => stage?.dress(OUTFITS[0], batOf(WELCOME_BAT)));
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
      try { this.stage = new DressingStage(); } catch { this.loading = null; return null; }
      return this.stage;
    // Not fetched — a dropped connection — is asked again next time, rather than held as an answer.
    }).catch(() => { this.loading = null; return null; });
    return this.loading;
  }
}
