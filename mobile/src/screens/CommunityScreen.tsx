import { AppIcon } from '../components/AppIcon';
import { iosStyles } from '../iosStyles';
import { LeaderboardModal } from './LeaderboardModal';
import { LearningCommunityLayout } from './LearningCommunityLayout';
import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { prepareCommunityImage } from '../platform/communityImage';
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
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
} from '../api/client';
import { AnimatedPressable, EntranceView } from '../components/Motion';
import { useScreenActive } from '../navigation/ScreenActivity';
import { mergeMessages } from '../api/communityMessages';
import { communityCursor, type CommunityCursor } from '../api/communityUnread';
import { isAppleWeb, radius, shadow, spacing, useThemedStyles, useTheme, type ThemeColors } from '../theme';

type CommunityScreenProps = {
  preview?: boolean;
  user?: AuthResponse['user'];
  onClose?: () => void;
  showLeaderboard?: boolean;
  learning?: boolean;
  onSignIn?: () => void;
  onLatestLoaded?: (latest: CommunityCursor | null) => void;
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

export function CommunityScreen({ preview = false, user, onClose, showLeaderboard = true, learning = false, onSignIn, onLatestLoaded }: CommunityScreenProps) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles, iosStyles.community);
  const active = useScreenActive();
  const readOnly = preview || (learning && !user);
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
  const [refreshKey, setRefreshKey] = useState(0);
  const scrollRef = useRef<FlatList<CommunityMessage> | null>(null);
  const initialized = useRef(false);
  const historyLoaded = useRef(false);
  const sendPending = useRef(false);
  const nearBottom = useRef(true);
  const scrollAfterUpdate = useRef(false);

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    let polling = false;
    const controller = new AbortController();
    if (!initialized.current) setLoading(true);
    setError('');
    if (readOnly) {
      setMessages(learning ? [] : previewMessages);
      setHasMore(false);
      setNextBefore(null);
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    async function refresh() {
      if (polling) return;
      polling = true;
      try {
        const result = await mobileApi.communityMessages(undefined, 50, controller.signal);
        if (!mounted) return;
        onLatestLoaded?.(communityCursor(result.messages.at(-1)));
        scrollAfterUpdate.current = !initialized.current || nearBottom.current;
        setMessages((current) => mergeMessages(current, result.messages));
        // The older-history cursor belongs to loadOlder, never to polling.
        if (!historyLoaded.current) {
          setHasMore(result.hasMore);
          setNextBefore(result.nextBefore);
        }
        initialized.current = true;
        setError('');
      } catch (cause: unknown) {
        if (mounted) setError(cause instanceof Error ? cause.message : '社区加载失败');
      } finally {
        polling = false;
        if (mounted) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 10000);
    return () => { mounted = false; controller.abort(); clearInterval(timer); };
  }, [active, readOnly, learning, refreshKey, onLatestLoaded]);

  async function loadOlder() {
    if (readOnly || loadingMore || !hasMore || !nextBefore) return;
    setLoadingMore(true);
    historyLoaded.current = true;
    scrollAfterUpdate.current = false;
    setError('');
    try {
      const result = await mobileApi.communityMessages(nextBefore);
      setMessages((current) => mergeMessages(current, result.messages));
      setHasMore(result.hasMore);
      setNextBefore(result.nextBefore);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '更早消息加载失败');
    } finally {
      setLoadingMore(false);
    }
  }

  async function chooseImage() {
    if (sending || readOnly) return;
    setError('');
    try {
      // Safari must open the picker directly from the user's tap.
      if (Platform.OS !== 'web') {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          setError('需要允许访问相册，才能发送图片');
          return;
        }
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        base64: true,
        mediaTypes: ['images'],
        quality: 0.82,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = await prepareCommunityImage(result.assets[0]);
      if (!asset.base64) {
        setError('图片读取失败，请重新选择');
        return;
      }
      if ((asset.fileSize ?? Math.ceil(asset.base64.length * 3 / 4)) > 6 * 1024 * 1024) {
        setError('图片不能超过 6 MB，请选择较小的图片');
        return;
      }
      setAttachment({
        data: asset.base64,
        mimeType: imageMimeType(asset.mimeType),
        uri: asset.uri,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法读取相册，请重新选择图片');
    }
  }

  async function sendMessage() {
    if (sendPending.current) return;
    const text = draft.trim();
    if (readOnly) {
      setDraft('');
      setAttachment(null);
      return;
    }
    if (!text && !attachment) {
      setError('先输入文字或选择一张图片');
      return;
    }
    setSending(true);
    sendPending.current = true;
    setError('');
    try {
      const result = await mobileApi.sendCommunityMessage(text, attachment || undefined);
      scrollAfterUpdate.current = true;
      setMessages((current) => mergeMessages(current, [result.message]));
      setDraft('');
      setAttachment(null);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : '消息发送失败');
    } finally {
      sendPending.current = false;
      setSending(false);
    }
  }

  if (learning) {
    return <LearningCommunityLayout
      active={active} readOnly={readOnly} user={user} messages={messages}
      listRef={scrollRef} loading={loading} loadingMore={loadingMore} hasMore={hasMore} error={error}
      draft={draft} attachmentUri={attachment?.uri} sending={sending}
      onNearLatest={(value) => { nearBottom.current = value; }}
      onListSizeChange={() => {
        if (scrollAfterUpdate.current) {
          scrollAfterUpdate.current = false;
          scrollRef.current?.scrollToOffset({ offset: 0, animated: false });
        }
      }}
      onRefresh={() => { setLoading(true); setRefreshKey((key) => key + 1); }} onLoadOlder={() => void loadOlder()}
      onSignIn={onSignIn} onPickImage={() => void chooseImage()} onRemoveAttachment={() => setAttachment(null)}
      onDraftChange={(value) => setDraft(value.slice(0, 2000))} onSend={() => void sendMessage()}
    />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <View style={styles.screen}>
        <View style={[styles.header, !showLeaderboard && styles.chatHeader]}>
          {onClose && (
            <AnimatedPressable
              accessibilityLabel="返回我的"
              accessibilityRole="button"
              onPress={onClose}
              style={styles.backButton}
            >
              <Text style={styles.backButtonText}>‹ 我的</Text>
            </AnimatedPressable>
          )}
          <View>
            <Text style={styles.title}>考匠社区</Text>
          </View>
          {showLeaderboard && <AnimatedPressable
            accessibilityLabel="打开排行榜"
            accessibilityRole="button"
            onPress={() => setLeaderboardOpen(true)}
            style={styles.leaderboardEntry}
          >
            {isAppleWeb && <AppIcon name="trophy" size={17} color={colors.brand} />}
            <Text style={styles.leaderboardEntryText}>排行榜</Text>
          </AnimatedPressable>}
        </View>

        <FlatList
          ref={scrollRef}
          data={messages}
          keyExtractor={(message) => message.id}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentContainerStyle={styles.messageContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          onScroll={({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
            nearBottom.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 100;
          }}
          scrollEventThrottle={100}
          onContentSizeChange={() => {
            if (scrollAfterUpdate.current) {
              scrollAfterUpdate.current = false;
              scrollRef.current?.scrollToEnd({ animated: false });
            }
          }}
          ListHeaderComponent={hasMore ? (
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
          ) : null}
          ListEmptyComponent={loading ? (
            <ContentPlaceholder rows={3} />
          ) : (
            <View style={styles.emptyState}>
              <AppIcon name="message" style={styles.emptyEmoji}>✦</AppIcon>
              <Text style={styles.emptyTitle}>社区还很安静</Text>
            </View>
          )}
          renderItem={({ item: message }) => {
              const own = message.userId === user?.id || (preview && message.userId === 'preview');
              return (
                <View>
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
                </View>
              );
          }}
          ListFooterComponent={error ? <Text style={styles.errorText}>{error}</Text> : null}
        />

        {attachment && (
          <View style={styles.attachmentPreview}>
            <Image source={{ uri: attachment.uri }} style={styles.attachmentImage} />
            <Text style={styles.attachmentText}>已选择图片，发送后会保存到社区</Text>
            <AnimatedPressable accessibilityLabel="移除已选图片" onPress={() => setAttachment(null)} style={styles.removeAttachment}>
              <AppIcon style={styles.removeAttachmentText}>×</AppIcon>
            </AnimatedPressable>
          </View>
        )}

        <View style={styles.composerRow}>
          <AnimatedPressable
            accessibilityLabel="选择社区图片"
            accessibilityRole="button"
            disabled={sending || preview}
            onPress={() => void chooseImage()}
            style={styles.imageButton}
          >
            <AppIcon style={styles.imageButtonText}>＋</AppIcon>
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
            {sending ? <ActivityIndicator color={colors.white} size="small" /> : <AppIcon name="send" style={styles.sendText}>发送</AppIcon>}
          </AnimatedPressable>
        </View>
        {showLeaderboard && active && leaderboardOpen && (
          <LeaderboardModal user={preview ? undefined : user} onClose={() => setLeaderboardOpen(false)} />
        )}
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
  chatHeader: { justifyContent: 'flex-start', gap: spacing.sm },
  backButton: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: spacing.sm,
  },
  backButtonText: { color: colors.brandDark, fontSize: 13, fontWeight: '800' },
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
import { ContentPlaceholder } from '../components/ContentPlaceholder';
