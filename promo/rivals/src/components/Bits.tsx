import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { theme } from '../theme';
import { pop } from '../lib';

/**
 * A line of display type that slams in: big, tilted and blurred, then lands.
 * Three properties at once, never a lone fade.
 */
export const Slam: React.FC<{
  text: React.ReactNode;
  delay: number;
  y: number;
  size: number;
  color?: string;
  exit?: number; // 0..1 remaining after exit
  tilt?: number;
  style?: React.CSSProperties;
  from?: number;
}> = ({ text, delay, y, size, color = '#fff', exit = 1, tilt = -5, style, from = 1.9 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(f, delay, fps, theme.spring.slam);
  const s = interpolate(p, [0, 1], [from, 1]);
  const o = interpolate(p, [0, 0.35], [0, 1], { extrapolateRight: 'clamp' });
  const blur = interpolate(p, [0, 0.6], [12, 0], { extrapolateRight: 'clamp' });
  const exitY = (1 - exit) * -60;
  return (
    <div
      style={{
        position: 'absolute', left: 0, right: 0, top: y - size * 0.55, textAlign: 'center',
        fontFamily: theme.fonts.display, fontSize: size, lineHeight: 1.05, color, letterSpacing: 1,
        opacity: o * exit, filter: blur > 0.3 ? `blur(${blur}px)` : undefined,
        transform: `translateY(${exitY}px) scale(${s * (1 + (1 - exit) * 0.15)}) rotate(${interpolate(p, [0, 1], [tilt, 0])}deg)`,
        textShadow: '0 10px 0 rgba(0,0,0,0.35), 0 20px 50px rgba(0,0,0,0.5)',
        whiteSpace: 'nowrap', ...style,
      }}
    >
      {text}
    </div>
  );
};

/** Words that rise in one after another. */
export const Words: React.FC<{
  text: string;
  delay: number;
  y: number;
  size: number;
  per?: number;
  color?: string;
  weight?: number;
  exit?: number;
  width?: number;
}> = ({ text, delay, y, size, per = 2, color = theme.colors.textDim, weight = 500, exit = 1, width = 920 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: 'absolute', left: (1080 - width) / 2, width, top: y, display: 'flex', flexWrap: 'wrap',
        justifyContent: 'center', columnGap: size * 0.28, rowGap: 4, opacity: exit,
        transform: `translateY(${(1 - exit) * -40}px)`,
      }}
    >
      {text.split(' ').map((w, i) => {
        const p = pop(f, delay + i * per, fps, theme.spring.snappy);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block', fontFamily: theme.fonts.body, fontWeight: weight, fontSize: size, color,
              opacity: Math.min(1, p * 1.4), transform: `translateY(${interpolate(p, [0, 1], [34, 0])}px)`,
              lineHeight: 1.2,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** The game's chunky button: a face, a darker edge under it, Jaro on top. */
export const GameButton: React.FC<{
  label: string;
  x: number;
  y: number;
  width: number;
  scale?: number;
  opacity?: number;
  pressed?: number; // 0..1
  face?: string;
  edge?: string;
  ink?: string;
  size?: number;
}> = ({ label, x, y, width, scale = 1, opacity = 1, pressed = 0, face = theme.colors.button, edge = theme.colors.buttonEdge, ink = '#fff', size = 58 }) => {
  const drop = 12 * (1 - pressed);
  return (
    <div
      style={{
        position: 'absolute', left: x - width / 2, top: y - 60 + (12 - drop), width, height: 120, borderRadius: 26,
        background: face, boxShadow: `0 ${drop}px 0 ${edge}, 0 ${drop + 20}px 40px rgba(0,0,0,0.45)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: theme.fonts.display, fontSize: size, color: ink, letterSpacing: 3,
        transform: `scale(${scale * (1 - pressed * 0.05)})`, opacity,
      }}
    >
      {label}
    </div>
  );
};

/** A chat message, sent (right, green) or received (left, grey). */
export const Bubble: React.FC<{
  text: string;
  mine: boolean;
  y: number;
  delay: number;
  side?: number; // distance from the edge
  size?: number;
  exit?: number;
}> = ({ text, mine, y, delay, side = 60, size = 46, exit = 1 }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(f, delay, fps, theme.spring.bouncy);
  if (f < delay) return null;
  return (
    <div
      style={{
        position: 'absolute', top: y, [mine ? 'right' : 'left']: side, maxWidth: 760,
        background: mine ? theme.colors.chatMine : theme.colors.chatTheirs,
        color: '#fff', fontFamily: theme.fonts.body, fontWeight: 600, fontSize: size, lineHeight: 1.2,
        padding: '22px 30px 18px', borderRadius: 30,
        [mine ? 'borderTopRightRadius' : 'borderTopLeftRadius']: 6,
        boxShadow: '0 20px 40px rgba(0,0,0,0.45)',
        transformOrigin: mine ? '100% 0%' : '0% 0%',
        transform: `scale(${interpolate(p, [0, 1], [0.3, 1])}) translateY(${interpolate(p, [0, 1], [30, 0])}px)`,
        opacity: Math.min(1, p * 2) * exit,
      } as React.CSSProperties}
    >
      {text}
      <span style={{ fontSize: size * 0.5, color: '#ffffff99', marginLeft: 18, fontWeight: 500 }}>9:41</span>
    </div>
  );
};
