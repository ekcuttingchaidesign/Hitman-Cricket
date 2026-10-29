/**
 * Restarting a CSS animation without stopping the frame for it.
 *
 * The usual way, taking the class or the animation off, reading `offsetWidth`
 * and putting it back, makes the browser finish every pending style and layout
 * change on the page there and then. Done at the moment of the shot, in the
 * same frame as the ball being met, it cost a phone a frame or more (thirty to
 * sixty milliseconds at a quarter of a desktop's speed, Super10 the most, with
 * its corners changing in the same frame). Here the animation comes off now
 * and goes back on at the next frame, after the browser's own style pass.
 */

/** A class whose animation plays again: off now, on at the next frame. */
export function replayClass(el: Element, cls: string) {
  el.classList.remove(cls);
  requestAnimationFrame(() => el.classList.add(cls));
}

/**
 * An element's own animation from its first frame again, at the next frame.
 * Held out of sight until then: its resting style is where the animation
 * finishes, not where it starts, and shown for a frame it would flash.
 */
export function replayAnimation(el: HTMLElement) {
  el.style.animation = 'none';
  el.style.visibility = 'hidden';
  requestAnimationFrame(() => { el.style.animation = ''; el.style.visibility = ''; });
}
