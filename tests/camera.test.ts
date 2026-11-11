import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { cameraAsked, facesBatter, readCamera, swipeAsPlayed } from '../src/game/camera';
import { mapSwipe } from '../src/game/InputManager';
import { BROADCAST, broadcastViewFor, homeViewFor } from '../src/scene/homeView';
import { fieldMapMarkup } from '../src/ui/FieldMap';
import { fieldFor } from '../src/game/super10-field';

/** A swipe on the screen, as the game reads it under a camera. */
const played = (dx: number, dy: number, { left = false, facing = false } = {}) => {
  const { across, down } = swipeAsPlayed(dx, dy, left, facing);
  return mapSwipe(across, down);
};

describe('the camera the innings is watched through', () => {
  it('is Classic unless the link or the pause sheet asks for Broadcast', () => {
    expect(cameraAsked('?cam=broadcast')).toBe('broadcast');
    expect(cameraAsked('?cam=classic')).toBe('classic');
    expect(cameraAsked('?cam=helicopter')).toBeNull();
    expect(readCamera('?cam=broadcast')).toBe('broadcast');
    expect(facesBatter('broadcast')).toBe(true);
    expect(facesBatter('classic')).toBe(false);
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

describe('the Super10 field map under the broadcast camera', () => {
  it('is turned half round with the picture, the batter still a point at its middle', () => {
    const field = fieldFor({ bowler: 'SWING', over: 0 });
    const classic = fieldMapMarkup(field), facing = fieldMapMarkup(field, { facing: true });
    expect(classic).not.toContain('rotate(180');
    expect(facing).toContain('rotate(180 50 50)');
    expect(facing).toContain('class="s10-bat" cx="50" cy="50"');
  });
});
