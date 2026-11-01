// Android-only presentation values. Business state and shared Web styling stay separate.
export const androidRadii = { sm: 14, md: 18, lg: 24, panel: 28, pill: 999 };
export const androidMotion = { enterMs: 200, pressInMs: 90, pressOutMs: 160, progressMs: 320, pressScale: 0.982 };
export type AndroidAccent = 'primary' | 'practice' | 'exam' | 'review' | 'ai' | 'member' | 'progress';
const accents = {
  light: {
    primary: { ink: '#255FDF', soft: '#EAF1FF', border: '#D7E4FF' },
    practice: { ink: '#176F65', soft: '#E8F5EF', border: '#CDE8DC' },
    exam: { ink: '#604AA0', soft: '#F0EBFA', border: '#E0D5F1' },
    review: { ink: '#AC4039', soft: '#FCEDE8', border: '#F1D5CC' },
    ai: { ink: '#78509C', soft: '#F5EDFA', border: '#E8D8F0' },
    member: { ink: '#855A18', soft: '#FFF3DE', border: '#F0DEB9' },
    progress: { ink: '#177B57', soft: '#E9F7F0', border: '#CAE7D9' },
  },
  dark: {
    primary: { ink: '#91B8FF', soft: '#203A60', border: '#36537B' },
    practice: { ink: '#89DBCA', soft: '#193D37', border: '#31564D' },
    exam: { ink: '#C6B6FA', soft: '#302A46', border: '#4C4268' },
    review: { ink: '#FFB0A2', soft: '#442C2B', border: '#65403C' },
    ai: { ink: '#D7B6EE', soft: '#3B2B49', border: '#594168' },
    member: { ink: '#EDC689', soft: '#403323', border: '#5D4B32' },
    progress: { ink: '#7CDBB2', soft: '#1D3A33', border: '#34574A' },
  },
};

export function androidAccent(colors: { background: string }, tone: AndroidAccent = 'primary') {
  return accents[colors.background === '#101722' ? 'dark' : 'light'][tone];
}

// Raise legacy 11–13sp helper copy, without disabling Android's system font scaling.
export function androidFontSize(size: number) {
  if (size <= 12) return 14;
  if (size === 13) return 15;
  if (size <= 15) return 16;
  if (size === 16) return 17;
  if (size === 17) return 18;
  if (size === 18) return 20;
  return size;
}

export function androidRadius(value: number, width?: unknown, height?: unknown) {
  if (value < 6 || value >= 100) return value;
  const rounded = value >= 18 ? 24 : value >= 16 ? 22 : value >= 14 ? 20 : value >= 12 ? 18 : value >= 10 ? 16 : value >= 8 ? 14 : 10;
  const edge = typeof width === 'number' && typeof height === 'number' ? Math.min(width, height) : undefined;
  return edge === undefined ? rounded : Math.min(rounded, edge / 2);
}
