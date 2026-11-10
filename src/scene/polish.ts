import * as THREE from 'three';

/**
 * The picture's finish, three small things laid over the scene as it was
 * (`GameScene`): a soft dark under each of the batter's boots so he stands on
 * the turf rather than over it, a light along his edges that lifts him off the
 * grass, and the corners of the picture let fall away, by night most of all.
 * None of it is a post-processing pass: an iPhone pays for every extra render,
 * so the edge light is a line in his own shaders, the dark under his boots one
 * small mesh, and the corners a still layer on the page over the canvas.
 * `?polish=0` turns all three off, for holding the two side by side.
 */

/** The edge light's colour and strength, shared by every material that has it: set by the time of day. */
export const RIM = { colour: { value: new THREE.Color('#fff2d6') }, strength: { value: .0 } };
/** By day the sun's own warmth, quietly; under the floodlights a cooler, stronger line. */
export const RIM_LIGHT = { day: { colour: '#fff2d6', strength: .5 }, night: { colour: '#cfe2ff', strength: .7 } } as const;

const RIM_GLSL = /* glsl */`
  {
    // Along his edges where they face the sky: the crown of the helmet, the shoulders, the top of a pad.
    // Wide enough to read at the size he is on a phone, where a true hairline rim is a pixel and is lost,
    // and next to nothing on what faces the turf, so it never washes over the whole of him.
    // A shell drawn both sides shows its inside through its own edge, and the renderer turns that normal
    // round to face the eye: turned back, the inside takes the light the edge beside it does. Lit as it
    // faced, it stayed dark between lit pixels and speckled the helmet's outline.
    vec3 rimNormal = normalize(normal) * (gl_FrontFacing ? 1.0 : -1.0);
    float rimTurn = 1.0 - saturate(dot(rimNormal, normalize(vViewPosition)));
    float rimUp = saturate(rimNormal.y * .5 + .5);
    outgoingLight += uRimColour * uRimStrength * smoothstep(.3, .92, rimTurn) * rimUp * rimUp;
  }
`;
/** A light along the edges of whatever wears `material`, laid on whatever its shader already does. Once a material. */
export function rimLit(material: THREE.Material) {
  if (material.userData.rimLit || !(material instanceof THREE.MeshStandardMaterial)) return;
  material.userData.rimLit = true;
  const before = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    before.call(material, shader, renderer);
    shader.uniforms.uRimColour = RIM.colour; shader.uniforms.uRimStrength = RIM.strength;
    shader.fragmentShader = `uniform vec3 uRimColour;\nuniform float uRimStrength;\n${shader.fragmentShader.replace('#include <opaque_fragment>', `${RIM_GLSL}\n#include <opaque_fragment>`)}`;
  };
  const key = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${key()}|rim`;
  material.needsUpdate = true;
}

/** How dark it is under a boot on the turf, how wide, and the height by which a lifted boot's has gone. */
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
