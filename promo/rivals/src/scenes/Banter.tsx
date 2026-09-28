import React from 'react';
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { at, people, theme } from '../theme';
import { ramp, pop } from '../lib';
import { GameButton, Bubble } from '../components/Bits';
import { VerdictRow } from '../components/Rows';
import { ResultBg } from './Result';

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
// The seam runs slightly uphill, left to right.
const SEAM = { left: 1020, right: 900 };
const WIN_Y = 330;
const LOSE_Y = 1600;

/**
 * The rage bait. The WINNER and LOSER rows are where the result left them;
 * they fly apart and open the screen into two: the winner chaired off at the
 * top, the loser on his knees at the bottom. Each gets the game's own button,
 * RUB IT IN and SEND AN EXCUSE, and the chat does the rest.
 */
export const Banter: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const r = ramp(f, [0, 11], [0, 1], theme.ease.inOut);

  const topPoly = `polygon(0 ${mix(SEAM.left, 0, r)}px, 1080px ${mix(SEAM.right, 0, r)}px, 1080px ${SEAM.right}px, 0 ${SEAM.left}px)`;
  const botPoly = `polygon(0 ${SEAM.left}px, 1080px ${SEAM.right}px, 1080px ${mix(SEAM.right, 1920, r)}px, 0 ${mix(SEAM.left, 1920, r)}px)`;

  const rub = pop(f, 10, fps, theme.spring.bouncy);
  const rubPress = f >= 16 && f <= 19 ? 1 : 0;
  const excuse = pop(f, 31, fps, theme.spring.bouncy);
  const excusePress = f >= 36 && f <= 39 ? 1 : 0;
  // the winner's side drifts in, the loser's drifts out: Ken Burns both ways
  const kbTop = ramp(f, [0, 75], [1.12, 1.22], theme.ease.inOut);
  const kbBot = ramp(f, [0, 75], [1.2, 1.1], theme.ease.inOut);
  const seamGlow = 0.6 + 0.4 * Math.sin(f / 4);

  return (
    <AbsoluteFill>
      <ResultBg />
      {/* the winner, chaired off */}
      <AbsoluteFill style={{ clipPath: topPoly }}>
        <div style={{ position: 'absolute', left: -366, top: 0, width: 1812, height: 1020, transform: `scale(${kbTop})`, transformOrigin: '50% 30%' }}>
          <Img src={staticFile('art/match_won.png')} style={{ width: '100%', height: '100%', filter: 'saturate(1.15) contrast(1.05)' }} />
        </div>
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(7,17,26,0.55) 0%, transparent 40%, rgba(7,17,26,0.35) 100%)' }} />
      </AbsoluteFill>
      {/* the loser, on his knees */}
      <AbsoluteFill style={{ clipPath: botPoly }}>
        <div style={{ position: 'absolute', left: -366, top: 900, width: 1812, height: 1020, transform: `scale(${kbBot})`, transformOrigin: '42% 60%' }}>
          <Img src={staticFile('art/match_lost_hurt.png')} style={{ width: '100%', height: '100%', filter: 'saturate(0.45) brightness(0.8) contrast(1.05)' }} />
        </div>
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(10,40,90,0.35) 45%, rgba(7,17,26,0.75) 100%)', mixBlendMode: 'multiply' }} />
      </AbsoluteFill>
      {/* the seam */}
      <div
        style={{
          position: 'absolute', left: 540 - 560, top: 960 - 6, width: 1120, height: 12, borderRadius: 6,
          background: theme.colors.hero, transform: `rotate(${-6.34}deg) scaleX(${r})`,
          boxShadow: `0 0 ${30 * seamGlow}px ${theme.colors.hero}, 0 0 ${80 * seamGlow}px ${theme.colors.hero}88`,
        }}
      />

      <VerdictRow
        avatar={people.you.avatar} ring={people.you.ring} name="You" won sixes={3} fours={4} balls={30}
        runs={51} wickets={2} y={mix(at.rowWon, WIN_Y, r)} scale={mix(1, 0.92, r)}
      />
      <VerdictRow
        avatar={people.virat.avatar} ring={people.virat.ring} name="Virat" won={false} sixes={1} fours={3} balls={28}
        runs={37} wickets={3} y={mix(at.rowLost, LOSE_Y, r)} scale={mix(1, 0.92, r)}
      />

      {/* top: the winner's side of the chat */}
      <GameButton label="RUB IT IN" x={540} y={530} width={520} scale={rub} opacity={Math.min(1, rub * 2)} pressed={rubPress} />
      <Bubble text="51 > 37. Just saying." mine y={640} delay={18} />
      <Bubble text="I’ll bat one-handed next time" mine y={760} delay={25} />

      {/* bottom: the loser's */}
      <GameButton label="SEND AN EXCUSE" x={540} y={1110} width={640} scale={excuse} opacity={Math.min(1, excuse * 2)} pressed={excusePress} />
      <Bubble text="my thumb slipped" mine={false} y={1220} delay={38} />
      <Bubble text="Rematch? Or are you scared?" mine y={1340} delay={49} />

      {/* a tap on each button, so it reads as pressed */}
      {[16, 36].map(t => {
        const p = ramp(f, [t, t + 10], [0, 1]);
        if (f < t || f > t + 10) return null;
        const y = t === 16 ? 530 : 1110;
        return (
          <div
            key={t}
            style={{
              position: 'absolute', left: 700 - 60, top: y - 60 + 20, width: 120, height: 120, borderRadius: '50%',
              border: '6px solid #fff', opacity: 1 - p, transform: `scale(${interpolate(p, [0, 1], [0.4, 1.6])})`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};
