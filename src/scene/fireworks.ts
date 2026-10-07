import * as THREE from 'three';
import { paintFilm, type Playing } from '../ui/Lottie';

/**
 * Fireworks in the Blast, for a special stroke or a milestone, after dark
 * only — by day there is nothing for them to light up against: the film
 * painted into a canvas and hung in the sky beyond the far stand, so that the
 * stands are in front of it. The rockets come up from behind the roof and the
 * bursts open over it, and a camera that moves sees them where they are.
 *
 * The film holds three bursts of its own in the top half of its square. One
 * copy is hung over the middle on a phone, whose frame is no wider than that;
 * a wide screen has one either side, the second a beat behind the first.
 */

/** How wide the film's square hangs, in metres: about a third of a phone's width at that distance. */
const SIZE = 43;
/** How far down the ground it hangs: thirty metres behind the far stand. */
const AWAY = 79;
/** Where its bursts are in the square, from the top, and how high above the horizon they go off from the crease. */
const BURSTS = .33, ELEVATION = 11.5 * Math.PI / 180;
/** The camera's eye at the crease, which the height is worked out from. */
const EYE = { y: 2.9, z: -5.15 } as const;
/** Across the ground: one over the middle, or one either side. */
const ACROSS = { one: [0], two: [-34, 34] } as const;
/** The second a wide screen sets off goes up this long after the first. */
const STAGGER = 700;
/** And the last of them fades over this long. */
const FADE = 450;
/** The canvas each is painted into: the film's own size. */
const PIXELS = 512;

interface Burst { mesh: THREE.Mesh; texture: THREE.CanvasTexture; context: CanvasRenderingContext2D; film: Playing | null; from: number }

export class Fireworks {
  private bursts: Burst[] = [];
  private until = 0;
  private lasts = 0;
  constructor(private readonly world: THREE.Object3D) {}
  /** Up now? For the checks. */
  get up() { return this.bursts.length; }
  /** Sets them off, from `now` for `ms`, one or two of them: see `ACROSS`. */
  show(now: number, ms: number, wide: boolean) {
    this.stop();
    const height = EYE.y + (AWAY - EYE.z) * Math.tan(ELEVATION) - (.5 - BURSTS) * SIZE;
    (wide ? ACROSS.two : ACROSS.one).forEach((x, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = PIXELS;
      const context = canvas.getContext('2d');
      if (!context) return;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), material);
      mesh.name = 'Fireworks';
      mesh.position.set(x, height, AWAY);
      mesh.lookAt(0, EYE.y, EYE.z);
      // The right-hand one is the left turned round, so the two are not one picture twice.
      if (x > 0) mesh.scale.x = -1;
      mesh.visible = false;
      this.world.add(mesh);
      this.bursts.push({ mesh, texture, context, film: null, from: now + i * STAGGER });
    });
    this.until = now + ms; this.lasts = ms;
  }
  update(now: number) {
    if (!this.bursts.length) return;
    // Over, or a new innings with the clock back at nought.
    if (now >= this.until || now < this.until - this.lasts) { this.stop(); return; }
    const fade = Math.min(1, (this.until - now) / FADE);
    for (const burst of this.bursts) {
      if (now < burst.from) continue;
      if (!burst.film) { burst.film = paintFilm(burst.context, 'fireworks', { loop: true }); burst.mesh.visible = true; }
      (burst.mesh.material as THREE.MeshBasicMaterial).opacity = fade;
      burst.texture.needsUpdate = true;
    }
  }
  stop() {
    for (const { mesh, texture, film } of this.bursts) {
      film?.destroy();
      this.world.remove(mesh);
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); texture.dispose();
    }
    this.bursts = [];
  }
}
