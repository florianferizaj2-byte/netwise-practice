import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  mobileApi,
  type AuthResponse,
  type CommunityImagePayload,
  type CommunityMessage,
  type LeaderboardResponse,
} from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

const quickEmojis = ['😀', '🤝', '🎉', '💪', '❤️', '😂'];
const leaderboardTabs = [
  { key: 'answered', label: '刷题量', unit: '题' },
  { key: 'accuracy', label: '正确率', unit: '%' },
  { key: 'streakDays', label: '坚持天数', unit: '天' },
  { key: 'submitted', label: '提交题目', unit: '题' },
] as const;
type LeaderboardTab = typeof leaderboardTabs[number]['key'];

type CommunityScreenProps = {
  preview?: boolean;
  user?: AuthResponse['user'];
};

type PendingImage = CommunityImagePayload & { uri: string };

const previewMessages: CommunityMessage[] = [
  {
    id: 'preview-community-1',
    userId: 'other',
    authorName: '考匠同学',
    text: '欢迎来到考匠社区，大家可以在这里交流学习心得。',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'preview-community-2',
    userId: 'preview',
    authorName: '我',
    text: '一起坚持，把碎片时间用起来！💪',
    createdAt: new Date().toISOString(),
  },
];

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function imageMimeType(value?: string): PendingImage['mimeType'] {
  if (
    value === 'image/png' ||
    value === 'image/gif' ||
    value === 'image/webp'
  )
    return value;
  return 'image/jpeg';
}

export function CommunityScreen({ preview = false, user }: CommunityScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<PendingImage | null>(null);
  const [error, setError] = useState('');
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<LeaderboardTab>('answered');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState('');
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (preview) {
      setMessages(previewMessages);
      setHasMore(false);
      setNextBefore(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    void mobileApi
      .communityMessages()
      .then((result) => {
        if (!active) return;
        setMessages(result.messages);
        setHasMore(result.hasMore);
        setNextBefore(result.nextBefore);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '社区加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [preview]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length]);

  useEffect(() => {
    if (preview) return;
    const timer = setInterval(() => {
      void mobileApi
        .communityMessages()
        .then((result) => {
          setMessages((current) => {
            const byId = new Map(current.map((message) => [message.id, message]));
            result.messages.forEach((message) => byId.set(message.id, message));
            return [...byId.values()].sort(
              (left, right) =>
                new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
            );
          });
          setHasMore(result.hasMore);
          setNextBefore(result.nextBefore);
        })
        .catch(() => undefined);
    }, 10000);
    return () => clearInterval(timer);
  }, [preview]);

  async function loadOlder() {
    if (preview || loadingMore || !hasMore || !nextBefore) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = await mobileApi.communityMessages(nextBefore);
      setMessages((current) => [...result.messages, ...current]);
      setHasMore(result.hasMore);
      setNextBefore(result.nextBefore);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '更早消息加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  async function chooseImage() {
    if (sending || preview) return;
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('需要允许访问相册，才能发送图片');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      base64: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.82,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      setError('图片读取失败，请重新选择');
      return;
    }
    setAttachment({
      data: asset.base64,
      mimeType: imageMimeType(asset.mimeType),
      uri: asset.uri,
    });
  }

  function addEmoji(emoji: string) {
    if (preview || sending) return;
    setDraft((current) => `${current}${emoji}`.slice(0, 2000));
  }

  async function sendMessage() {
    const text = draft.trim();
    if (preview) {
      setDraft('');
      setAttachment(null);
      return;
    }
    if (!text && !attachment) {
      setError('先输入文字、Emoji 或选择一张图片');
      return;
    }
    setSending(true);
    setError('');
    try {
      const result = await mobileApi.sendCommunityMessage(text, attachment || undefined);
      setMessages((current) => [...current, result.message]);
      setDraft('');
      setAttachment(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '消息发送失败');
    } finally {
      setSending(false);
    }
  }

  async function openLeaderboard() {
    setLeaderboardOpen(true);
    setLeaderboardError('');
    if (preview) return;
    setLeaderboardLoading(true);
    try {
      setLeaderboard(await mobileApi.leaderboards());
    } catch (cause: unknown) {
      setLeaderboardError(cause instanceof Error ? cause.message : '排行榜加载失败');
    } finally {
      setLeaderboardLoading(false);
    }
  }

  const activeBoard = leaderboard?.[leaderboardTab];
  const activeTab = leaderboardTabs.find((tab) => tab.key === leaderboardTab)!;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.screen}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>考匠社区</Text>
          </View>
          <AnimatedPressable
            accessibilityLabel="打开排行榜"
            accessibilityRole="button"
            onPress={() => void openLeaderboard()}
            style={styles.leaderboardEntry}
          >
            <Text style={styles.leaderboardEntryText}>♛ 排行榜</Text>
          </AnimatedPressable>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {hasMore && (
            <AnimatedPressable
              disabled={loadingMore}
              onPress={() => void loadOlder()}
              style={styles.loadOlderButton}
            >
              {loadingMore ? (
                <ActivityIndicator color={colors.brand} size="small" />
              ) : (
                <Text style={styles.loadOlderText}>加载更早消息</Text>
              )}
            </AnimatedPressable>
          )}
          {loading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator color={colors.brand} />
              <Text style={styles.loadingText}>正在进入社区…</Text>
            </View>
          ) : messages.length ? (
            messages.map((message, index) => {
              const own = message.userId === user?.id || (preview && message.userId === 'preview');
              return (
                <EntranceView delay={Math.min(220, index * 25)} distance={8} key={message.id}>
                  <View style={[styles.messageRow, own && styles.messageRowOwn]}>
                    <View style={[styles.messageBlock, own && styles.messageBlockOwn]}>
                      {!own && <Text style={styles.authorName}>{message.authorName}</Text>}
                      <View style={[styles.bubble, own && styles.bubbleOwn]}>
                        {!!message.text && <Text style={[styles.messageText, own && styles.messageTextOwn]}>{message.text}</Text>}
                        {!!message.imageUrl && (
                          <Image
                            accessibilityLabel="社区图片"
                            source={{ uri: mobileApi.communityImageUrl(message.imageUrl) }}
                            style={styles.messageImage}
                          />
                        )}
                      </View>
                      <Text style={[styles.messageTime, own && styles.messageTimeOwn]}>
                        {formatMessageTime(message.createdAt)}
                      </Text>
                    </View>
                  </View>
                </EntranceView>
              );
            })
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>✦</Text>
              <Text style={styles.emptyTitle}>社区还很安静</Text>
            </View>
          )}
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        {attachment && (
          <View style={styles.attachmentPreview}>
            <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
            <Text style={styles.attachmentText}>已选择图片，发送后会保存到社区</Text>
            <AnimatedPressable onPress={() => setAttachment(null)} style={styles.removeAttachment}>
              <Text style={styles.removeAttachmentText}>×</Text>
            </AnimatedPressable>
          </View>
        )}

        <View style={styles.emojiRow}>
          {quickEmojis.map((emoji) => (
            <AnimatedPressable key={emoji} onPress={() => addEmoji(emoji)} style={styles.emojiButton}>
              <Text style={styles.emoji}>{emoji}</Text>
            </AnimatedPressable>
          ))}
        </View>
        <View style={styles.composerRow}>
          <AnimatedPressable
            accessibilityLabel="选择社区图片"
            accessibilityRole="button"
            disabled={sending || preview}
            onPress={() => void chooseImage()}
            style={styles.imageButton}
          >
            <Text style={styles.imageButtonText}>＋</Text>
          </AnimatedPressable>
          <TextInput
            editable={!sending && !preview}
            multiline
            onChangeText={(value) => setDraft(value.slice(0, 2000))}
            onSubmitEditing={() => void sendMessage()}
            placeholder={preview ? '登录后即可加入社区' : '说点什么…'}
            placeholderTextColor={colors.textFaint}
            style={styles.composerInput}
            value={draft}
          />
          <AnimatedPressable
            accessibilityLabel="发送消息"
            accessibilityRole="button"
            disabled={sending || preview}
            onPress={() => void sendMessage()}
            style={[styles.sendButton, (sending || preview) && styles.disabledButton]}
          >
            {sending ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.sendText}>发送</Text>}
          </AnimatedPressable>
        </View>
        <Modal
          animationType="slide"
          onRequestClose={() => setLeaderboardOpen(false)}
          transparent
          visible={leaderboardOpen}
        >
          <View style={styles.leaderboardBackdrop}>
            <View style={styles.leaderboardPanel}>
              <View style={styles.leaderboardHeader}>
                <View>
                  <Text style={styles.leaderboardTitle}>社区排行榜</Text>
                  <Text style={styles.leaderboardSubtitle}>一起记录每天的进步</Text>
                </View>
                <AnimatedPressable accessibilityLabel="关闭排行榜" onPress={() => setLeaderboardOpen(false)} style={styles.leaderboardClose}>
                  <Text style={styles.leaderboardCloseText}>×</Text>
                </AnimatedPressable>
              </View>
              <View style={styles.leaderboardTabs}>
                {leaderboardTabs.map((tab) => (
                  <AnimatedPressable
                    accessibilityLabel={`${tab.label}榜单`}
                    key={tab.key}
                    onPress={() => setLeaderboardTab(tab.key)}
                    style={[styles.leaderboardTab, leaderboardTab === tab.key && styles.leaderboardTabActive]}
                  >
                    <Text style={[styles.leaderboardTabText, leaderboardTab === tab.key && styles.leaderboardTabTextActive]}>{tab.label}</Text>
                  </AnimatedPressable>
                ))}
              </View>
              <Text style={styles.leaderboardRule}>
                {leaderboardTab === 'accuracy'
                  ? `至少作答 ${leaderboard?.accuracyMinAttempts ?? 20} 题参与正确率排行`
                  : leaderboardTab === 'streakDays'
                    ? '按北京时间计算连续刷题天数，今天未刷时保留昨日连续记录'
                    : leaderboardTab === 'submitted'
                      ? '统计通过双重核验并提交到服务器的题目'
                      : '统计累计作答次数'}
              </Text>
              {leaderboardLoading && <ActivityIndicator color={colors.brand} />}
              {!!leaderboardError && <Text style={styles.errorText}>{leaderboardError}</Text>}
              <ScrollView contentContainerStyle={styles.leaderboardRows} showsVerticalScrollIndicator={false}>
                {preview && <Text style={styles.leaderboardEmpty}>登录后查看真实榜单</Text>}
                {!preview && !leaderboardLoading && !leaderboardError && !activeBoard?.top.length && (
                  <Text style={styles.leaderboardEmpty}>这个榜单还没有记录，开始刷题吧。</Text>
                )}
                {activeBoard?.top.map((entry) => (
                  <View key={entry.userId} style={[styles.leaderboardRow, entry.userId === user?.id && styles.leaderboardOwnRow]}>
                    <Text style={styles.leaderboardRank}>{entry.rank}</Text>
                    <View style={styles.leaderboardPerson}>
                      <Text style={styles.leaderboardName}>{entry.name}{entry.userId === user?.id ? ' · 我' : ''}</Text>
                      {leaderboardTab === 'accuracy' && <Text style={styles.leaderboardDetail}>{entry.correct}/{entry.answered} 题正确</Text>}
                    </View>
                    <Text style={styles.leaderboardValue}>{entry.value}{activeTab.unit}</Text>
                  </View>
                ))}
              </ScrollView>
              {activeBoard?.me && activeBoard.me.rank > activeBoard.top.length && (
                <View style={[styles.leaderboardRow, styles.leaderboardOwnRow]}>
                  <Text style={styles.leaderboardRank}>{activeBoard.me.rank}</Text>
                  <Text style={styles.leaderboardName}>我的排名</Text>
                  <Text style={styles.leaderboardValue}>{activeBoard.me.value}{activeTab.unit}</Text>
                </View>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  flex: { flex: 1 },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
    padding: spacing.lg,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 36,
  },
  leaderboardEntry: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.pill,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  leaderboardEntryText: { color: colors.brandDark, fontSize: 13, fontWeight: '800' },
  leaderboardBackdrop: { backgroundColor: '#0008', flex: 1, justifyContent: 'flex-end' },
  leaderboardPanel: { backgroundColor: colors.background, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, gap: spacing.sm, height: '82%', padding: spacing.lg },
  leaderboardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  leaderboardTitle: { color: colors.text, fontSize: 23, fontWeight: '800' },
  leaderboardSubtitle: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  leaderboardClose: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  leaderboardCloseText: { color: colors.textMuted, fontSize: 28 },
  leaderboardTabs: { flexDirection: 'row', gap: 3 },
  leaderboardTab: { alignItems: 'center', borderRadius: radius.sm, flex: 1, minHeight: 36, justifyContent: 'center' },
  leaderboardTabActive: { backgroundColor: colors.brandSoft },
  leaderboardTabText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  leaderboardTabTextActive: { color: colors.brandDark, fontWeight: '800' },
  leaderboardRule: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  leaderboardRows: { gap: 5, paddingBottom: spacing.xl },
  leaderboardRow: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.sm, flexDirection: 'row', gap: spacing.sm, minHeight: 56, padding: spacing.sm },
  leaderboardOwnRow: { borderColor: colors.brand, borderWidth: 1 },
  leaderboardRank: { color: colors.brand, fontSize: 17, fontWeight: '800', textAlign: 'center', width: 32 },
  leaderboardPerson: { flex: 1 },
  leaderboardName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  leaderboardDetail: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  leaderboardValue: { color: colors.brandDark, fontSize: 15, fontWeight: '800' },
  leaderboardEmpty: { color: colors.textMuted, fontSize: 14, paddingVertical: spacing.xl, textAlign: 'center' },
  roomCard: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.md,
    ...shadow.card,
  },
  roomIcon: {
    alignItems: 'center',
    backgroundColor: '#2C9478',
    borderColor: '#75BBA2',
    borderRadius: radius.sm,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  roomIconText: {
    color: colors.white,
    fontSize: 25,
    fontWeight: '800',
  },
  roomCopy: { flex: 1, gap: 3 },
  roomTitle: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  roomText: {
    color: '#D9F0E3',
    fontSize: 12,
    lineHeight: 18,
  },
  roomStatus: {
    color: '#D9F0E3',
    fontSize: 12,
    fontWeight: '800',
  },
  storageLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingVertical: spacing.sm,
  },
  storageText: {
    color: colors.textFaint,
    fontSize: 11,
  },
  messageContent: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: spacing.xs,
  },
  loadOlderButton: {
    alignItems: 'center',
    alignSelf: 'center',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  loadOlderText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: '800',
  },
  loadingState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  messageRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  messageRowOwn: { justifyContent: 'flex-end' },
  messageBlock: { maxWidth: '84%' },
  messageBlockOwn: { alignItems: 'flex-end' },
  authorName: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
    paddingHorizontal: 3,
  },
  bubble: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderTopLeftRadius: 5,
    gap: spacing.sm,
    padding: spacing.md,
    ...shadow.card,
  },
  bubbleOwn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: 5,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextOwn: { color: colors.white },
  messageTime: {
    color: colors.textFaint,
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 3,
  },
  messageTimeOwn: { textAlign: 'right' },
  messageImage: {
    borderRadius: radius.sm,
    height: 180,
    width: 220,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyEmoji: { color: colors.gold, fontSize: 36 },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: spacing.sm,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  errorText: {
    color: colors.warning,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  attachmentPreview: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xs,
    padding: spacing.sm,
  },
  attachmentImage: {
    borderRadius: 6,
    height: 48,
    width: 48,
  },
  attachmentText: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
  },
  removeAttachment: { padding: spacing.xs },
  removeAttachmentText: {
    color: colors.warning,
    fontSize: 24,
    lineHeight: 24,
  },
  emojiRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingBottom: spacing.xs,
  },
  emojiButton: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  emoji: { fontSize: 20 },
  composerRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },
  imageButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  imageButtonText: {
    color: colors.brand,
    fontSize: 25,
    fontWeight: '500',
  },
  composerInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 96,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  sendText: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: { opacity: 0.5 },
});
