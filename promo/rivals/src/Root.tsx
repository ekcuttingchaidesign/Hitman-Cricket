import React from 'react';
import { Composition } from 'remotion';
import './fonts';
import { RivalsPromo } from './RivalsPromo';
import { real } from './lib';
import { scenes } from './theme';

export const Root: React.FC = () => (
  <Composition
    id="RivalsPromo"
    component={RivalsPromo}
    durationInFrames={real(scenes.cta[1])}
    fps={30}
    width={1080}
    height={1920}
  />
);
