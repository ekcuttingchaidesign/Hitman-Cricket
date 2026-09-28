import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { theme } from '../theme';

/** Never a flat background: two soft glows drifting over the base. */
export const BgMesh: React.FC<{ base?: string; a?: string; b?: string; opacity?: number }> = ({
  base = theme.colors.bg,
  a = theme.colors.navy,
  b = theme.colors.hero,
  opacity = 1,
}) => {
  const f = useCurrentFrame();
  const d1 = Math.sin(f / 40) * 60;
  const d2 = Math.cos(f / 52) * 50;
  return (
    <AbsoluteFill style={{ background: base, opacity }}>
      <div
        style={{
          position: 'absolute', width: 1500, height: 1500, borderRadius: '50%', top: -500, left: -400 + d1,
          filter: 'blur(40px)', background: `radial-gradient(circle, ${a}cc, transparent 62%)`,
        }}
      />
      <div
        style={{
          position: 'absolute', width: 1200, height: 1200, borderRadius: '50%', bottom: -500, right: -400 - d2,
          filter: 'blur(60px)', background: `radial-gradient(circle, ${b}33, transparent 65%)`,
        }}
      />
    </AbsoluteFill>
  );
};

/** Pulls the game art, the drawn UI and the type into one look. */
export const Grade: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill style={{ backgroundColor: theme.colors.hero, mixBlendMode: 'soft-light', opacity: 0.1 }} />
    <AbsoluteFill
      style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.18), transparent 22%, transparent 78%, rgba(0,0,0,0.25))' }}
    />
  </AbsoluteFill>
);

const noise = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E")`;

export const Grain: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none', backgroundImage: noise, backgroundSize: '220px',
        backgroundPosition: `${(f * 7) % 220}px ${(f * 13) % 220}px`, opacity: 0.09, mixBlendMode: 'overlay',
      }}
    />
  );
};

export const Vignette: React.FC = () => (
  <AbsoluteFill
    style={{ pointerEvents: 'none', background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.42) 100%)' }}
  />
);

/** A white flash for a hard cut. */
export const Flash: React.FC<{ at: number; len?: number; color?: string; peak?: number }> = ({
  at, len = 7, color = '#fff', peak = 0.7,
}) => {
  const f = useCurrentFrame();
  const t = f - at;
  if (t < 0 || t > len) return null;
  const o = peak * Math.pow(1 - t / len, 2);
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: 'none' }} />;
};
