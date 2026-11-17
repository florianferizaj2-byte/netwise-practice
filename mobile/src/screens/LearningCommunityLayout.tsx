import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, FlatList, Image, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { mobileApi, type AuthResponse, type CommunityMessage } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { ContentPlaceholder } from '../components/ContentPlaceholder';
import { AnimatedPressable } from '../components/Motion';
import { useTheme, useThemedStyles, type ThemeColors } from '../theme';

type Props = {
  active: boolean;
  readOnly: boolean;
  user?: AuthResponse['user'];
  messages: CommunityMessage[];
  listRef: RefObject<FlatList<CommunityMessage> | null>;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string;
  draft: string;
  attachmentUri?: string;
  sending: boolean;
  onNearLatest: (value: boolean) => void;
  onListSizeChange: () => void;
  onRefresh: () => void;
  onLoadOlder: () => void;
  onSignIn?: () => void;
  onPickImage: () => void;
  onRemoveAttachment: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

const timeFormat = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const dateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

function messageDate(value?: string) {
  const date = new Date(value ?? '');
  return Number.isNaN(date.getTime()) ? null : date;
}

function Avatar({ name, uri }: { name: string; uri?: string }) {
  const s = useThemedStyles(styles);
  const [failedUri, setFailedUri] = useState('');
  const initial = Array.from(name)[0] ?? '考';
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.avatar}>
    {uri && uri !== failedUri
      ? <Image source={{ uri }} style={s.avatarPhoto} onError={() => setFailedUri(uri)} />
      : <Text allowFontScaling={false} style={s.avatarInitial}>{initial.toUpperCase()}</Text>}
  </View>;
}

export function LearningCommunityLayout({
  active, readOnly, user, messages, listRef, loading, loadingMore, hasMore, error,
  draft, attachmentUri, sending, onNearLatest, onListSizeChange, onRefresh,
  onLoadOlder, onSignIn, onPickImage, onRemoveAttachment, onDraftChange, onSend,
}: Props) {
  const s = useThemedStyles(styles);
  const { colors, reduceMotion } = useTheme();
  const { width } = useWindowDimensions();
  const inputRef = useRef<TextInput>(null);
  const wasActive = useRef(active);
  const [atLatest, setAtLatest] = useState(true);
  // Inverting the list puts offset zero at the visual bottom, including on first open.
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const canSend = !sending && !!(draft.trim() || attachmentUri);
  const ownAvatar = user?.avatarUrl ? mobileApi.resolveDownloadUrl(user.avatarUrl) : undefined;
  const imageWidth = Math.min(216, Math.max(96, (width - 32) * 0.78 - 24));

  useEffect(() => {
    if (!active && wasActive.current) {
      inputRef.current?.blur();
      Keyboard.dismiss();
    }
    wasActive.current = active;
  }, [active]);

  return <KeyboardAvoidingView testID="learning-community" behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.screen}>
    <View style={s.header}>
      <View style={s.headerIcon}><AppIcon name="message" size={20} color={colors.brandDark} /></View>
      <View style={s.headerCopy}>
        <Text accessibilityRole="header" style={s.title}>社区</Text>
      </View>
      {!readOnly && <AnimatedPressable accessibilityRole="button" accessibilityLabel="刷新社区" disabled={loading} onPress={onRefresh} style={s.iconButton}>
        {loading ? <ActivityIndicator color={colors.brand} size="small" /> : <AppIcon name="refresh" size={21} color={colors.brandDark} />}
      </AnimatedPressable>}
    </View>

    <View style={s.chatBody}>
    <FlatList
      inverted ref={listRef} data={newestFirst} keyExtractor={(item) => item.id} style={s.feed}
      testID="learning-community-feed" contentContainerStyle={[s.feedContent, !messages.length && s.emptyFeed]}
      initialNumToRender={15} maxToRenderPerBatch={10} windowSize={7}
      keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }} onContentSizeChange={onListSizeChange}
      onScroll={({ nativeEvent: { contentOffset } }) => {
        const latest = contentOffset.y < 100;
        onNearLatest(latest);
        setAtLatest(latest);
      }} scrollEventThrottle={100}
      ListFooterComponent={hasMore ? <AnimatedPressable accessibilityRole="button" onPress={onLoadOlder} disabled={loadingMore} style={s.history}>
        <Text style={s.linkText}>{loadingMore ? '正在加载…' : '查看历史消息'}</Text>
      </AnimatedPressable> : null}
      ListEmptyComponent={loading && !readOnly ? <ContentPlaceholder rows={3} /> : <View style={s.empty}>
        <View style={s.emptyIcon}><AppIcon name="message" size={28} color={colors.brandDark} /></View>
        <Text accessibilityRole="header" style={s.emptyTitle}>{readOnly ? '登录参与聊天' : error ? '社区暂时连不上' : '还没有消息'}</Text>
        <Text style={s.emptyDescription}>{readOnly ? '登录后可以查看和发送社区消息。' : error ? '可以点右上角刷新，稍后再试。' : '发条消息，和大家打个招呼。'}</Text>
      </View>}
      renderItem={({ item, index }) => {
        const own = !!user && item.userId === user.id;
        const name = item.authorName?.trim() || '同学';
        const date = messageDate(item.createdAt);
        const older = newestFirst[index + 1];
        const olderDate = messageDate(older?.createdAt);
        const startsDay = !!date && date.toDateString() !== olderDate?.toDateString();
        return <View>
          {date && startsDay && <View style={s.dateRow}>
            <Text style={s.dateLabel}>{dateFormat.format(date)}</Text>
          </View>}
          <View style={[s.messageRow, own && s.ownRow]}>
            <Avatar name={name} uri={own ? ownAvatar : undefined} />
            <View style={[s.messageStack, own && s.ownStack]}>
              {!own && <Text style={s.author}>{name}</Text>}
              <View testID={own ? 'community-self-bubble' : 'community-peer-bubble'} style={[s.bubble, own && s.ownBubble]}>
                {!!item.text && <Text selectable style={s.bodyText}>{item.text}</Text>}
                {!!item.imageUrl && <Image accessibilityLabel="讨论图片" source={{ uri: mobileApi.communityImageUrl(item.imageUrl) }} resizeMode="contain" style={[s.postImage, { width: imageWidth }]} />}
              </View>
              {date && <Text style={s.time}>{timeFormat.format(date)}</Text>}
            </View>
          </View>
        </View>;
      }}
    />

    {!readOnly && !atLatest && !!messages.length && <AnimatedPressable accessibilityRole="button" onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion })} style={s.returnLatest}>
      <Text style={s.linkText}>回到最新</Text><AppIcon name="chevron-down" size={16} color={colors.brandDark} />
    </AnimatedPressable>}
    </View>
    {readOnly ? <View style={s.composer}>
      {onSignIn && <AnimatedPressable accessibilityRole="button" onPress={onSignIn} style={s.loginButton}>
        <Text style={s.loginText}>去登录</Text><AppIcon name="arrow" size={18} color={colors.white} />
      </AnimatedPressable>}
    </View> : <View style={s.composer}>
      {!!error && <Text accessibilityLiveRegion="polite" style={s.error}>{error}</Text>}
      {!!attachmentUri && <View style={s.attachment}>
        <Image accessibilityLabel="待发送图片" source={{ uri: attachmentUri }} style={s.attachmentImage} />
        <Text style={s.attachmentLabel}>已选图片</Text>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="移除已选图片" onPress={onRemoveAttachment} disabled={sending} style={s.iconButton}>
          <AppIcon name="close" size={19} color={colors.textMuted} />
        </AnimatedPressable>
      </View>}
      <View style={s.composerRow}>
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="选择社区图片" onPress={onPickImage} disabled={sending} style={s.iconButton}>
          <AppIcon name="image" size={21} color={colors.brandDark} />
        </AnimatedPressable>
        <TextInput ref={inputRef} accessibilityLabel="写下讨论" multiline editable={!sending} maxLength={2000}
          value={draft} onChangeText={onDraftChange} placeholder="发条消息…" placeholderTextColor={colors.textFaint} style={s.input} />
        <AnimatedPressable accessibilityRole="button" accessibilityLabel="发送消息" disabled={!canSend} onPress={onSend} style={[s.sendButton, !canSend && s.sendDisabled]}>
          {sending ? <ActivityIndicator color={colors.brandDark} size="small" /> : <AppIcon name="send" size={21} color={canSend ? colors.white : colors.textFaint} />}
        </AnimatedPressable>
      </View>
    </View>}
  </KeyboardAvoidingView>;
}

const styles = (c: ThemeColors) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  header: { paddingHorizontal: 16, paddingVertical: 3, gap: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  headerIcon: { width: 36, height: 36, borderRadius: 10, flexShrink: 0, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: c.text, fontSize: 21, fontWeight: '700' },
  iconButton: { width: 48, minHeight: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chatBody: { flex: 1 },
  feed: { flex: 1 },
  feedContent: { paddingHorizontal: 16, paddingVertical: 10 },
  emptyFeed: { flexGrow: 1, justifyContent: 'center' },
  history: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  linkText: { color: c.brandDark, fontSize: 13, fontWeight: '700' },
  dateRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 13 },
  dateLabel: { color: c.textMuted, fontSize: 12, backgroundColor: c.surfaceMuted, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 13 },
  ownRow: { flexDirection: 'row-reverse' },
  avatar: { width: 34, height: 34, borderRadius: 17, overflow: 'hidden', backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: c.brandDark, fontSize: 15, fontWeight: '700' },
  avatarPhoto: { width: '100%', height: '100%' },
  messageStack: { maxWidth: '80%', minWidth: 0, flexShrink: 1, alignItems: 'flex-start', gap: 3 },
  ownStack: { alignItems: 'flex-end' },
  author: { color: c.textMuted, fontSize: 12, fontWeight: '600', paddingHorizontal: 3 },
  bubble: { backgroundColor: c.surface, borderColor: c.border, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, borderTopLeftRadius: 5, paddingHorizontal: 11, paddingVertical: 8, gap: 5 },
  ownBubble: { backgroundColor: c.brandSoft, borderColor: c.brandSoft, borderTopLeftRadius: 18, borderTopRightRadius: 5 },
  time: { color: c.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  bodyText: { color: c.text, fontSize: 15, lineHeight: 23 },
  postImage: { aspectRatio: 4/3, borderRadius: 8, backgroundColor: c.surfaceMuted },
  empty: { alignItems: 'center', paddingVertical: 34, paddingHorizontal: 16, gap: 8 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: c.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: c.textMuted, fontSize: 13, lineHeight: 22, textAlign: 'center' },
  returnLatest: { position: 'absolute', right: 12, bottom: 8, minHeight: 48, paddingHorizontal: 14, gap: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: c.brandSoft, borderColor: c.border, borderWidth: 1, borderRadius: 18 },
  composer: { backgroundColor: c.surface, borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 7, paddingVertical: 5, gap: 5 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  input: { flex: 1, minWidth: 0, minHeight: 48, maxHeight: 112, paddingHorizontal: 11, paddingVertical: 12, borderRadius: 12, backgroundColor: c.surfaceMuted, color: c.text, fontSize: 14, lineHeight: 20 },
  sendButton: { width: 48, height: 48, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action },
  sendDisabled: { backgroundColor: c.surfaceMuted },
  loginButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 8, backgroundColor: c.action, borderRadius: 11, marginHorizontal: 6 },
  loginText: { color: c.white, fontSize: 14, fontWeight: '700' },
  attachment: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 9 },
  attachmentImage: { width: 42, height: 42, borderRadius: 7 },
  attachmentLabel: { flex: 1, color: c.textMuted, fontSize: 13 },
  error: { color: c.warning, fontSize: 13, paddingHorizontal: 8 },
});
