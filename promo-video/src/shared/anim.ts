import {Easing, interpolate, spring} from 'remotion';

export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

/** 带 clamp 的插值，默认 expo-out */
export const tw = (
  f: number,
  input: number[],
  output: number[],
  easing: (t: number) => number = easeOut,
) =>
  interpolate(f, input, output, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing,
  });

export const spr = (
  f: number,
  fps: number,
  delay = 0,
  config: {damping?: number; stiffness?: number; mass?: number} = {damping: 200},
) => spring({frame: f - delay, fps, config});

/** 弹性（有过冲） */
export const bounce = (f: number, fps: number, delay = 0) =>
  spring({frame: f - delay, fps, config: {damping: 9, stiffness: 160, mass: 0.6}});

/** 确定性伪随机 */
export const rand = (seed: number) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
