import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { theme } from '../theme';
import { ramp, pop, out, shake } from '../lib';
import { BgMesh } from '../components/Layers';
import { Duel } from '../components/Duel';
import { Slam, Words } from '../components/Bits';

/**
 * What Rivals is. VS comes out of the gap the hook dived into, RIVALS lands
 * over it, the two faces slide in, and one link becomes one match: sent, and
 * the friend has joined. It ends on the bare duel, which the live scene opens on.
 */
export const Intro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const vs = ramp(f, [0, 9], [0, 1]);
  const left = pop(f, 7, fps, theme.spring.snappy);
  const right = pop(f, 10, fps, theme.spring.snappy);
  const leave = out(f, 50, 58);
  const s = shake(f, 0, 9, 14);

  // The link: slides up, is tapped, is sent.
  const pill = pop(f, 26, fps, theme.spring.snappy);
  const tap = f >= 36 && f < 40 ? 1 : 0;
  const sent = ramp(f, [38, 44], [0, 1]);
  const ripple = ramp(f, [38, 50], [0, 1]);
  const joined = pop(f, 42, fps, theme.spring.bouncy);

  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
      <BgMesh />
      {/* rays behind VS, the burst it arrives with */}
      <div style={{ position: 'absolute', left: 540, top: 960, opacity: ramp(f, [0, 3], [0, 1]) * out(f, 10, 22) }}>
        {Array.from({ length: 14 }).map((_, i) => {
          const p = pop(f, i * 0.6, fps, theme.spring.snappy);
          return (
            <div
              key={i}
              style={{
                position: 'absolute', width: 16, height: 520 * p, left: -8, top: 0, borderRadius: 16,
                background: `linear-gradient(180deg, ${theme.colors.hero}00, ${theme.colors.hero})`,
                transformOrigin: '50% 0%', transform: `rotate(${(360 / 14) * i}deg) translateY(90px)`,
              }}
            />
          );
        })}
      </div>

      <Duel
        leftIn={left} rightIn={right}
        vsScale={interpolate(vs, [0, 1], [6, 1])} vsOpacity={Math.min(1, vs * 3)} vsBlur={(1 - vs) * 20}
        namesOpacity={Math.min(left, right)}
        viratLine={
          <span
            style={{
              fontFamily: theme.fonts.body, fontWeight: 700, fontSize: 32, letterSpacing: 2, color: '#000',
              background: theme.colors.won, padding: '8px 20px', borderRadius: 10,
              transform: `scale(${joined})`, display: 'inline-block', opacity: Math.min(1, joined * 2) * leave,
            }}
          >
            JOINED
          </span>
        }
      />

      <Slam text="RIVALS" delay={3} y={520} size={260} exit={leave} from={2.4} tilt={-3}
        style={{ backgroundImage: theme.colors.cream, WebkitBackgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 12px 0 rgba(0,0,0,0.35))' }}
      />
      <Words text="Challenge a mate. One link, one match." delay={14} y={690} size={48} exit={leave} width={1000} />

      {/* the link pill */}
      <div
        style={{
          position: 'absolute', left: 90, top: 1440, width: 900, height: 130, borderRadius: 65,
          background: theme.colors.row, border: `3px solid ${theme.colors.rowWon}`,
          display: 'flex', alignItems: 'center', padding: '0 20px 0 44px', boxSizing: 'border-box',
          opacity: Math.min(1, pill * 2) * leave,
          transform: `translateY(${interpolate(pill, [0, 1], [120, 0]) + (1 - leave) * 60}px) scale(${interpolate(pill, [0, 1], [0.9, 1])})`,
          boxShadow: '0 30px 60px -20px rgba(0,0,0,0.7)',
        }}
      >
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke={theme.colors.textDim} strokeWidth="2.4" strokeLinecap="round">
          <path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
        </svg>
        <div style={{ flex: 1, marginLeft: 20, fontFamily: theme.fonts.body, fontWeight: 600, fontSize: 40, color: '#fff' }}>
          hitman-cricket.vercel.app/?c=RV7K
        </div>
        <div
          style={{
            width: 96, height: 96, borderRadius: '50%', background: theme.colors.button, position: 'relative',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${tap ? 0.86 : 1 + sent * 0.06 * (1 - ripple)})`,
          }}
        >
          <div
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%', border: `4px solid ${theme.colors.won}`,
              transform: `scale(${1 + ripple * 1.2})`, opacity: f >= 38 ? 1 - ripple : 0,
            }}
          />
          {sent < 0.5 ? (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="#fff" style={{ opacity: 1 - sent * 2 }}>
              <path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5Z" />
            </svg>
          ) : (
            <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12.5 9.5 18 20 6" strokeDasharray="24" strokeDashoffset={24 * (1 - (sent - 0.5) * 2)} />
            </svg>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
