import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { RivalsPromo } from './RivalsPromo';

export const Root: React.FC = () => (
  <Composition
    id="RivalsPromo"
    component={RivalsPromo}
    durationInFrames={450}
    fps={30}
    width={1080}
    height={1920}
  />
);
