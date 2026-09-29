import * as THREE from 'three';

/**
 * The perimeter boards: the strip at the foot of the stands, all the way round.
 *
 * It was twenty-eight painted boxes, two navy to every one orange, and the
 * orange ones were the colour of the fielding side's shirts. A fielder in the
 * deep stood in front of his own kit and disappeared into it. So the boards now
 * carry sponsors, and none of them is orange: navy, royal blue, teal, purple,
 * black and white, every one of which an orange shirt stands out against.
 *
 * Every sponsor here is made up. They are cricket jokes rather than brands,
 * which is the point: a real name on the fence would be an endorsement nobody
 * gave.
 *
 * One ring and its top edge, where the boxes were twenty-eight draw calls.
 */

interface Ad { bg: string; ink: string; big: string; small?: string; accent?: string }

const ADS: Ad[] = [
  { bg: '#16304a', ink: '#ffffff', big: 'HITMAN CRICKET', accent: '#8fd3ff' },
  { bg: '#1f5fd6', ink: '#ffffff', big: 'COVER DRIVE', small: 'MOTORS' },
  { bg: '#3b1f6e', ink: '#ffd23f', big: 'GOLDEN DUCK', small: 'INSURANCE' },
  { bg: '#f4f6f8', ink: '#16304a', big: 'SILLY POINT', small: 'PAINTS', accent: '#1f9d8b' },
  { bg: '#0e7c7b', ink: '#ffffff', big: 'BOUNDARY BANK', accent: '#b8f0e6' },
  { bg: '#111418', ink: '#b8f24a', big: 'NIGHTWATCH', small: 'SECURITY' },
];

/** Boards per sponsor round the ground. */
const LAPS = 5;

function boardTexture(anisotropy: number) {
  const panelW = 640, H = 128;
  const canvas = document.createElement('canvas'); canvas.width = panelW * ADS.length; canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const font = (weight: number, size: number) => `${weight} ${size}px "Arial Black", "Helvetica Neue", Arial, system-ui, sans-serif`;
  ADS.forEach((ad, i) => {
    const x = i * panelW;
    ctx.fillStyle = ad.bg; ctx.fillRect(x, 0, panelW, H);
    // A stripe of the sponsor's second colour along the foot of the board.
    if (ad.accent) { ctx.fillStyle = ad.accent; ctx.fillRect(x, H - 12, panelW, 12); }
    ctx.fillStyle = ad.ink; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const room = panelW - 70;
    if (ad.small) {
      // Name and trade side by side, the trade lighter, fitted together.
      ctx.font = font(900, 62); const big = ctx.measureText(ad.big).width;
      ctx.font = font(700, 34); const small = ctx.measureText(ad.small).width;
      const gap = 18, scale = Math.min(1, room / (big + gap + small));
      ctx.save(); ctx.translate(x + panelW / 2, H / 2 - 3); ctx.scale(scale, 1);
      const left = -(big + gap + small) / 2;
      ctx.textAlign = 'left';
      ctx.font = font(900, 62); ctx.fillText(ad.big, left, 0);
      ctx.globalAlpha = 0.85; ctx.font = font(700, 34); ctx.fillText(ad.small, left + big + gap, 4);
      ctx.restore();
    } else {
      ctx.font = font(900, 62);
      const scale = Math.min(1, room / ctx.measureText(ad.big).width);
      ctx.save(); ctx.translate(x + panelW / 2, H / 2 - 3); ctx.scale(scale, 1); ctx.fillText(ad.big, 0, 0); ctx.restore();
    }
    // The seam between one board and the next.
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x, 0, 3, H);
  });
  // Light catching the top of every board, so they read as panels, not paint.
  const sheen = ctx.createLinearGradient(0, 0, 0, H);
  sheen.addColorStop(0, 'rgba(255,255,255,0.22)'); sheen.addColorStop(0.35, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 0, canvas.width, H);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  // Negative, because the ring is seen from inside and would otherwise run
  // every sponsor's name backwards.
  texture.repeat.x = -LAPS;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * The ring of boards, centred on the middle of the ground, with its face at
 * `radius` and `height` tall. Symmetric about the wicket, so it can sit
 * outside the mirrored stage and its lettering reads the right way round.
 */
export function perimeterBoards(radius: number, depth: number, height: number, centreZ: number, anisotropy: number) {
  const texture = boardTexture(anisotropy);
  const group = new THREE.Group(); group.position.set(0, 0, centreZ);
  // LED boards give off a little light of their own, which is what keeps them
  // bright on the side of the ground the sun is behind.
  const face = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, height, 180, 1, true),
    new THREE.MeshStandardMaterial({ map: texture, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.55, side: THREE.BackSide }),
  );
  face.position.y = height / 2;
  const top = new THREE.Mesh(new THREE.RingGeometry(radius, radius + depth, 180), new THREE.MeshStandardMaterial({ color: 0x19334a, roughness: 0.8 }));
  top.rotation.x = -Math.PI / 2; top.position.y = height;
  group.add(face, top);
  return { group, texture };
}
