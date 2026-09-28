import React from 'react';
import { AbsoluteFill, useVideoConfig, interpolate } from 'remotion';
import { at, theme } from '../theme';
import { ramp, pop, out, useSceneFrame } from '../lib';
import { BgMesh } from '../components/Layers';
import { Duel } from '../components/Duel';
import { Slam, Words } from '../components/Bits';

// Virat's balls, one every eight frames: what each went for.
export const BALLS = [
  { at: 6, runs: '4', color: theme.colors.four },
  { at: 14, runs: '1', color: '#ffffff' },
  { at: 22, runs: '6', color: theme.colors.six },
  { at: 30, runs: '•', color: '#ffffff' },
  { at: 38, runs: '2', color: '#ffffff' },
  { at: 46, runs: '4', color: theme.colors.four },
];
const FIRST_BALL = 20;

/**
 * The first selling point: you bat at the same time and watch each other's
 * balls land. The duel is exactly where the intro left it; the room turns Live
 * blue around it, and Virat's ring fills ball by ball.
 */
export const Live: React.FC = () => {
  const f = useSceneFrame();
  const { fps } = useVideoConfig();
  const done = BALLS.filter(b => f >= b.at).length;
  // the ring steps a ball at a time, easing into each step
  const stepped = BALLS.reduce((acc, b) => acc + ramp(f, [b.at, b.at + 5], [0, 1]), 0);
  // the ring draws round to where he has got to, then steps a ball at a time
  const progress = (ramp(f, [0, 7], [0, FIRST_BALL]) + stepped) / 30;
  const leave = out(f, 50, 58);
  const live = pop(f, 0, fps, theme.spring.bouncy);
  const needs = pop(f, 34, fps, theme.spring.snappy);
  const dot = 0.5 + 0.5 * Math.sin(f / 3);

  return (
    <AbsoluteFill>
      <BgMesh />
      {/* the Live screen's blue, rising from the bottom */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${theme.colors.live} 0%, #0a3a78 35%, transparent 75%)`,
          opacity: ramp(f, [0, 10], [0, 1]),
        }}
      />

      {/* LIVE tag */}
      <div
        style={{
          position: 'absolute', left: 540 - 110, top: 250, width: 220, height: 76, borderRadius: 38,
          background: theme.colors.lostPill, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16,
          fontFamily: theme.fonts.display, fontSize: 48, color: '#fff', letterSpacing: 3,
          transform: `scale(${live}) translateY(${(1 - leave) * -40}px)`, opacity: leave,
          boxShadow: '0 16px 40px rgba(226,32,45,0.35)',
        }}
      >
        <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', opacity: 0.4 + dot * 0.6 }} />
        LIVE
      </div>
      <Slam text="BAT AT THE SAME TIME" delay={2} y={430} size={104} exit={leave} tilt={-3} />
      <Words text="See every ball your mate hits, live." delay={8} y={520} size={48} exit={leave} width={1000} />

      <Duel
        progress={progress}
        youLine={
          <span style={{ fontFamily: theme.fonts.display, fontSize: 76, color: '#fff' }}>
            51<span style={{ fontSize: 40, color: theme.colors.textDim }}>/2</span>
          </span>
        }
        viratLine={
          <span style={{ fontFamily: theme.fonts.body, fontSize: 38, color: theme.colors.textDim, fontVariantNumeric: 'tabular-nums', opacity: leave }}>
            batting ball {FIRST_BALL + done} of 30
          </span>
        }
      />

      {/* each ball Virat hits flies out of his ring and across to you */}
      {BALLS.map((b, i) => {
        const t = f - b.at;
        if (t < 0 || t > 16) return null;
        const p = ramp(f, [b.at, b.at + 16], [0, 1], theme.ease.out);
        // from over Virat's head to over yours, arcing up between them
        const x = interpolate(p, [0, 1], [at.right.x, at.left.x]);
        const y = at.right.y - 190 - Math.sin(p * Math.PI) * 90;
        const s = pop(f, b.at, fps, theme.spring.bouncy);
        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x - 55, top: y - 55, width: 110, height: 110, borderRadius: '50%',
              background: '#0b1b2a', border: `5px solid ${b.color}`, color: b.color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: theme.fonts.display, fontSize: 70, lineHeight: 1,
              transform: `scale(${s})`, opacity: out(f, b.at + 10, b.at + 16),
              boxShadow: `0 0 40px ${b.color}66`,
            }}
          >
            {b.runs}
          </div>
        );
      })}

      {/* the chase, as the room words it */}
      <div
        style={{
          position: 'absolute', left: 90, top: 1440, width: 900, height: 140, borderRadius: 30,
          background: '#06213fcc', border: '2px solid #ffffff22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.fonts.body, fontWeight: 800, fontSize: 60, color: '#fff',
          opacity: Math.min(1, needs * 2) * leave,
          transform: `translateY(${interpolate(needs, [0, 1], [80, 0]) + (1 - leave) * 50}px) scale(${interpolate(needs, [0, 1], [0.92, 1])})`,
        }}
      >
        Virat needs 12 off 4 balls
      </div>
    </AbsoluteFill>
  );
};
