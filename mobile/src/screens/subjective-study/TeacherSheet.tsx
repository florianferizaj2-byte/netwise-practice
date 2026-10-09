import { iosStyles } from "../../iosStyles";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "../../components/SafeArea";
import { mobileApi } from "../../api/client";
import {
  studyRequestId,
  type StudyTeacherMessage,
  type StudyTeacherRequest,
} from "../../api/studyTypes";
import { useTheme, useThemedStyles } from "../../theme";
import { type StudyPracticeContext } from "./PracticePanel";
import {
  createStudyStyles,
  StudyButton,
  StudyNotice,
  studyErrorMessage,
  useStudyAlive,
} from "./study-ui";

export function TeacherSheet({
  open,
  active,
  nodeId,
  nodeTitle,
  context,
  onClose,
  onFailure,
}: {
  open: boolean;
  active: boolean;
  nodeId: string;
  nodeTitle: string;
  context: StudyPracticeContext | null;
  onClose: () => void;
  onFailure: (error: unknown) => boolean;
}) {
  const s = useThemedStyles(createStudyStyles, iosStyles.study),
    { colors } = useTheme(),
    alive = useStudyAlive();
  const compact = useWindowDimensions().height < 560;
  const [messages, setMessages] = useState<StudyTeacherMessage[]>([]);
  const [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const busyRef = useRef(false),
    revision = useRef(0),
    request = useRef<{ key: string; id: string } | null>(null);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (!open || !active) return;
    const id = ++revision.current;
    setLoading(true);
    void mobileApi
      .studyTeacherHistory(nodeId)
      .then((data) => {
        if (alive.current && revision.current === id)
          setMessages(data.messages);
      })
      .catch((failure) => {
        if (alive.current && revision.current === id && !onFailure(failure))
          setError(studyErrorMessage(failure));
      })
      .finally(() => {
        if (alive.current && revision.current === id) setLoading(false);
      });
    return () => {
      revision.current++;
    };
  }, [open, active, nodeId]);
  async function ask(action: StudyTeacherRequest["action"], message: string) {
    if (busyRef.current || message.trim().length < 2) return;
    busyRef.current = true;
    revision.current++;
    setLoading(false);
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    const body = {
      nodeId,
      action,
      message: message.trim(),
      ...(context || {}),
    };
    const key = JSON.stringify(body);
    if (request.current?.key !== key)
      request.current = { key, id: studyRequestId() };
    try {
      const result = await mobileApi.askStudyTeacher({
        ...body,
        requestId: request.current.id,
      });
      if (alive.current) {
        setMessages((old) =>
          [...old, { question: message.trim(), answer: result.answer }].slice(
            -10,
          ),
        );
        if (action === "ask")
          setDraft((old) => (old.trim() === message.trim() ? "" : old));
        request.current = null;
      }
    } catch (failure) {
      if (alive.current && !onFailure(failure))
        setError(studyErrorMessage(failure) + " 问题已保留，可以重试。");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const close = () => {
    Keyboard.dismiss();
    onClose();
  };
  return (
    <Modal
      transparent
      visible={open && active}
      animationType="fade"
      onRequestClose={close}
    >
      <KeyboardAvoidingView
        style={s.sheetBackdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <Pressable
          accessible={false}
          importantForAccessibility="no"
          onPress={close}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView
          style={s.sheet}
          role="dialog"
          accessibilityLabel="AI 老师"
          accessibilityViewIsModal
        >
          <View style={s.sheetHeader}>
            <View style={s.headerLine}>
              <Text style={s.headerTitle}>问老师</Text>
              <Pressable
                accessibilityRole="button"
                onPress={close}
                style={s.textAction}
              >
                <Text style={s.actionText}>收起</Text>
              </Pressable>
            </View>
            <Text style={s.meta} numberOfLines={2}>
              {nodeTitle}
              {context ? " · 当前填空题" : " · 本课答疑"}
            </Text>
          </View>
          <ScrollView
            ref={scroll}
            style={s.scroll}
            contentContainerStyle={s.sheetContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: false })
            }
          >
            {loading && (
              <ContentPlaceholder rows={2} />
            )}
            {!messages.length && !loading && (
              <View style={s.teacherAnswer}>
                <Text style={s.sectionTitle}>卡在哪里，一起拆开看。</Text>
                <Text style={s.body}>
                  {context
                    ? "可以问当前题目的思路，或让老师换一种方式解释。作答前会先给提示。"
                    : "问本课不理解的地方，或直接让老师换个说法、举个例子。"}
                </Text>
              </View>
            )}
            {messages.map((item, index) => (
              <View style={s.section} key={index}>
                <Text style={s.teacherQuestion}>{item.question}</Text>
                <View style={s.teacherAnswer}>
                  <Text style={s.body}>{item.answer.conclusion}</Text>
                  {item.answer.points.map((point, pointIndex) => (
                    <Text style={s.body} key={pointIndex}>
                      {point}
                    </Text>
                  ))}
                  {!!item.answer.example && (
                    <View style={s.example}>
                      <Text style={s.label}>再看一个例子</Text>
                      <Text style={s.body}>{item.answer.example}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
            {busy && (
              <View accessibilityLiveRegion="polite" style={s.row}>
                <ActivityIndicator color={colors.brand} />
                <Text style={s.meta}>老师正在整理思路…</Text>
              </View>
            )}
            {!!error && <StudyNotice>{error}</StudyNotice>}
          </ScrollView>
          <View style={s.teacherComposer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.wrap}
              style={{ flexGrow: 0 }}
            >
              <StudyButton
                label="换个说法"
                secondary
                disabled={busy}
                onPress={() => void ask("simple", "请换一种简单的说法解释")}
              />
              <StudyButton
                label="举个例子"
                secondary
                disabled={busy}
                onPress={() => void ask("example", "请给我一个具体的例子")}
              />
              {!!context && (
                <StudyButton
                  label="给我提示"
                  secondary
                  disabled={busy}
                  onPress={() => void ask("hint", "请提示这道题的解题思路")}
                />
              )}
            </ScrollView>
            <View style={compact ? s.row : { gap: 12 }}>
              <TextInput
                accessibilityLabel="向 AI 老师提问"
                placeholder="例如：为什么要从最右边开始算？"
                placeholderTextColor={colors.textMuted}
                value={draft}
                onChangeText={setDraft}
                maxLength={600}
                multiline
                style={[
                  s.input,
                  s.teacherInput,
                  compact && { flex: 1, minHeight: 50, maxHeight: 72 },
                ]}
                editable={!busy}
              />
              <StudyButton
                label="发送问题"
                busy={busy}
                disabled={draft.trim().length < 2}
                onPress={() => void ask("ask", draft)}
              />
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
import { ContentPlaceholder } from '../../components/ContentPlaceholder';
