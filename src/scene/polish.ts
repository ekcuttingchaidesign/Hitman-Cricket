import * as THREE from 'three';

/**
 * The picture's finish, two small things laid over the scene as it was
 * (`GameScene`): a soft dark under each of the batter's boots so he stands on
 * the turf rather than over it, and the corners of the picture let fall away,
 * by night most of all. Neither is a post-processing pass: an iPhone pays for
 * every extra render, so the dark under his boots is one small mesh and the
 * corners a still layer on the page over the canvas. `?polish=0` turns both
 * off, for holding the two side by side.
 *
 * A light along his edges was the third, a line in his own shaders on the
 * crown of the helmet and the shoulders, and was taken out: on a phone the
 * whitish shine made him look laminated, the owner said.
 */

/** `over` is how far above the ground it is laid: the strip stands a little proud of the outfield, and under it nothing showed. */
export const CONTACT = { dark: .4, radius: .34, lifted: .32, grows: 1.5, over: .036 } as const;

/**
 * The dark under his boots: one mesh of a soft disc a boot, so one draw call
 * and no texture,
 * laid just over the turf and moved each frame to where the boots are. A boot
 * off the ground has a wider, fainter one, and none once it is well up.
 */
export class ContactShadows {
  readonly mesh: THREE.Mesh;
  private readonly count: number;
  constructor(count = 2) {
    this.count = count;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 12), 3));
    geometry.setAttribute('dark', new THREE.BufferAttribute(new Float32Array(count * 4), 1));
    // Which corner of its disc each vertex is, from -1 to 1 either way.
    const corner = new Float32Array(count * 8), index: number[] = [];
    for (let i = 0; i < count; i++) {
      corner.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
      index.push(i * 4, i * 4 + 2, i * 4 + 1, i * 4, i * 4 + 3, i * 4 + 2);
    }
    geometry.setAttribute('corner', new THREE.BufferAttribute(corner, 2)); geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        attribute float dark; attribute vec2 corner; varying float vDark; varying vec2 vAt;
        void main() { vDark = dark; vAt = corner; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      // Dark out to half its width, since the boot itself covers the middle and what shows is what is round it,
      // and gone by the disc's edge: worked out here, so there is no texture to fetch or upload.
      fragmentShader: /* glsl */`
        varying float vDark; varying vec2 vAt;
        void main() { float fade = 1.0 - smoothstep(.4, 1.0, length(vAt)); gl_FragColor = vec4(.07, .1, .08, vDark * fade); }`,
    }));
    this.mesh.frustumCulled = false;
  }
  /** Each boot's place on the ground and how far off it the sole is, in the mesh's own frame. */
  place(feet: readonly { x: number; z: number; height: number }[]) {
    const position = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const dark = this.mesh.geometry.getAttribute('dark') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      const foot = feet[i], up = foot ? Math.min(1, Math.max(0, foot.height / CONTACT.lifted)) : 1;
      const r = CONTACT.radius * (1 + up * (CONTACT.grows - 1)), alpha = foot ? CONTACT.dark * (1 - up) * (1 - up) : 0;
      const x = foot?.x ?? 0, z = foot?.z ?? 0, y = CONTACT.over + i * .001;
      position.setXYZ(i * 4, x - r, y, z - r); position.setXYZ(i * 4 + 1, x + r, y, z - r);
      position.setXYZ(i * 4 + 2, x + r, y, z + r); position.setXYZ(i * 4 + 3, x - r, y, z + r);
      for (let v = 0; v < 4; v++) dark.setX(i * 4 + v, alpha);
    }
    position.needsUpdate = true; dark.needsUpdate = true;
  }
}

/** How dark a boot's shadow is at `height` off the turf, for the tests: the rule `place` draws by. */
export function contactDark(height: number) {
  const up = Math.min(1, Math.max(0, height / CONTACT.lifted));
  return CONTACT.dark * (1 - up) * (1 - up);
}
