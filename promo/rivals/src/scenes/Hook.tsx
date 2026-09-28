import React from 'react';
import { AbsoluteFill, Img, staticFile} from 'remotion';
import { theme } from '../theme';
import { ramp, out, useSceneFrame } from '../lib';
import { Slam } from '../components/Bits';

// challenge_mode.png is 620x465. Covering 1080x1920 it is drawn 2560x1920,
// shifted 740px left. The point where the two helmets meet sits at (305, 85)
// in the picture, which is (1259, 351) inside that box.
const W = 2560, H = 1920, LEFT = -740;
const GAP = { x: 1259, y: 351 };

/**
 * Two batters helmet to helmet, and the question. On the last beat the camera
 * dives into the gap between the helmets, and the VS of the next scene comes
 * out of that same point.
 */
export const Hook: React.FC = () => {
  const f = useSceneFrame();
  // Ken Burns, then the dive.
  const kb = ramp(f, [0, 34], [1.0, 1.1], theme.ease.inOut);
  const dive = ramp(f, [33, 45], [0, 1], theme.ease.in);
  const scale = kb * (1 + dive * 7);
  // Bring the gap to the centre of the frame as we dive.
  const tx = dive * (540 - (LEFT + GAP.x));
  const ty = dive * (960 - GAP.y);
  // A small punch on each line landing.
  const punch = [2, 10, 18].reduce((acc, at) => acc + Math.max(0, 1 - Math.abs(f - at - 2) / 5) * 0.025, 0);
  const textExit = out(f, 31, 38);

  return (
    <AbsoluteFill style={{ background: theme.colors.bg, overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute', left: LEFT, top: 0, width: W, height: H,
          transformOrigin: `${GAP.x}px ${GAP.y}px`,
          transform: `translate(${tx}px, ${ty}px) scale(${scale * (1 + punch)})`,
          filter: dive > 0 ? `blur(${dive * 16}px) saturate(${1 + dive * 0.5})` : undefined,
        }}
      >
        <Img src={staticFile('art/challenge_mode.png')} style={{ width: '100%', height: '100%' }} />
      </div>
      {/* The words need a floor to stand on. */}
      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, transparent 38%, rgba(7,17,26,0.78) 62%, rgba(7,17,26,0.92) 100%)',
          opacity: 1 - dive,
        }}
      />
      <Slam text="THINK YOU’RE" delay={2} y={1090} size={150} exit={textExit} />
      <Slam text="BETTER THAN" delay={10} y={1250} size={150} exit={textExit} tilt={5} />
      <Slam
        text={<>YOUR <span style={{ color: theme.colors.hero }}>MATE?</span></>}
        delay={18} y={1415} size={168} exit={textExit}
      />
      {/* The gap glows orange just before the cut, which is where VS comes from. */}
      <div
        style={{
          position: 'absolute', left: 540 - 400, top: 960 - 400, width: 800, height: 800, borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.colors.hero}, transparent 60%)`,
          opacity: ramp(f, [38, 45], [0, 0.9], theme.ease.in), transform: `scale(${1 + dive})`,
        }}
      />
    </AbsoluteFill>
  );
};
