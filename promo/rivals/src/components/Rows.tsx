import React from 'react';
import { Img, staticFile } from 'remotion';
import { theme } from '../theme';

const display = theme.fonts.display;
const body = theme.fonts.body;

/** The WINNER / LOSER row off the result screen, drawn at video size. */
export const VerdictRow: React.FC<{
  avatar: string;
  ring: string;
  name: string;
  won: boolean;
  sixes: number;
  fours: number;
  balls: number;
  runs: number;
  wickets: number;
  y: number;
  x?: number;
  scale?: number;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({ avatar, ring, name, won, sixes, fours, balls, runs, wickets, y, x = 0, scale = 1, opacity = 1, style }) => {
  const tone = won ? theme.colors.won : theme.colors.lost;
  return (
    <div
      style={{
        position: 'absolute', left: 60, top: y - 80, width: 960, height: 160, borderRadius: 24,
        background: theme.colors.row, border: `4px solid ${won ? theme.colors.rowWon : theme.colors.lost}`,
        display: 'flex', alignItems: 'center', padding: '0 36px', boxSizing: 'border-box',
        transform: `translateX(${x}px) scale(${scale})`, opacity,
        boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)', ...style,
      }}
    >
      <div
        style={{
          width: 104, height: 104, borderRadius: '50%', overflow: 'hidden', background: ring, flexShrink: 0,
          border: '4px solid #7cc4ea',
        }}
      >
        <Img src={staticFile(avatar)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ marginLeft: 30, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <span style={{ fontFamily: body, fontWeight: 700, fontSize: 50, color: '#fff' }}>{name}</span>
          <span
            style={{
              fontFamily: body, fontWeight: 700, fontSize: 30, letterSpacing: 1, padding: '6px 18px', borderRadius: 10,
              background: won ? theme.colors.won : theme.colors.lostPill, color: won ? '#000' : '#fff',
            }}
          >
            {won ? 'WINNER' : 'LOSER'}
          </span>
        </div>
        <div style={{ fontFamily: body, fontSize: 36, marginTop: 6, color: theme.colors.textDim, display: 'flex', gap: 26 }}>
          <span><span style={{ color: theme.colors.six }}>6s:</span> {sixes}</span>
          <span><span style={{ color: theme.colors.four }}>4s:</span> {fours}</span>
          <span>{balls} balls</span>
        </div>
      </div>
      <div style={{ fontFamily: display, color: tone, fontSize: 104, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {runs}
        <span style={{ fontSize: 50 }}>/{wickets}</span>
      </div>
    </div>
  );
};

/** One line of the Rivals board. */
export const BoardRow: React.FC<{
  rank: number;
  avatar: string;
  ring: string;
  name: string;
  won: number;
  lost: number;
  runs: number;
  you?: boolean;
  y: number;
  opacity?: number;
  x?: number;
  hideAvatar?: boolean;
  glow?: number;
}> = ({ rank, avatar, ring, name, won, lost, runs, you, y, opacity = 1, x = 0, hideAvatar, glow = 0 }) => (
  <div
    style={{
      position: 'absolute', left: 60, top: y, width: 960, height: 118, borderRadius: 22,
      display: 'flex', alignItems: 'center', boxSizing: 'border-box', padding: '0 28px',
      // opaque, so the rows it passes on the way up do not show through it
      background: you ? 'linear-gradient(90deg, #6a3a27, #2f2a33)' : 'transparent',
      borderBottom: you ? 'none' : '2px solid #ffffff14',
      boxShadow: you ? `0 20px 50px -10px rgba(0,0,0,0.6), 0 0 ${60 * glow}px ${theme.colors.hero}${Math.round(glow * 140).toString(16).padStart(2, '0')}` : undefined,
      opacity, transform: `translateX(${x}px)`, zIndex: you ? 5 : 1,
    }}
  >
    <div
      style={{
        width: 70, fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 44, textAlign: 'center',
        color: you ? theme.colors.hero : theme.colors.quiet, fontVariantNumeric: 'tabular-nums',
      }}
    >
      {rank}
    </div>
    <div
      style={{
        width: 92, height: 92, marginLeft: 16, borderRadius: '50%', overflow: 'hidden', background: ring,
        border: '3px solid #ffffff55', opacity: hideAvatar ? 0 : 1, flexShrink: 0,
      }}
    >
      <Img src={staticFile(avatar)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
    <div
      style={{
        marginLeft: 24, flex: 1, fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 48,
        color: you ? theme.colors.hero : '#fff',
      }}
    >
      {name}
    </div>
    <Stat value={won} label="won" color={theme.colors.won} />
    <Stat value={lost} label="lost" color={theme.colors.lost} />
    <Stat value={runs.toLocaleString('en-US')} label="runs" color="#fff" wide />
  </div>
);

const Stat: React.FC<{ value: React.ReactNode; label: string; color: string; wide?: boolean }> = ({ value, label, color, wide }) => (
  <div style={{ width: wide ? 170 : 130, textAlign: wide ? 'right' : 'center', fontFamily: theme.fonts.body, lineHeight: 1 }}>
    <div style={{ fontWeight: 700, fontSize: 46, color, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    <div style={{ fontSize: 26, color: theme.colors.quiet, marginTop: 6 }}>{label}</div>
  </div>
);
