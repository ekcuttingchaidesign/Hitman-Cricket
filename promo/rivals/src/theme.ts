// The one theme. Every colour here is lifted from the game's own stylesheet
// (src/styles.css) so the video looks like the screens it is selling.
import { Easing } from 'remotion';

export const theme = {
  colors: {
    bg: '#07111a', // the result room's near-black navy
    bgAlt: '#0f1f2b',
    navy: '#152b3c',
    live: '#0a5fc0', // the Live screen's blue glow
    board: '#123a5c',
    hero: '#ed7044', // the interface orange: VS, the "you" row, the last word
    ctaOrange: '#e9582b',
    text: '#ffffff',
    textDim: '#c9d6dd',
    quiet: '#9fb2bd',
    row: '#1c2730',
    rowWon: '#3d8bff',
    won: '#50ff8a',
    lost: '#ff505c',
    lostPill: '#e2202d',
    six: '#f2894f',
    four: '#5bbcdc',
    cream: 'linear-gradient(90deg,#faebbe 0%,#eff89f 100%)',
    warm: '#3a1d0a', // the glow behind the winner's face
    button: '#129a4f',
    buttonEdge: '#0a5a2f',
    gold: '#ffc53d',
    chatMine: '#005c4b',
    chatTheirs: '#202c33',
  },
  kits: {
    orange: '#f55b11',
    blue: '#0248c8',
    purple: '#3f0884',
    teal: '#018ea3',
    pink: '#d31e6e',
  },
  fonts: {
    display: 'Jaro, Impact, sans-serif', // the game's CTA face
    body: 'Satoshi, Arial, sans-serif', // the game's card face
  },
  ease: {
    out: Easing.bezier(0.16, 1, 0.3, 1), // easeOutExpo, entrances
    inOut: Easing.bezier(0.83, 0, 0.17, 1), // moves, Ken Burns
    in: Easing.bezier(0.7, 0, 0.84, 0), // exits only
    back: Easing.bezier(0.34, 1.56, 0.64, 1), // playful overshoot
  },
  spring: {
    snappy: { damping: 14, stiffness: 160, mass: 0.6 },
    smooth: { damping: 20, stiffness: 90, mass: 1 },
    bouncy: { damping: 11, stiffness: 170, mass: 0.7 },
    slam: { damping: 16, stiffness: 260, mass: 0.7 },
  },
  // 100 BPM at 30 fps: one beat is exactly eighteen frames. Scenes are timed
  // in fifteen-frame beats and stretched by STRETCH in lib.ts.
  beat: 18,
} as const;

export const people = {
  you: { name: 'You', avatar: 'avatars/avatar_3.webp', ring: theme.kits.orange },
  virat: { name: 'Virat', avatar: 'avatars/avatar_1.webp', ring: theme.kits.blue },
  amit: { name: 'Amit', avatar: 'avatars/avatar_6.webp', ring: theme.kits.teal },
  rohit: { name: 'Rohit', avatar: 'avatars/avatar_7.webp', ring: theme.kits.pink },
  hardik: { name: 'Hardik', avatar: 'avatars/avatar_2.webp', ring: theme.kits.purple },
} as const;

// Scene boundaries, in scene frames (real frames are these times STRETCH).
// Every cut lands on a beat.
export const scenes = {
  hook: [0, 45],
  intro: [45, 105],
  live: [105, 165],
  room: [165, 225],
  result: [225, 270],
  banter: [270, 345],
  board: [345, 405],
  cta: [405, 450],
} as const;

// Positions shared across a cut, so the element is in the same place on both
// sides of it. This is what makes a match cut a match cut.
export const at = {
  vs: { x: 540, y: 960 },
  left: { x: 250, y: 960 },
  right: { x: 830, y: 960 },
  duelSize: 270,
  winner: { x: 540, y: 600, size: 340 },
  rowWon: 1180,
  rowLost: 1360,
  crown: { x: 540, y: 780, size: 300 },
};
