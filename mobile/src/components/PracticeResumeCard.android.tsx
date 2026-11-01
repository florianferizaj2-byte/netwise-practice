import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL, type AuthResponse } from '../api/client';
import { practiceCheckpoint } from '../api/practiceCheckpoint.android';
import type { PracticeCheckpoint } from '../api/practiceCheckpointStore';
import { useScreenActive } from '../navigation/ScreenActivity';
import { useThemedStyles, type ThemeColors } from '../theme';
import type { AppTab, NavigationOptions } from '../types';
import { AnimatedPressable } from './Motion';
export function PracticeResumeCard({ user, onNavigate }: { user?: AuthResponse['user']; onNavigate: (tab: AppTab, options?: NavigationOptions) => void }) {
  const [saved, setSaved] = useState<PracticeCheckpoint | null>(null);
  const active = useScreenActive(), s = useThemedStyles(styles);
  useEffect(() => {
    setSaved(null); let live = true;
    if (user && active) void practiceCheckpoint.read(JSON.stringify([API_BASE_URL, user.id, user.certificateId || ''])).then(row => { if (live) setSaved(row); }).catch(() => {});
    return () => { live = false; };
  }, [user?.id, user?.certificateId, active]);
  if (!saved || saved.completed) return null;
  return <View style={s.card} testID="practice-resume-card"><View style={s.copy}>
    <Text style={s.title}>继续上次刷题</Text><Text style={s.meta}>{saved.point || saved.section || saved.chapter || '综合练习'} · 第 {saved.index + 1} 题</Text>
  </View><AnimatedPressable accessibilityRole="button" accessibilityLabel="继续上次刷题" onPress={() => onNavigate('practice', { practiceMode: saved.mode, practiceSession: 'standard', practiceSource: 'all', practiceChapter: saved.chapter, practiceKnowledgeSection: saved.section, practiceKnowledgePoint: saved.point, practiceSelectionComplete: true, practiceQuestionId: saved.questionId })} style={s.button}><Text style={s.link}>继续刷题</Text></AnimatedPressable></View>;
}
const styles = (c: ThemeColors) => StyleSheet.create({ card: { backgroundColor: c.brandSoft, borderRadius: 16, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, copy: { flexGrow: 1, flexBasis: 180, gap: 6 }, title: { fontSize: 16, fontWeight: '700', color: c.text }, meta: { color: c.textMuted, fontSize: 13, lineHeight: 21 }, button: { minHeight: 48, padding: 12, justifyContent: 'center' }, link: { fontSize: 15, fontWeight: '700', color: c.brand } });
