import React from 'react';
import { Img, staticFile } from 'remotion';
import { theme } from '../theme';

/**
 * A player's face the way the game draws it: the picture on a disc of its own
 * ring colour, a light rim, and optionally the progress ring that fills ball by
 * ball while somebody bats.
 */
export const Avatar: React.FC<{
  src: string;
  ring: string;
  size: number;
  x: number;
  y: number;
  scale?: number;
  opacity?: number;
  rotate?: number;
  progress?: number; // 0..1, the live batting ring
  glow?: string;
  gray?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({ src, ring, size, x, y, scale = 1, opacity = 1, rotate = 0, progress, glow, gray = 0, style, children }) => {
  const r = size / 2 + size * 0.09;
  const c = 2 * Math.PI * r;
  const box = size * 1.3;
  return (
    <div
      style={{
        position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size,
        transform: `scale(${scale}) rotate(${rotate}deg)`, opacity, ...style,
      }}
    >
      {progress !== undefined && (
        <svg
          width={box}
          height={box}
          style={{ position: 'absolute', left: (size - box) / 2, top: (size - box) / 2, overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={theme.colors.hero} />
              <stop offset="100%" stopColor={theme.colors.gold} />
            </linearGradient>
          </defs>
          <circle cx={box / 2} cy={box / 2} r={r} fill="none" stroke="#ffffff22" strokeWidth={size * 0.045} />
          <circle
            cx={box / 2} cy={box / 2} r={r} fill="none" stroke="url(#ring)" strokeWidth={size * 0.045}
            strokeLinecap="round" strokeDasharray={`${c * progress} ${c}`}
            transform={`rotate(-90 ${box / 2} ${box / 2})`}
            style={{ filter: `drop-shadow(0 0 ${size * 0.06}px ${theme.colors.hero}aa)` }}
          />
        </svg>
      )}
      <div
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: ring, overflow: 'hidden',
          border: `${Math.max(4, size * 0.035)}px solid #7cc4ea`,
          boxShadow: `0 ${size * 0.06}px ${size * 0.18}px rgba(0,0,0,0.5)${glow ? `, 0 0 ${size * 0.35}px ${glow}` : ''}`,
          filter: gray ? `grayscale(${gray}) brightness(${1 - gray * 0.35})` : undefined,
        }}
      >
        <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      {children}
    </div>
  );
};

/** The crown the board puts over first place. */
export const Crown: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <svg width={size} height={size * 0.72} viewBox="0 0 100 72" style={style}>
    <path
      d="M6 62 L0 14 L28 36 L50 4 L72 36 L100 14 L94 62 Z"
      fill={theme.colors.gold} stroke="#b07a10" strokeWidth="3" strokeLinejoin="round"
    />
    <rect x="6" y="58" width="88" height="12" rx="4" fill="#f2a91e" stroke="#b07a10" strokeWidth="3" />
    <circle cx="50" cy="4" r="5" fill="#fff3c4" />
    <circle cx="0" cy="14" r="4" fill="#fff3c4" />
    <circle cx="100" cy="14" r="4" fill="#fff3c4" />
  </svg>
);
