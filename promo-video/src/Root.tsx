import {Composition} from 'remotion';
import {Cyberpunk} from './cyber/Cyberpunk';
import {Premium} from './premium/Premium';
import {Trendy} from './trendy/Trendy';
import {PremiumV} from './premium-v/PremiumV';
import {TrendyV} from './trendy-v/TrendyV';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 28.8s = 12 小节 @100 BPM */}
      <Composition id="Premium" component={Premium} durationInFrames={864} fps={30} width={1920} height={1080} />
      {/* 28s = 15 小节 @128 BPM（1 拍 = 14 帧） */}
      <Composition id="Cyberpunk" component={Cyberpunk} durationInFrames={840} fps={30} width={1920} height={1080} />
      {/* 26s = 13 小节 @120 BPM */}
      <Composition id="Trendy" component={Trendy} durationInFrames={780} fps={30} width={1920} height={1080} />
      {/* 竖屏 9:16 */}
      <Composition id="PremiumV" component={PremiumV} durationInFrames={864} fps={30} width={1080} height={1920} />
      <Composition id="TrendyV" component={TrendyV} durationInFrames={780} fps={30} width={1080} height={1920} />
      {/* 潮流竖屏纯音乐版：无配音、无字幕 */}
      <Composition id="TrendyVClean" component={TrendyV} defaultProps={{narration: false}} durationInFrames={780} fps={30} width={1080} height={1920} />
    </>
  );
};
