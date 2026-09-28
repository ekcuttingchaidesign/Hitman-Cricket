import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { at, people, theme } from '../theme';
import { ramp, pop, out } from '../lib';
import { BgMesh } from '../components/Layers';
import { Avatar, Crown } from '../components/Avatar';
import { BoardRow } from '../components/Rows';
import { Slam, Words } from '../components/Bits';

const ROWS = [
  { name: 'Rohit', avatar: 'avatars/avatar_7.webp', ring: theme.kits.pink, won: 34, lost: 3, runs: 2146 },
  { name: 'Bumrah', avatar: 'avatars/avatar_1.webp', ring: theme.kits.blue, won: 34, lost: 10, runs: 3124 },
  { name: 'Hardik', avatar: 'avatars/avatar_2.webp', ring: theme.kits.purple, won: 33, lost: 6, runs: 3276 },
  { name: 'Shreyas', avatar: 'avatars/avatar_6.webp', ring: theme.kits.teal, won: 32, lost: 9, runs: 2870 },
  { name: 'Ishan', avatar: 'avatars/avatar_1.webp', ring: theme.kits.blue, won: 32, lost: 13, runs: 4365 },
  { name: 'Surya', avatar: 'avatars/avatar_7.webp', ring: theme.kits.pink, won: 31, lost: 5, runs: 2988 },
  { name: 'Kuldeep', avatar: 'avatars/avatar_2.webp', ring: theme.kits.purple, won: 30, lost: 8, runs: 2622 },
];
const TOP = 540;
const GAP = 126;
export const CLIMB = [18, 34] as const;
export const CROWN = 34;

/** Where your row is on the board, 7 (eighth) to 0 (first). */
export const climb = (f: number) => ramp(f, [CLIMB[0], CLIMB[1]], [7, 0], theme.ease.inOut);

// Where the avatar in your row sits when you are first.
const ROW_AVATAR = { x: 60 + 28 + 70 + 16 + 46, y: TOP + 59, size: 92 };

/**
 * The Rivals board. Seven rows cascade in with you eighth, then you climb:
 * each row you pass drops a place, your wins tick up, and at the top the crown
 * lands on your face. Your face then lifts out of the row into the end card.
 */
export const Board: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = climb(f);
  const wins = 30 + Math.round(((7 - p) / 7) * 5);
  const runs = Math.round(interpolate(p, [0, 7], [4410, 4032]));
  const crown = pop(f, CROWN, fps, theme.spring.bouncy);
  const leave = out(f, 50, 57);
  const lift = ramp(f, [50, 60], [0, 1], theme.ease.inOut);
  const glow = ramp(f, [CROWN - 2, CROWN + 4], [0, 1]);

  const heroX = interpolate(lift, [0, 1], [ROW_AVATAR.x, at.crown.x]);
  const heroY = interpolate(lift, [0, 1], [TOP + p * GAP + 59, at.crown.y]);
  const heroSize = interpolate(lift, [0, 1], [ROW_AVATAR.size, at.crown.size]);

  return (
    <AbsoluteFill>
      <BgMesh base="#0b2238" a={theme.colors.board} b={theme.colors.hero} />
      <div style={{ opacity: leave, transform: `translateY(${(1 - leave) * -60}px)` }}>
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 250, textAlign: 'center', fontFamily: theme.fonts.body,
            fontWeight: 700, fontSize: 34, letterSpacing: 10, color: theme.colors.quiet,
            opacity: ramp(f, [0, 6], [0, 1]), transform: `translateY(${ramp(f, [0, 8], [20, 0])}px)`,
          }}
        >
          ALL TIME
        </div>
        <Slam text="RIVALS BOARD" delay={1} y={370} size={150} tilt={-3} />
        <Words text="Ranked on wins. Kept forever." delay={6} y={446} size={46} />
      </div>

      {ROWS.map((row, i) => {
        // a row gets out of the way as soon as yours reaches it
        const shift = ramp(i + 1 - p, [0, 1], [0, 1], theme.ease.out);
        const enter = pop(f, 2 + i * 2, fps, theme.spring.snappy);
        return (
          <BoardRow
            key={row.name}
            rank={i + 1 + Math.round(shift)}
            {...row}
            y={TOP + (i + shift) * GAP + interpolate(enter, [0, 1], [60, 0])}
            opacity={Math.min(1, enter * 2) * leave}
          />
        );
      })}
      {(() => {
        const enter = pop(f, 2 + 7 * 2, fps, theme.spring.snappy);
        return (
          <BoardRow
            rank={Math.round(p) + 1}
            name="You" avatar={people.you.avatar} ring={people.you.ring} won={wins} lost={12} runs={runs} you
            y={TOP + p * GAP + interpolate(enter, [0, 1], [60, 0])}
            x={Math.sin(Math.min(1, Math.max(0, (f - CLIMB[0]) / 20)) * Math.PI) * 24}
            opacity={Math.min(1, enter * 2) * leave} hideAvatar glow={glow}
          />
        );
      })()}

      {/* your face: in the row while you climb, then lifted out of it */}
      <Avatar
        src={people.you.avatar} ring={people.you.ring} size={heroSize} x={heroX} y={heroY}
        opacity={Math.min(1, pop(f, 16, fps) * 2)} style={{ zIndex: 10 }}
      >
        <Crown
          size={heroSize * 0.62}
          style={{
            position: 'absolute', left: heroSize * 0.19, top: -heroSize * 0.5,
            transform: `scale(${crown}) rotate(${interpolate(crown, [0, 1], [-30, -8])}deg)`, opacity: Math.min(1, crown * 2),
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.5))',
          }}
        />
      </Avatar>

      <Words text="Top of the board." delay={CROWN + 2} y={1540} size={52} color="#fff" weight={800} exit={leave} />
      <Words text="Top of the group chat." delay={CROWN + 6} y={1610} size={52} color={theme.colors.textDim} weight={800} exit={leave} />
    </AbsoluteFill>
  );
};
