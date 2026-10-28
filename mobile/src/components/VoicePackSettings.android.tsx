import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  useWindowDimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { practiceVoice } from '../practiceVoice';
import { previewAnswerSound } from '../answerFeedback';
import { voiceSceneClips, voiceScenePlayback } from '../api/voicePacks';
import type { VoiceScenePreference } from '../answerFeedbackSettings';
import { androidAccent, type AndroidAccent } from '../android-design-tokens';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
import { useScreenActive } from '../navigation/ScreenActivity';
import { AppIcon } from './AppIcon';
import { AppSwitch } from './AppSwitch';
import { AnimatedPressable } from './Motion';
import { SafeAreaView } from './SafeArea';

export type VoicePackSettingsHandle = { goBack(): void };
type Page = 'main' | 'manage' | 'discover' | 'enter' | 'correct' | 'wrong';
const pageTitles: Record<Page, string> = {
  main: '语音包',
  manage: '管理语音包',
  discover: '发现语音包',
  enter: '开始刷题',
  correct: '答对与连对',
  wrong: '答错与连错',
};
const sceneTitle = (key: string) =>
  key === 'practice.enter'
    ? '进入题目'
    : key === 'answer.correct'
      ? '答对提示'
      : key.startsWith('wrong:')
        ? `连续答错 ${key.split(':')[1]} 次${key === 'wrong:5' ? '及以上' : ''}`
        : `连续答对 ${key.split(':')[1]} 次`;
const sizeText = (bytes: number) =>
  bytes
    ? bytes < 104857.6
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`
    : '';

function VolumeSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme(),
    s = useThemedStyles(styles),
    [draft, setDraft] = useState(value),
    width = useRef(1),
    latest = useRef(value);
  useEffect(() => {
    setDraft(value);
    latest.current = value;
  }, [value]);
  const move = (e: GestureResponderEvent) => {
    const v =
      Math.round(
        Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)) * 100,
      ) / 100;
    latest.current = v;
    setDraft(v);
  };
  const step = (by: number) =>
    onChange(Math.max(0, Math.min(1, Math.round((value + by) * 100) / 100)));
  return (
    <View style={s.sliderRow}>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="降低语音音量"
        disabled={disabled || value <= 0}
        onPress={() => step(-0.05)}
        style={s.iconButton}
      >
        <AppIcon name="volume" size={21} color={colors.textMuted} />
      </AnimatedPressable>
      <View
        accessibilityRole="adjustable"
        testID="voice-volume-slider"
        accessibilityLabel="语音音量滑块"
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(draft * 100),
          text: `${Math.round(draft * 100)}%`,
        }}
        accessibilityState={{ disabled }}
        accessibilityActions={[
          { name: 'increment', label: '提高音量' },
          { name: 'decrement', label: '降低音量' },
        ]}
        onAccessibilityAction={(e) => {
          if (!disabled)
            step(e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05);
        }}
        onLayout={(e) => {
          width.current = Math.max(1, e.nativeEvent.layout.width);
        }}
        onStartShouldSetResponder={() => !disabled}
        onMoveShouldSetResponder={() => !disabled}
        onResponderGrant={move}
        onResponderMove={move}
        onResponderRelease={() => onChange(latest.current)}
        onResponderTerminate={() => onChange(latest.current)}
        style={[s.sliderHit, disabled && s.disabled]}
      >
        <View pointerEvents="none" style={s.track}>
          <View
            style={[s.trackFill, { width: `${Math.round(draft * 100)}%` }]}
          />
        </View>
        <View
          pointerEvents="none"
          style={[s.thumb, { left: `${Math.round(draft * 100)}%` }]}
        />
      </View>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="提高语音音量"
        disabled={disabled || value >= 1}
        onPress={() => step(0.05)}
        style={s.iconButton}
      >
        <AppIcon name="volume" size={25} color={colors.textMuted} />
      </AnimatedPressable>
    </View>
  );
}

export const VoicePackSettings = forwardRef<
  VoicePackSettingsHandle,
  { onClose: () => void }
>(function VoicePackSettings({ onClose }, ref) {
  const {
      colors,
      answerFeedbackSettings: settings,
      answerFeedbackReady: ready,
      setAnswerFeedbackSettings: update,
    } = useTheme(),
    s = useThemedStyles(styles),
    active = useScreenActive();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.2;
  const [status, setStatus] = useState(practiceVoice.getStatus),
    [page, setPage] = useState<Page>('main'),
    [notice, setNotice] = useState(''),
    [removeId, setRemoveId] = useState<string | null>(null),
    [removing, setRemoving] = useState(false);
  const mounted = useRef(true),
    current = useRef(active);
  current.current = active;
  useEffect(() => {
    mounted.current = true;
    const unsub = practiceVoice.subscribe(() =>
      setStatus(practiceVoice.getStatus()),
    );
    void practiceVoice.refresh();
    return () => {
      mounted.current = false;
      unsub();
      practiceVoice.stop();
    };
  }, []);
  useEffect(() => {
    if (!active) practiceVoice.stop();
  }, [active]);
  const back = () => {
    practiceVoice.stop();
    setNotice('');
    setRemoveId(null);
    if (page === 'main') onClose();
    else setPage('main');
  };
  useImperativeHandle(ref, () => ({ goBack: back }));
  const manifest = practiceVoice.getManifest(),
    canPreview = ready && settings.soundEnabled && settings.volume > 0;
  const guard = () => mounted.current && current.current;
  function preview(id?: string) {
    if (!canPreview) return;
    if (id) {
      if (!practiceVoice.previewClip(id, guard))
        setNotice('这条音频尚未就绪，请稍后重试');
      return;
    }
    if (status.state === 'ready') {
      if (!practiceVoice.preview(guard)) setNotice('音频尚未就绪，请稍后重试');
    } else previewAnswerSound(guard);
  }
  async function download(id: string) {
    setNotice('');
    const ok = await practiceVoice.download(id);
    if (!guard()) return;
    if (ok) update({ voicePackId: id });
    else setNotice(practiceVoice.getStatus().message);
  }
  async function remove(id: string) {
    setRemoving(true);
    await practiceVoice.remove(id);
    if (!mounted.current) return;
    if (!practiceVoice.getStatus().downloads.some((p) => p.id === id)) {
      const selected = practiceVoice.getStatus().selected;
      if (
        selected === id ||
        (selected === 'default' &&
          practiceVoice.getStatus().defaultPackId === id)
      )
        update({ voicePackId: 'builtin' });
      setRemoveId(null);
      setNotice('已删除本地语音包，之后可重新下载');
    } else setNotice(practiceVoice.getStatus().message);
    setRemoving(false);
  }
  function changeScene(key: string, choice: VoiceScenePreference | null) {
    if (!manifest) return;
    const scenes = { ...(settings.voiceScenes?.[manifest.id] ?? {}) };
    if (choice) scenes[key] = choice;
    else delete scenes[key];
    update({ voiceScenes: { ...settings.voiceScenes, [manifest.id]: scenes } });
    setNotice('');
    practiceVoice.stop();
  }
  const currentLabel =
    settings.voicePackId === 'builtin' ? '内置音效' : status.currentName;
  const rows = new Map(status.packs.map((p) => [p.id, p]));
  for (const p of status.downloads)
    if (!rows.has(p.id)) rows.set(p.id, { ...p, enabled: true, updatedAt: '' });
  const packRows = [...rows.values()].filter(
    (p) => page !== 'manage' || status.downloads.some((d) => d.id === p.id),
  );
  const iconTile = (
    name: string,
    tone: AndroidAccent = 'primary',
    large = false,
  ) => (
    <View
      style={[
        large ? [s.cover, compact && s.compactCover] : s.tile,
        { backgroundColor: androidAccent(colors, tone).soft },
      ]}
    >
      <AppIcon
        name={name}
        size={large ? 34 : 24}
        color={androidAccent(colors, tone).ink}
      />
    </View>
  );
  const section = (
    title: string,
    action?: { label: string; go: () => void },
  ) => (
    <View style={s.sectionHeading}>
      <Text accessibilityRole="header" style={s.sectionTitle}>
        {title}
      </Text>
      {action && (
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={action.label + '语音包'}
          onPress={action.go}
          style={s.textButton}
        >
          <Text style={s.link}>{action.label}</Text>
          <AppIcon name="chevron-right" size={17} color={colors.brand} />
        </AnimatedPressable>
      )}
    </View>
  );
  const sceneSummary = (key: string) => {
    if (!manifest) return '跟随语音包';
    const pref = settings.voiceScenes?.[manifest.id]?.[key],
      choice = voiceScenePlayback(manifest, key, pref);
    return choice.muted
      ? '已关闭'
      : !pref
        ? '跟随语音包'
        : `${choice.mode === 'fixed' ? '固定' : '随机'} · ${choice.clips.length} 条`;
  };
  function packList() {
    return (
      <View style={s.group}>
        {packRows.map((p, index) => {
          const local = status.downloads.find((d) => d.id === p.id),
            outdated = local && local.revision < p.revision,
            selected =
              settings.voicePackId === p.id ||
              (settings.voicePackId === 'default' &&
                status.defaultPackId === p.id);
          return (
            <View key={p.id}>
              {index > 0 && <View style={s.divider} />}
              <View style={[s.packRow, compact && s.compactWrap]}>
                {iconTile('waveform', index % 2 ? 'member' : 'primary', true)}
                <View style={s.copy}>
                  <Text style={s.packName}>{p.name}</Text>
                  <Text style={s.meta}>
                    {local
                      ? page === 'manage'
                        ? `${sizeText(local.bytes)} · 已下载`
                        : `已下载${outdated ? ' · 有更新' : ' · 可离线使用'}`
                      : '下载后可离线播放'}
                  </Text>
                </View>
                <View style={compact ? s.compactAction : undefined}>
                  {page === 'manage' ? (
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={'删除语音包 ' + p.name}
                      disabled={!!status.downloadId || removing}
                      onPress={() => setRemoveId(p.id)}
                      style={s.smallButton}
                    >
                      <Text style={s.danger}>删除</Text>
                    </AnimatedPressable>
                  ) : !local || outdated ? (
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        (outdated ? '更新语音包 ' : '下载语音包 ') + p.name
                      }
                      disabled={!!status.downloadId || !ready}
                      onPress={() => void download(p.id)}
                      style={[s.outline, !!status.downloadId && s.disabled]}
                    >
                      <Text style={s.link}>
                        {status.downloadId === p.id
                          ? `${status.progress}%`
                          : outdated
                            ? '更新'
                            : '下载'}
                      </Text>
                    </AnimatedPressable>
                  ) : (
                    <AnimatedPressable
                      accessibilityRole="radio"
                      accessibilityLabel={'使用语音包 ' + p.name}
                      accessibilityState={{
                        checked: selected,
                        disabled: !!status.downloadId,
                      }}
                      disabled={!!status.downloadId || !ready}
                      onPress={() => update({ voicePackId: p.id })}
                      style={[s.smallButton, selected && s.selected]}
                    >
                      <Text style={s.link}>{selected ? '使用中' : '使用'}</Text>
                    </AnimatedPressable>
                  )}
                </View>
              </View>
              {removeId === p.id && (
                <View style={s.confirm}>
                  <Text style={s.meta}>
                    删除“{p.name}”的本地音频？之后可重新下载。
                  </Text>
                  <View style={s.wrap}>
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={'确认删除语音包 ' + p.name}
                      disabled={removing}
                      onPress={() => void remove(p.id)}
                      style={s.smallButton}
                    >
                      <Text style={s.danger}>
                        {removing ? '正在删除' : '确认删除'}
                      </Text>
                    </AnimatedPressable>
                    <AnimatedPressable
                      accessibilityRole="button"
                      disabled={removing}
                      onPress={() => setRemoveId(null)}
                      style={s.smallButton}
                    >
                      <Text style={s.link}>取消</Text>
                    </AnimatedPressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}
        {!packRows.length && (
          <Text style={s.empty}>
            {page === 'manage'
              ? '还没有下载语音包。发现语音包后，下载即可离线使用。'
              : '暂无已发布的语音包，内置音效仍可使用。'}
          </Text>
        )}
      </View>
    );
  }
  const sceneKeys = manifest
    ? page === 'enter'
      ? ['practice.enter']
      : page === 'correct'
        ? [
            'answer.correct',
            ...manifest.cues['answer.streak'].map((p) => 'streak:' + p.count),
          ]
        : [1, 2, 3, 4, 5].map((n) => 'wrong:' + n)
    : [];
  return (
    <SafeAreaView style={s.screen}>
      <View style={s.header}>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel={page === 'main' ? '返回设置' : '返回语音包'}
          onPress={back}
          style={s.iconButton}
        >
          <AppIcon name="chevron-left" size={26} color={colors.text} />
        </AnimatedPressable>
        <Text accessibilityRole="header" style={s.headerTitle}>
          {pageTitles[page]}
        </Text>
        {page === 'main' ? (
          <AnimatedPressable
            accessibilityRole="button"
            accessibilityLabel="管理语音包"
            onPress={() => {
              setPage('manage');
              setNotice('');
            }}
            style={s.textButton}
          >
            <Text style={s.link}>管理</Text>
          </AnimatedPressable>
        ) : (
          <View style={s.iconButton} />
        )}
      </View>
      <ScrollView
        testID="voice-pack-settings"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.content}
      >
        {page === 'main' ? (
          <>
            <View style={s.currentCard}>
              <Text style={s.currentEyebrow}>
                正在使用
                {settings.voicePackId === 'default' ? ' · 跟随后台默认' : ''}
              </Text>
              <View style={[s.currentRow, compact && s.compactWrap]}>
                {iconTile('waveform', 'primary', true)}
                <View style={s.copy}>
                  <Text style={s.currentName}>{currentLabel}</Text>
                  <View style={s.statusRow}>
                    <View
                      style={[
                        s.dot,
                        {
                          backgroundColor:
                            status.state === 'ready'
                              ? colors.success
                              : colors.textMuted,
                        },
                      ]}
                    />
                    <Text style={s.meta}>
                      {status.state === 'ready'
                        ? '已下载 · 本地播放'
                        : settings.voicePackId === 'builtin'
                          ? '无需下载 · 即时播放'
                          : status.message}
                    </Text>
                  </View>
                </View>
                <AnimatedPressable
                  accessibilityRole="button"
                  accessibilityLabel="试听当前语音包"
                  disabled={!canPreview || status.state === 'loading'}
                  onPress={() => preview()}
                  style={[
                    s.audition,
                    compact && s.compactAudition,
                    (!canPreview || status.state === 'loading') && s.disabled,
                  ]}
                >
                  <View style={s.playCircle}>
                    <AppIcon name="play" size={23} color={colors.brand} />
                  </View>
                  <Text style={s.link}>试听</Text>
                </AnimatedPressable>
              </View>
            </View>
            <View>
              {section('播放设置')}
              <View style={s.group}>
                <View style={s.row}>
                  <AppIcon name="volume" size={24} color={colors.text} />
                  <Text style={[s.rowLabel, s.grow]}>刷题语音</Text>
                  <AppSwitch
                    accessibilityLabel="刷题语音"
                    disabled={!ready}
                    value={settings.soundEnabled}
                    onValueChange={(soundEnabled) => update({ soundEnabled })}
                    trackColor={{ false: colors.border, true: colors.action }}
                    thumbColor={colors.white}
                  />
                </View>
                <View style={s.divider} />
                <View style={s.volume}>
                  <View style={s.between}>
                    <Text style={s.rowLabel}>语音音量</Text>
                    <Text testID="voice-volume-value" style={s.meta}>
                      {Math.round(settings.volume * 100)}%
                    </Text>
                  </View>
                  <VolumeSlider
                    value={settings.volume}
                    onChange={(volume) => update({ volume })}
                    disabled={!ready}
                  />
                </View>
              </View>
            </View>
            <View>
              {section('场景语音')}
              <View style={s.group}>
                {(
                  [
                    {
                      id: 'enter',
                      title: '开始刷题',
                      hint: '进入题目后播放',
                      icon: 'play-circle',
                      tone: 'progress',
                      value: sceneSummary('practice.enter'),
                    },
                    {
                      id: 'correct',
                      title: '答对与连对',
                      icon: 'trophy',
                      tone: 'member',
                      value: sceneSummary('answer.correct'),
                    },
                    {
                      id: 'wrong',
                      title: '答错与连错',
                      icon: 'close',
                      tone: 'ai',
                      value: '连续 1–5 次',
                    },
                  ] as const
                ).map((row, index) => (
                  <View key={row.id}>
                    {index > 0 && <View style={s.divider} />}
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={'配置' + row.title + '语音'}
                      onPress={() => {
                        setPage(row.id);
                        setNotice('');
                      }}
                      style={s.sceneRow}
                    >
                      {iconTile(row.icon, row.tone)}
                      <View style={s.copy}>
                        <Text style={s.rowLabel}>{row.title}</Text>
                        {'hint' in row && (
                          <Text style={s.meta}>{row.hint}</Text>
                        )}
                        {compact && <Text style={s.meta}>{row.value}</Text>}
                      </View>
                      {!compact && (
                        <Text style={s.sceneValue}>{row.value}</Text>
                      )}
                      <AppIcon
                        name="chevron-right"
                        size={19}
                        color={colors.textMuted}
                      />
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            </View>
            <View>
              {section('我的语音包', {
                label: '发现更多',
                go: () => {
                  setPage('discover');
                  void practiceVoice.refresh();
                },
              })}
              {packList()}
            </View>
            <View style={s.note}>
              <AppIcon name="info" size={18} color={colors.textMuted} />
              <Text style={[s.meta, s.grow]}>
                练习目录不播放语音，进入题目后才响。设置自动保存在本机。
              </Text>
            </View>
          </>
        ) : page === 'manage' || page === 'discover' ? (
          <>
            <View style={s.between}>
              <Text style={[s.meta, s.grow]}>
                {page === 'manage'
                  ? '管理本地下载；删除不会影响学习记录。'
                  : '下载并校验后才可使用，作答时不请求音频网络。'}
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="刷新语音包列表"
                onPress={() => void practiceVoice.refresh()}
                style={s.textButton}
              >
                <Text style={s.link}>刷新</Text>
              </AnimatedPressable>
            </View>
            {packList()}
            {page === 'manage' && (
              <View style={s.group}>
                {(['builtin', 'default'] as const).map((id, index) => (
                  <View key={id}>
                    {index > 0 && <View style={s.divider} />}
                    <AnimatedPressable
                      accessibilityRole="radio"
                      accessibilityLabel={
                        id === 'builtin' ? '仅内置音效' : '跟随后台默认'
                      }
                      accessibilityState={{
                        checked: settings.voicePackId === id,
                      }}
                      onPress={() => update({ voicePackId: id })}
                      style={s.row}
                    >
                      <Text style={[s.rowLabel, s.grow]}>
                        {id === 'builtin' ? '仅内置音效' : '跟随后台默认'}
                      </Text>
                      <AppIcon
                        name={
                          settings.voicePackId === id
                            ? 'check-circle'
                            : 'circle'
                        }
                        size={24}
                        color={
                          settings.voicePackId === id
                            ? colors.brand
                            : colors.border
                        }
                      />
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={s.meta}>
              {page === 'enter'
                ? '只在真正进入题目时播放，练习目录保持安静。'
                : page === 'wrong'
                  ? '按连续答错计数，答对后清零；第 5 档覆盖后续连续错误。'
                  : '连对达到对应次数时播放；其他次数使用答对提示。'}
            </Text>
            {!manifest ? (
              <View style={s.group}>
                <Text style={s.empty}>
                  先在“我的语音包”下载并启用一个语音包，再配置该包的场景声音。
                </Text>
              </View>
            ) : (
              sceneKeys.map((key) => {
                const clips = voiceSceneClips(manifest.cues, key),
                  pref = settings.voiceScenes?.[manifest.id]?.[key],
                  resolved = voiceScenePlayback(manifest, key, pref),
                  mode =
                    pref &&
                    (pref.mode === 'off' ||
                      pref.clips.some((id) => clips.includes(id)))
                      ? pref.mode
                      : 'pack';
                return (
                  <View key={key} style={s.editorCard}>
                    <Text accessibilityRole="header" style={s.sectionTitle}>
                      {sceneTitle(key)}
                    </Text>
                    {!clips.length ? (
                      <Text style={s.meta}>此语音包没有配置该场景的素材。</Text>
                    ) : (
                      <>
                        <View
                          accessibilityRole="radiogroup"
                          accessibilityLabel={sceneTitle(key) + '播放方式'}
                          style={s.wrap}
                        >
                          {(
                            [
                              { id: 'pack', label: '跟随语音包' },
                              { id: 'off', label: '关闭' },
                              { id: 'fixed', label: '固定' },
                              { id: 'random', label: '随机' },
                            ] as const
                          ).map((item) => (
                            <AnimatedPressable
                              key={item.id}
                              accessibilityRole="radio"
                              accessibilityLabel={`${sceneTitle(key)}：${item.label}`}
                              accessibilityState={{ checked: mode === item.id }}
                              onPress={() =>
                                changeScene(
                                  key,
                                  item.id === 'pack'
                                    ? null
                                    : {
                                        mode: item.id,
                                        clips:
                                          item.id === 'off'
                                            ? []
                                            : item.id === 'fixed'
                                              ? [resolved.clips[0] ?? clips[0]]
                                              : resolved.clips.length
                                                ? resolved.clips
                                                : clips,
                                      },
                                )
                              }
                              style={[
                                s.modeButton,
                                mode === item.id && s.selected,
                              ]}
                            >
                              <Text style={mode === item.id ? s.link : s.meta}>
                                {item.label}
                              </Text>
                            </AnimatedPressable>
                          ))}
                        </View>
                        <Text style={s.meta}>
                          {mode === 'pack'
                            ? '使用后台发布的候选和播放方式。'
                            : mode === 'off'
                              ? '此场景保持静默，不播放内置兜底音。'
                              : mode === 'fixed'
                                ? '选择一条，每次播放这一条。'
                                : '勾选参与随机的语音；至少保留一条。'}
                        </Text>
                        {clips.map((id, index) => {
                          const asset = manifest.assets.find(
                              (a) => a.id === id,
                            ),
                            checked = resolved.clips.includes(id),
                            editable = mode === 'fixed' || mode === 'random';
                          return (
                            <View key={id} style={s.clipRow}>
                              <AnimatedPressable
                                accessibilityRole={
                                  mode === 'fixed' ? 'radio' : 'checkbox'
                                }
                                accessibilityLabel={`${sceneTitle(key)} 语音 ${index + 1}`}
                                accessibilityState={{
                                  checked,
                                  disabled: !editable,
                                }}
                                disabled={!editable}
                                onPress={() => {
                                  const next =
                                    mode === 'fixed'
                                      ? [id]
                                      : checked
                                        ? resolved.clips.filter((x) => x !== id)
                                        : [...resolved.clips, id];
                                  if (!next.length) {
                                    setNotice('至少保留一条随机语音');
                                    return;
                                  }
                                  changeScene(key, {
                                    mode: mode === 'fixed' ? 'fixed' : 'random',
                                    clips: next,
                                  });
                                }}
                                style={s.clipChoice}
                              >
                                <AppIcon
                                  name={checked ? 'check-circle' : 'circle'}
                                  size={23}
                                  color={checked ? colors.brand : colors.border}
                                />
                                <Text style={s.rowLabel}>
                                  语音 {String(index + 1).padStart(2, '0')}
                                </Text>
                                <Text style={s.meta}>
                                  {asset?.durationMs
                                    ? `${(asset.durationMs / 1000).toFixed(1)} 秒`
                                    : asset
                                      ? sizeText(asset.bytes)
                                      : ''}
                                </Text>
                              </AnimatedPressable>
                              <AnimatedPressable
                                accessibilityRole="button"
                                accessibilityLabel={`试听${sceneTitle(key)}语音 ${index + 1}`}
                                disabled={!canPreview}
                                onPress={() => preview(id)}
                                style={[
                                  s.iconButton,
                                  !canPreview && s.disabled,
                                ]}
                              >
                                <AppIcon
                                  name="play"
                                  size={20}
                                  color={colors.brand}
                                />
                              </AnimatedPressable>
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
        {!!status.downloadId && (
          <View accessibilityLiveRegion="polite" style={s.downloadCard}>
            <View style={s.between}>
              <Text style={[s.rowLabel, s.grow]}>
                下载并校验 {status.progress}%
              </Text>
              <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel="取消语音包下载"
                onPress={() => practiceVoice.cancelDownload()}
                style={s.textButton}
              >
                <Text style={s.link}>取消</Text>
              </AnimatedPressable>
            </View>
            <View style={s.track}>
              <View style={[s.trackFill, { width: `${status.progress}%` }]} />
            </View>
          </View>
        )}
        {!!notice && (
          <Text accessibilityLiveRegion="polite" style={s.notice}>
            {notice}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
});
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    compactWrap: { flexWrap: 'wrap' },
    compactCover: { width: 48, height: 48 },
    compactAction: { width: '100%', alignItems: 'flex-end' },
    compactAudition: {
      width: '100%',
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 10,
    },
    screen: { flex: 1, backgroundColor: c.background },
    header: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      gap: 8,
    },
    headerTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 22,
      lineHeight: 32,
      fontWeight: '700',
      color: c.text,
    },
    iconButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textButton: {
      minWidth: 48,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    content: {
      padding: 20,
      paddingTop: 12,
      paddingBottom: 40,
      gap: 22,
      maxWidth: 640,
      width: '100%',
      alignSelf: 'center',
    },
    currentCard: {
      backgroundColor: c.surface,
      borderRadius: 22,
      padding: 16,
      gap: 14,
    },
    currentEyebrow: { fontSize: 14, lineHeight: 21, color: c.textMuted },
    currentRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    currentName: {
      fontSize: 21,
      lineHeight: 30,
      fontWeight: '700',
      color: c.text,
    },
    cover: {
      width: 58,
      height: 58,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    tile: {
      width: 42,
      height: 42,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    },
    copy: { flex: 1, minWidth: 0, gap: 5 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
    audition: { minWidth: 48, alignItems: 'center', gap: 5 },
    playCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionHeading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      minHeight: 38,
      marginBottom: 9,
    },
    sectionTitle: {
      fontSize: 18,
      lineHeight: 27,
      fontWeight: '700',
      color: c.text,
    },
    link: { fontSize: 14, lineHeight: 22, fontWeight: '500', color: c.brand },
    meta: { fontSize: 13, lineHeight: 21, color: c.textMuted, flexShrink: 1 },
    group: { backgroundColor: c.surface, borderRadius: 20, overflow: 'hidden' },
    row: {
      minHeight: 62,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 12,
    },
    rowLabel: {
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '500',
      color: c.text,
      flexShrink: 1,
    },
    grow: { flex: 1, minWidth: 0 },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginHorizontal: 16,
    },
    volume: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    between: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    sliderHit: { height: 48, justifyContent: 'center', flex: 1 },
    track: {
      height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      overflow: 'hidden',
    },
    trackFill: { height: 4, backgroundColor: c.action, borderRadius: 2 },
    thumb: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.action,
      backgroundColor: c.surface,
      marginLeft: -10,
      top: 14,
    },
    disabled: { opacity: 0.4 },
    sceneRow: {
      minHeight: 65,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 12,
    },
    sceneValue: {
      fontSize: 13,
      lineHeight: 21,
      color: c.textMuted,
      maxWidth: '32%',
      textAlign: 'right',
      flexShrink: 1,
    },
    packRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    packName: {
      fontSize: 16,
      lineHeight: 25,
      fontWeight: '700',
      color: c.text,
    },
    smallButton: {
      minHeight: 48,
      minWidth: 56,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 16,
    },
    outline: {
      minHeight: 48,
      minWidth: 56,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      borderWidth: 1,
      borderColor: c.brand,
    },
    selected: { backgroundColor: c.brandSoft },
    danger: {
      fontSize: 14,
      lineHeight: 22,
      color: c.warning,
      fontWeight: '500',
    },
    confirm: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    empty: { padding: 18, fontSize: 14, lineHeight: 24, color: c.textMuted },
    editorCard: {
      padding: 16,
      gap: 14,
      borderRadius: 20,
      backgroundColor: c.surface,
    },
    modeButton: {
      minHeight: 48,
      minWidth: 56,
      paddingHorizontal: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
    },
    clipRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    clipChoice: {
      flex: 1,
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      paddingVertical: 8,
      gap: 10,
    },
    downloadCard: {
      padding: 16,
      gap: 12,
      backgroundColor: c.brandSoft,
      borderRadius: 16,
    },
    notice: { fontSize: 14, lineHeight: 23, color: c.brand },
  });
