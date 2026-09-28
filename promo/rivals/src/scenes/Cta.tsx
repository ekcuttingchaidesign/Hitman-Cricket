import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Lottie } from '@remotion/lottie';
import { at, people, theme } from '../theme';
import { ramp, pop, breathe } from '../lib';
import { BgMesh } from '../components/Layers';
import { Avatar, Crown } from '../components/Avatar';
import { Slam, GameButton } from '../components/Bits';
import { useLottie } from './Result';

/**
 * The end card. Your crowned face is exactly where the board lifted it; the
 * flame comes back round it, and the ask is one line: send the link.
 */
export const Cta: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flame = useLottie('art/flame.json');
  const fire = ramp(f, [0, 8], [0, 1]);
  const b = breathe(f, 0.018, 14);
  const button = pop(f, 15, fps, theme.spring.bouncy);
  const url = ramp(f, [21, 29], [0, 1]);

  return (
    <AbsoluteFill>
      <BgMesh base={theme.colors.bg} a="#0b2238" b={theme.colors.hero} />
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at 50% 40%, ${theme.colors.warm} 0%, transparent 42%)`, opacity: fire }}
      />
      {flame && (
        <div
          style={{
            position: 'absolute', left: at.crown.x - 300, top: at.crown.y - 440, width: 600, height: 690,
            opacity: fire, transform: `scale(${0.6 + fire * 0.4})`, transformOrigin: '50% 80%',
          }}
        >
          <Lottie animationData={flame} loop />
        </div>
      )}
      <Avatar src={people.you.avatar} ring={people.you.ring} size={at.crown.size} x={at.crown.x} y={at.crown.y} scale={b}
        glow={`${theme.colors.hero}88`}>
        <Crown
          size={at.crown.size * 0.62}
          style={{
            position: 'absolute', left: at.crown.size * 0.19, top: -at.crown.size * 0.5, transform: 'rotate(-8deg)',
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))',
          }}
        />
      </Avatar>
      <Slam text="SEND THE LINK." delay={2} y={1110} size={120} tilt={-3} />
      <Slam text="SETTLE IT." delay={8} y={1265} size={200} color={theme.colors.hero} tilt={4} from={2.4}
        style={{ textShadow: `0 10px 0 #7a2c10, 0 0 60px ${theme.colors.hero}66` }} />
      <GameButton
        label="PLAY RIVALS" x={540} y={1490} width={640} scale={button} opacity={Math.min(1, button * 2)}
        face="#fff" edge={theme.colors.ctaOrange} ink={theme.colors.navy} size={64}
      />
      <div
        style={{
          position: 'absolute', left: 0, right: 0, top: 1590, textAlign: 'center', fontFamily: theme.fonts.body,
          fontWeight: 600, fontSize: 44, color: theme.colors.textDim, opacity: url,
          transform: `translateY(${(1 - url) * 24}px)`,
        }}
      >
        hitman-cricket.vercel.app
      </div>
    </AbsoluteFill>
  );
};
