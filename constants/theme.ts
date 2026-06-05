import { Platform } from 'react-native';

export const colors = {
  bg:           '#111218',
  surface:      '#1c1d27',
  surfaceHigh:  '#252637',
  surfacePress: '#2e2f45',

  border:       '#2d2e42',
  borderStrong: '#3f405a',

  text:         '#f0f0f5',
  textSub:      '#8b8ca8',
  textMuted:    '#52536a',
  textInverted: '#111218',

  red:          '#e53935',
  redDim:       '#2d1212',
  orange:       '#f97316',
  yellow:       '#f59e0b',
  green:        '#22c55e',
  blue:         '#3b82f6',

  tier1:        '#e53935',
  tier2:        '#f97316',
  tier3:        '#f59e0b',
  tier4:        '#52536a',
};

export const radius = {
  sm:  4,
  md:  8,
  lg:  12,
  xl:  20,
};

export const mono = Platform.select({
  ios:     'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  36,
  xxl: 52,
};
