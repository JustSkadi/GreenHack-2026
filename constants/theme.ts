import { Platform } from 'react-native';

export const colors = {
  bg:           '#4369AA',  // Czech blue-purple — shell / status bar
  surface:      '#FFFFFF',  // white — screens and cards
  surfaceHigh:  '#EEF2FF',  // light lavender — hover, selected states
  surfacePress: '#E0E8FF',

  border:       '#D0DCEF',
  borderStrong: '#AABCDF',

  text:         '#1A2B5A',  // dark navy — for white backgrounds
  textSub:      '#3D5490',  // medium navy
  textMuted:    '#7A90BE',  // muted blue
  textInverted: '#FFFFFF',  // white — for use on bg (purple) backgrounds

  red:          '#C62828',
  redDim:       '#FFEBEE',
  orange:       '#D84315',
  yellow:       '#F57F17',
  green:        '#2E7D32',
  blue:         '#4369AA',  // Czech blue — primary action colour on white bg
  purple:       '#7E57C2',  // purple — offline mode indicator
  purpleDim:    '#EDE7F6',

  tier1:        '#C62828',
  tier2:        '#D84315',
  tier3:        '#F57F17',
  tier4:        '#7A90BE',
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
