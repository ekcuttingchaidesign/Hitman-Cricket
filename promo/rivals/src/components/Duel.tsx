import React from 'react';
import { at, people, theme } from '../theme';
import { breathe, useSceneFrame } from '../lib';
import { Avatar } from './Avatar';

/**
 * The two faces with VS between them, exactly as the Live screen lays them out.
 * Drawn by the intro and by the live scene at the same positions, so the cut
 * between them is invisible: only what is around the faces changes.
 */
export const Duel: React.FC<{
  leftIn?: number; // 0..1 slide-in progress
  rightIn?: number;
  vsScale?: number;
  vsOpacity?: number;
  vsBlur?: number;
  progress?: number;
  youLine?: React.ReactNode;
  viratLine?: React.ReactNode;
  namesOpacity?: number;
}> = ({ leftIn = 1, rightIn = 1, vsScale = 1, vsOpacity = 1, vsBlur = 0, progress, youLine, viratLine, namesOpacity = 1 }) => {
  const f = useSceneFrame();
  const b = breathe(f + 0, 0.012, 20);
  const b2 = breathe(f + 17, 0.012, 20);
  const size = at.duelSize;
  const lx = at.left.x - (1 - leftIn) * 700;
  const rx = at.right.x + (1 - rightIn) * 700;
  const labelY = at.vs.y + size / 2 + 40;
  return (
    <>
      <Avatar
        src={people.you.avatar} ring={people.you.ring} size={size} x={lx} y={at.left.y}
        scale={b} rotate={(1 - leftIn) * -25}
      />
      <Avatar
        src={people.virat.avatar} ring={people.virat.ring} size={size} x={rx} y={at.right.y}
        scale={b2} rotate={(1 - rightIn) * 25} progress={progress}
      />
      <div
        style={{
          position: 'absolute', left: at.vs.x - 200, top: at.vs.y - 110, width: 400, height: 220,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.fonts.display, fontSize: 150, color: theme.colors.hero,
          transform: `scale(${vsScale}) skewX(-8deg)`, opacity: vsOpacity,
          filter: vsBlur > 0.3 ? `blur(${vsBlur}px)` : undefined,
          textShadow: `0 0 60px ${theme.colors.hero}88, 0 8px 0 #7a2c10`,
        }}
      >
        VS
      </div>
      <div style={{ opacity: namesOpacity }}>
        <Label x={lx} y={labelY} name="You" line={youLine} />
        <Label x={rx} y={labelY} name="Virat" line={viratLine} />
      </div>
    </>
  );
};

const Label: React.FC<{ x: number; y: number; name: string; line?: React.ReactNode }> = ({ x, y, name, line }) => (
  <div style={{ position: 'absolute', left: x - 220, top: y, width: 440, textAlign: 'center' }}>
    <div style={{ fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 54, color: '#fff' }}>{name}</div>
    <div style={{ marginTop: 8, height: 80, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{line}</div>
  </div>
);
