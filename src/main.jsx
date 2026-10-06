import {
  ArrowRight,
  BadgeInfo,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  Clock,
  Crown,
  Download,
  Globe2,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageCircle,
  Monitor,
  Network,
  NotebookPen,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Ticket,
  TriangleAlert,
  UserRound,
  X,
} from "lucide-react";
import { lazy, useEffect, useRef, useState } from "react";
import {
  DesktopCertificatePicker,
  DesktopHome,
  DesktopLanding,
  DesktopToolbar,
  useDesktopWeb,
} from "./desktop-experience.jsx";
import { DownloadPage } from "./download-page.jsx";
import { DesktopChapterBrowser } from "./desktop-workspace.jsx";
import {
  loadPracticeProgress,
  practiceStorageKey,
  readPracticeProgress,
} from "./practice-progress.js";
import { MembershipBadge } from "./components/membership-badge.jsx";
import { useMembershipAccount } from "./use-membership-account.js";
const VipView = lazy(() =>
  import("./vip-view.jsx").then((m) => ({ default: m.VipView })),
);
const SubjectiveStudy = lazy(() => import("./features/subjective-study.jsx").then((m) => ({ default: m.SubjectiveStudy })));
import { api, streamApi } from "./api.js";
import { pct } from "./question-utils.js";
import { Empty, Heading, IconButton } from "./components/study-ui.jsx";
import { createRoot } from "react-dom/client";
import { FeatureBoundary } from "./components/feature-boundary.jsx";
import { appleMobile } from "./platform.js";
import {
  ANNOUNCEMENT_KEY,
  MOBILE_APK_NAME,
  MOBILE_DOWNLOAD_URL,
} from "./mobile-release.js";
const AuthScreen = lazy(() =>
  import("./features/auth.jsx").then((m) => ({ default: m.AuthScreen })),
);
const AnnouncementModal = lazy(() =>
  import("./features/modals.jsx").then((m) => ({
    default: m.AnnouncementModal,
  })),
);
const SponsorModal = lazy(() =>
  import("./features/modals.jsx").then((m) => ({ default: m.SponsorModal })),
);
const CertificatePicker = lazy(() =>
  import("./features/auth.jsx").then((m) => ({ default: m.CertificatePicker })),
);
const ChapterGrid = lazy(() =>
  import("./features/chapters.jsx").then((m) => ({ default: m.ChapterGrid })),
);
const KnowledgeSectionGrid = lazy(() =>
  import("./features/chapters.jsx").then((m) => ({
    default: m.KnowledgeSectionGrid,
  })),
);
const KnowledgePointGrid = lazy(() =>
  import("./features/chapters.jsx").then((m) => ({
    default: m.KnowledgePointGrid,
  })),
);
const CertificateGuideView = lazy(() =>
  import("./features/guide.jsx").then((m) => ({
    default: m.CertificateGuideView,
  })),
);
const WrongView = lazy(() =>
  import("./features/wrong.jsx").then((m) => ({ default: m.WrongView })),
);
const TrainingView = lazy(() =>
  import("./features/training.jsx").then((m) => ({ default: m.TrainingView })),
);
const CommunityView = lazy(() =>
  import("./features/shared-library.jsx").then((m) => ({
    default: m.CommunityView,
  })),
);
const CommunityChatView = lazy(() =>
  import("./features/community-chat.jsx").then((m) => ({
    default: m.CommunityChatView,
  })),
);
const AboutView = lazy(() =>
  import("./features/about.jsx").then((m) => ({ default: m.AboutView })),
);
const SettingsView = lazy(() =>
  import("./features/settings.jsx").then((m) => ({ default: m.SettingsView })),
);
const AdminView = lazy(() =>
  import("./features/admin.jsx").then((m) => ({ default: m.AdminView })),
);
const Practice = lazy(() =>
  import("./features/practice.jsx").then((m) => ({ default: m.Practice })),
);
const ExamView = lazy(() =>
  import("./features/exam.jsx").then((m) => ({ default: m.ExamView })),
);
import "./style.css";
import "./exam-scope.css";
import "./desktop.css";
import "./workspace.css";

const navs = [
  ["home", "学习总览", LayoutDashboard],
  ["guide", "证书指南", BadgeInfo],
  ["chapters", "章节练习", BookOpen],
  ["wrong", "错题本", NotebookPen],
  ["training", "AI 专项训练", Sparkles],
  ["study", "AI 精讲与练习", BookOpen],
  ["vip", "VIP 中心", Crown],
  ["community", "共享题库", Globe2],
  ["chat", "社区交流", MessageCircle],
  ["mastery", "知识掌握度", ChartNoAxesCombined],
  ["exam", "模拟考试", GraduationCap],
  ["admin", "管理员面板", ShieldCheck],
];

const navGroups = [
  {
    label: "学习",
    pages: ["home", "chapters", "study", "wrong", "training", "exam", "mastery"],
  },
  { label: "发现与服务", pages: ["vip", "community", "chat", "guide"] },
  { label: "管理", pages: ["admin"] },
];

function App() {
  const desktop = useDesktopWeb();
  const [page, setPage] = useState(location.hash.slice(1) || "home"),
    [auth, setAuth] = useState(null),
    [bankSource, setBankSource] = useState("all"),
    [chapterFocus, setChapterFocus] = useState(""),
    [sectionFocus, setSectionFocus] = useState(""),
    [dashboard, setDashboard] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [mobile, setMobile] = useState(false),
    [session, setSession] = useState(null),
    [wrong, setWrong] = useState([]),
    [allQuestions, setAllQuestions] = useState([]),
    [queue, setQueue] = useState([]),
    [useSharedAi, setUseSharedAi] = useState(false),
    [sharedAiQuestions, setSharedAiQuestions] = useState([]),
    [sharedAiLoading, setSharedAiLoading] = useState(false),
    [aiGroups, setAiGroups] = useState([]),
    [announcementOpen, setAnnouncementOpen] = useState(false),
    [sponsorOpen, setSponsorOpen] = useState(false),
    [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const [savedPractice, setSavedPractice] = useState(null);
  const practiceKey = practiceStorageKey(
    auth?.user?.id,
    auth?.user?.certificateId,
  );
  useEffect(() => {
    try {
      setSavedPractice(readPracticeProgress(window.localStorage, practiceKey));
    } catch {
      setSavedPractice(null);
    }
  }, [practiceKey, page]);
  useEffect(() => {
    // Re-entering practice (including browser Back) must read the latest checkpoint.
    if (desktop && page !== "practice") setSession(null);
  }, [desktop, page]);
  const membership = useMembershipAccount(
    api,
    auth?.authenticated ? auth.user?.id : null,
    page,
  );
  useEffect(() => {
    if (desktop || page === "downloads")
      window.scrollTo({ top: 0, behavior: "instant" });
    else if (page === "welcome") {
      setPage("home");
      location.hash = "home";
    }
  }, [desktop, page, auth?.authenticated]);
  const refresh = async () => {
    const [d, w, q] = await Promise.all([
      api("/dashboard"),
      api("/wrong"),
      api("/questions"),
    ]);
    setDashboard(d);
    setWrong(w);
    setAllQuestions(q);
  };
  useEffect(() => {
    api("/auth/me")
      .then(setAuth)
      .catch((e) => {
        setError(e.message);
        setAuth({ authenticated: false, user: null, certificates: [] });
      });
  }, []);
  useEffect(() => {
    if (auth?.authenticated && auth.user?.certificateId)
      refresh().catch((e) => setError(e.message));
    const h = () => setPage(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [auth?.authenticated, auth?.user?.certificateId]);
  useEffect(() => {
    if (!auth?.authenticated || !auth.user?.certificateId || !dashboard) return;
    try {
      if (localStorage.getItem(ANNOUNCEMENT_KEY) !== "seen")
        setAnnouncementOpen(true);
    } catch {
      setAnnouncementOpen(true);
    }
  }, [auth?.authenticated, auth?.user?.certificateId, dashboard]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);
  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try {
      localStorage.setItem(ANNOUNCEMENT_KEY, "seen");
    } catch {
      // Private browsing may disable localStorage; closing still works for this render.
    }
  };
  const go = (p) => {
    setPage(p);
    if (p !== "chapters") setChapterFocus("");
    location.hash = p;
    setMobile(false);
    setError("");
  };
  const signOut = async () => {
    setAccountMenuOpen(false);
    setError("");
    try {
      await api("/auth/logout", {}, "POST");
      setDashboard(null);
      setSession(null);
      setMobile(false);
      setPage("home");
      location.hash = "home";
      setAuth({ authenticated: false, user: null, certificates: [] });
    } catch (e) {
      setError(e.message);
    }
  };
  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401) {
        setDashboard(null);
        setSession(null);
        setQueue([]);
        setAllQuestions([]);
        setWrong([]);
        setSharedAiQuestions([]);
        setAiGroups([]);
        setAuth({ authenticated: false, user: null, certificates: [] });
        setError("登录已失效，请重新登录后继续。");
      } else {
        setError(e.message);
      }
      return null;
    } finally {
      setBusy("");
    }
  };
  const start = (questions, title = "自由练习") => {
    if (!questions.length) {
      setError("暂无可练习题目");
      return;
    }
    setSession({
      questions,
      title,
      certificateId:
        auth.user?.certificateId || dashboard?.certificate?.id || null,
      storageKey: desktop ? practiceKey : null,
      key: Date.now(),
    });
    go("practice");
  };
  const resumePractice = () => {
    setSession(null);
    go("practice");
  };
  useEffect(() => {
    if (
      !desktop ||
      page !== "practice" ||
      session ||
      !practiceKey ||
      !allQuestions.length
    )
      return;
    let active = true;
    try {
      const saved = readPracticeProgress(window.localStorage, practiceKey);
      loadPracticeProgress(saved, allQuestions, () =>
        api("/questions/shared-ai"),
      )
        .then((restored) => {
          if (!active) return;
          if (restored)
            setSession({
              ...restored,
              storageKey: practiceKey,
              certificateId: auth.user.certificateId,
              key: Date.now(),
            });
          else if (saved) {
            setSavedPractice(null);
            try {
              localStorage.removeItem(practiceKey);
            } catch {
              /* Private mode. */
            }
          }
        })
        .catch(() => {
          if (active) setError("暂时无法恢复练习，请返回学习总览后重试。");
        });
    } catch {
      /* A fresh practice can still be started without browser storage. */
    }
    return () => {
      active = false;
    };
  }, [desktop, page, session, practiceKey, allQuestions]);
  const changeCertificate = (certificateId) =>
    run("正在切换备考证书", async () => {
      const result = await api("/auth/certificate", { certificateId }, "PUT");
      try {
        localStorage.removeItem("netwise-exam");
      } catch {
        /* Private mode. */
      }
      setSession(null);
      setDashboard(null);
      setAllQuestions([]);
      setWrong([]);
      setSavedPractice(null);
      setQueue([]);
      setBankSource("all");
      setUseSharedAi(false);
      setSharedAiQuestions([]);
      setAuth((old) => ({ ...old, user: result.user }));
      go("home");
      setNotice(`已切换到 ${result.user.certificate.shortName}`);
    });
  const openChapter = (name) => {
    setChapterFocus(name);
    setSectionFocus("");
    go("chapters");
  };
  const questionsForChapter = (name) => [
    ...allQuestions.filter(
      (q) =>
        q.chapter === name &&
        q.source !== "ai_generated" &&
        (bankSource === "all" || q.source === bankSource),
    ),
    ...(useSharedAi ? sharedAiQuestions.filter((q) => q.chapter === name) : []),
  ];
  const selectedChapter = dashboard?.chapters?.find(
    (chapter) => chapter.name === chapterFocus,
  );
  const selectedChapterQuestions = selectedChapter
    ? questionsForChapter(selectedChapter.name)
    : [];
  const selectedChapterSections = selectedChapter?.sections || [];
  const selectedSectionQuestions = sectionFocus
    ? selectedChapterQuestions.filter(
        (question) => question.knowledgeSection === sectionFocus,
      )
    : selectedChapterQuestions;
  const knowledgePointName = (point) =>
    typeof point === "string" ? point : point?.name || "";
  const selectedSectionPoints =
    selectedChapterSections.find((section) => section.name === sectionFocus)
      ?.knowledgePoints || [];
  const selectedKnowledgePoints = selectedChapter
    ? [
        ...new Set([
          ...(sectionFocus
            ? selectedSectionPoints.map(knowledgePointName)
            : selectedChapterSections.length
              ? []
              : (selectedChapter.knowledgePoints || []).map(
                  knowledgePointName,
                )),
          ...selectedSectionQuestions.map(
            (question) =>
              question.targetKnowledgePoint || question.knowledgePoint,
          ),
        ]),
      ].filter(Boolean)
    : [];
  const favoriteQuestions = allQuestions.filter(
    (question) => question.favorite,
  );
  const train = async (q, count = 5, harder = false) =>
    run(`准备生成 ${count} 道针对题`, async () => {
      const r = await streamApi(
        "/ai/train/stream",
        { questionId: q.id, count, harder },
        (event) => {
          if (event.message) setBusy(event.message);
        },
      );
      setNotice("针对训练已准备好");
      await refresh();
      start(r.questions, "AI 针对训练");
      return r;
    });
  const toggleSharedAi = async (checked) => {
    setUseSharedAi(checked);
    if (!checked) {
      setSharedAiQuestions([]);
      return;
    }
    setSharedAiLoading(true);
    setError("");
    try {
      setSharedAiQuestions(await api("/questions/shared-ai"));
    } catch (e) {
      setUseSharedAi(false);
      setSharedAiQuestions([]);
      setError(e.message);
    } finally {
      setSharedAiLoading(false);
    }
  };
  const loadSharedAi = async () => {
    setSharedAiLoading(true);
    setError("");
    try {
      const questions = await api("/questions/shared-ai");
      setSharedAiQuestions(questions);
      return questions;
    } catch (e) {
      setError(e.message);
      return [];
    } finally {
      setSharedAiLoading(false);
    }
  };
  useEffect(() => {
    if (!auth?.authenticated || !auth.user?.certificateId) return;
    let active = true;
    if (page === "training") {
      Promise.all([api("/queue"), api("/ai/groups")])
        .then(([nextQueue, nextGroups]) => {
          if (!active) return;
          setQueue(nextQueue);
          setAiGroups(nextGroups);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }
    if (page === "community") {
      setSharedAiLoading(true);
      api("/questions/shared-ai")
        .then((questions) => {
          if (active) setSharedAiQuestions(questions);
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setSharedAiLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [page, auth?.authenticated, auth?.user?.certificateId]);
  if (page === "downloads")
    return (
      <DownloadPage api={api} authenticated={!!auth?.authenticated} go={go} />
    );
  if (auth === null)
    return (
      <div className="loading-page">
        <LoaderCircle className="spin" />
        <p>正在检查登录状态</p>
      </div>
    );
  if (!auth.authenticated && desktop)
    return (
      <DesktopLanding
        api={api}
        certificates={auth.certificates}
        initialError={error}
        navigate={go}
        onAuth={(result) => {
          setError("");
          setAuth(result);
        }}
      />
    );
  if (!auth.authenticated)
    return (
      <AuthScreen
        initialError={error}
        onAuth={(result) => {
          setError("");
          setAuth(result);
        }}
      />
    );
  if (!auth.user.certificateId && desktop)
    return (
      <DesktopCertificatePicker
        certificates={auth.certificates}
        onSignOut={signOut}
        onSelect={async (certificateId) => {
          const result = await api(
            "/auth/certificate",
            { certificateId },
            "PUT",
          );
          setAuth((old) => ({ ...old, user: result.user }));
        }}
      />
    );
  if (!auth.user.certificateId)
    return (
      <CertificatePicker
        certificates={auth.certificates}
        onSelect={async (certificateId) => {
          const result = await api(
            "/auth/certificate",
            { certificateId },
            "PUT",
          );
          setAuth((old) => ({ ...old, user: result.user }));
        }}
      />
    );
  if (!dashboard)
    return (
      <div className="loading-page">
        {error ? (
          <>
            <TriangleAlert />
            <p>{error}</p>
            <button onClick={() => location.reload()}>重新加载</button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>正在加载学习记录</p>
          </>
        )}
      </div>
    );
  const weak = [...dashboard.mastery].sort(
    (a, b) => a.masteryScore - b.masteryScore || b.wrongCount - a.wrongCount,
  );
  const recommendedModules = dashboard.syllabus
    ? [...dashboard.syllabus.modules]
        .sort(
          (a, b) =>
            a.attempted - b.attempted ||
            (a.accuracy ?? 1) - (b.accuracy ?? 1) ||
            b.weight - a.weight ||
            a.order - b.order,
        )
        .slice(0, 3)
    : [];
  const recommendedChapterNames = new Set(
    recommendedModules.map((module) => module.name),
  );
  const recommendedQuestions = allQuestions
    .filter(
      (question) =>
        question.source !== "ai_generated" &&
        (!recommendedChapterNames.size ||
          recommendedChapterNames.has(question.chapter)),
    )
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);
  if (desktop && page === "welcome")
    return (
      <DesktopLanding
        api={api}
        certificates={auth.certificates}
        authenticated
        navigate={go}
      />
    );
  return (
    <div
      className={`app-shell${desktop ? " desk-workspace" : ""}`}
      data-page={page}
    >
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#home" onClick={() => go("home")}>
          <span className="brand-icon">
            <img src="/kaojiang-logo-192.png" alt="" />
          </span>
          <strong>
            考匠<span>AceExam</span>
          </strong>
        </a>
        {desktop ? (
          <label className="study-certificate-select">
            <span>正在备考</span>
            <select
              aria-label="切换备考证书"
              value={auth.user.certificateId}
              disabled={!!busy}
              onChange={(event) => changeCertificate(event.target.value)}
            >
              {auth.certificates.map((certificate) => (
                <option key={certificate.id} value={certificate.id}>
                  {certificate.shortName || certificate.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <div className="workspace-label">
            {dashboard.certificate?.shortName} · 学习工作台
          </div>
        )}
        <nav aria-label="主导航">
          {(desktop
            ? [
                { label: "学习", pages: ["home", "chapters", "study", "wrong", "exam"] },
                {
                  label: "更多学习工具",
                  pages: ["training", "mastery", "community", "chat", "guide"],
                  collapsible: true,
                },
                { label: "管理", pages: ["admin"] },
              ]
            : navGroups
          ).map((group) => {
            const entries = group.pages
              .map((id) => navs.find((entry) => entry[0] === id))
              .filter(([id]) => id !== "admin" || dashboard.user?.isAdmin);
            if (!entries.length) return null;
            const buttons = entries.map(([id, label, Icon]) => {
              const selected =
                page === id || (id === "vip" && page === "redeem") || (id === "admin" && page === "study-admin");
              return (
                <button
                  key={id}
                  className={`${selected ? "active" : ""} ${id === "vip" ? "nav-vip" : ""}`}
                  aria-current={selected ? "page" : undefined}
                  onClick={() => go(id)}
                >
                  <Icon size={19} />
                  <span>{label}</span>
                  {id === "wrong" && dashboard.wrongCount > 0 && (
                    <small>{dashboard.wrongCount}</small>
                  )}
                  {id === "vip" &&
                    membership.account?.plan &&
                    membership.account.plan !== "free" && (
                      <MembershipBadge plan={membership.account.plan} />
                    )}
                </button>
              );
            });
            return group.collapsible ? (
              <details
                className="study-nav-more"
                key={group.label}
                open={group.pages.includes(page) || undefined}
              >
                <summary>
                  {group.label}
                  <ChevronDown size={15} />
                </summary>
                <div className="nav-section">{buttons}</div>
              </details>
            ) : (
              <div className="nav-section" key={group.label}>
                <span className="nav-section-label">{group.label}</span>
                {buttons}
              </div>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button
              className="local-profile account-trigger"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <span className="account-avatar" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <strong>{dashboard.user?.username || "学习账户"}</strong>
              <ChevronDown size={16} />
            </button>
            {accountMenuOpen && (
              <div className="account-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    go("vip");
                  }}
                >
                  <Crown size={17} />
                  我的会员
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setAccountMenuOpen(false);
                    go("redeem");
                  }}
                >
                  <Ticket size={17} />
                  兑换码
                </button>
                {desktop ? (
                  <button
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      go("downloads");
                    }}
                  >
                    <Download size={17} />
                    多端学习与下载
                  </button>
                ) : (
                  <a
                    className="account-menu-link"
                    role="menuitem"
                    href={appleMobile ? "/app/" : MOBILE_DOWNLOAD_URL}
                    download={appleMobile ? undefined : MOBILE_APK_NAME}
                    onClick={() => setAccountMenuOpen(false)}
                  >
                    <Download size={17} />
                    {appleMobile ? "打开移动版" : "下载 App"}
                  </a>
                )}
                <button role="menuitem" onClick={signOut}>
                  <UserRound size={17} />
                  切换账号
                </button>
                <button className="danger" role="menuitem" onClick={signOut}>
                  <LogOut size={17} />
                  退出登录
                </button>
              </div>
            )}
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            title={desktop ? "设置" : undefined}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            设置
            <ChevronRight size={15} />
          </button>
          <button
            className={page === "about" ? "active" : ""}
            title={desktop ? "关于考匠" : undefined}
            onClick={() => go("about")}
          >
            <BadgeInfo size={19} />
            关于考匠
            <ChevronRight size={15} />
          </button>
          <button
            className="sponsor-sidebar-button"
            title={desktop ? "赞助作者" : undefined}
            onClick={() => setSponsorOpen(true)}
          >
            <Heart size={17} />
            赞助作者
          </button>
          {desktop && (
            <button title="考匠品牌首页" onClick={() => go("welcome")}>
              <Monitor size={17} />
              考匠品牌首页
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          {desktop ? (
            <DesktopToolbar
              pageTitle={
                navs.find((n) => n[0] === (page === "study-admin" ? "admin" : page))?.[1] ||
                {
                  settings: "设置",
                  about: "关于考匠",
                  practice: session?.title || "练习中",
                  redeem: "会员兑换",
                }[page] ||
                "学习总览"
              }
              navs={[
                ...navs.filter(
                  ([id]) => id !== "admin" || dashboard.user?.isAdmin,
                ),
                ["settings", "账号设置", Settings],
                ["redeem", "会员兑换", Ticket],
                ["about", "关于考匠", BadgeInfo],
                ["downloads", "多端学习与下载", Download],
                ["welcome", "考匠品牌首页", Monitor],
              ]}
              chapters={dashboard.chapters}
              go={go}
              openChapter={openChapter}
              plan={membership.account?.plan}
              username={dashboard.user?.username}
            />
          ) : (
            <>
              <div>
                <IconButton
                  icon={Menu}
                  label="展开导航"
                  className="mobile-menu icon-button"
                  onClick={() => setMobile(!mobile)}
                />
                <span>我的学习空间</span>
                <ChevronRight size={14} />
                <strong>
                  {navs.find((n) => n[0] === (page === "study-admin" ? "admin" : page))?.[1] ||
                    {
                      settings: "设置",
                      about: "关于考匠",
                      practice: session?.title || "练习中",
                      redeem: "会员兑换",
                    }[page] ||
                    "学习总览"}
                </strong>
              </div>
              <div className="topbar-actions">
                <button
                  type="button"
                  className="membership-topbar-entry"
                  onClick={() => go("vip")}
                  aria-label={`打开 VIP 中心${membership.account ? `，当前套餐 ${membership.account.plan === "free" ? "Free" : membership.account.plan.toUpperCase()}` : ""}`}
                >
                  <Crown size={15} />
                  {membership.account && (
                    <MembershipBadge plan={membership.account.plan} />
                  )}
                  <span>会员中心</span>
                  <ChevronRight size={13} />
                </button>
                <span className="date">
                  <CalendarDays size={15} />
                  {new Date().toLocaleDateString("zh-CN", {
                    month: "long",
                    day: "numeric",
                    weekday: "long",
                  })}
                </span>
              </div>
            </>
          )}
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <IconButton
                icon={X}
                label="关闭错误"
                onClick={() => setError("")}
              />
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={18} />
              <span>{notice}</span>
              <IconButton
                icon={X}
                label="关闭通知"
                onClick={() => setNotice("")}
              />
            </div>
          )}
          {busy && (
            <div className="alert working" role="status">
              <LoaderCircle size={18} className="spin" />
              <span>{busy}</span>
            </div>
          )}
          {page === "home" &&
            (desktop ? (
              <DesktopHome
                dashboard={dashboard}
                go={go}
                openChapter={openChapter}
                weak={weak}
                busy={busy}
                savedPractice={savedPractice}
                resumePractice={resumePractice}
                reviewWrong={() => {
                  const due = wrong.filter(
                    (question) =>
                      question.review?.dueAt <= new Date().toISOString(),
                  );
                  start(due.length ? due : wrong, "错题复习");
                }}
                startRecommended={() =>
                  start(recommendedQuestions, "今日推荐练习")
                }
                favoriteCount={favoriteQuestions.length}
                openFavorites={() => start(favoriteQuestions, "我的收藏")}
                practicePoint={(point) =>
                  start(
                    allQuestions.filter(
                      (question) =>
                        question.knowledgePoint === point ||
                        question.targetKnowledgePoint === point,
                    ),
                    point,
                  )
                }
                onPlan={() =>
                  run("正在生成今日学习计划", async () => {
                    await api("/ai/daily", { refresh: true });
                    await refresh();
                  })
                }
                trainTask={(task) => {
                  const question =
                    wrong.find(
                      (item) => item.knowledgePoint === task.knowledgePoint,
                    ) ||
                    allQuestions.find(
                      (item) =>
                        item.knowledgePoint === task.knowledgePoint ||
                        item.targetKnowledgePoint === task.knowledgePoint,
                    );
                  if (question) train(question, task.count);
                  else go("training");
                }}
              />
            ) : (
              <>
                <div className="page-heading">
                  <div>
                    <div className="eyebrow">持续练习，逐步掌握</div>
                    <h1>今天，离掌握更近一步。</h1>
                    <p>
                      {dashboard.certificate?.shortName}{" "}
                      <span className="dot">·</span> 我的学习总览
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => start(recommendedQuestions, "今日推荐练习")}
                  >
                    开始推荐练习
                    <ArrowRight size={17} />
                  </button>
                </div>
                {dashboard.syllabus && (
                  <section className="syllabus-banner">
                    <div className="syllabus-version">
                      <span className="badge green">官方范围已核实</span>
                      <strong>{dashboard.certificate.shortName}</strong>
                      <small>
                        考试范围核实于 {dashboard.syllabus.verifiedAt} ·{" "}
                        {dashboard.syllabus.examCodeLabel || "考试代码"}{" "}
                        {dashboard.syllabus.examCode}（报名前复核）
                      </small>
                    </div>
                    <div className="syllabus-coverage">
                      <strong>{pct(dashboard.syllabus.coverage)}</strong>
                      <span>本站题库覆盖度</span>
                      <div className="progress">
                        <i
                          style={{ width: pct(dashboard.syllabus.coverage) }}
                        />
                      </div>
                    </div>
                    <div className="syllabus-facts">
                      <span>
                        <b>{dashboard.syllabus.coveredModules}</b> /{" "}
                        {dashboard.syllabus.modules.length} 个模块已有题
                      </span>
                      <span>
                        <b>{dashboard.syllabus.questionCount}</b> /{" "}
                        {dashboard.syllabus.targetQuestionCount} 道目标题量
                      </span>
                      <span>
                        今日推荐：
                        {recommendedModules
                          .map((module) => module.name)
                          .join("、")}
                      </span>
                    </div>
                    <p>{dashboard.syllabus.scopeNote}</p>
                    <div className="syllabus-links">
                      {dashboard.syllabus.sourceUrls.map((source) => (
                        <a
                          key={source.url}
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <CircleCheck size={15} />
                          {source.name}
                        </a>
                      ))}
                    </div>
                  </section>
                )}
                <div className="stats">
                  {[
                    ["今日已练", dashboard.todayCount, "题", BookOpen],
                    ["累计正确率", pct(dashboard.accuracy), "", Target],
                    ["待复习错题", dashboard.dueCount, "题", RotateCcw],
                    ["今日专注", dashboard.minutes, "分钟", Clock],
                  ].map(([label, value, unit, Icon]) => (
                    <div className="stat" key={label}>
                      <div>
                        <span>{label}</span>
                        <Icon size={18} />
                      </div>
                      <strong>
                        {value}
                        <small>{unit}</small>
                      </strong>
                      <span className="stat-note">
                        {label === "今日已练"
                          ? `每日目标 30 题 · 已完成 ${Math.min(100, Math.round((dashboard.todayCount / 30) * 100))}%`
                          : label === "累计正确率"
                            ? `累计完成 ${dashboard.totalCount} 次作答`
                            : label === "待复习错题"
                              ? "按间隔复习计划安排"
                              : "每一次投入都算数"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="overview-grid">
                  <section className="daily-section">
                    <div className="section-heading">
                      <h2>
                        <Sparkles size={20} />
                        AI 今日学习
                      </h2>
                      <span className="badge green">
                        {dashboard.plan ? "已生成" : "待安排"}
                      </span>
                    </div>
                    {dashboard.plan ? (
                      <>
                        <p className="plan-summary">{dashboard.plan.summary}</p>
                        <div className="plan-list">
                          {dashboard.plan.tasks.map((t, i) => (
                            <button
                              key={i}
                              disabled={!!busy}
                              onClick={() =>
                                train(
                                  wrong.find(
                                    (q) =>
                                      q.knowledgePoint === t.knowledgePoint,
                                  ) ||
                                    allQuestions.find(
                                      (q) =>
                                        q.knowledgePoint === t.knowledgePoint,
                                    ),
                                  t.count,
                                )
                              }
                            >
                              <span className="number">
                                {String(i + 1).padStart(2, "0")}
                              </span>
                              <span>
                                <strong>{t.knowledgePoint}</strong>
                                <small>{t.focus}</small>
                              </span>
                              <b>AI · {t.count} 题</b>
                              <ArrowRight size={17} />
                            </button>
                          ))}
                        </div>
                        <button
                          className="text-button"
                          disabled={!!busy}
                          onClick={() =>
                            run("正在更新今日学习计划", async () => {
                              await api("/ai/daily", { refresh: true });
                              await refresh();
                            })
                          }
                        >
                          <RefreshCw size={15} />
                          重新安排
                        </button>
                      </>
                    ) : (
                      <div className="daily-empty">
                        <span className="ai-symbol">
                          <Sparkles size={30} />
                        </span>
                        <h3>让下一道题，更有针对性</h3>
                        <p>
                          {dashboard.aiConfigured
                            ? "根据你的练习记录，安排今天的学习重点。"
                            : "作者 AI 服务暂未就绪，请稍后再试。"}
                        </p>
                        <button
                          className="primary"
                          disabled={!!busy}
                          onClick={() =>
                            dashboard.aiConfigured
                              ? run("正在分析弱点并安排今日学习", async () => {
                                  await api("/ai/daily", {});
                                  await refresh();
                                })
                              : go("vip")
                          }
                        >
                          {dashboard.aiConfigured
                            ? "生成今日计划"
                            : "查看 AI 额度"}
                          <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="weak-section">
                    <div className="section-heading">
                      <h2>{dashboard.plan ? "今日薄弱点" : "重点关注"}</h2>
                      <button
                        className="text-button"
                        onClick={() => go("mastery")}
                      >
                        全部
                        <ChevronRight size={15} />
                      </button>
                    </div>
                    {(dashboard.plan?.weaknesses.length
                      ? dashboard.plan.weaknesses
                          .map((w) =>
                            weak.find(
                              (m) => m.knowledgePoint === w.knowledgePoint,
                            ),
                          )
                          .filter(Boolean)
                      : weak
                    )
                      .slice(0, 4)
                      .map((m, i) => (
                        <button
                          className="weak-row"
                          key={m.knowledgePoint}
                          onClick={() =>
                            start(
                              allQuestions.filter(
                                (q) => q.knowledgePoint === m.knowledgePoint,
                              ),
                              m.knowledgePoint,
                            )
                          }
                        >
                          <div>
                            <span className={"topic-dot tone-" + i} />
                            <strong>{m.knowledgePoint}</strong>
                            <b>
                              {m.attemptCount ? m.masteryScore : "--"}
                              <small> / 100</small>
                            </b>
                          </div>
                          <div className="progress">
                            <i style={{ width: m.masteryScore + "%" }} />
                          </div>
                          <small>
                            {m.attemptCount
                              ? `${m.attemptCount} 次练习 · 正确率 ${pct(m.accuracy)}`
                              : "尚未练习"}
                          </small>
                          {dashboard.plan?.weaknesses.find(
                            (w) => w.knowledgePoint === m.knowledgePoint,
                          )?.reason && (
                            <p className="weak-reason">
                              {
                                dashboard.plan.weaknesses.find(
                                  (w) => w.knowledgePoint === m.knowledgePoint,
                                ).reason
                              }
                            </p>
                          )}
                        </button>
                      ))}
                  </section>
                </div>
                <section className="chapters-section">
                  <div className="section-heading">
                    <h2>章节练习</h2>
                    <button
                      className="text-button"
                      onClick={() => go("chapters")}
                    >
                      查看全部章节
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <ChapterGrid
                    chapters={dashboard.chapters.slice(0, 6).map((chapter) => {
                      const questions = questionsForChapter(chapter.name);
                      return { ...chapter, questions, total: questions.length };
                    })}
                    start={start}
                    expand={openChapter}
                  />
                </section>
                <div className="bottom-band">
                  <img
                    src="/network-rack.jpg"
                    alt="网络机房中的服务器与交换设备"
                  />
                  <div>
                    <Network size={28} />
                    <span>
                      <strong>
                        {dashboard.certificate.shortName} · 知识体系
                      </strong>
                      <small>
                        {dashboard.syllabus
                          ? `${dashboard.syllabus.version} · ${dashboard.syllabus.modules.length} 个考点模块`
                          : "从基础概念，到岗位实操"}
                      </small>
                    </span>
                  </div>
                  <button onClick={() => go("exam")}>
                    进入模拟考试
                    <ArrowRight size={16} />
                  </button>
                </div>
              </>
            ))}
          {page === "chapters" &&
            (desktop ? (
              <DesktopChapterBrowser
                dashboard={dashboard}
                allQuestions={allQuestions}
                sharedAiQuestions={sharedAiQuestions}
                bankSource={bankSource}
                setBankSource={setBankSource}
                useSharedAi={useSharedAi}
                sharedAiLoading={sharedAiLoading}
                toggleSharedAi={toggleSharedAi}
                chapterFocus={chapterFocus}
                setChapterFocus={setChapterFocus}
                sectionFocus={sectionFocus}
                setSectionFocus={setSectionFocus}
                start={start}
                favoriteQuestions={favoriteQuestions}
              />
            ) : (
              <>
                <Heading
                  title={
                    !chapterFocus
                      ? "章节练习"
                      : sectionFocus
                        ? `${sectionFocus} · 三级知识点`
                        : selectedChapterSections.length
                          ? `${chapterFocus} · 二级分类`
                          : `${chapterFocus} · 知识点`
                  }
                  subtitle={
                    chapterFocus
                      ? sectionFocus
                        ? `${selectedSectionQuestions.length} 道题 · ${selectedKnowledgePoints.length} 个考点`
                        : selectedChapterSections.length
                          ? `${selectedChapterQuestions.length} 道题 · ${selectedChapterSections.filter((section) => section.total > 0).length} 个二级分类`
                          : `${selectedChapterQuestions.length} 道题 · ${selectedKnowledgePoints.length} 个知识点`
                      : `${dashboard.chapters.length} 个${dashboard.syllabus ? "考点模块" : "章节"} · ${dashboard.banks.map((bank) => `${allQuestions.filter((q) => q.source === bank.source).length} 道${bank.name}`).join(" · ")}`
                  }
                />
                {dashboard.syllabus && (
                  <div className="source-notice">
                    <CircleCheck size={19} />
                    <div>
                      <strong>
                        {dashboard.certificate.id === "veterinary-practitioner"
                          ? "执兽题库统一归档"
                          : "题库来源分级已启用"}
                      </strong>
                      <p>
                        {dashboard.certificate.id === "veterinary-practitioner"
                          ? "现有执兽题目统一显示为“管理员添加”，原始 PDF 文件、题号和来源类型仍保留在题目 provenance 中。"
                          : "当前收录的是依据官方 V2.0 范围编写的原创仿真题。尚未发现华为官方公开的完整历年真题库，因此不会把第三方 Dump 标成官方真题。"}
                      </p>
                    </div>
                  </div>
                )}
                <div className="bank-filter-row">
                  <label className="bank-filter">
                    题库来源
                    <select
                      aria-label="题库来源"
                      value={bankSource}
                      onChange={(e) => setBankSource(e.target.value)}
                    >
                      <option value="all">全部内置题库</option>
                      {dashboard.banks.map((bank) => (
                        <option key={bank.id} value={bank.source}>
                          {bank.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="shared-ai-toggle">
                    <input
                      type="checkbox"
                      checked={useSharedAi}
                      disabled={sharedAiLoading}
                      onChange={(event) => toggleSharedAi(event.target.checked)}
                    />
                    <span>使用其他用户生成的 AI 题目</span>
                    {useSharedAi && (
                      <small>
                        {sharedAiLoading
                          ? "读取中"
                          : `${sharedAiQuestions.length} 题`}
                      </small>
                    )}
                  </label>
                </div>
                <button
                  className="favorite-practice-entry"
                  disabled={!favoriteQuestions.length}
                  onClick={() => start(favoriteQuestions, "收藏题目")}
                >
                  <span className="favorite-practice-icon">
                    <Star size={20} fill="currentColor" />
                  </span>
                  <span className="favorite-practice-copy">
                    <strong>收藏题目</strong>
                    <small>
                      {favoriteQuestions.length
                        ? `${favoriteQuestions.length} 道已收藏题目`
                        : "在答题页点击星标收藏题目"}
                    </small>
                  </span>
                  <ChevronRight size={18} />
                </button>
                {!chapterFocus ? (
                  <ChapterGrid
                    chapters={dashboard.chapters
                      .map((chapter) => {
                        const questions = questionsForChapter(chapter.name);
                        return {
                          ...chapter,
                          questions,
                          total: questions.length,
                        };
                      })
                      .filter((chapter) => chapter.total > 0)}
                    start={start}
                    expand={openChapter}
                  />
                ) : selectedChapter ? (
                  selectedChapterSections.length && !sectionFocus ? (
                    <KnowledgeSectionGrid
                      chapter={selectedChapter.name}
                      sections={selectedChapterSections}
                      questions={selectedChapterQuestions}
                      start={start}
                      select={(name) => setSectionFocus(name)}
                      back={() => setChapterFocus("")}
                    />
                  ) : (
                    <KnowledgePointGrid
                      chapter={`${selectedChapter.name}${sectionFocus ? ` · ${sectionFocus}` : ""}`}
                      points={selectedKnowledgePoints}
                      questions={selectedSectionQuestions}
                      mastery={dashboard.mastery}
                      start={start}
                      back={() =>
                        sectionFocus ? setSectionFocus("") : setChapterFocus("")
                      }
                      backLabel={sectionFocus ? "返回二级分类" : "返回章节"}
                      allLabel={
                        sectionFocus ? "练习本分类全部题" : "练习本章全部题"
                      }
                    />
                  )
                ) : (
                  <Empty title="找不到这个科目">
                    <button
                      className="primary"
                      onClick={() => setChapterFocus("")}
                    >
                      返回章节
                    </button>
                  </Empty>
                )}
              </>
            ))}
          {page === "guide" && (
            <CertificateGuideView
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
            />
          )}
          {page === "wrong" && (
            <WrongView
              desktop={desktop}
              onPractice={() => go("chapters")}
              wrong={wrong}
              start={start}
              train={train}
              busy={busy}
              run={run}
              refresh={refresh}
            />
          )}
          {page === "training" && (
            <>
              <Heading
                title="AI 专项训练"
                subtitle="围绕薄弱知识，从基础理解到综合应用"
              />
              <TrainingView
                questions={allQuestions}
                wrong={wrong}
                weak={weak}
                queue={queue}
                groups={aiGroups}
                onShareChange={(id, shared) =>
                  run("正在保存共享设置", async () => {
                    await api(`/ai/groups/${id}/share`, { shared }, "PUT");
                    setAiGroups((old) =>
                      old.map((group) =>
                        group.id === id ? { ...group, shared } : group,
                      ),
                    );
                    await loadSharedAi();
                    await refresh();
                  })
                }
                train={train}
                start={start}
                busy={busy}
                configured={dashboard.aiConfigured}
                settings={() => go("vip")}
              />
            </>
          )}
          {page === "community" && (
            <CommunityView
              questions={sharedAiQuestions}
              loading={sharedAiLoading}
              stats={dashboard.community}
              reload={loadSharedAi}
              start={start}
            />
          )}
          {page === "chat" && (
            <CommunityChatView currentUserId={auth.user?.id} />
          )}
          {page === "about" && (
            <AboutView onSponsor={() => setSponsorOpen(true)} />
          )}
          {page === "mastery" && (
            <>
              <Heading
                title="知识掌握度"
                subtitle="长期表现 · 近期正确率 · 练习频率"
              />
              <div className="mastery-summary">
                <strong>
                  {dashboard.mastery.filter((m) => m.masteryScore >= 80).length}
                  <small>个知识点已掌握</small>
                </strong>
                <strong>
                  {dashboard.mastery.filter((m) => m.attemptCount).length}
                  <small>个知识点已练习</small>
                </strong>
                <strong>
                  {dashboard.totalCount}
                  <small>次累计作答</small>
                </strong>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>知识点</th>
                      <th>掌握度</th>
                      <th>正确 / 错误</th>
                      <th>近期正确率</th>
                      <th>平均用时</th>
                      <th>连续正确</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {weak.map((m) => (
                      <tr key={m.knowledgePoint}>
                        <td>
                          <strong>{m.knowledgePoint}</strong>
                          <small>{m.chapter}</small>
                        </td>
                        <td>
                          <div className="mastery-meter">
                            <div className="progress">
                              <i style={{ width: m.masteryScore + "%" }} />
                            </div>
                            <b>{m.masteryScore}</b>
                          </div>
                        </td>
                        <td>
                          {m.correctCount} / {m.wrongCount}
                        </td>
                        <td>{m.attemptCount ? pct(m.recentAccuracy) : "--"}</td>
                        <td>
                          {m.attemptCount
                            ? Math.round(m.averageTime / 1000) + " 秒"
                            : "--"}
                        </td>
                        <td>{m.consecutiveCorrect}</td>
                        <td>
                          <IconButton
                            icon={ArrowRight}
                            label={`练习${m.knowledgePoint}`}
                            onClick={() =>
                              start(
                                allQuestions.filter(
                                  (q) => q.knowledgePoint === m.knowledgePoint,
                                ),
                                m.knowledgePoint,
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {(page === "vip" || page === "redeem") && (
            <VipView
              key={auth.user.id}
              api={api}
              user={auth.user}
              membership={membership}
              navigate={go}
              focusRedemption={page === "redeem"}
            />
          )}
          {page === "study" && <SubjectiveStudy key={`${auth.user.id}:${auth.user.certificateId}`} user={auth.user} navigate={go} />}
          {page === "settings" && (
            <SettingsView
              key={auth.user.id}
              membership={membership}
              onOpenVip={() => go("vip")}
              run={run}
              busy={busy}
              notify={setNotice}
              refresh={refresh}
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
              onUserUpdated={(user) => setAuth((old) => ({ ...old, user }))}
              onCertificateChange={async (certificateId) => {
                const result = await api(
                  "/auth/certificate",
                  { certificateId },
                  "PUT",
                );
                localStorage.removeItem("netwise-exam");
                setSession(null);
                setQueue([]);
                setBankSource("all");
                setUseSharedAi(false);
                setSharedAiQuestions([]);
                setAuth((old) => ({ ...old, user: result.user }));
                setNotice(`已切换到 ${result.user.certificate.shortName}`);
              }}
            />
          )}
          {["admin", "study-admin"].includes(page) && dashboard.user?.isAdmin && (
            <AdminView
              initialTab={page === "study-admin" ? "study" : "overview"}
              navigate={go}
              run={run}
              busy={busy}
              notify={setNotice}
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
            />
          )}
          {page === "practice" &&
            (session ? (
              <Practice
                key={session.key}
                session={session}
                refresh={refresh}
                run={run}
                busy={busy}
                train={train}
                configured={dashboard.aiConfigured}
                community={dashboard.community}
                exit={() => go("home")}
              />
            ) : (
              <Empty title="选择一组题目开始练习">
                <button className="primary" onClick={() => go("chapters")}>
                  选择章节
                </button>
              </Empty>
            ))}
          {page === "exam" && (
            <ExamView run={run} refresh={refresh} dashboard={dashboard} />
          )}
        </main>
        <footer>
          考匠 · AceExam<span>职业认证机考练习平台</span>
          <span className="local-status">
            <i />
            题库与学习数据保存在服务器
          </span>
        </footer>
      </div>
      {announcementOpen && <AnnouncementModal onClose={dismissAnnouncement} />}
      {sponsorOpen && <SponsorModal onClose={() => setSponsorOpen(false)} />}
    </div>
  );
}

const appRoot = createRoot(document.getElementById("root"));

appRoot.render(
  <FeatureBoundary>
    <App />
  </FeatureBoundary>,
);

if (import.meta.hot) import.meta.hot.dispose(() => appRoot.unmount());
