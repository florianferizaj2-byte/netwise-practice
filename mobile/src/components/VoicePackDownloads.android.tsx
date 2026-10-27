import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { practiceVoice } from '../practiceVoice';
import { AnimatedPressable } from './Motion';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';
export function VoicePackDownloads() {
  const {
      answerFeedbackSettings: settings,
      setAnswerFeedbackSettings: update,
    } = useTheme(),
    s = useThemedStyles(styles);
  const [status, setStatus] = useState(practiceVoice.getStatus),
    [open, setOpen] = useState(false);
  useEffect(
    () => practiceVoice.subscribe(() => setStatus(practiceVoice.getStatus())),
    [],
  );
  const label =
    settings.voicePackId === 'builtin'
      ? '仅内置音效'
      : settings.voicePackId === 'default'
        ? '跟随后台默认'
        : (status.downloads.find((p) => p.id === settings.voicePackId)?.name ??
          '自选语音包');
  const rows = new Map(status.packs.map((p) => [p.id, p]));
  for (const p of status.downloads)
    if (!rows.has(p.id)) rows.set(p.id, { ...p, enabled: true, updatedAt: '' });
  async function download(id: string) {
    if (await practiceVoice.download(id)) update({ voicePackId: id });
  }
  return (
    <View style={s.card} testID="voice-pack-downloads">
      <View style={s.heading}>
        <Text style={s.title}>刷题语音包</Text>
        <AnimatedPressable
          accessibilityRole="button"
          accessibilityLabel="刷新语音包列表"
          onPress={() => void practiceVoice.refresh()}
        >
          <Text style={s.action}>刷新</Text>
        </AnimatedPressable>
      </View>
      <Text style={s.hint}>
        先下载，后播放。入场、答对和连对声音都从本地读取，不影响出题速度。
      </Text>
      <AnimatedPressable
        accessibilityRole="button"
        accessibilityLabel="选择刷题语音包"
        onPress={() => setOpen(!open)}
        style={s.choice}
      >
        <Text style={s.label}>{label}</Text>
        <Text style={s.action}>{open ? '收起' : '更换'} ›</Text>
      </AnimatedPressable>
      <Text accessibilityLiveRegion="polite" style={s.hint}>
        {status.state === 'ready'
          ? status.currentName + ' · 已就绪'
          : status.message}
      </Text>
      {status.downloadId && (
        <View style={s.progress}>
          <Text style={s.label}>下载并校验 {status.progress}%</Text>
          <AnimatedPressable
            accessibilityRole="button"
            onPress={() => practiceVoice.cancelDownload()}
          >
            <Text style={s.action}>取消</Text>
          </AnimatedPressable>
        </View>
      )}
      {open && (
        <ScrollView nestedScrollEnabled style={s.list}>
          <View style={s.actions}>
            {[
              ['default', '跟随后台默认'],
              ['builtin', '仅内置音效'],
            ].map(([id, name]) => (
              <AnimatedPressable
                key={id}
                accessibilityRole="radio"
                accessibilityState={{ checked: settings.voicePackId === id }}
                onPress={() => update({ voicePackId: id })}
                style={[s.option, settings.voicePackId === id && s.selected]}
              >
                <Text style={s.label}>{name}</Text>
              </AnimatedPressable>
            ))}
          </View>
          {[...rows.values()].map((pack) => {
            const local = status.downloads.find((p) => p.id === pack.id),
              outdated = local && local.revision < pack.revision;
            return (
              <View key={pack.id} style={s.pack}>
                <View style={s.copy}>
                  <Text style={s.label}>
                    {pack.name}
                    {status.defaultPackId === pack.id ? ' · 默认' : ''}
                  </Text>
                  <Text style={s.hint}>
                    {local
                      ? `${(local.bytes / 1048576).toFixed(2)} MB · 已下载${outdated ? ' · 有更新' : ''}`
                      : `${pack.bytes ? (pack.bytes / 1048576).toFixed(2) + ' MB · ' : ''}未下载，下载后可离线播放`}
                  </Text>
                </View>
                <View style={s.actions}>
                  {(!local || outdated) && (
                    <AnimatedPressable
                      accessibilityRole="button"
                      accessibilityLabel={'下载语音包 ' + pack.name}
                      disabled={!!status.downloadId}
                      onPress={() => void download(pack.id)}
                      style={s.option}
                    >
                      <Text style={s.action}>
                        {outdated ? '更新' : '下载并使用'}
                      </Text>
                    </AnimatedPressable>
                  )}
                  {local && (
                    <>
                      <AnimatedPressable
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: settings.voicePackId === pack.id,
                        }}
                        disabled={!!status.downloadId}
                        onPress={() => update({ voicePackId: pack.id })}
                        style={[
                          s.option,
                          settings.voicePackId === pack.id && s.selected,
                        ]}
                      >
                        <Text style={s.action}>
                          {settings.voicePackId === pack.id ? '使用中' : '使用'}
                        </Text>
                      </AnimatedPressable>
                      <AnimatedPressable
                        accessibilityRole="button"
                        accessibilityLabel={'删除已下载语音包 ' + pack.name}
                        disabled={!!status.downloadId}
                        onPress={() => void practiceVoice.remove(pack.id)}
                        style={s.option}
                      >
                        <Text style={s.hint}>删除</Text>
                      </AnimatedPressable>
                    </>
                  )}
                </View>
              </View>
            );
          })}
          {!rows.size && (
            <Text style={s.hint}>
              后台尚未发布语音包，内置音效仍可正常使用。
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}
const styles = (c: ThemeColors) =>
  StyleSheet.create({
    card: { gap: 12 },
    heading: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    title: { fontSize: 16, lineHeight: 25, fontWeight: '700', color: c.text },
    hint: { fontSize: 13, lineHeight: 21, color: c.textMuted },
    label: { fontSize: 14, lineHeight: 23, color: c.text },
    action: { fontSize: 14, lineHeight: 23, color: c.brand },
    choice: {
      minHeight: 48,
      padding: 12,
      borderRadius: 12,
      backgroundColor: c.surfaceMuted,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    progress: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      padding: 12,
      backgroundColor: c.brandSoft,
      borderRadius: 12,
    },
    list: { maxHeight: 320 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    option: {
      minHeight: 48,
      padding: 10,
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: c.surfaceMuted,
    },
    selected: { backgroundColor: c.brandSoft },
    pack: {
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      gap: 10,
    },
    copy: { gap: 4 },
  });
