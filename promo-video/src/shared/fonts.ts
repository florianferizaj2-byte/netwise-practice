import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

// 全部为 SIL OFL 1.1 字体，见 assets/SOURCES.md
const FONTS: [string, string, string][] = [
  ['Noto Sans SC', 'fonts/NotoSansSC-VF.ttf', '100 900'],
  ['Space Grotesk', 'fonts/SpaceGrotesk-VF.ttf', '300 700'],
  ['JetBrains Mono', 'fonts/JetBrainsMono-VF.ttf', '100 800'],
  ['Smiley Sans', 'fonts/smiley/SmileySans-Oblique.ttf', '400'],
];

let loading: Promise<void> | null = null;
const loadAll = () => {
  if (!loading) {
    loading = Promise.all(
      FONTS.map(([family, url, weight]) =>
        new FontFace(family, `url(${staticFile(url)})`, {weight})
          .load()
          .then((f) => {
            document.fonts.add(f);
          }),
      ),
    ).then(() => undefined);
  }
  return loading;
};

export const useFonts = () => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    loadAll().then(() => continueRender(handle));
  }, [handle]);
};

export const CN = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
export const LATIN = '"Space Grotesk", "Noto Sans SC", sans-serif';
export const MONO = '"JetBrains Mono", "Noto Sans SC", monospace';
export const FUN = '"Smiley Sans", "Noto Sans SC", sans-serif';
