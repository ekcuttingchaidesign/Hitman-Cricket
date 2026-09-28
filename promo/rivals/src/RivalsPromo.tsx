import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, interpolate } from 'remotion';
import { scenes, theme } from './theme';
import { ramp } from './lib';
import { Grade, Grain, Vignette, Flash } from './components/Layers';
import { Hook } from './scenes/Hook';
import { Intro } from './scenes/Intro';
import { Live, BALLS } from './scenes/Live';
import { Room } from './scenes/Room';
import { Result } from './scenes/Result';
import { Banter } from './scenes/Banter';
import { Board, climb, CROWN } from './scenes/Board';
import { Cta } from './scenes/Cta';

const span = (s: readonly [number, number]) => ({ from: s[0], durationInFrames: s[1] - s[0] });

/** The frames your row passes another on the board, one tick each. */
const overtakes = (() => {
  const out: number[] = [];
  let last = Math.round(climb(0));
  for (let f = 1; f < 60; f++) {
    const now = Math.round(climb(f));
    if (now !== last) out.push(scenes.board[0] + f - 1);
    last = now;
  }
  return out;
})();

// Every sound, placed two or three frames before the thing it belongs to lands.
const SFX: [number, string, number][] = [
  [0, 'hit', 0.7], [8, 'pop', 0.7], [16, 'pop', 0.8], [31, 'whoosh', 0.9], [43, 'hit', 0.9],
  [50, 'pop', 0.6], [53, 'pop', 0.6], [69, 'pop', 0.6], [80, 'tick', 0.8], [82, 'bubble', 0.7], [86, 'pop', 0.6], [94, 'whoosh', 0.6],
  [103, 'pop', 0.6], ...BALLS.map(b => [scenes.live[0] + b.at - 1, 'tick', 0.9] as [number, string, number]), [137, 'pop', 0.6],
  [169, 'hit', 0.5], [185, 'whoosh', 0.6], [189, 'pop', 0.6], [192, 'pop', 0.6], [212, 'whoosh', 0.7],
  [223, 'hit', 1], [237, 'whoosh', 0.6], [242, 'whoosh', 0.6],
  [268, 'whoosh', 0.8], [278, 'pop', 0.7], [286, 'tick', 0.9], [287, 'bubble', 0.8], [294, 'bubble', 0.8],
  [299, 'pop', 0.7], [306, 'tick', 0.9], [306, 'trombone', 0.75], [307, 'bubble', 0.8], [318, 'bubble', 0.8],
  [332, 'whoosh', 1], [343, 'hit', 0.9],
  [346, 'pop', 0.5], [scenes.board[0] + CROWN - 30, 'riser', 0.55], ...overtakes.map(f => [f, 'tick', 0.9] as [number, string, number]),
  [scenes.board[0] + CROWN - 1, 'ding', 0.8], [393, 'whoosh', 0.6],
  [403, 'hit', 0.9], [418, 'pop', 0.7], [426, 'tick', 0.7],
];

const PATH_X = [1390, -1210];
const PATH_Y = [-1620, 1380];

/** A ball on fire, thrown corner to corner across the cut into the board. */
const Fireball: React.FC = () => {
  const f = useCurrentFrame();
  // The ball sits at (450, 1080) inside the 1500px picture, so this path puts
  // it dead centre of the frame halfway through, which is the cut.
  const p = ramp(f, [0, 22], [0, 1], theme.ease.inOut);
  const x = interpolate(p, [0, 1], PATH_X);
  const y = interpolate(p, [0, 1], PATH_Y);
  const speed = Math.sin(p * Math.PI);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* the trail: the same ball twice more, behind and fainter */}
      {[0.16, 0.08, 0].map((lag, i) => {
        const q = Math.max(0, p - lag);
        return (
          <Img
            key={i}
            src={staticFile('art/fireball.webp')}
            style={{
              position: 'absolute', width: 1500, height: 1500,
              left: interpolate(q, [0, 1], PATH_X), top: interpolate(q, [0, 1], PATH_Y),
              opacity: i === 2 ? 1 : 0.35 * speed, filter: `blur(${i === 2 ? speed * 3 : 10}px)`,
              transform: `scale(${1 + speed * 0.1})`,
            }}
          />
        );
      })}
      {/* the glow round the lead ball */}
      <div
        style={{
          position: 'absolute', left: x + 100, top: y + 730, width: 700, height: 700, borderRadius: '50%',
          background: `radial-gradient(circle, ${theme.colors.hero}aa, transparent 65%)`, opacity: speed,
        }}
      />
    </AbsoluteFill>
  );
};

export const RivalsPromo: React.FC = () => (
  <AbsoluteFill style={{ background: theme.colors.bg }}>
    <Sequence {...span(scenes.hook)}><Hook /></Sequence>
    <Sequence {...span(scenes.intro)}><Intro /></Sequence>
    <Sequence {...span(scenes.live)}><Live /></Sequence>
    <Sequence {...span(scenes.room)}><Room /></Sequence>
    <Sequence {...span(scenes.result)}><Result /></Sequence>
    <Sequence {...span(scenes.banter)}><Banter /></Sequence>
    <Sequence {...span(scenes.board)}><Board /></Sequence>
    <Sequence {...span(scenes.cta)}><Cta /></Sequence>

    <Sequence from={334} durationInFrames={24}><Fireball /></Sequence>

    <Grade />
    <Flash at={45} color={theme.colors.hero} peak={0.55} len={8} />
    <Flash at={225} color="#ffb070" peak={0.3} len={6} />
    <Flash at={345} color="#ffd9a0" peak={0.4} len={6} />
    <Grain />
    <Vignette />

    <Audio src={staticFile('sfx/music.wav')} volume={0.48} />
    {SFX.map(([at, name, volume], i) => (
      <Sequence key={i} from={at} durationInFrames={75}>
        <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
      </Sequence>
    ))}
  </AbsoluteFill>
);
