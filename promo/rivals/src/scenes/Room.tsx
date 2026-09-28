import React from 'react';
import { AbsoluteFill, useVideoConfig, interpolate } from 'remotion';
import { at, people, theme } from '../theme';
import { ramp, pop, out, shake, breathe, useSceneFrame } from '../lib';
import { BgMesh } from '../components/Layers';
import { Avatar } from '../components/Avatar';
import { Slam, Words } from '../components/Bits';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Two more selling points, one beat each. First: nobody sees a score until
 * their own last ball, so your 51 is locked away. Then the forwarded link:
 * two more faces take seats and the room holds four. On the last beat your
 * face lifts to the top of the frame, where the result scene crowns it.
 */
export const Room: React.FC = () => {
  const f = useSceneFrame();
  const { fps } = useVideoConfig();

  // beat 1: the lock
  const blur = ramp(f, [2, 8], [0, 16]);
  const lock = pop(f, 5, fps, theme.spring.slam);
  const s = shake(f, 6, 8, 12);
  const firstOut = out(f, 21, 27);

  // beat 2: four seats
  const seat = ramp(f, [22, 31], [0, 1], theme.ease.inOut);
  const amit = pop(f, 26, fps, theme.spring.bouncy);
  const rohit = pop(f, 29, fps, theme.spring.bouncy);
  const secondOut = out(f, 48, 54);

  // the lift into the result
  const lift = ramp(f, [49, 60], [0, 1], theme.ease.inOut);
  const others = out(f, 47, 53);

  const row = { y: 1000, size: 190, xs: [168, 416, 664, 912] };
  const youX = mix(mix(at.left.x, row.xs[0], seat), at.winner.x, lift);
  const youY = mix(mix(at.left.y, row.y, seat), at.winner.y, lift);
  const youSize = mix(mix(at.duelSize, row.size, seat), at.winner.size, lift);
  const vX = mix(at.right.x, row.xs[1], seat);
  const vY = mix(at.right.y, row.y, seat);
  const vSize = mix(at.duelSize, row.size, seat);
  const b = breathe(f, 0.012, 20);

  const name = (x: number, y: number, n: string, o: number) => (
    <div
      style={{
        position: 'absolute', left: x - 150, top: y, width: 300, textAlign: 'center', opacity: o,
        fontFamily: theme.fonts.body, fontWeight: 700, fontSize: seat > 0.5 ? 40 : 54, color: '#fff',
      }}
    >
      {n}
    </div>
  );

  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
      <BgMesh />
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 100%, ${theme.colors.live} 0%, #0a3a78 35%, transparent 75%)`,
          opacity: out(f, 40, 58),
        }}
      />
      {/* warm light gathering where the winner will stand */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 31%, ${theme.colors.warm} 0%, transparent 45%)`,
          opacity: lift,
        }}
      />

      <Slam text="NO PEEKING." delay={0} y={400} size={150} exit={firstOut} tilt={4} />
      <Words text="Scores stay hidden till your last ball." delay={4} y={500} size={48} exit={firstOut} />
      <Slam text="UP TO 4 IN A ROOM" delay={24} y={400} size={128} exit={secondOut} tilt={-3} />
      <Words text="Forward the link. Make it a group chat problem." delay={28} y={500} size={48} exit={secondOut} />

      {/* VS gives way to the row of four */}
      <div
        style={{
          position: 'absolute', left: at.vs.x - 200, top: at.vs.y - 110, width: 400, height: 220,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: theme.fonts.display, fontSize: 150, color: theme.colors.hero,
          transform: `scale(${1 - seat * 0.6}) skewX(-8deg)`, opacity: 1 - seat,
          textShadow: `0 0 60px ${theme.colors.hero}88, 0 8px 0 #7a2c10`,
        }}
      >
        VS
      </div>

      <Avatar src={people.virat.avatar} ring={people.virat.ring} size={vSize} x={vX} y={vY} scale={b} opacity={others}
        progress={seat < 1 ? 26 / 30 : undefined} style={{ opacity: others * (seat < 1 ? 1 : 1) }} />
      <Avatar src={people.amit.avatar} ring={people.amit.ring} size={row.size} x={row.xs[2]} y={row.y}
        scale={amit * b} opacity={Math.min(1, amit * 2) * others} rotate={(1 - amit) * 30} />
      <Avatar src={people.rohit.avatar} ring={people.rohit.ring} size={row.size} x={row.xs[3]} y={row.y}
        scale={rohit * b} opacity={Math.min(1, rohit * 2) * others} rotate={(1 - rohit) * 30} />
      <Avatar src={people.you.avatar} ring={people.you.ring} size={youSize} x={youX} y={youY} scale={b} />

      {/* names: two, then four */}
      {name(mix(at.left.x, row.xs[0], seat), mix(at.left.y + at.duelSize / 2 + 40, row.y + row.size / 2 + 26, seat), 'You', 1 - lift * 3)}
      {name(vX, mix(at.right.y + at.duelSize / 2 + 40, row.y + row.size / 2 + 26, seat), 'Virat', others)}
      {name(row.xs[2], row.y + row.size / 2 + 26, 'Amit', Math.min(1, amit * 2) * others)}
      {name(row.xs[3], row.y + row.size / 2 + 26, 'Rohit', Math.min(1, rohit * 2) * others)}

      {/* your 51, locked away */}
      <div
        style={{
          position: 'absolute', left: at.left.x - 150, top: at.left.y + at.duelSize / 2 + 116, width: 300, height: 90,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: firstOut,
        }}
      >
        <span style={{ fontFamily: theme.fonts.display, fontSize: 76, color: '#fff', filter: `blur(${blur}px)` }}>
          51<span style={{ fontSize: 40, color: theme.colors.textDim }}>/2</span>
        </span>
        <div
          style={{
            position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transform: `scale(${interpolate(lock, [0, 1], [2.4, 1])}) rotate(${interpolate(lock, [0, 1], [-30, -8])}deg)`,
            opacity: Math.min(1, lock * 2), boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          }}
        >
          <svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke={theme.colors.bg} strokeWidth="2.6" strokeLinecap="round">
            <rect x="5" y="11" width="14" height="10" rx="2" fill={theme.colors.bg} />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
        </div>
      </div>
    </AbsoluteFill>
  );
};
