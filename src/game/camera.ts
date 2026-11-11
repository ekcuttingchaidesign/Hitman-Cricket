/**
 * The camera the innings is watched through (`?cam=`, the pause sheet's
 * Camera row, kept in `hitman-camera`).
 *
 *  - **Classic**: the game's own view from behind the bat (`homeViewFor`).
 *  - **Broadcast**: the television's, high behind the bowler's arm on a long
 *    lens, looking down the pitch at the batter, the keeper beyond him
 *    (`broadcastViewFor`).
 *
 * Only the picture: every ball is bowled, timed and scored as it is, and who
 * fields a ball is judged from the classic view whatever the camera
 * (`GameScene.inShot`), so a Rival Match is the same game either way.
 *
 * The swipes follow the screen. Looking at the batter from in front, straight
 * down the ground is down the screen and his off side is on the other side
 * from the classic view's, so a swipe is read turned half round
 * (`swipeAsPlayed`): the ball goes the way the thumb went on the picture.
 * The keys stay the strokes they always were.
 */
export type CameraId = 'classic' | 'broadcast';
export const CAMERA_KEY = 'hitman-camera';
export const CAMERAS: readonly { id: CameraId; name: string }[] = [
  { id: 'classic', name: 'Classic' },
  { id: 'broadcast', name: 'Broadcast' },
];
const isCamera = (value: string | null): value is CameraId => value === 'classic' || value === 'broadcast';

/** What the link asks for (`?cam=broadcast`), or null. */
export function cameraAsked(search: string): CameraId | null {
  const asked = new URLSearchParams(search).get('cam');
  return isCamera(asked) ? asked : null;
}

/** The camera this visit plays under: the link's, else the one kept, else Classic. */
export function readCamera(search = typeof location === 'undefined' ? '' : location.search): CameraId {
  const asked = cameraAsked(search);
  if (asked) return asked;
  try { const kept = localStorage.getItem(CAMERA_KEY); if (isCamera(kept)) return kept; } catch { /* Nothing kept. */ }
  return 'classic';
}

export function saveCamera(id: CameraId) {
  try { localStorage.setItem(CAMERA_KEY, id); } catch { /* For this visit, then. */ }
}

/** The camera looks at the batter from in front of him, so the screen is the field turned half round. */
export const facesBatter = (id: CameraId) => id === 'broadcast';

/**
 * A swipe on the screen as the batter plays it: `across` positive to his off
 * side, `down` positive back towards the keeper. Mirrored for a left-hander,
 * and turned half round when the camera faces him.
 */
export function swipeAsPlayed(dx: number, dy: number, mirrored: boolean, facing: boolean) {
  return { across: dx * (mirrored !== facing ? -1 : 1), down: dy * (facing ? -1 : 1) };
}
