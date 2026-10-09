import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleCheck,
  Crown,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Target,
} from "lucide-react";
import { api, invalidateApiCache, peekCachedApi } from "../api.js";
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
import { FeatureBoundary } from "../components/feature-boundary.jsx";
import { preloadableFeature } from "../components/preloadable-feature.js";
import {
  Stem,
  StudyNotice as Notice,
  handleStudyAccessFailure as handleAccessFailure,
} from "../components/study-content.jsx";
import { LessonContent, StudyTeacher } from "../components/study-lesson.jsx";
import "../subjective-study.css";

const Practice = preloadableFeature(() =>
  import("./study-practice.jsx").then((module) => ({
    default: module.StudyPractice,
  })),
);
const encode = encodeURIComponent;
const statusName = {
  graded: "已判分",
  pending_review: "待复核",
  processing: "正在判分",
};
const chooseNode = (catalog, key) => {
  let saved = "";
  try {
    saved = localStorage.getItem(key);
  } catch {
    /* Optional position recovery. */
  }
  return (
    catalog?.nodes.find((node) => node.id === saved)?.id ||
    catalog?.nodes.find((node) => node.available && !node.completed)?.id ||
    catalog?.nodes.find((node) => node.available)?.id ||
    catalog?.nodes[0]?.id ||
    ""
  );
};

function StudyPlaceholder() {
  return (
    <div className="ss-layout" aria-busy="true">
      <div className="ss-directory">
        <ContentPlaceholder variant="list" rows={5} />
      </div>
      <div className="ss-workspace ss-placeholder-workspace">
        <ContentPlaceholder rows={5} />
      </div>
    </div>
  );
}

export function SubjectiveStudy({ user, navigate }) {
  const tabKey = `aceexam-study-tab:${user.id}:${user.certificateId}`;
  const selectionKey = `aceexam-study-position:${user.id}:${user.certificateId}`;
  const [catalog, setCatalog] = useState(
    () => peekCachedApi("/study/catalog") || null,
  );
  const [selected, setSelected] = useState(() =>
    chooseNode(peekCachedApi("/study/catalog"), selectionKey),
  );
  const [chapter, setChapter] = useState("");
  const [expandedTopics, setExpandedTopics] = useState([]);
  const [tab, setTab] = useState(() => {
    try {
      return localStorage.getItem(tabKey) === "practice" ? "practice" : "learn";
    } catch {
      return "learn";
    }
  });
  const [practiceVisited, setPracticeVisited] = useState(tab === "practice");
  const [lesson, setLesson] = useState(() =>
    selected
      ? peekCachedApi(`/study/lessons/${encode(selected)}`) || null
      : null,
  );
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(!catalog);
  const [error, setError] = useState(""),
    [lessonError, setLessonError] = useState(""),
    [completing, setCompleting] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false),
    [teacherVisited, setTeacherVisited] = useState(false);
  const [lessonRevision, setLessonRevision] = useState(0);
  const mounted = useRef(true),
    reading = useRef(0),
    catalogReading = useRef(0),
    completionPending = useRef(false),
    workspace = useRef(null);
  const revokeAccess = useCallback(() => {
    reading.current++;
    catalogReading.current++;
    invalidateApiCache("/study/");
    setCatalog((old) => (old ? { ...old, access: false, nodes: [] } : old));
    setLesson(null);
    setContext(null);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(tabKey, tab);
    } catch {
      /* Optional tab recovery. */
    }
  }, [tabKey, tab]);
  const reload = useCallback(
    async (force = false) => {
      const request = ++catalogReading.current;
      let data = await api("/study/catalog", undefined, undefined, { force });
      if (!mounted.current || request !== catalogReading.current) return;
      if (
        !data.access ||
        (data.expiresAt && Date.parse(data.expiresAt) <= Date.now())
      ) {
        data = { ...data, access: false, nodes: [] };
        revokeAccess();
      }
      setCatalog(data);
      setError("");
      setSelected((current) =>
        data.nodes.some((node) => node.id === current)
          ? current
          : chooseNode(data, selectionKey),
      );
      return data;
    },
    [selectionKey, revokeAccess],
  );
  useEffect(() => {
    mounted.current = true;
    void reload()
      .catch((failure) => {
        if (mounted.current && failure.name !== "CacheCancelledError")
          setError(failure.message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [reload]);
  useEffect(() => {
    const refreshVisible = () => {
      if (!document.hidden) void reload().catch(() => {});
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 60000);
    const remaining =
      catalog?.access && catalog.expiresAt
        ? Date.parse(catalog.expiresAt) - Date.now()
        : NaN;
    const expiry =
      Number.isFinite(remaining) && remaining <= 2147483647
        ? window.setTimeout(
            () => {
              revokeAccess();
              void reload(true).catch(() => {});
            },
            Math.max(0, remaining),
          )
        : null;
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(timer);
      if (expiry !== null) window.clearTimeout(expiry);
    };
  }, [reload, catalog?.access, catalog?.expiresAt, revokeAccess]);
  const node =
    catalog?.nodes.find((item) => item.id === selected) || catalog?.nodes[0];
  const currentLesson =
    lesson?.node.id === node?.id && lesson?.packageId === node?.packageId
      ? lesson
      : null;
  const next = catalog?.nodes.find(
    (item) => item.order > node?.order && item.available,
  );
  useEffect(() => {
    if (node) setChapter(node.chapter);
    setContext(null);
    try {
      if (selected) localStorage.setItem(selectionKey, selected);
    } catch {
      /* Optional position recovery. */
    }
  }, [selected, selectionKey]);
  useEffect(() => {
    const revision = ++reading.current;
    setLessonError("");
    if (!node?.available || !catalog?.access) {
      setLesson(null);
      return;
    }
    const path = `/study/lessons/${encode(node.id)}`;
    const cached = peekCachedApi(path);
    setLesson(cached?.packageId === node.packageId ? cached : null);
    api(path)
      .then((data) => {
        if (mounted.current && reading.current === revision) setLesson(data);
      })
      .catch((failure) => {
        if (
          mounted.current &&
          reading.current === revision &&
          failure.name !== "CacheCancelledError" &&
          !handleAccessFailure(failure, revokeAccess)
        )
          setLessonError(failure.message);
      });
    return () => {
      reading.current++;
    };
  }, [selected, node?.packageId, catalog?.access, lessonRevision]);
  useEffect(() => {
    if (!currentLesson || !next || !catalog?.access) return;
    const timer = setTimeout(() => {
      void api(`/study/lessons/${encode(next.id)}`).catch((failure) => {
        if (mounted.current) handleAccessFailure(failure, revokeAccess);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [currentLesson?.packageId, next?.id, catalog?.access, revokeAccess]);
  const refreshProgress = useCallback(() => {
    void reload(true).catch(() => {});
  }, [reload]);
  const openPractice = () => {
    void Practice.preload().catch(() => {});
    setPracticeVisited(true);
    setTeacherOpen(false);
    setTab("practice");
  };
  const preloadPractice = () => {
    void Practice.preload().catch(() => {});
    if (node?.completed)
      void api(
        "/study/practice-sessions",
        { nodeId: node.id, resume: true },
        "POST",
        { cache: { ttl: 300000 } },
      ).catch(() => {});
  };
  const complete = async () => {
    if (completionPending.current) return;
    completionPending.current = true;
    setCompleting(true);
    setLessonError("");
    try {
      if (!node.completed) {
        await api(`/study/lessons/${encode(node.id)}/complete`, {
          version: node.progressVersion,
        });
        await reload(true);
      }
      if (mounted.current) openPractice();
    } catch (failure) {
      if (mounted.current && !handleAccessFailure(failure, revokeAccess)) {
        setLessonError(failure.message);
        void reload(true).catch(() => {});
      }
    } finally {
      completionPending.current = false;
      if (mounted.current) setCompleting(false);
    }
  };
  const changeNode = (id) => {
    if (id !== selected) {
      setLesson(peekCachedApi(`/study/lessons/${encode(id)}`) || null);
      setSelected(id);
      setPracticeVisited(false);
      setTeacherOpen(false);
      setTeacherVisited(false);
      setContext(null);
      requestAnimationFrame(() =>
        workspace.current?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        }),
      );
    }
    setTab("learn");
  };
  const manualRefresh = () => {
    invalidateApiCache("/study/");
    setLessonRevision((value) => value + 1);
    setLoading(true);
    void reload(true)
      .catch((failure) => setError(failure.message))
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  };
  const chapters = [
    ...new Set(catalog?.nodes.map((item) => item.chapter) || []),
  ];
  const activeNodes =
    catalog?.nodes.filter((item) => item.chapter === chapter) || [];
  const activeSections = [
    ...new Set(activeNodes.map((item) => item.section)),
  ].map((name) => {
    const topics = [];
    for (const item of activeNodes.filter((row) => row.section === name)) {
      const key = item.parentId || item.id;
      let topic = topics.find((row) => row.key === key);
      if (!topic) {
        topic = { key, name: item.parentName || item.name, units: [] };
        topics.push(topic);
      }
      topic.units.push(item);
    }
    return { name, topics };
  });
  const siblings = node
    ? activeNodes.filter(
        (item) => (item.parentId || item.id) === (node.parentId || node.id),
      )
    : [];
  const nodeButton = (item, name = item.name) => (
    <button
      key={item.id}
      className={item.id === selected ? "active" : ""}
      aria-current={item.id === selected ? "page" : undefined}
      onMouseEnter={() => {
        if (item.available)
          void api(`/study/lessons/${encode(item.id)}`).catch(() => {});
      }}
      onClick={() => changeNode(item.id)}
    >
      <span>
        {name}
        <small>
          {item.mastery.mastered
            ? "已掌握"
            : item.completed
              ? "已学，继续巩固"
              : item.available
                ? "可以学习"
                : "准备中"}
        </small>
      </span>
      {item.completed ? <CircleCheck size={16} /> : <ArrowRight size={15} />}
    </button>
  );
  return (
    <div className="subjective-study" data-mode={tab}>
      <header className="ss-heading">
        <div>
          <h1>AI 精讲与练习</h1>
          <p>一次学透一个知识点，再用练习检验掌握。</p>
        </div>
        <button
          disabled={loading}
          aria-label="刷新学习目录"
          onClick={manualRefresh}
        >
          <RefreshCw
            size={17}
            className={loading ? "spin" : undefined}
            aria-hidden="true"
          />
        </button>
      </header>
      {error && <Notice error>{error}</Notice>}
      {!catalog && loading ? (
        <StudyPlaceholder />
      ) : !catalog ? (
        <button onClick={manualRefresh}>重试</button>
      ) : !catalog.access ? (
        <div className="ss-gate">
          <Crown size={30} />
          <h2>VIP 专属的学习与练习</h2>
          <p>
            开通或续期 VIP 后，可学习精讲、完成填空练习并向 AI
            老师提问。VIP、SVIP、SSVIP 均可使用。
          </p>
          <button className="primary" onClick={() => navigate("vip")}>
            开通或续期 VIP
            <ArrowRight size={17} />
          </button>
        </div>
      ) : !catalog.supported ? (
        <div className="ss-gate">
          <BookOpen size={30} />
          <h2>当前证书的课程正在准备</h2>
          <p>
            已开放网络工程师和四川专升本计算机基础课程。你可以在侧栏切换证书，或继续普通练习。
          </p>
          <button onClick={() => navigate("chapters")}>返回章节练习</button>
        </div>
      ) : (
        <div className="ss-layout">
          <nav className="ss-directory" aria-label="精讲与练习目录">
            <label htmlFor="ss-chapter">章节</label>
            <select
              id="ss-chapter"
              value={chapter}
              onChange={(event) => {
                const first = catalog.nodes.find(
                  (item) => item.chapter === event.target.value,
                );
                if (first) changeNode(first.id);
              }}
            >
              {chapters.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <label className="ss-compact-node" htmlFor="ss-node-select">
              <span>知识点与小节</span>
              <select
                id="ss-node-select"
                aria-label="知识点与小节"
                value={node.id}
                onChange={(event) => changeNode(event.target.value)}
              >
                {activeSections.map((section) => (
                  <optgroup key={section.name} label={section.name}>
                    {section.topics.flatMap((topic) =>
                      topic.units.map((item) => (
                        <option key={item.id} value={item.id}>
                          {topic.units.length > 1
                            ? `${topic.name} · 第${item.sublesson.order}节 ${item.sublesson.title}`
                            : item.name}
                          {item.available ? "" : "（准备中）"}
                        </option>
                      )),
                    )}
                  </optgroup>
                ))}
              </select>
            </label>
            <p className="ss-directory-progress">
              已学 {activeNodes.filter((item) => item.completed).length} /{" "}
              {activeNodes.length} 节
            </p>
            {activeSections.map((section) => (
              <section key={section.name}>
                <h3>{section.name}</h3>
                {section.topics.map((topic) =>
                  topic.units.length === 1 ? (
                    nodeButton(topic.units[0], topic.name)
                  ) : (
                    <div className="ss-directory-topic" key={topic.key}>
                      <button
                        className={`ss-topic-summary ${topic.units.some((item) => item.id === selected) ? "active" : ""}`}
                        aria-expanded={expandedTopics.includes(topic.key)}
                        aria-controls={`ss-topic-units-${topic.key}`}
                        onClick={() =>
                          setExpandedTopics((current) =>
                            current.includes(topic.key)
                              ? current.filter((key) => key !== topic.key)
                              : [...current, topic.key],
                          )
                        }
                      >
                        <span>
                          {topic.name}
                          <small>
                            已学{" "}
                            {
                              topic.units.filter((item) => item.completed)
                                .length
                            }{" "}
                            / {topic.units.length} 节
                          </small>
                        </span>
                        <ChevronDown
                          className={`ss-topic-chevron ${expandedTopics.includes(topic.key) ? "expanded" : ""}`}
                          size={17}
                          aria-hidden="true"
                        />
                      </button>
                      <div
                        className="ss-directory-units"
                        id={`ss-topic-units-${topic.key}`}
                        hidden={!expandedTopics.includes(topic.key)}
                      >
                        {topic.units.map((item) =>
                          nodeButton(
                            item,
                            `${item.sublesson.order}. ${item.sublesson.title}`,
                          ),
                        )}
                      </div>
                    </div>
                  ),
                )}
              </section>
            ))}
          </nav>
          <div className="ss-workspace" ref={workspace}>
            <div className="ss-workspace-title">
              <div>
                <p>
                  {node.chapter} / {node.section}
                </p>
                <h2>{node.parentName || node.name}</h2>
                {node.sublesson && (
                  <p className="ss-current-sublesson">
                    第 {node.sublesson.order} 节 · {node.sublesson.title}
                  </p>
                )}
              </div>
              <button
                aria-expanded={teacherOpen}
                aria-controls="ss-teacher-slot"
                onClick={() => {
                  setTeacherVisited(true);
                  setTeacherOpen(!teacherOpen);
                }}
              >
                <MessageCircle size={16} aria-hidden="true" />
                {teacherOpen ? "收起老师" : "问老师"}
              </button>
            </div>
            {siblings.length > 1 && (
              <nav
                className="ss-sublesson-selector"
                aria-label={`${node.parentName}小节`}
              >
                <span>
                  {siblings.filter((item) => item.completed).length}/
                  {siblings.length} 节已学
                </span>
                {siblings.length > 8 ? (
                  <>
                    <label htmlFor="ss-current-unit">当前知识点的小节</label>
                    <select
                      id="ss-current-unit"
                      value={node.id}
                      onChange={(event) => changeNode(event.target.value)}
                    >
                      {siblings.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.sublesson.order}. {item.sublesson.title}
                          {item.completed ? "（已学）" : ""}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div>
                    {siblings.map((item) => (
                      <button
                        key={item.id}
                        className={item.id === node.id ? "active" : ""}
                        aria-current={item.id === node.id ? "page" : undefined}
                        onClick={() => changeNode(item.id)}
                      >
                        <small>{item.sublesson.order}</small>
                        {item.sublesson.title}
                      </button>
                    ))}
                  </div>
                )}
              </nav>
            )}
            <div className="ss-tabs" role="tablist" aria-label="学习与练习">
              <button
                id="ss-learn-tab"
                role="tab"
                aria-controls="ss-learn-panel"
                aria-selected={tab === "learn"}
                className={tab === "learn" ? "active" : ""}
                onClick={() => {
                  setTab("learn");
                  setContext(null);
                }}
              >
                <BookOpen size={17} aria-hidden="true" />
                学习
              </button>
              <button
                id="ss-practice-tab"
                role="tab"
                aria-controls="ss-practice-panel"
                aria-selected={tab === "practice"}
                className={tab === "practice" ? "active" : ""}
                onMouseEnter={preloadPractice}
                onFocus={preloadPractice}
                onClick={openPractice}
              >
                <Target size={17} aria-hidden="true" />
                练习
              </button>
            </div>
            <div
              className={`ss-content-layout ${teacherOpen && currentLesson ? "with-teacher" : ""}`}
            >
              <div className="ss-primary-content">
                {!node.available ? (
                  <div className="ss-state">
                    <BookOpen size={28} />
                    <h3>这个知识点正在准备</h3>
                    <p>讲解和练习通过审核后会出现在这里。</p>
                    {next && (
                      <button onClick={() => changeNode(next.id)}>
                        先学下一节已发布课程
                      </button>
                    )}
                  </div>
                ) : !currentLesson && lessonError ? (
                  <Notice error>{lessonError}</Notice>
                ) : !currentLesson ? (
                  <ContentPlaceholder
                    variant={tab === "practice" ? "practice" : "article"}
                    rows={4}
                  />
                ) : (
                  <>
                    <div
                      role="tabpanel"
                      id="ss-learn-panel"
                      aria-labelledby="ss-learn-tab"
                      hidden={tab !== "learn"}
                    >
                      <LessonContent lesson={currentLesson.lesson} />
                      {lessonError && <Notice error>{lessonError}</Notice>}
                      <div className="ss-actions ss-lesson-actions">
                        <button
                          className="primary"
                          disabled={completing}
                          onMouseEnter={preloadPractice}
                          onFocus={preloadPractice}
                          onClick={() => void complete()}
                        >
                          {completing ? (
                            <LoaderCircle
                              className="spin"
                              size={17}
                              aria-hidden="true"
                            />
                          ) : (
                            <Check size={17} aria-hidden="true" />
                          )}
                          {node.completed ? "练几道题" : "我学完了，开始练习"}
                        </button>
                        {next && (
                          <button onClick={() => changeNode(next.id)}>
                            下一知识点
                            <ArrowRight size={16} aria-hidden="true" />
                          </button>
                        )}
                      </div>
                    </div>
                    {(practiceVisited || tab === "practice") && (
                      <div
                        role="tabpanel"
                        id="ss-practice-panel"
                        aria-labelledby="ss-practice-tab"
                        hidden={tab !== "practice"}
                      >
                        <FeatureBoundary
                          fallback={
                            <ContentPlaceholder variant="practice" rows={3} />
                          }
                        >
                          <Practice
                            key={`${node.id}:${currentLesson.packageId}:${lessonRevision}`}
                            node={node}
                            packageId={currentLesson.packageId}
                            userId={user.id}
                            active={tab === "practice"}
                            onLearn={() => setTab("learn")}
                            onNext={
                              next ? () => changeNode(next.id) : undefined
                            }
                            nextLabel={next?.sublesson?.title || next?.name}
                            onProgress={refreshProgress}
                            onContext={setContext}
                            onAccessDenied={revokeAccess}
                          />
                        </FeatureBoundary>
                      </div>
                    )}
                  </>
                )}
              </div>
              {teacherVisited && currentLesson && (
                <div
                  className="ss-teacher-slot"
                  id="ss-teacher-slot"
                  hidden={!teacherOpen}
                >
                  <StudyTeacher
                    key={`${node.id}:${currentLesson.packageId}:${lessonRevision}`}
                    node={node}
                    packageId={currentLesson.packageId}
                    context={tab === "practice" ? context : null}
                    onAccessDenied={revokeAccess}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { LessonContent, Stem, statusName };
