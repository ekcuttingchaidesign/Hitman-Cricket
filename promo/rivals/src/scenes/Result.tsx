import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, staticFile, delayRender, continueRender } from 'remotion';
import { Lottie, type LottieAnimationData } from '@remotion/lottie';
import { at, people, theme } from '../theme';
import { ramp, pop, out, shake, breathe } from '../lib';
import { Avatar } from '../components/Avatar';
import { Slam } from '../components/Bits';
import { VerdictRow } from '../components/Rows';

/** The game's own films, drawn by scripts/lottie-art.mjs: the winner's flame and the confetti. */
export function useLottie(file: string, keep?: (layer: string) => boolean) {
  const [data, setData] = React.useState<LottieAnimationData | null>(null);
  const [handle] = React.useState(() => delayRender(`lottie ${file}`));
  React.useEffect(() => {
    fetch(staticFile(file))
      .then(r => r.json())
      .then(json => {
        if (keep) json.layers = json.layers.filter((l: { nm: string }) => keep(l.nm));
        setData(json);
        continueRender(handle);
      })
      .catch(err => { console.error(err); continueRender(handle); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, handle]);
  return data;
}

/** The warm dark the result room is drawn on. */
export const ResultBg: React.FC = () => (
  <AbsoluteFill
    style={{ background: `radial-gradient(circle at 50% 31%, ${theme.colors.warm} 0%, ${theme.colors.bg} 45%, #04090e 100%)` }}
  />
);

/**
 * The payoff. Your face is where the last scene lifted it, and the game's own
 * flame goes up round it. YOU WIN lands with a shake, then the WINNER and LOSER
 * rows, which the banter scene splits apart.
 */
export const Result: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flame = useLottie('art/flame.json');
  // the win film is a trophy with confetti round it; only the confetti is wanted
  const confetti = useLottie('art/win.json', name => name.startsWith('confetti') || name.startsWith('sparkle'));
  const s = shake(f, 1, 12, 22);
  const winRow = pop(f, 14, fps, theme.spring.snappy);
  const loseRow = pop(f, 19, fps, theme.spring.snappy);
  const headOut = out(f, 36, 44);
  const runsWon = Math.round(ramp(f, [14, 30], [0, 51]));
  const runsLost = Math.round(ramp(f, [19, 33], [0, 37]));
  const b = breathe(f, 0.015, 16);
  const fire = ramp(f, [0, 6], [0, 1]);

  return (
    <AbsoluteFill style={{ transform: `translate(${s.x}px, ${s.y}px)` }}>
      <ResultBg />
      <div style={{ opacity: headOut, transform: `translateY(${(1 - headOut) * -80}px)` }}>
        {flame && (
          <div
            style={{
              position: 'absolute', left: at.winner.x - 320, top: at.winner.y - 470, width: 640, height: 736,
              opacity: fire, transform: `scale(${interpolate(fire, [0, 1], [0.6, 1])})`, transformOrigin: '50% 80%',
            }}
          >
            <Lottie animationData={flame} loop playbackRate={1} />
          </div>
        )}
        <Avatar
          src={people.you.avatar} ring={people.you.ring} size={at.winner.size} x={at.winner.x} y={at.winner.y}
          scale={b} glow={`${theme.colors.hero}99`}
        />
        <Slam
          text="YOU WIN" delay={2} y={900} size={200} from={2.6} tilt={-4}
          style={{ backgroundImage: theme.colors.cream, WebkitBackgroundClip: 'text', color: 'transparent', textShadow: 'none', filter: 'drop-shadow(0 12px 0 rgba(0,0,0,0.4))' }}
        />
        <div
          style={{
            position: 'absolute', left: 0, right: 0, top: 1010, textAlign: 'center',
            fontFamily: theme.fonts.body, fontSize: 46, color: theme.colors.textDim,
            opacity: ramp(f, [8, 14], [0, 1]), transform: `translateY(${ramp(f, [8, 16], [24, 0])}px)`,
          }}
        >
          Your 51 held. Virat fell 14 runs short.
        </div>
      </div>
      {confetti && f < 44 && (
        <div style={{ position: 'absolute', left: 0, top: at.winner.y - 540, width: 1080, height: 1080, opacity: headOut }}>
          <Lottie animationData={confetti} playbackRate={1.4} />
        </div>
      )}
      <VerdictRow
        avatar={people.you.avatar} ring={people.you.ring} name="You" won sixes={3} fours={4} balls={30}
        runs={runsWon} wickets={2} y={at.rowWon}
        x={interpolate(winRow, [0, 1], [-1100, 0])} opacity={Math.min(1, winRow * 2)}
      />
      <VerdictRow
        avatar={people.virat.avatar} ring={people.virat.ring} name="Virat" won={false} sixes={1} fours={3} balls={28}
        runs={runsLost} wickets={3} y={at.rowLost}
        x={interpolate(loseRow, [0, 1], [1100, 0])} opacity={Math.min(1, loseRow * 2)}
      />
    </AbsoluteFill>
  );
};
