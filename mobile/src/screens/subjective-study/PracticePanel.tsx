import { iosStyles } from "../../iosStyles";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { mobileApi } from "../../api/client";
import {
  studyRequestId,
  type StudyAttempt,
  type StudySession,
} from "../../api/studyTypes";
import { useTheme, useThemedStyles } from "../../theme";
import {
  createStudyStyles,
  StudyButton,
  StudyNotice,
  studyErrorMessage,
  useStudyAlive,
} from "./study-ui";

export type StudyPracticeContext = { sessionId: string; questionId: string };

export function PracticePanel({
  initial,
  active,
  onFailure,
  onProgress,
  onContext,
  onNewGroup,
  onNextLesson,
}: {
  initial: StudySession;
  active: boolean;
  onFailure: (error: unknown) => boolean;
  onProgress: () => void;
  onContext: (context: StudyPracticeContext | null) => void;
  onNewGroup: () => void;
  onNextLesson: () => void;
}) {
  const s = useThemedStyles(createStudyStyles, iosStyles.study),
    { colors } = useTheme();
  const alive = useStudyAlive();
  const [session, setSession] = useState(initial);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initial.questions.findIndex(
        (question) =>
          !initial.attempts.some(
            (attempt) => attempt.questionId === question.id,
          ),
      ),
    ),
  );
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false),
    [note, setNote] = useState(""),
    [feedbackSaved, setFeedbackSaved] = useState(false);
  const request = useRef<{ key: string; id: string } | null>(null),
    busyRef = useRef(false);
  const scroll = useRef<ScrollView>(null),
    resultOffset = useRef(0),
    showResult = useRef(false);
  const question = session.questions[index];
  const attempt = question
    ? session.attempts.filter((item) => item.questionId === question.id).at(-1)
    : undefined;
  const answers = question ? drafts[question.id] || attempt?.answers || {} : {};
  const complete = session.questions.every((item) =>
    session.attempts.some(
      (row) => row.questionId === item.id && row.status === "graded",
    ),
  );
  const graded = session.questions.filter((item) =>
    session.attempts.some(
      (row) => row.questionId === item.id && row.status === "graded",
    ),
  ).length;
  const updateAttempt = (next: StudyAttempt) => {
    setSession((old) => ({
      ...old,
      attempts: [...old.attempts.filter((item) => item.id !== next.id), next],
    }));
    onProgress();
  };
  useEffect(() => {
    onContext(
      active && question
        ? { sessionId: session.id, questionId: question.id }
        : null,
    );
  }, [active, session.id, question?.id, onContext]);
  useEffect(() => {
    resultOffset.current = 0;
    showResult.current = false;
    scroll.current?.scrollTo({ y: 0, animated: false });
    setError("");
    setFeedbackOpen(false);
    setNote("");
    setFeedbackSaved(false);
  }, [question?.id]);
  useEffect(() => {
    if (!active || !attempt?.processing) return;
    let current = true;
    const timer = setInterval(() => {
      void mobileApi
        .studyAttempt(attempt.id)
        .then((next) => {
          if (current && alive.current) updateAttempt(next);
        })
        .catch((failure) => {
          if (current && !onFailure(failure))
            setError(studyErrorMessage(failure));
        });
    }, 2500);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [active, attempt?.id, attempt?.processing]);
  async function submit() {
    if (!question || busyRef.current || attempt) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    Keyboard.dismiss();
    const key = JSON.stringify([session.id, question.id, answers]);
    if (request.current?.key !== key)
      request.current = { key, id: studyRequestId() };
    try {
      const result = await mobileApi.submitStudyAttempt(
        session.id,
        question.id,
        answers,
        request.current.id,
      );
      if (alive.current) {
        showResult.current = true;
        updateAttempt(result);
      }
    } catch (failure) {
      if (alive.current && !onFailure(failure))
        setError(studyErrorMessage(failure) + " 你的填写已保留，可以重试。");
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function retryGrade() {
    if (!attempt || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await mobileApi.retryStudyAttempt(attempt.id);
      if (alive.current) {
        updateAttempt(result);
        scroll.current?.scrollTo({ y: resultOffset.current, animated: false });
      }
    } catch (failure) {
      if (alive.current && !onFailure(failure))
        setError(studyErrorMessage(failure));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function feedback() {
    if (!attempt || note.trim().length < 2 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await mobileApi.studyFeedback(attempt.id, note.trim());
      if (alive.current) {
        setFeedbackSaved(true);
        setFeedbackOpen(false);
      }
    } catch (failure) {
      if (alive.current && !onFailure(failure))
        setError(studyErrorMessage(failure));
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(false);
    }
  }
  if (!question)
    return (
      <View style={s.state}>
        <Text style={s.body}>这组练习没有可用题目，请重新打开本课。</Text>
        <StudyButton label="重新打开练习" onPress={onNewGroup} />
      </View>
    );
  return (
    <View style={s.root}>
      <ScrollView
        ref={scroll}
        style={s.scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        <View style={s.section}>
          <View style={s.headerLine}>
            <Text style={s.label}>填空练习</Text>
            <Text style={s.meta}>
              已完成 {graded} / {session.questions.length} 题
            </Text>
          </View>
          <View style={s.questionNav}>
            {session.questions.map((item, position) => {
              const done = session.attempts.some(
                (row) => row.questionId === item.id && row.status === "graded",
              );
              return (
                <Pressable
                  key={item.id}
                  disabled={busy}
                  accessibilityRole="button"
                  aria-pressed={position === index}
                  accessibilityLabel={`第 ${position + 1} 题${done ? "，已完成" : ""}`}
                  accessibilityState={{
                    selected: position === index,
                    disabled: busy,
                  }}
                  onPress={() => setIndex(position)}
                  style={({ pressed }) => [
                    s.questionNavButton,
                    position === index && s.questionNavActive,
                    pressed && s.pressed,
                  ]}
                >
                  <Text style={s.label}>
                    {position + 1}
                    {done ? " ✓" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={s.question}>
          <Text style={s.meta}>{question.stage}题</Text>
          <Text style={s.questionStem}>
            {question.stem.split(/(\{\{b[1-3]\}\})/g).map((part, position) => {
              const token = part.match(/^\{\{(b[1-3])\}\}$/);
              const blankIndex = token
                ? question.blanks.findIndex((blank) => blank.id === token[1])
                : -1;
              return (
                <Text key={position} style={token ? s.blankText : undefined}>
                  {token ? `〔第 ${blankIndex + 1} 空〕` : part}
                </Text>
              );
            })}
          </Text>
          {question.blanks.map((blank, position) => (
            <View key={blank.id} style={s.blankField}>
              <Text style={s.label}>
                第 {position + 1} 空 · {blank.label}
                {blank.unit ? `（${blank.unit}）` : ""}
              </Text>
              <TextInput
                accessibilityLabel={`第 ${position + 1} 空答案`}
                value={answers[blank.id] || ""}
                maxLength={400}
                editable={!attempt && !busy}
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType={
                  blank.kind === "number"
                    ? "numbers-and-punctuation"
                    : "default"
                }
                onChangeText={(value) =>
                  setDrafts((old) => ({
                    ...old,
                    [question.id]: { ...answers, [blank.id]: value },
                  }))
                }
                placeholder="写出你的答案"
                placeholderTextColor={colors.textMuted}
                style={[s.input, !!attempt && s.inputGraded]}
              />
            </View>
          ))}
        </View>
        {!!error && <StudyNotice>{error}</StudyNotice>}
        {attempt && (
          <View
            style={s.result}
            accessibilityLiveRegion="polite"
            onLayout={(event) => {
              resultOffset.current = Math.max(
                0,
                event.nativeEvent.layout.y - 16,
              );
              if (showResult.current) {
                showResult.current = false;
                scroll.current?.scrollTo({
                  y: resultOffset.current,
                  animated: false,
                });
              }
            }}
          >
            <Text style={s.sectionTitle}>
              {attempt.processing
                ? "正在确认答案"
                : attempt.status !== "graded"
                  ? "部分表达需要复核"
                  : attempt.correct
                    ? "全部答对了"
                    : "再看一遍这些空"}
            </Text>
            <Text style={s.body}>
              {attempt.score} / {attempt.maxScore} 分
            </Text>
            {attempt.results.map((row, position) => (
              <View key={row.blankId} style={s.resultRow}>
                <Text style={s.label}>
                  第 {position + 1} 空 ·{" "}
                  {row.verdict === "correct"
                    ? "答对了"
                    : row.verdict === "uncertain"
                      ? "等待复核"
                      : "需要纠正"}
                </Text>
                <Text style={s.body}>你的答案：{row.response || "未填写"}</Text>
                {row.verdict !== "uncertain" && (
                  <Text style={s.body}>参考答案：{row.expectedAnswer}</Text>
                )}
                <Text style={s.meta}>{row.reason}</Text>
              </View>
            ))}
            {!!attempt.explanation && (
              <Text style={s.body}>{attempt.explanation}</Text>
            )}
            {!!attempt.reviewNote && (
              <Text style={s.body}>复核说明：{attempt.reviewNote}</Text>
            )}
            {attempt.retryable && (
              <StudyButton
                label="重新判分"
                secondary
                busy={busy}
                onPress={() => void retryGrade()}
              />
            )}
            {!feedbackOpen && !feedbackSaved && (
              <Pressable
                accessibilityRole="button"
                onPress={() => setFeedbackOpen(true)}
                style={s.textAction}
              >
                <Text style={s.actionText}>对评分有疑问</Text>
              </Pressable>
            )}
            {feedbackSaved && (
              <Text style={s.body}>已提交反馈，复核后会更新这次成绩。</Text>
            )}
            {feedbackOpen && (
              <View style={s.section}>
                <Text style={s.label}>说明你认为需要复核的地方</Text>
                <TextInput
                  accessibilityLabel="评分反馈"
                  multiline
                  maxLength={500}
                  value={note}
                  onChangeText={setNote}
                  style={[s.input, s.feedbackInput]}
                />
                <StudyButton
                  label="提交评分反馈"
                  secondary
                  busy={busy}
                  disabled={note.trim().length < 2}
                  onPress={() => void feedback()}
                />
              </View>
            )}
          </View>
        )}
        {complete && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>这一组练完了</Text>
            <Text style={s.body}>
              带着刚刚容易混淆的地方再读一遍，也可以继续下一课。
            </Text>
            <StudyButton label="再练一组" secondary onPress={onNewGroup} />
          </View>
        )}
      </ScrollView>
      <View style={s.footer}>
        {!attempt ? (
          <StudyButton
            label="提交本题"
            busy={busy}
            disabled={
              !question.blanks.every((blank) =>
                (answers[blank.id] || "").trim(),
              )
            }
            onPress={() => void submit()}
          />
        ) : complete ? (
          <StudyButton label="继续下一课" onPress={onNextLesson} />
        ) : index < session.questions.length - 1 ? (
          <StudyButton
            label="下一题"
            disabled={busy || !!attempt.processing}
            onPress={() => setIndex((value) => value + 1)}
          />
        ) : (
          <StudyButton
            label="回到未完成的题"
            onPress={() =>
              setIndex(
                Math.max(
                  0,
                  session.questions.findIndex(
                    (item) =>
                      !session.attempts.some(
                        (row) =>
                          row.questionId === item.id && row.status === "graded",
                      ),
                  ),
                ),
              )
            }
          />
        )}
      </View>
    </View>
  );
}
