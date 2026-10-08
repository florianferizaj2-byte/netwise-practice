import { iosStyles } from "../../iosStyles";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { mobileApi, type AuthResponse } from "../../api/client";
import {
  studyNodeTitle,
  type StudyCatalog,
  type StudyLesson,
  type StudyNode,
  type StudySession,
} from "../../api/studyTypes";
import { useScreenActive } from "../../navigation/ScreenActivity";
import { useTheme, useThemedStyles } from "../../theme";
import { PracticePanel, type StudyPracticeContext } from "./PracticePanel";
import { TeacherSheet } from "./TeacherSheet";
import {
  createStudyStyles,
  StudyButton,
  StudyNotice,
  studyAccessDenied,
  studyErrorCode,
  studyErrorMessage,
  useStudyAlive,
} from "./study-ui";

type StudyView = "directory" | "learn" | "practice";
type Position = { nodeId: string; mode: StudyView };

export function SubjectiveStudyScreen({
  visible,
  preview,
  user,
  certificateName,
  onClose,
  onOpenMembership,
  onOpenCertificates,
  onOpenPractice,
}: {
  visible: boolean;
  preview: boolean;
  user?: AuthResponse["user"];
  certificateName: string;
  onClose: () => void;
  onOpenMembership: () => void;
  onOpenCertificates: () => void;
  onOpenPractice: () => void;
}) {
  const screenActive = useScreenActive(),
    active = screenActive && visible;
  const s = useThemedStyles(createStudyStyles, iosStyles.study),
    { colors } = useTheme(),
    alive = useStudyAlive();
  const [catalog, setCatalog] = useState<StudyCatalog | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(""),
    [mode, setMode] = useState<StudyView>("directory");
  const [lesson, setLesson] = useState<StudyLesson | null>(null),
    [lessonLoading, setLessonLoading] = useState(false);
  const [session, setSession] = useState<StudySession | null>(null),
    [practiceLoading, setPracticeLoading] = useState(false),
    [completing, setCompleting] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false),
    [context, setContext] = useState<StudyPracticeContext | null>(null);
  const [search, setSearch] = useState(""),
    [chapter, setChapter] = useState("全部");
  const catalogRevision = useRef(0),
    lessonRevision = useRef(0),
    practiceRevision = useRef(0),
    completionBusy = useRef(false),
    practiceBusy = useRef(false);
  const catalogRef = useRef(catalog),
    selectedRef = useRef(selectedId),
    activeRef = useRef(active),
    modeRef = useRef(mode),
    restored = useRef(false);
  catalogRef.current = catalog;
  selectedRef.current = selectedId;
  activeRef.current = active;
  modeRef.current = mode;
  const positionKey = `kaojiang-study-position:${user?.id || "preview"}:${user?.certificateId || "none"}`;
  const selected = catalog?.nodes.find((node) => node.id === selectedId);
  const revoke = useCallback(() => {
    catalogRevision.current++;
    lessonRevision.current++;
    practiceRevision.current++;
    const next: StudyCatalog = {
      access: false,
      supported: catalogRef.current?.supported ?? true,
      nodes: [],
    };
    catalogRef.current = next;
    setCatalog(next);
    setLesson(null);
    setSession(null);
    setTeacherOpen(false);
    setContext(null);
    setSelectedId("");
    setMode("directory");
    setLoading(false);
    setLessonLoading(false);
    setPracticeLoading(false);
  }, []);
  const onFailure = useCallback(
    (failure: unknown) => {
      if (studyAccessDenied(failure)) {
        revoke();
        setError("会员权益已失效，请开通或续期后继续。");
        return true;
      }
      if (
        ["STUDY_CONTENT_SUSPENDED", "STUDY_LESSON_NOT_READY"].includes(
          studyErrorCode(failure),
        )
      ) {
        lessonRevision.current++;
        practiceRevision.current++;
        setLesson(null);
        setSession(null);
        setTeacherOpen(false);
        setMode("directory");
        setError("这节课的内容正在更新，请重新选择已开放课程。");
        const revision = ++catalogRevision.current;
        void mobileApi
          .studyCatalog()
          .then((data) => {
            if (alive.current && revision === catalogRevision.current) {
              catalogRef.current = data;
              setCatalog(data);
              if (!data.access) revoke();
            }
          })
          .catch((error) => {
            if (alive.current && revision === catalogRevision.current)
              setError(studyErrorMessage(error));
          });
        return true;
      }
      return false;
    },
    [revoke, alive],
  );
  const refreshCatalog = useCallback(
    async (quiet = false) => {
      if (preview || !user || !activeRef.current) return null;
      const revision = ++catalogRevision.current;
      if (!quiet) {
        setLoading(true);
        setError("");
      }
      try {
        const [data, saved] = await Promise.all([
          mobileApi.studyCatalog(),
          restored.current
            ? Promise.resolve(null)
            : AsyncStorage.getItem(positionKey).catch(() => null),
        ]);
        if (!alive.current || revision !== catalogRevision.current) return null;
        if (
          !data.access ||
          (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now())
        ) {
          revoke();
          return data;
        }
        catalogRef.current = data;
        setCatalog(data);
        if (!restored.current) {
          restored.current = true;
          try {
            const position = saved ? (JSON.parse(saved) as Position) : null;
            if (
              position &&
              data.nodes.some(
                (node) => node.id === position.nodeId && node.available,
              )
            ) {
              const node = data.nodes.find(
                (item) => item.id === position.nodeId,
              )!;
              setSelectedId(position.nodeId);
              setMode(
                position.mode === "practice" && node.completed
                  ? "practice"
                  : position.mode === "directory"
                    ? "directory"
                    : "learn",
              );
            }
          } catch {
            /* A damaged position never prevents opening the directory. */
          }
        }
        const oldId = selectedRef.current;
        if (
          oldId &&
          !data.nodes.some((node) => node.id === oldId && node.available)
        ) {
          lessonRevision.current++;
          practiceRevision.current++;
          setLesson(null);
          setSession(null);
          setTeacherOpen(false);
          setSelectedId("");
          setMode("directory");
        }
        return data;
      } catch (failure) {
        if (
          alive.current &&
          revision === catalogRevision.current &&
          !onFailure(failure)
        )
          setError(studyErrorMessage(failure));
        return null;
      } finally {
        if (alive.current && revision === catalogRevision.current)
          setLoading(false);
      }
    },
    [preview, user?.id, positionKey, alive, revoke, onFailure],
  );
  useEffect(() => {
    if (!active) return;
    void refreshCatalog();
    const timer = setInterval(() => void refreshCatalog(true), 60000);
    return () => {
      catalogRevision.current++;
      clearInterval(timer);
    };
  }, [active, refreshCatalog]);
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        if (mode === "directory") onClose();
        else setMode("directory");
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, mode, onClose]);
  useEffect(() => {
    if (!catalog?.access || !catalog.expiresAt) return;
    const delay = new Date(catalog.expiresAt).getTime() - Date.now();
    if (!Number.isFinite(delay)) return;
    if (delay <= 0) {
      revoke();
      return;
    }
    const expiresAt = new Date(catalog.expiresAt).getTime();
    const timer = setInterval(
      () => {
        if (Date.now() >= expiresAt) revoke();
      },
      Math.min(delay, 60000),
    );
    return () => clearInterval(timer);
  }, [catalog?.access, catalog?.expiresAt, revoke]);
  useEffect(() => {
    if (!selectedId || !catalog?.access) return;
    // Only a resume position is persisted; lessons, answers and teacher replies stay in memory.
    void AsyncStorage.setItem(
      positionKey,
      JSON.stringify({ nodeId: selectedId, mode }),
    ).catch(() => {});
  }, [selectedId, mode, catalog?.access, positionKey]);
  useEffect(() => {
    if (!active || !selected?.available || mode === "directory") return;
    if (
      lesson?.node.id === selected.id &&
      lesson.packageId === selected.packageId
    )
      return;
    const revision = ++lessonRevision.current;
    setLesson(null);
    setLessonLoading(true);
    setError("");
    setSession(null);
    setContext(null);
    setTeacherOpen(false);
    void mobileApi
      .studyLesson(selected.id)
      .then((data) => {
        if (alive.current && revision === lessonRevision.current) {
          if (data.packageId !== selected.packageId) {
            setMode("directory");
            void refreshCatalog(true);
            return;
          }
          setLesson(data);
        }
      })
      .catch((failure) => {
        if (
          alive.current &&
          revision === lessonRevision.current &&
          !onFailure(failure)
        )
          setError(studyErrorMessage(failure));
      })
      .finally(() => {
        if (alive.current && revision === lessonRevision.current)
          setLessonLoading(false);
      });
    return () => {
      lessonRevision.current++;
    };
  }, [active, selected?.id, selected?.packageId, mode === "directory"]);
  const startGroup = useCallback(
    async (resume = true) => {
      const node = catalogRef.current?.nodes.find(
        (item) => item.id === selectedRef.current,
      );
      if (
        !node?.available ||
        !catalogRef.current?.access ||
        practiceBusy.current
      )
        return;
      practiceBusy.current = true;
      const revision = ++practiceRevision.current;
      setPracticeLoading(true);
      setError("");
      try {
        const result = await mobileApi.startStudyPractice(node.id, resume);
        if (
          alive.current &&
          revision === practiceRevision.current &&
          result.nodeId === selectedRef.current
        ) {
          if (result.packageId !== node.packageId) {
            setSession(null);
            setMode("directory");
            void refreshCatalog(true);
            return;
          }
          setSession(result);
        }
      } catch (failure) {
        if (
          alive.current &&
          revision === practiceRevision.current &&
          !onFailure(failure)
        ) {
          setError(studyErrorMessage(failure));
          if (
            modeRef.current === "practice" &&
            studyErrorCode(failure) === "STUDY_LEARNING_REQUIRED"
          )
            setMode("learn");
        }
      } finally {
        practiceBusy.current = false;
        if (alive.current && revision === practiceRevision.current)
          setPracticeLoading(false);
      }
    },
    [alive, onFailure, refreshCatalog],
  );
  useEffect(() => {
    if (
      active &&
      mode === "practice" &&
      lesson &&
      selected?.completed &&
      !session &&
      !practiceLoading
    )
      void startGroup();
    if (mode !== "practice") setContext(null);
  }, [active, mode, lesson, selected?.completed, session, startGroup]);
  const onProgress = useCallback(() => {
    void refreshCatalog(true);
  }, [refreshCatalog]);
  const onContext = useCallback(
    (next: StudyPracticeContext | null) => setContext(next),
    [],
  );
  async function completeAndPractice() {
    if (!selected || completionBusy.current) return;
    completionBusy.current = true;
    setCompleting(true);
    setError("");
    try {
      if (!selected.completed) {
        try {
          await mobileApi.completeStudyLesson(
            selected.id,
            selected.progressVersion,
          );
        } catch (failure) {
          if (studyErrorCode(failure) !== "STUDY_PROGRESS_CONFLICT")
            throw failure;
        }
        const data = await refreshCatalog(true);
        if (!alive.current || !data?.access) return;
        if (!data.nodes.find((node) => node.id === selected.id)?.completed) {
          setError("学习进度已更新，请重新确认本课完成。");
          return;
        }
      }
      if (
        alive.current &&
        activeRef.current &&
        modeRef.current === "learn" &&
        selectedRef.current === selected.id &&
        catalogRef.current?.access
      )
        setMode("practice");
    } catch (failure) {
      if (alive.current && !onFailure(failure))
        setError(studyErrorMessage(failure));
    } finally {
      completionBusy.current = false;
      if (alive.current) setCompleting(false);
    }
  }
  function openLesson(node: StudyNode, resume = false) {
    if (!node.available) return;
    if (node.id === selectedId && lesson?.packageId === node.packageId) {
      setError("");
      setMode(resume && session && node.completed ? "practice" : "learn");
      return;
    }
    lessonRevision.current++;
    practiceRevision.current++;
    setLesson(null);
    setSession(null);
    setContext(null);
    setError("");
    setSelectedId(node.id);
    setMode("learn");
  }
  function nextLesson() {
    const available =
      catalogRef.current?.nodes.filter((node) => node.available) || [];
    const next =
      available[
        available.findIndex((node) => node.id === selectedRef.current) + 1
      ];
    if (next) openLesson(next);
    else setMode("directory");
  }
  const available = catalog?.nodes.filter((node) => node.available) || [];
  const completed = available.filter((node) => node.completed).length;
  const continueNode = selected?.available
    ? selected
    : available.find((node) => !node.completed) || available[0];
  const chapters = [
    ...new Set(catalog?.nodes.map((node) => node.chapter) || []),
  ];
  const filtered =
    catalog?.nodes.filter(
      (node) =>
        (chapter === "全部" || node.chapter === chapter) &&
        `${node.name} ${node.parentName || ""} ${studyNodeTitle(node)} ${node.chapter}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    ) || [];
  const gate =
    preview ||
    !user ||
    !catalog?.access ||
    !catalog.supported ||
    !available.length;
  return (
    <KeyboardAvoidingView
      style={[s.root, !visible && s.hidden]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
    >
      <View style={s.header}>
        <View style={s.headerLine}>
          <Pressable
            accessibilityRole="button"
            style={s.textAction}
            onPress={() =>
              mode === "directory" ? onClose() : setMode("directory")
            }
          >
            <Text style={s.actionText}>
              {mode === "directory" ? "返回 VIP" : "课程目录"}
            </Text>
          </Pressable>
          {!gate && mode !== "directory" && !!lesson && (
            <Pressable
              accessibilityRole="button"
              style={s.textAction}
              onPress={() => setTeacherOpen(true)}
            >
              <Text style={s.actionText}>问老师</Text>
            </Pressable>
          )}
        </View>
        <View style={s.headerLine}>
          <Text style={s.headerTitle}>AI 精炼</Text>
          <Text style={[s.meta, s.flex, { textAlign: "right" }]}>
            {certificateName}
          </Text>
        </View>
      </View>
      {gate ? (
        <ScrollView contentContainerStyle={s.state}>
          {loading ? (
            <>
              <ActivityIndicator color={colors.brand} />
              <Text style={s.body}>正在同步课程与学习进度…</Text>
            </>
          ) : (
            <>
              <Text style={s.title}>
                {preview || !user
                  ? "登录后开始学习"
                  : !catalog
                    ? "课程暂未同步"
                    : !catalog.access
                      ? "把知识点，真正学进去"
                      : !catalog.supported
                        ? "这个科目的课程正在准备"
                        : "精讲课程正在准备"}
              </Text>
              <Text style={s.reading}>
                {preview || !user
                  ? "AI 精炼为会员提供知识点精讲、填空练习与老师答疑。登录后可查看你的课程。"
                  : !catalog
                    ? "请重新同步课程目录，进度会随账号保存。"
                    : !catalog.access
                      ? "先读懂一节短课，再用填空检验理解。卡住的地方，随时问老师。有效 VIP、SVIP、SSVIP 均可使用。"
                      : "当前已开放网络工程师课程。你可以切换备考目标开始学习，也可以继续当前科目的题库练习。"}
              </Text>
              {!!error && <StudyNotice>{error}</StudyNotice>}
              {!preview && !!user && !catalog && (
                <StudyButton
                  label="重新同步课程"
                  onPress={() => void refreshCatalog()}
                />
              )}
              {!preview && !!user && catalog && !catalog.access && (
                <StudyButton label="去开通或续期" onPress={onOpenMembership} />
              )}
              {!!catalog?.access && (
                <>
                  <StudyButton
                    label="切换备考目标"
                    onPress={onOpenCertificates}
                  />
                  <StudyButton
                    secondary
                    label="继续题库练习"
                    onPress={onOpenPractice}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>
      ) : mode === "directory" ? (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={s.section}>
            <Text style={s.title}>学一课，练到会。</Text>
            <Text style={s.body}>
              先读精讲，再做 5 道填空。把每个知识点留在脑海里。
            </Text>
            <View style={s.row}>
              <Text style={s.meta}>
                已读 {completed} / {available.length} 课
              </Text>
              {loading && (
                <ActivityIndicator color={colors.brand} size="small" />
              )}
            </View>
            <View style={s.progress}>
              <View
                style={[
                  s.progressFill,
                  { width: `${(completed / available.length) * 100}%` },
                ]}
              />
            </View>
          </View>
          {continueNode && (
            <View style={s.feature}>
              <Text style={s.label}>
                {selected?.available ? "接着学" : "从这里开始"}
              </Text>
              <Text style={s.featureTitle}>{studyNodeTitle(continueNode)}</Text>
              <Text style={s.meta}>
                {continueNode.chapter}
                {continueNode.sublesson ? ` · ${continueNode.parentName}` : ""}
              </Text>
              <StudyButton
                label={selected?.available ? "继续本课" : "开始第一课"}
                onPress={() => openLesson(continueNode, true)}
              />
            </View>
          )}
          {!!error && <StudyNotice>{error}</StudyNotice>}
          <View style={s.section}>
            <Text style={s.sectionTitle}>课程目录</Text>
            <TextInput
              accessibilityLabel="搜索知识点"
              value={search}
              onChangeText={setSearch}
              placeholder="搜索知识点，例如 OSI、子网"
              placeholderTextColor={colors.textMuted}
              style={s.search}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.chapterList}
            >
              {["全部", ...chapters].map((item) => (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  aria-pressed={chapter === item}
                  accessibilityState={{ selected: chapter === item }}
                  onPress={() => setChapter(item)}
                  style={[
                    s.chapterButton,
                    chapter === item && s.chapterSelected,
                  ]}
                >
                  <Text style={s.chapterText}>{item}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          {!filtered.length && (
            <Text style={s.body}>没有找到这个知识点，试试另一个关键词。</Text>
          )}
          {chapters
            .filter((item) => filtered.some((node) => node.chapter === item))
            .map((item) => (
              <View style={s.courseSection} key={item}>
                <Text style={s.sectionTitle}>{item}</Text>
                {filtered
                  .filter((node) => node.chapter === item)
                  .map((node) => (
                    <Pressable
                      key={node.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${studyNodeTitle(node)}，${!node.available ? "准备中" : node.mastery.mastered ? "已掌握" : node.completed ? "已读" : "未读"}`}
                      accessibilityState={{ disabled: !node.available }}
                      disabled={!node.available}
                      onPress={() => openLesson(node)}
                      style={({ pressed }) => [
                        s.courseRow,
                        pressed && s.pressed,
                      ]}
                    >
                      <View style={s.flex}>
                        <Text style={s.courseTitle}>
                          {studyNodeTitle(node)}
                        </Text>
                        {node.sublesson && (
                          <Text style={s.meta}>
                            {node.parentName} · 第 {node.sublesson.order} /{" "}
                            {node.sublesson.total} 课
                          </Text>
                        )}
                      </View>
                      <Text style={node.available ? s.courseStatus : s.meta}>
                        {!node.available
                          ? "准备中"
                          : node.mastery.mastered
                            ? "已掌握"
                            : node.completed
                              ? "已读 ›"
                              : "开始 ›"}
                      </Text>
                    </Pressable>
                  ))}
              </View>
            ))}
        </ScrollView>
      ) : (
        <>
          <View style={s.tabs} accessibilityRole="tablist">
            {(["learn", "practice"] as const).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                aria-selected={mode === item}
                accessibilityState={{
                  selected: mode === item,
                  disabled: item === "practice" && !selected?.completed,
                }}
                disabled={item === "practice" && !selected?.completed}
                onPress={() => setMode(item)}
                style={[s.tab, mode === item && s.tabSelected]}
              >
                <Text
                  style={[
                    s.tabText,
                    mode === item && s.tabSelectedText,
                    item === "practice" && !selected?.completed && s.disabled,
                  ]}
                >
                  {item === "learn" ? "知识精讲" : "填空练习"}
                </Text>
              </Pressable>
            ))}
          </View>
          {mode === "learn" ? (
            <>
              <ScrollView style={s.scroll} contentContainerStyle={s.content}>
                <Text style={s.meta}>
                  {selected?.chapter}
                  {selected?.sublesson
                    ? ` · ${selected.parentName} · 第 ${selected.sublesson.order} / ${selected.sublesson.total} 课`
                    : ""}
                </Text>
                {!!error && <StudyNotice>{error}</StudyNotice>}
                {lessonLoading ? (
                  <ActivityIndicator
                    accessibilityLabel="加载精讲"
                    color={colors.brand}
                  />
                ) : lesson ? (
                  <>
                    <Text style={s.title}>{lesson.lesson.title}</Text>
                    <View style={s.lead}>
                      <Text style={s.label}>先记住这一句</Text>
                      <Text style={s.reading}>{lesson.lesson.summary}</Text>
                    </View>
                    <View style={s.section}>
                      <Text style={s.sectionTitle}>把要点拆开看</Text>
                      {lesson.lesson.points.map((point, index) => (
                        <View style={s.point} key={index}>
                          <View style={s.pointMark} />
                          <Text style={[s.reading, s.flex]}>{point}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={s.example}>
                      <Text style={s.label}>用一个例子理解</Text>
                      <Text style={s.reading}>{lesson.lesson.example}</Text>
                    </View>
                    <View style={s.pitfall}>
                      <Text style={s.sectionTitle}>这个地方容易混淆</Text>
                      <Text style={s.body}>{lesson.lesson.pitfall}</Text>
                    </View>
                  </>
                ) : (
                  <StudyButton
                    secondary
                    label="重新加载本课"
                    onPress={() => {
                      setMode("directory");
                    }}
                  />
                )}
              </ScrollView>
              {!!lesson && !lessonLoading && (
                <View style={s.footer}>
                  <StudyButton
                    label={
                      selected?.completed
                        ? "开始填空练习"
                        : "我学完了，开始练习"
                    }
                    busy={completing}
                    onPress={() => void completeAndPractice()}
                  />
                </View>
              )}
            </>
          ) : !session ? (
            <View style={s.state}>
              {practiceLoading || lessonLoading ? (
                <>
                  <ActivityIndicator color={colors.brand} />
                  <Text style={s.body}>正在准备本课练习…</Text>
                </>
              ) : (
                <>
                  <StudyNotice>{error || "尚未打开本课练习。"}</StudyNotice>
                  <StudyButton
                    label="重新打开练习"
                    onPress={() => void startGroup()}
                  />
                </>
              )}
            </View>
          ) : null}
        </>
      )}
      {!!session && !gate && (
        <View style={[s.root, mode !== "practice" && s.hidden]}>
          <PracticePanel
            key={session.id}
            initial={session}
            active={active && mode === "practice"}
            onFailure={onFailure}
            onProgress={onProgress}
            onContext={onContext}
            onNewGroup={() => void startGroup(false)}
            onNextLesson={nextLesson}
          />
        </View>
      )}
      {selected && lesson && (
        <TeacherSheet
          key={`${selected.id}:${lesson.packageId}`}
          open={teacherOpen}
          active={active}
          nodeId={selected.id}
          nodeTitle={studyNodeTitle(selected)}
          context={mode === "practice" ? context : null}
          onClose={() => setTeacherOpen(false)}
          onFailure={onFailure}
        />
      )}
    </KeyboardAvoidingView>
  );
}
