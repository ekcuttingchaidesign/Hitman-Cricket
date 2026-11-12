import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERAS, CAMERA_KEY, cameraAsked, facesBatter, readCamera, swipeAsPlayed } from '../src/game/camera';
import { mapSwipe } from '../src/game/InputManager';
import { BROADCAST, CLOSE_CAM, PRO_CAM, broadcastViewFor, closeViewFor, homeViewFor, proViewFor } from '../src/scene/homeView';
import { fieldMapMarkup } from '../src/ui/FieldMap';
import { BODY_LAYER, Batter } from '../src/entities/Batter';
import { MOST_OF_SCREEN, sizeOf } from '../src/ui/Milestone';
import { fieldFor } from '../src/game/super10-field';

/** A swipe on the screen, as the game reads it under a camera. */
const played = (dx: number, dy: number, { left = false, facing = false } = {}) => {
  const { across, down } = swipeAsPlayed(dx, dy, left, facing);
  return mapSwipe(across, down);
};

describe('the camera the innings is watched through', () => {
  it('is Classic unless the link or the pause sheet asks for another', () => {
    expect(cameraAsked('?cam=pro')).toBe('pro');
    expect(cameraAsked('?cam=broadcast')).toBe('broadcast');
    expect(cameraAsked('?cam=classic')).toBe('classic');
    expect(cameraAsked('?cam=helicopter')).toBeNull();
    expect(readCamera('?cam=broadcast')).toBe('broadcast');
    expect(facesBatter('broadcast')).toBe(true);
    expect(facesBatter('classic')).toBe(false);
    expect(facesBatter('pro')).toBe(false);
    expect(facesBatter('close')).toBe(false);
    expect(cameraAsked('?cam=close')).toBe('close');
  });

  it('offers Classic, Close and Pro Cam on the row, Broadcast only from the link', () => {
    expect(CAMERAS.map(c => c.id)).toEqual(['classic', 'close', 'pro']);
    const store = new Map<string, string>();
    const was = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
    try {
      store.set(CAMERA_KEY, 'pro');
      expect(readCamera('')).toBe('pro');
      // Picked while it was on the row, Broadcast would be stuck on with no key to leave it.
      store.set(CAMERA_KEY, 'broadcast');
      expect(readCamera('')).toBe('classic');
    } finally { Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: was }); }
  });

  it('reads the swipes as it always did under the classic camera', () => {
    expect(played(0, -60)).toBe('STRAIGHT');
    expect(played(60, 0)).toBe('SQUARE_CUT');
    expect(played(-60, 0)).toBe('LEG');
    expect(played(0, 60)).toBe('DEFEND');
    expect(played(-60, 0, { left: true })).toBe('SQUARE_CUT');
  });

  it('under the broadcast camera, sends the ball the way the thumb went on the picture', () => {
    // Facing him, straight down the ground is down the screen and back past the keeper is up it.
    expect(played(0, 60, { facing: true })).toBe('STRAIGHT');
    expect(played(0, -60, { facing: true })).toBe('DEFEND');
    // A right-hander's off side is on the left of the picture from the bowler's end, his leg side on the right.
    expect(played(-60, 0, { facing: true })).toBe('SQUARE_CUT');
    expect(played(60, 0, { facing: true })).toBe('LEG');
    // Down and to the left is through the covers for him.
    expect(played(-45, 45, { facing: true })).toBe('COVER_LONG_OFF');
    // And a left-hander the other way round again.
    expect(played(60, 0, { left: true, facing: true })).toBe('SQUARE_CUT');
    expect(played(-60, 0, { left: true, facing: true })).toBe('LEG');
  });
});

/** Where a point lands in the broadcast picture: x and y from -1 to 1, edge to edge. */
function seen(aspect: number, x: number, y: number, z: number) {
  const view = broadcastViewFor(aspect), camera = new THREE.PerspectiveCamera(view.fov, aspect, .1, 500);
  camera.position.set(...view.eye); camera.lookAt(...view.at); camera.updateMatrixWorld();
  return new THREE.Vector3(x, y, z).project(camera);
}

describe('the broadcast view', () => {
  const phones = [0.56, 9 / 16, 0.5, 402 / 874, 0.45];
  it('stands behind the bowler inside the rope, far further off than the classic camera', () => {
    expect(BROADCAST.eye[2]).toBeGreaterThan(40);
    expect(BROADCAST.eye[2]).toBeLessThan(50); // the rope straight down the ground, ten up the pitch plus forty
    expect(BROADCAST.eye[2]).toBeGreaterThan(homeViewFor(.46).eye[2]);
  });
  it('has the batter whole in the upper half, under the score bar, and his keeper above him', () => {
    for (const aspect of phones) {
      const head = seen(aspect, -.36, 1.8, 1), feet = seen(aspect, -.36, 0, 1), keeper = seen(aspect, .45, .6, -11);
      expect(head.y, `head at ${aspect}`).toBeLessThan(.8);
      expect(feet.y, `feet at ${aspect}`).toBeGreaterThan(-.1);
      expect(Math.abs(feet.x), `across at ${aspect}`).toBeLessThan(.8);
      expect(keeper.y, `keeper at ${aspect}`).toBeGreaterThan(head.y);
      expect(keeper.y, `keeper at ${aspect}`).toBeLessThan(1);
    }
  });
  it('has the bowler in the foot of the picture as he delivers, from his back', () => {
    for (const aspect of phones) {
      const shoulders = seen(aspect, .3, 1.5, 19.5);
      expect(shoulders.y, `at ${aspect}`).toBeGreaterThan(-1);
      expect(shoulders.y, `at ${aspect}`).toBeLessThan(-.3);
    }
  });
  it('keeps the boards behind the batter up under the score bar', () => {
    for (const aspect of phones) expect(seen(aspect, 0, 0, -24).y, `at ${aspect}`).toBeGreaterThan(.8);
  });
});

/** Where a point lands in a picture taken from `view`. */
function seenFrom(view: { eye: readonly number[]; at: readonly number[]; fov: number }, aspect: number, x: number, y: number, z: number) {
  const camera = new THREE.PerspectiveCamera(view.fov, aspect, .1, 500);
  camera.position.set(view.eye[0], view.eye[1], view.eye[2]); camera.lookAt(view.at[0], view.at[1], view.at[2]); camera.updateMatrixWorld();
  return new THREE.Vector3(x, y, z).project(camera);
}
const proSeen = (aspect: number, x: number, y: number, z: number) => seenFrom(proViewFor(aspect), aspect, x, y, z);

describe('Close, low behind him', () => {
  const phones = [0.56, 9 / 16, 0.5, 402 / 874, 0.45];
  it('stands lower and nearer him than the classic camera, behind the stumps', () => {
    const classic = homeViewFor(.46);
    expect(CLOSE_CAM.eye[1]).toBeLessThan(classic.eye[1]);
    expect(CLOSE_CAM.eye[2]).toBeGreaterThan(classic.eye[2]);
    expect(CLOSE_CAM.eye[2]).toBeLessThan(0);
  });
  it("sees over his helmet to the bowler's hand: the line to the release clears his head", () => {
    const [, y, z] = CLOSE_CAM.eye, release = { y: 2.1, z: 18 }, batter = 1;
    expect(y + (release.y - y) * (batter - z) / (release.z - z)).toBeGreaterThan(1.9);
  });
  it("has him whole in the lower half and the bowler's end above him, on every phone", () => {
    for (const aspect of phones) {
      const view = closeViewFor(aspect);
      const head = seenFrom(view, aspect, .36, 1.8, 1), feet = seenFrom(view, aspect, .36, 0, 1), release = seenFrom(view, aspect, .5, 2.1, 18);
      expect(head.y, `head at ${aspect}`).toBeLessThan(.2);
      expect(feet.y, `feet at ${aspect}`).toBeGreaterThan(-1);
      expect(release.y, `release at ${aspect}`).toBeGreaterThan(head.y);
      expect(release.y, `release at ${aspect}`).toBeLessThan(.7);
    }
  });
});

describe("Pro Cam, the batter's own eyes", () => {
  const phones = [0.56, 9 / 16, 0.5, 402 / 874, 0.45];
  it('draws nothing of him but the gloves and the bat, and his shadow still falls', () => {
    const batter = new Batter();
    batter.update(0);
    const seen = (root: THREE.Object3D) => {
      let shown = 0;
      root.traverseVisible(o => { if ((o as THREE.Mesh).isMesh && o.layers.isEnabled(0)) shown++; });
      return shown;
    };
    const whole = seen(batter.root), bat = seen(batter.bat);
    batter.firstPerson(true);
    expect(batter.firstPersonShown).toBe(true);
    // Only the bat and the gloves on it: no head, body, legs, arms or gauntlets.
    expect(seen(batter.root)).toBe(seen(batter.bat));
    expect(seen(batter.bat)).toBe(bat);
    // What went is on the body's layer, which the sun's shadow camera still sees.
    let body = 0;
    batter.root.traverse(o => { if (o.layers.isEnabled(BODY_LAYER)) body++; });
    expect(body).toBeGreaterThan(10);
    // Up against the lens the bat and gloves go too, still casting.
    batter.firstPerson(true, false);
    expect(batter.batShown).toBe(false);
    expect(seen(batter.root)).toBe(0);
    batter.firstPerson(false);
    expect(seen(batter.root)).toBe(whole);
  });
  it("has his eyes in front of his face, at a standing man's height in his guard", () => {
    const batter = new Batter();
    batter.update(0);
    batter.root.updateMatrixWorld(true);
    const eyes = batter.eyes();
    expect(eyes.y).toBeGreaterThan(1.3);
    expect(eyes.y).toBeLessThan(1.8);
  });
  it("stands just behind his eyes and draws the bat only clear of the lens", () => {
    expect(PRO_CAM.behind).toBeGreaterThan(0);
    expect(PRO_CAM.behind).toBeLessThan(.5);
    expect(PRO_CAM.above).toBeLessThan(.15);
    expect(PRO_CAM.near).toBeLessThan(PRO_CAM.clear);
  });
  it('looks nearly level down the middle: the bowler near the middle of the picture, the pitch below, on every phone', () => {
    for (const aspect of phones) {
      const release = proSeen(aspect, .5, 2.1, 18), stumps = proSeen(aspect, 0, 0, 20), pitch = proSeen(aspect, 0, 0, 4);
      expect(release.y, `release at ${aspect}`).toBeGreaterThan(-.1);
      expect(release.y, `release at ${aspect}`).toBeLessThan(.5);
      expect(Math.abs(stumps.x), `stumps across at ${aspect}`).toBeLessThan(.2);
      expect(pitch.y, `pitch at ${aspect}`).toBeLessThan(release.y);
      expect(pitch.y, `pitch at ${aspect}`).toBeGreaterThan(-1);
    }
  });
});

describe('the Super10 field map under the broadcast camera', () => {
  it('is turned half round with the picture, the batter still a point at its middle', () => {
    const field = fieldFor({ bowler: 'SWING', over: 0 });
    const classic = fieldMapMarkup(field), facing = fieldMapMarkup(field, { facing: true });
    expect(classic).not.toContain('rotate(180');
    expect(facing).toContain('rotate(180 50 50)');
    expect(facing).toContain('class="s10-bat" cx="50" cy="50"');
  });
});

describe('the flashes drawn round him, under any camera', () => {
  const at = (tall: number, height = 874) => ({ feet: { x: 200, y: 600 }, head: { x: 200, y: 600 - tall }, bat: { x: 200, y: 600 - tall * 1.5 }, width: 402, height });
  it('are drawn to his height as the classic view shows him', () => {
    // About 180 points tall on a 874-high phone from behind the bat.
    expect(sizeOf(at(180))).toBeCloseTo(180 / 1.78, 6);
  });
  it('are held to a seventh of the screen when a camera brings him nearer, as Close does', () => {
    expect(sizeOf(at(470))).toBeCloseTo(874 * MOST_OF_SCREEN, 6);
    expect(sizeOf(at(470))).toBeLessThan(470 / 1.78 / 2);
  });
});
