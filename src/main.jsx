import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  BookOpen,
  NotebookPen,
  Sparkles,
  ChartNoAxesCombined,
  Settings,
  Network,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Clock,
  ChevronRight,
  LoaderCircle,
  Eye,
  EyeOff,
  Trash2,
  Save,
  PlugZap,
  Lightbulb,
  MessageCircle,
  RotateCcw,
  Menu,
  Target,
  GraduationCap,
  CalendarDays,
  RefreshCw,
  CircleCheck,
  TriangleAlert,
  LockKeyhole,
  UserRound,
  LogOut,
  ExternalLink,
  BadgeInfo,
  Monitor,
  Award,
  Banknote,
  ShieldCheck,
  CalendarClock,
  FileText,
  Layers3,
  BriefcaseBusiness,
  Scale,
  Compass,
  Landmark,
  Megaphone,
  Heart,
  Globe2,
  ThumbsUp,
  Flag,
  Share2,
  Users,
} from "lucide-react";
import "./style.css";

async function api(url, body, method) {
  const res = await fetch("/api" + url, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}
async function streamApi(url, body, onEvent) {
  const res = await fetch("/api" + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throw new Error(data?.error || "请求失败");
  }
  if (!res.body) throw new Error("浏览器不支持 AI 流式响应");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  const consume = (chunk) => {
    buffer += chunk;
    const records = buffer.split(/\r?\n\r?\n/);
    buffer = records.pop() || "";
    for (const record of records) {
      const line = record
        .split(/\r?\n/)
        .find((part) => part.startsWith("data:"));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        throw new Error("AI 流式响应格式不合法");
      }
      onEvent?.(event);
      if (event.type === "done") result = event.result;
      if (event.type === "error")
        throw new Error(event.message || "AI 生成失败");
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());
  if (!result) throw new Error("AI 流式响应提前结束");
  return result;
}
const pct = (x) =>
  x === null || x === undefined ? "--" : Math.round(x * 100) + "%";
const diff = { easy: "基础", medium: "进阶", hard: "挑战" };
const sources = {
  practice: "原创练习题",
  official_like: "仿真练习题",
  past_exam: "历年真题",
  user_collection: "真题汇编（用户提供）",
  syllabus_practice: "HCIA V2.0 大纲仿真题",
  user_recall_collection: "第三方公开回忆题（用户提供）",
  user_simulation_collection: "第三方原创模拟题（用户提供）",
  ai_generated: "AI 生成练习题",
};
const sourceName = (q) => q.sourceLabel || sources[q.source] || q.source;
const isSingleSelect = (question) =>
  question.type === "single_choice" || question.type === "true_false";
const questionTypeName = (question, compact = false) => {
  if (question.type === "true_false") return "判断题";
  if (question.type === "multiple_choice") return compact ? "多选" : "多选题";
  return compact ? "单选" : "单选题";
};
const navs = [
  ["home", "学习总览", LayoutDashboard],
  ["guide", "证书指南", BadgeInfo],
  ["chapters", "章节练习", BookOpen],
  ["wrong", "错题本", NotebookPen],
  ["training", "AI 专项训练", Sparkles],
  ["community", "共享题库", Globe2],
  ["mastery", "知识掌握度", ChartNoAxesCombined],
  ["exam", "模拟考试", GraduationCap],
];
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </button>
  );
}
function Empty({ icon: Icon = BookOpen, title, children }) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function QuestionOrigin({ question }) {
  if (question.sourceVerification)
    return (
      <p className="question-origin verified-scope">
        题目性质：{question.sourceVerification}
      </p>
    );
  if (!question.provenance?.length) return null;
  return (
    <p className="question-origin">
      来源：
      {question.provenance
        .map(
          (p) =>
            `${p.file.replace("（含答案解析）.docx", "")} · 第 ${p.questionNumber} 题`,
        )
        .join("；")}
      <span>按原文收录，未核实官方出处与考试年份</span>
    </p>
  );
}
function AuthScreen({ onAuth, initialError = "" }) {
  const [mode, setMode] = useState("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onAuth(
        await api(`/auth/${mode === "login" ? "login" : "register"}`, {
          username,
          password,
        }),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <div className="auth-mark">
          <Network size={28} />
        </div>
        <p className="eyebrow">AceExam</p>
        <h1>{mode === "login" ? "登录学习账户" : "创建学习账户"}</h1>
        <p>登录后选择报考证书，系统会按对应知识点推荐练习题。</p>
        <form onSubmit={submit}>
          <label>
            账号
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength="3"
              maxLength="40"
              autoComplete="username"
              placeholder="3-40 位字母、数字或 _ -"
              required
            />
          </label>
          <label>
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength="8"
              maxLength="128"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              placeholder="至少 8 位"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "处理中..." : mode === "login" ? "登录" : "注册并继续"}
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login" ? "没有账号？注册" : "已有账号？登录"}
        </button>
      </section>
    </main>
  );
}
function AnnouncementModal({ onClose }) {
  return (
    <div
      className="announcement-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="announcement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <header className="announcement-header">
          <div className="announcement-heading">
            <span className="announcement-icon">
              <Megaphone size={22} />
            </span>
            <div>
              <span className="announcement-kicker">AceExam · 网站公告</span>
              <h2 id="announcement-title">欢迎来到你的机考练习空间</h2>
              <p>把零散的刷题时间，变成看得见的学习进度。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭网站公告" onClick={onClose} />
        </header>
        <div className="announcement-body">
          <div className="announcement-highlight">
            <strong>现在可以开始了</strong>
            <span>
              当前支持软考中级网络工程师与 HCIA-Datacom，进入章节练习即可按证书和知识点开始学习。
            </span>
          </div>
          <ul className="announcement-list">
            <li>
              <span>01</span>
              <div>
                <strong>题库来源会清楚标注</strong>
                <p>
                  内置练习、用户提供资料和 AI 生成题会分开显示；第三方资料仅作为学习参考，请结合官方范围复核。
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>AI 功能按需使用</strong>
                <p>
                  答错后可以先看内置解析，只有点击 AI 解析或生成训练题时才会调用你配置的 API。
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>学习记录跟随账号保存</strong>
                <p>
                  错题、掌握度、复习计划和 AI 题组保存在服务器，换设备登录后也能继续学习。
                </p>
              </div>
            </li>
          </ul>
          <p className="announcement-footnote">
            使用中遇到问题，可以先刷新页面；题目或解析存在疑问时，优先以考试主办方和认证机构的最新信息为准。
          </p>
        </div>
        <footer className="announcement-footer">
          <small>公告关闭后，本次浏览器将不再重复提示。</small>
          <button className="primary" onClick={onClose}>
            知道了，开始学习
            <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}
function SponsorModal({ onClose }) {
  return (
    <div
      className="sponsor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="sponsor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-title"
      >
        <header>
          <div>
            <span className="sponsor-kicker">支持 AceExam</span>
            <h2 id="sponsor-title">赞助作者</h2>
            <p>如果这个学习工具对你有帮助，欢迎请作者喝杯咖啡。</p>
          </div>
          <IconButton icon={X} label="关闭赞助作者" onClick={onClose} />
        </header>
        <div className="sponsor-content">
          <img src="/sponsor-wechat.jpg" alt="微信赞助二维码" />
          <strong>使用微信扫一扫</strong>
          <p>感谢你的支持，我会继续维护题库和学习功能。</p>
        </div>
        <footer>
          <button onClick={onClose}>暂时关闭</button>
        </footer>
      </section>
    </div>
  );
}
function CertificatePicker({ certificates, onSelect }) {
  const [busy, setBusy] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-panel certificate-panel">
        <div className="auth-mark">
          <GraduationCap size={28} />
        </div>
        <p className="eyebrow">第一步</p>
        <h1>选择要报考的证书</h1>
        <p>
          题库、章节和练习推荐会围绕所选证书的知识点组织，之后可在账号设置中切换。
        </p>
        <div className="certificate-list">
          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              className="certificate-option"
              disabled={!!busy}
              onClick={async () => {
                setBusy(certificate.id);
                try {
                  await onSelect(certificate.id);
                } finally {
                  setBusy("");
                }
              }}
            >
              <GraduationCap size={22} />
              <span>
                <strong>{certificate.name}</strong>
                <small>{certificate.description}</small>
                {certificate.syllabus && (
                  <small className="certificate-meta">
                    {certificate.syllabus.version} · 考试代码{" "}
                    {certificate.syllabus.examCode}（报名前复核）
                  </small>
                )}
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "home"),
    [auth, setAuth] = useState(null),
    [bankSource, setBankSource] = useState("all"),
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
    [sponsorOpen, setSponsorOpen] = useState(false);
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
      if (localStorage.getItem("netwise-announcement-2026-09-v1") !== "seen")
        setAnnouncementOpen(true);
    } catch {
      setAnnouncementOpen(true);
    }
  }, [auth?.authenticated, auth?.user?.certificateId, dashboard]);
  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try {
      localStorage.setItem("netwise-announcement-2026-09-v1", "seen");
    } catch {
      // Private browsing may disable localStorage; closing still works for this render.
    }
  };
  const go = (p) => {
    setPage(p);
    location.hash = p;
    setMobile(false);
    setError("");
  };
  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
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
    setSession({ questions, title, key: Date.now() });
    go("practice");
  };
  const train = async (q, count = 5, harder = false) =>
    run(`准备生成 ${count} 道针对题`, async () => {
      const r = await streamApi(
        "/ai/train/stream",
        { questionId: q.id, count, harder },
        (event) => {
          if (event.message) setBusy(event.message);
        },
      );
      setNotice(r.cached ? "已载入缓存训练题" : "针对训练已生成");
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
    if (page === "training") {
      Promise.all([api("/queue"), api("/ai/groups")])
        .then(([nextQueue, nextGroups]) => {
          setQueue(nextQueue);
          setAiGroups(nextGroups);
        })
        .catch((e) => setError(e.message));
    }
    if (page === "community") loadSharedAi();
  }, [page, auth?.user?.certificateId]);
  if (auth === null)
    return (
      <div className="loading-page">
        <LoaderCircle className="spin" />
        <p>正在检查登录状态</p>
      </div>
    );
  if (!auth.authenticated)
    return (
      <AuthScreen
        initialError={error}
        onAuth={(result) => setAuth({ authenticated: true, ...result })}
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
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#home" onClick={() => go("home")}>
          <span className="brand-icon">
            <Network size={23} />
          </span>
          <strong>
            AceExam<span>机考练习平台</span>
          </strong>
        </a>
        <div className="workspace-label">
          {dashboard.certificate?.shortName} · 学习工作台
        </div>
        <nav>
          {navs.map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "wrong" && dashboard.wrongCount > 0 && (
                <small>{dashboard.wrongCount}</small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-profile">
            <span>学</span>
            <div>
              <strong>{dashboard.user?.username || "学习账户"}</strong>
              <small>{dashboard.certificate?.shortName || "已选证书"}</small>
            </div>
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            设置
            <ChevronRight size={15} />
          </button>
          <button
            className="sponsor-sidebar-button"
            onClick={() => setSponsorOpen(true)}
          >
            <Heart size={17} />
            赞助作者
          </button>
          <button
            onClick={async () => {
              await api("/auth/logout", {}, "POST");
              setDashboard(null);
              setAuth({ authenticated: false });
            }}
          >
            <LogOut size={19} />
            退出登录
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
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
              {navs.find((n) => n[0] === page)?.[1] ||
                { settings: "设置", practice: session?.title || "练习中" }[
                  page
                ] ||
                "学习总览"}
            </strong>
          </div>
          <span className="date">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
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
          {page === "home" && (
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
                      考试范围核实于 {dashboard.syllabus.verifiedAt} · 考试代码{" "}
                      {dashboard.syllabus.examCode}（报名前复核）
                    </small>
                  </div>
                  <div className="syllabus-coverage">
                    <strong>{pct(dashboard.syllabus.coverage)}</strong>
                    <span>本站题库覆盖度</span>
                    <div className="progress">
                      <i style={{ width: pct(dashboard.syllabus.coverage) }} />
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
                                  (q) => q.knowledgePoint === t.knowledgePoint,
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
                          : "连接你的 AI 服务，开启今日学习计划。"}
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
                            : go("settings")
                        }
                      >
                        {dashboard.aiConfigured
                          ? "生成今日计划"
                          : "配置 AI 服务"}
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
                  chapters={dashboard.chapters.slice(0, 6)}
                  start={(name) =>
                    start(
                      allQuestions.filter(
                        (q) =>
                          q.chapter === name && q.source !== "ai_generated",
                      ),
                      name,
                    )
                  }
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
                        ? `${dashboard.syllabus.modules.length} 个 V2.0 考点模块`
                        : "从基础协议，到网络设计与安全"}
                    </small>
                  </span>
                </div>
                <button onClick={() => go("exam")}>
                  进入模拟考试
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === "chapters" && (
            <>
              <Heading
                title="章节练习"
                subtitle={`${dashboard.chapters.length} 个${dashboard.syllabus ? "考点模块" : "章节"} · ${dashboard.banks.map((bank) => `${allQuestions.filter((q) => q.source === bank.source).length} 道${bank.name}`).join(" · ")}`}
              />
              {dashboard.syllabus && (
                <div className="source-notice">
                  <CircleCheck size={19} />
                  <div>
                    <strong>题库来源分级已启用</strong>
                    <p>
                      当前收录的是依据官方 V2.0
                      范围编写的原创仿真题。尚未发现华为官方公开的完整历年真题库，因此不会把第三方
                      Dump 标成官方真题。
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
              <ChapterGrid
                chapters={dashboard.chapters
                  .map((c) => ({
                    ...c,
                    total:
                      allQuestions.filter(
                        (q) =>
                          q.chapter === c.name &&
                          q.source !== "ai_generated" &&
                          (bankSource === "all" || q.source === bankSource),
                      ).length +
                      (useSharedAi
                        ? sharedAiQuestions.filter((q) => q.chapter === c.name)
                            .length
                        : 0),
                  }))
                  .filter((c) => c.total > 0)}
                start={(name) =>
                  start(
                    [
                      ...allQuestions.filter(
                        (q) =>
                          q.chapter === name &&
                          q.source !== "ai_generated" &&
                          (bankSource === "all" || q.source === bankSource),
                      ),
                      ...(useSharedAi
                        ? sharedAiQuestions.filter((q) => q.chapter === name)
                        : []),
                    ],
                    name,
                  )
                }
              />
            </>
          )}
          {page === "guide" && (
            <CertificateGuideView
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
            />
          )}
          {page === "wrong" && (
            <WrongView
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
                settings={() => go("settings")}
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
          {page === "settings" && (
            <SettingsView
              run={run}
              busy={busy}
              notify={setNotice}
              refresh={refresh}
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
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
          AceExam<span>职业认证机考练习平台</span>
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
function Heading({ title, subtitle, children }) {
  return (
    <div className="page-heading compact">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function ChapterGrid({ chapters, start }) {
  return (
    <div className="chapter-grid">
      {chapters.map((c, i) => (
        <button
          className="chapter-item"
          key={c.name}
          onClick={() => start(c.name)}
        >
          <div className={"chapter-icon tone-" + (i % 4)}>
            <Network size={22} />
          </div>
          <div className="chapter-info">
            <strong>{c.name}</strong>
            <small>
              {c.total} 题 <span>·</span> 已练 {c.attempted} 题
            </small>
            {c.targetQuestionCount && (
              <small className="module-meta">
                题库 {c.total}/{c.targetQuestionCount} · 本站配比 {c.weight}%
              </small>
            )}
            <div className="progress">
              <i
                style={{
                  width: Math.min(100, (c.attempted / c.total) * 100) + "%",
                }}
              />
            </div>
          </div>
          <ChevronRight size={17} />
        </button>
      ))}
    </div>
  );
}
function CertificateGuideView({ certificates, currentCertificateId }) {
  const [selectedId, setSelectedId] = useState(currentCertificateId);
  useEffect(() => setSelectedId(currentCertificateId), [currentCertificateId]);
  const certificate =
    certificates.find((item) => item.id === selectedId) || certificates[0];
  const guide = certificate?.guide;
  const factIcons = [
    BadgeInfo,
    Banknote,
    ShieldCheck,
    CalendarClock,
    FileText,
    Layers3,
  ];
  if (!guide)
    return (
      <Empty icon={BadgeInfo} title="这张证书的指南正在整理">
        <p>考试规则确认后会在这里发布。</p>
      </Empty>
    );
  const careerGroups = [
    {
      title: "适合谁考",
      hint: "人群",
      icon: Compass,
      items: guide.career.bestFor,
    },
    {
      title: "对应岗位",
      hint: "方向",
      icon: BriefcaseBusiness,
      items: guide.career.roles,
    },
    {
      title: "主要价值",
      hint: "收益",
      icon: Award,
      items: guide.career.value,
    },
    {
      title: "现实边界",
      hint: "注意",
      icon: Scale,
      items: guide.career.limitations,
    },
  ];
  return (
    <div className={`certificate-guide-page guide-theme-${certificate.id}`}>
      <Heading title="证书指南" subtitle="考试规则、考点范围、成本与职业价值">
        <span className="guide-verified">
          <CircleCheck size={15} />
          信息核对于 {guide.verifiedAt}
        </span>
      </Heading>

      <div className="certificate-guide-switcher" role="tablist">
        {certificates.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={selectedId === item.id}
            className={selectedId === item.id ? "selected" : ""}
            onClick={() => setSelectedId(item.id)}
          >
            <span className="guide-tab-icon">
              {item.id === "network-engineer" ? (
                <Landmark size={18} />
              ) : (
                <Network size={18} />
              )}
            </span>
            <span>
              <strong>{item.shortName}</strong>
              <small>
                {item.id === currentCertificateId
                  ? "当前报考证书"
                  : "查看证书资料"}
              </small>
            </span>
            {selectedId === item.id ? (
              <CircleCheck size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        ))}
        <p>切换这里只查看资料，不会改变你的当前题库。</p>
      </div>

      <section className="certificate-guide-hero">
        <div className="guide-identity">
          <div className="guide-document-meta">
            <span>{guide.badge}</span>
            <span>EXAM GUIDE · 2026</span>
          </div>
          <div className="guide-title-lockup">
            <span className="guide-emblem">
              <Award size={30} strokeWidth={1.7} />
            </span>
            <div>
              <h1>{guide.title}</h1>
              <strong>{guide.subtitle}</strong>
            </div>
          </div>
          <p>{guide.overview}</p>
          <a
            className="guide-official-link"
            href={guide.sources[0].url}
            target="_blank"
            rel="noreferrer"
          >
            查看官方介绍
            <ExternalLink size={15} />
          </a>
        </div>
        <div className="guide-fact-board">
          <header>
            <span>报考速览</span>
            <strong>先看清这 {guide.facts.length} 项</strong>
          </header>
          <div className="guide-facts">
            {guide.facts.map((fact, index) => {
              const FactIcon = factIcons[index % factIcons.length];
              return (
                <div key={fact.label}>
                  <span className="guide-fact-icon">
                    <FactIcon size={17} />
                  </span>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                  <small>{fact.note}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="certificate-guide-layout">
        <div className="guide-primary-column">
          <section className="guide-section guide-schedule">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">01 · TIME</span>
                <h2>
                  <CalendarDays size={20} />
                  {guide.schedule.title}
                </h2>
              </div>
              <span className="badge green">{guide.schedule.status}</span>
            </div>
            <div className="guide-timeline">
              {guide.schedule.items.map((item, index) => (
                <div key={`${item.date}-${item.title}`}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <time>{item.date}</time>
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </span>
                </div>
              ))}
            </div>
            <p className="guide-section-note">{guide.schedule.note}</p>
          </section>

          <section className="guide-section">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">02 · EXAM</span>
                <h2>
                  <Monitor size={20} />
                  考试方式与通过要求
                </h2>
              </div>
            </div>
            <dl className="guide-detail-list">
              {guide.examDetails.map((item, index) => (
                <div key={item.label}>
                  <dt>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.label}
                  </dt>
                  <dd>
                    <strong>{item.value}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="guide-must-know">
          <div className="guide-must-know-heading">
            <span>
              <TriangleAlert size={19} />
            </span>
            <div>
              <small>BEFORE YOU BOOK</small>
              <h2>报名前必须知道</h2>
            </div>
          </div>
          <ol>
            {guide.mustKnow.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="guide-section guide-knowledge">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">03 · SYLLABUS</span>
            <h2>
              <Target size={20} />
              核心考点
            </h2>
          </div>
          <span>{guide.knowledgeAreas.length} 个知识领域</span>
        </div>
        <div className="guide-knowledge-grid">
          {guide.knowledgeAreas.map((area, index) => (
            <article key={area.name}>
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Target size={15} />
              </div>
              <h3>{area.name}</h3>
              <div className="guide-topic-list">
                {area.topics.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section guide-career">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">04 · CAREER</span>
            <h2>
              <GraduationCap size={20} />
              职业前景与证书价值
            </h2>
          </div>
        </div>
        <p className="guide-career-summary">{guide.career.positioning}</p>
        <div className="guide-career-columns">
          {careerGroups.map(({ title, hint, icon: Icon, items }) => (
            <article key={title}>
              <header>
                <span>
                  <Icon size={17} />
                </span>
                <div>
                  <small>{hint}</small>
                  <h3>{title}</h3>
                </div>
              </header>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="certificate-choice-band">
        <header>
          <span>怎么选</span>
          <strong>同一套网络基础，两种职业价值</strong>
        </header>
        <div className="guide-choice-track">
          <article>
            <Landmark size={21} />
            <span>国家资格与职称使用</span>
            <strong>软考网络工程师</strong>
            <p>适合国企、事业单位、职称聘任依据和需要广泛网络知识的场景。</p>
          </article>
          <article>
            <Target size={21} />
            <span>两证共同基础</span>
            <strong>TCP/IP · VLAN · OSPF · ACL · NAT</strong>
            <p>知识重叠明显，基础阶段可以共用学习成果。</p>
          </article>
          <article>
            <Network size={21} />
            <span>数通实操与华为生态</span>
            <strong>HCIA-Datacom</strong>
            <p>适合 ICT、网络运维、系统集成岗位，并继续进阶 HCIP/HCIE。</p>
          </article>
        </div>
      </section>

      <section className="guide-section guide-sources">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">05 · SOURCES</span>
            <h2>
              <CircleCheck size={20} />
              官方核对入口
            </h2>
          </div>
          <span>费用、日期与规则变化时以官方页面为准</span>
        </div>
        <div>
          {guide.sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="guide-source-icon">
                <FileText size={17} />
              </span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.scope}</small>
              </span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
function WrongView({ wrong, start, train, busy, run, refresh }) {
  const [filter, setFilter] = useState("all"),
    [count, setCount] = useState(5),
    [chapter, setChapter] = useState("");
  const filtered = wrong.filter(
    (q) =>
      (filter !== "due" || q.review?.dueAt <= new Date().toISOString()) &&
      (!chapter || q.chapter === chapter),
  );
  return (
    <>
      <Heading
        title="错题本"
        subtitle={`${wrong.length} 道错题 · 持续追踪，定期回顾`}
      >
        <button
          className="primary"
          disabled={!filtered.length}
          onClick={() => start(filtered, "错题复习")}
        >
          <RotateCcw size={17} />
          开始复习
        </button>
      </Heading>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            全部错题
          </button>
          <button
            className={filter === "due" ? "selected" : ""}
            onClick={() => setFilter("due")}
          >
            今日到期
          </button>
        </div>
        <select
          aria-label="筛选章节"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
        >
          <option value="">全部章节</option>
          {[...new Set(wrong.map((q) => q.chapter))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="inline-label">
          训练题量
          <select
            aria-label="训练题量"
            value={count}
            onChange={(e) => setCount(+e.target.value)}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} 题
              </option>
            ))}
          </select>
        </label>
      </div>
      {!filtered.length ? (
        <Empty title={wrong.length ? "没有符合条件的错题" : "还没有错题记录"}>
          <p>完成练习后，答错的题目会出现在这里。</p>
        </Empty>
      ) : (
        <div className="wrong-list">
          {filtered.map((q) => (
            <article className="wrong-item" key={q.id}>
              <div className="question-meta">
                <span className="badge">{q.chapter}</span>
                <span className="badge red">错误 {q.wrongCount} 次</span>
                <span>{sourceName(q)}</span>
                <span className="push-right">
                  下次复习{" "}
                  {new Date(q.review.dueAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <h3>{q.question}</h3>
              <p className="answer-line">
                上次错选 <b>{q.lastWrong.selected.join("、") || "未作答"}</b>
                <span>
                  正确答案 <strong>{q.answer.join("、")}</strong>
                </span>
              </p>
              {q.mistake && (
                <div className="mistake-detail">
                  <Sparkles size={17} />
                  <div>
                    <strong>{q.mistake.weakKnowledge}</strong>
                    <p>{q.mistake.reason}</p>
                    <small>{q.mistake.mistakeType}</small>
                  </div>
                </div>
              )}
              <div className="item-actions">
                <button onClick={() => start([q], "错题复习")}>
                  <RotateCcw size={16} />
                  再做一次
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    run("正在分析错误原因", async () => {
                      await api("/ai/analyze", { questionId: q.id });
                      await refresh();
                    })
                  }
                >
                  <MessageCircle size={16} />
                  {q.mistake ? "重新分析" : "分析错因"}
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => train(q, count)}
                >
                  <Sparkles size={16} />
                  AI 针对训练
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function TrainingView({
  questions,
  wrong,
  weak,
  queue,
  groups,
  onShareChange,
  train,
  start,
  busy,
  configured,
  settings,
}) {
  const [topic, setTopic] = useState(weak[0]?.knowledgePoint || ""),
    [count, setCount] = useState(5);
  const q =
    wrong.find((q) => q.knowledgePoint === topic) ||
    questions.find((q) => q.knowledgePoint === topic);
  return (
    <>
      {!configured && (
        <div className="alert">
          <PlugZap size={18} />
          <span>尚未连接 AI 服务</span>
          <button onClick={settings}>
            前往设置
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <section className="training-form">
        <h2>
          <Target size={21} />
          创建专项训练
        </h2>
        <div className="training-controls">
          <label>
            知识点
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {weak.map((m) => (
                <option key={m.knowledgePoint}>{m.knowledgePoint}</option>
              ))}
            </select>
          </label>
          <label>
            题目数量
            <div className="segmented">
              {[3, 5, 10].map((n) => (
                <button
                  className={count === n ? "selected" : ""}
                  key={n}
                  onClick={() => setCount(n)}
                >
                  {n} 题
                </button>
              ))}
            </div>
          </label>
          <button
            className="primary"
            disabled={!!busy || !configured || !q}
            onClick={() => train(q, count)}
          >
            <Sparkles size={17} />
            生成训练
          </button>
        </div>
        <div className="stage-track">
          {["基础理解", "直接计算", "变式计算", "反向推理", "综合应用"].map(
            (s, i) => (
              <React.Fragment key={s}>
                <span>
                  <b>{i + 1}</b>
                  {s}
                </span>
                {i < 4 && <ChevronRight size={16} />}
              </React.Fragment>
            ),
          )}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>待完成训练</h2>
          <span className="muted">{queue.length} 题</span>
        </div>
        {queue.length ? (
          <div className="chapter-grid">
            {[
              ...new Set(
                queue.map((q) => q.targetKnowledgePoint || q.knowledgePoint),
              ),
            ].map((t) => (
              <button
                className="chapter-item"
                key={t}
                onClick={() =>
                  start(
                    queue.filter(
                      (q) => (q.targetKnowledgePoint || q.knowledgePoint) === t,
                    ),
                    "AI 专项训练",
                  )
                }
              >
                <Sparkles size={24} />
                <div className="chapter-info">
                  <strong>{t}</strong>
                  <small>
                    {
                      queue.filter(
                        (q) =>
                          (q.targetKnowledgePoint || q.knowledgePoint) === t,
                      ).length
                    }{" "}
                    题待完成
                  </small>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Sparkles} title="暂无待完成的训练" />
        )}
      </section>
      <section className="ai-groups-section">
        <div className="section-heading">
          <div>
            <h2>
              <Share2 size={20} />
              我的 AI 题组
            </h2>
            <p className="muted">
              共享后，同证书用户可以练习题目，但看不到你的账号和学习记录。
            </p>
          </div>
          <span className="muted">{groups?.length || 0} 组</span>
        </div>
        {groups?.length ? (
          <div className="ai-group-list">
            {groups.map((group) => (
              <article className="ai-group-card" key={group.id}>
                <div>
                  <span className="badge green">AI 生成</span>
                  <strong>{group.topic}</strong>
                  <small>
                    {group.questionCount} 题 · 已完成 {group.completedCount} 题 ·{" "}
                    {new Date(group.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </div>
                <label className="shared-ai-toggle">
                  <input
                    type="checkbox"
                    checked={group.shared}
                    disabled={!!busy}
                    onChange={(event) =>
                      onShareChange?.(group.id, event.target.checked)
                    }
                  />
                  <span>{group.shared ? "已共享" : "仅自己使用"}</span>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Share2} title="还没有 AI 题组">
            <p>在错题本中分析错因后，可以生成第一组针对性训练。</p>
          </Empty>
        )}
      </section>
    </>
  );
}
function CommunityView({ questions, loading, stats, reload, start }) {
  const [chapter, setChapter] = useState(""),
    [sort, setSort] = useState("latest");
  const chapters = [...new Set(questions.map((q) => q.chapter))].sort();
  const filtered = questions
    .filter((q) => !chapter || q.chapter === chapter)
    .sort((a, b) => {
      if (sort === "helpful")
        return (b.feedback?.helpful || 0) - (a.feedback?.helpful || 0);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return (
    <>
      <Heading
        title="共享 AI 题库"
        subtitle="用户共同贡献的变式题，练习记录彼此独立"
      >
        <button onClick={reload} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          刷新题库
        </button>
      </Heading>
      <div className="stats community-stats">
        {[
          ["共享题目", stats?.sharedQuestionCount || 0, "题", Globe2],
          ["贡献用户", stats?.contributorCount || 0, "人", Users],
          ["累计练习", stats?.attemptCount || 0, "次", BookOpen],
          ["我的贡献", stats?.myQuestionCount || 0, "题", Share2],
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
              {label === "我的贡献" ? "审核通过后可被同证书用户练习" : "同证书范围"}
            </span>
          </div>
        ))}
      </div>
      <div className="community-notice">
        <Share2 size={19} />
        <div>
          <strong>一起把题库做大，也把题目做稳</strong>
          <p>
            AI 题经过服务端校验和独立审核才会进入共享列表。练习后可以反馈答案错误、表述不清或题目重复，帮助后续整理题库。
          </p>
        </div>
      </div>
      <div className="toolbar community-toolbar">
        <label className="inline-label">
          章节
          <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
            <option value="">全部章节</option>
            {chapters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="inline-label">
          排序
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="latest">最新生成</option>
            <option value="helpful">最多有帮助反馈</option>
          </select>
        </label>
        <span className="muted">{filtered.length} 道可练习</span>
      </div>
      {loading ? (
        <div className="alert working">
          <LoaderCircle size={18} className="spin" />
          <span>正在读取共享题库</span>
        </div>
      ) : filtered.length ? (
        <div className="community-list">
          {filtered.map((q) => (
            <article className="community-card" key={q.id}>
              <div className="question-meta">
                <span className="badge green">AI 生成</span>
                <span className="badge">{q.chapter}</span>
                <span>{diff[q.difficulty] || "练习"}</span>
                <span className="push-right feedback-count">
                  <ThumbsUp size={14} /> {q.feedback?.helpful || 0}
                </span>
              </div>
              <h3>{q.question}</h3>
              <p className="community-topic">{q.knowledgePoint}</p>
              <button
                className="primary"
                onClick={() => start([q], "共享 AI 练习")}
              >
                开始练习
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Globe2} title="共享题库还在增长中">
          <p>先从错题本生成一组 AI 训练题，审核通过后就能贡献给同证书用户。</p>
        </Empty>
      )}
    </>
  );
}
function SettingsView({
  run,
  busy,
  notify,
  refresh,
  certificates,
  currentCertificateId,
  onCertificateChange,
}) {
  const [s, setS] = useState(null),
    [key, setKey] = useState(""),
    [show, setShow] = useState(false),
    [dirty, setDirty] = useState(false),
    [deepSeekGuideOpen, setDeepSeekGuideOpen] = useState(false);
  const load = () => api("/settings").then(setS);
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!deepSeekGuideOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDeepSeekGuideOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deepSeekGuideOpen]);
  if (!s) return <LoaderCircle className="spin" />;
  const change = (field, value) => {
    setS({ ...s, [field]: value });
    setDirty(true);
  };
  const save = () =>
    run("正在保存 AI 配置", async () => {
      await api(
        "/settings",
        {
          baseUrl: s.baseUrl,
          model: s.model,
          temperature: +s.temperature,
          ...(key ? { apiKey: key } : {}),
        },
        "PUT",
      );
      setKey("");
      setShow(false);
      setDirty(false);
      await load();
      await refresh();
      notify("AI 配置已保存");
    });
  const useDeepSeekDefaults = () => {
    setS({
      ...s,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.3,
    });
    setDirty(true);
    setDeepSeekGuideOpen(false);
    notify("已填入 DeepSeek 推荐参数，请粘贴 API Key");
  };
  return (
    <>
      <Heading title="设置" subtitle="报考证书、AI 服务与调用用量" />
      <section className="certificate-settings">
        <div className="section-heading">
          <div>
            <h2>
              <GraduationCap size={21} />
              报考证书
            </h2>
            <p>切换后，章节、推荐练习、错题本和模拟考试会使用对应题库。</p>
          </div>
          <span className="badge green">账号设置</span>
        </div>
        <div className="certificate-settings-list">
          {certificates.map((certificate) => {
            const selected = certificate.id === currentCertificateId;
            return (
              <button
                key={certificate.id}
                className={
                  "certificate-setting " + (selected ? "selected" : "")
                }
                disabled={!!busy || selected}
                onClick={() =>
                  run(`正在切换到 ${certificate.shortName}`, () =>
                    onCertificateChange(certificate.id),
                  )
                }
              >
                <span className="certificate-setting-icon">
                  {selected ? <Check size={18} /> : <GraduationCap size={18} />}
                </span>
                <span>
                  <strong>{certificate.name}</strong>
                  <small>{certificate.description}</small>
                  {certificate.syllabus && (
                    <small className="certificate-setting-meta">
                      {certificate.syllabus.version} · 考试代码{" "}
                      {certificate.syllabus.examCode}
                    </small>
                  )}
                </span>
                <b>{selected ? "当前证书" : "切换"}</b>
              </button>
            );
          })}
        </div>
      </section>
      <div className="settings-tabs">
        <span>AI 设置</span>
      </div>
      <section className="settings-layout">
        <div className="settings-form">
          <div className="settings-form-heading">
            <h2>
              <PlugZap size={21} />
              AI 服务连接
            </h2>
            <button
              className="deepseek-guide-trigger"
              onClick={() => setDeepSeekGuideOpen(true)}
            >
              <BookOpen size={16} />
              DeepSeek 配置教程
            </button>
          </div>
          {!s.encryptionReady && (
            <div className="alert error">
              服务器尚未配置加密主密钥，无法保存 API Key。
            </div>
          )}
          <label>
            API Base URL
            <input
              type="url"
              placeholder="https://api.example.com/v1"
              value={s.baseUrl}
              onChange={(e) => change("baseUrl", e.target.value)}
            />
          </label>
          <label>
            API Key
            <div className="key-input">
              <input
                aria-label="API Key"
                type={show ? "text" : "password"}
                value={key}
                placeholder={
                  s.hasKey ? "已保存 · 输入新 Key 可修改" : "输入 API Key"
                }
                autoComplete="off"
                spellCheck="false"
                onChange={(e) => {
                  setKey(e.target.value);
                  setDirty(true);
                }}
              />
              <IconButton
                icon={show ? EyeOff : Eye}
                label={show ? "隐藏 API Key" : "显示 API Key"}
                disabled={!key}
                onClick={() => setShow(!show)}
              />
              <IconButton
                icon={Trash2}
                label="删除已保存 API Key"
                disabled={!s.hasKey || !!busy}
                onClick={() =>
                  run("正在删除 API Key", async () => {
                    await api("/settings/key", null, "DELETE");
                    setKey("");
                    await load();
                    await refresh();
                    notify("API Key 已删除");
                  })
                }
              />
            </div>
            <small className="field-state">
              {s.hasKey ? "已加密保存 · 原值不回传浏览器" : "尚未保存"}
            </small>
          </label>
          <label>
            模型名称
            <input
              placeholder="输入服务商提供的模型名称"
              value={s.model}
              onChange={(e) => change("model", e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={s.temperature}
                onChange={(e) => change("temperature", e.target.value)}
              />
            </label>
          </div>
          <div className="item-actions">
            <button
              className="primary"
              disabled={!!busy || !s.encryptionReady}
              onClick={save}
            >
              <Save size={16} />
              保存配置
            </button>
            <button
              disabled={!!busy || !s.hasKey || dirty}
              onClick={() =>
                run("正在测试连接", async () => {
                  const r = await api("/ai/test", {});
                  notify(r.message);
                  await load();
                })
              }
            >
              <PlugZap size={16} />
              测试连接
            </button>
            {dirty && <small className="muted">有未保存的修改</small>}
          </div>
        </div>
        <aside className="usage-section">
          <h2>调用用量</h2>
          <div className="usage-period">今日</div>
          <div className="usage-values">
            <div>
              <strong>{s.usage.today.calls}</strong>
              <span>调用次数</span>
            </div>
            <div>
              <strong>{s.usage.today.total_tokens.toLocaleString()}</strong>
              <span>Token</span>
            </div>
          </div>
          <div className="usage-period">累计</div>
          <div className="usage-values">
            <div>
              <strong>{s.usage.total.calls}</strong>
              <span>调用次数</span>
            </div>
            <div>
              <strong>{s.usage.total.total_tokens.toLocaleString()}</strong>
              <span>Token</span>
            </div>
          </div>
          <dl>
            <dt>输入 Token</dt>
            <dd>{s.usage.total.prompt_tokens.toLocaleString()}</dd>
            <dt>输出 Token</dt>
            <dd>{s.usage.total.completion_tokens.toLocaleString()}</dd>
            <dt>未返回用量的调用</dt>
            <dd>{s.usage.total.unknownUsage}</dd>
          </dl>
          <button
            className="text-button"
            onClick={() => run("正在刷新用量", load)}
          >
            <RefreshCw size={15} />
            刷新统计
          </button>
        </aside>
      </section>
      {deepSeekGuideOpen && (
        <div
          className="guide-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setDeepSeekGuideOpen(false);
          }}
        >
          <section
            className="deepseek-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deepseek-guide-title"
          >
            <header>
              <div>
                <span className="guide-kicker">从零开始</span>
                <h2 id="deepseek-guide-title">配置 DeepSeek API</h2>
                <p>
                  按下面五步操作。完成后，网站里的 AI 解析和专项训练就能使用。
                </p>
              </div>
              <IconButton
                icon={X}
                label="关闭 DeepSeek 配置教程"
                onClick={() => setDeepSeekGuideOpen(false)}
              />
            </header>

            <ol className="guide-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>注册并登录 DeepSeek 开放平台</strong>
                  <p>这里是开发者控制台，和普通聊天页面不是同一个入口。</p>
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 DeepSeek 开放平台
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>给 API 账户充值</strong>
                  <p>
                    API 按实际调用量计费。聊天产品的会员或余额通常不能直接抵扣
                    API 费用。
                  </p>
                  <a
                    href="https://platform.deepseek.com/top_up"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开官方充值页面
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>创建 API Key</strong>
                  <p>
                    点击“创建 API Key”，复制生成的密钥。密钥通常以 sk-
                    开头，关闭页面后可能无法再次完整查看。
                  </p>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开官方 API Keys 页面
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>填写本站设置</strong>
                  <dl className="guide-values">
                    <dt>API Base URL</dt>
                    <dd>https://api.deepseek.com</dd>
                    <dt>API Key</dt>
                    <dd>粘贴刚才复制的 sk- 密钥</dd>
                    <dt>模型名称</dt>
                    <dd>deepseek-chat</dd>
                    <dt>Temperature</dt>
                    <dd>0.3</dd>
                    <dt>输出长度</dt>
                    <dd>由模型服务商自动决定</dd>
                  </dl>
                </div>
              </li>
              <li>
                <span>5</span>
                <div>
                  <strong>保存并测试</strong>
                  <p>
                    先点“保存配置”，再点“测试连接”。看到连接成功就配置完成了。
                  </p>
                </div>
              </li>
            </ol>

            <div className="guide-help">
              <strong>测试失败时先检查</strong>
              <p>
                Key 是否完整、API 账户是否有余额、模型名是否为
                deepseek-chat。不要把 API Key 发给别人或放进截图。
              </p>
              <a
                href="https://api-docs.deepseek.com/"
                target="_blank"
                rel="noreferrer"
              >
                查看 DeepSeek 官方 API 文档
                <ExternalLink size={14} />
              </a>
            </div>

            <footer>
              <button onClick={() => setDeepSeekGuideOpen(false)}>
                稍后配置
              </button>
              <button className="primary" onClick={useDeepSeekDefaults}>
                <PlugZap size={16} />
                一键填入推荐配置
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
function Practice({ session, refresh, run, busy, train, configured, exit }) {
  const [index, setIndex] = useState(0),
    [selected, setSelected] = useState([]),
    [result, setResult] = useState(null),
    [teacher, setTeacher] = useState(""),
    [hint, setHint] = useState(0),
    [history, setHistory] = useState([]),
    [done, setDone] = useState(false),
    [teacherOpen, setTeacherOpen] = useState(false),
    [feedbackKind, setFeedbackKind] = useState(null);
  const started = useRef(Date.now());
  const q = session.questions[index];
  const choose = (k) => {
    if (result) return;
    setSelected(
      isSingleSelect(q)
        ? [k]
        : selected.includes(k)
          ? selected.filter((x) => x !== k)
          : [...selected, k],
    );
  };
  const submit = () =>
    run("正在记录作答", async () => {
      const r = await api("/attempts", {
        questionId: q.id,
        selected,
        timeMs: Math.min(86400000, Date.now() - started.current),
      });
      setResult(r);
      setHistory([...history, r]);
      await refresh();
    });
  const analyzeMistake = () =>
    run("正在分析错误原因", async () => {
      const m = await api("/ai/analyze", { questionId: q.id });
      setTeacher(`${m.weakKnowledge}\n\n${m.reason}`);
      setTeacherOpen(true);
      await refresh();
    });
  const sendFeedback = (kind) =>
    run("正在保存题目反馈", async () => {
      await api(`/questions/${q.id}/feedback`, { kind });
      setFeedbackKind(kind);
    });
  const next = () => {
    if (busy) return;
    if (index === session.questions.length - 1) {
      setDone(true);
      return;
    }
    setIndex(index + 1);
    setSelected([]);
    setResult(null);
    setTeacher("");
    setHint(0);
    setFeedbackKind(null);
    started.current = Date.now();
  };
  const ask = (action, level = 0) =>
    run("AI 老师正在思考", async () => {
      const r = await api("/ai/teacher", {
        questionId: q.id,
        action,
        selected,
        hintLevel: level,
      });
      setTeacher(r.text);
      if (level) setHint(level);
      setTeacherOpen(true);
    });
  if (done)
    return (
      <div className="completion">
        <CircleCheck size={56} />
        <h1>本轮练习完成</h1>
        <p>{session.title}</p>
        <div className="completion-stats">
          <strong>
            {history.filter((h) => h.correct).length}
            <small>答对</small>
          </strong>
          <strong>
            {history.filter((h) => !h.correct).length}
            <small>答错</small>
          </strong>
          <strong>
            {session.questions.length - history.length}
            <small>查看答案</small>
          </strong>
        </div>
        <button className="primary" onClick={exit}>
          返回学习总览
          <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <>
      <Heading
        title={session.title}
        subtitle={`${q.chapter} · ${q.knowledgePoint}`}
      >
        <button onClick={exit}>
          <ArrowLeft size={16} />
          结束练习
        </button>
      </Heading>
      <div className="practice-layout">
        <section className="question-panel">
          <div className="question-top">
            <span>
              第 <b>{index + 1}</b> / {session.questions.length} 题
            </span>
            <span
              className={
                "badge " + (q.source === "ai_generated" ? "green" : "")
              }
            >
              {sourceName(q)}
            </span>
          </div>
          <div className="progress">
            <i
              style={{
                width: ((index + 1) / session.questions.length) * 100 + "%",
              }}
            />
          </div>
          <div className="question-meta">
            <span className="badge">{questionTypeName(q)}</span>
            <span>{diff[q.difficulty]}</span>
            {q.stage && <span>{q.stage}</span>}
          </div>
          <h2 className="question-text">{q.question}</h2>
          <QuestionOrigin question={q} />
          <div className="options">
            {Object.entries(q.options).map(([k, v]) => (
              <button
                key={k}
                disabled={!!result}
                className={
                  "option " +
                  (selected.includes(k) ? "chosen " : "") +
                  (result?.answer.includes(k)
                    ? "correct "
                    : result && selected.includes(k)
                      ? "incorrect"
                      : "")
                }
                onClick={() => choose(k)}
              >
                <span className="option-letter">{k}</span>
                <span>{v}</span>
                {result?.answer.includes(k) ? (
                  <Check size={20} />
                ) : result && selected.includes(k) ? (
                  <X size={20} />
                ) : null}
              </button>
            ))}
          </div>
          {result && (
            <div
              className={
                "result-block " + (result.correct === false ? "wrong" : "")
              }
            >
              <h3>
                {result.correct === undefined
                  ? "答案解析"
                  : result.correct
                    ? "回答正确"
                    : "这道题还需要巩固"}
                <span>正确答案 {result.answer.join("、")}</span>
              </h3>
              <p>{result.analysis}</p>
            </div>
          )}
          {result && q.source === "ai_generated" && (
            <div className="question-feedback">
              <span>这道共享 AI 题怎么样？</span>
              <button
                className={feedbackKind === "helpful" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("helpful")}
              >
                <ThumbsUp size={15} />
                {feedbackKind === "helpful" ? "已标记有帮助" : "有帮助"}
              </button>
              <button
                className={feedbackKind === "wrong_answer" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("wrong_answer")}
              >
                <Flag size={15} />
                {feedbackKind === "wrong_answer" ? "已反馈答案问题" : "答案有问题"}
              </button>
              <button
                className={feedbackKind === "ambiguous" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("ambiguous")}
              >
                {feedbackKind === "ambiguous" ? "已反馈表述问题" : "表述不清"}
              </button>
              <button
                className={feedbackKind === "duplicate" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("duplicate")}
              >
                {feedbackKind === "duplicate" ? "已反馈重复" : "题目重复"}
              </button>
            </div>
          )}
          <div className="question-actions">
            <button
              disabled={!!busy || hint >= 3 || !!result}
              onClick={() => ask("给我提示", hint + 1)}
            >
              <Lightbulb size={17} />
              给我提示 {hint}/3
            </button>
            <button
              className="text-button"
              disabled={!!busy || !!result}
              onClick={() =>
                run("正在查看答案", async () =>
                  setResult(await api(`/questions/${q.id}/reveal`, {})),
                )
              }
            >
              查看答案
            </button>
            {result ? (
              <>
                {result.correct === false && (
                  <button
                    className="ai-analysis-button"
                    onClick={analyzeMistake}
                    disabled={!!busy}
                  >
                    <MessageCircle size={17} />
                    AI 解析
                  </button>
                )}
                <button
                  className="primary push-right"
                  onClick={next}
                  disabled={!!busy}
                >
                  {index === session.questions.length - 1
                    ? "完成练习"
                    : "下一题"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <button
                className="primary push-right"
                disabled={!selected.length || !!busy}
                onClick={submit}
              >
                提交答案
                <Check size={17} />
              </button>
            )}
          </div>
        </section>
        <aside className="teacher-panel">
          <h2>
            <Sparkles size={21} />
            AI 老师
          </h2>
          <button
            className="teacher-open"
            onClick={() => setTeacherOpen(!teacherOpen)}
          >
            <MessageCircle size={17} />问 AI
            <ChevronRight size={16} />
          </button>
          {teacherOpen && (
            <>
              <div className="teacher-actions">
                {[
                  "为什么我错了？",
                  "详细讲解",
                  "换一种方法解释",
                  "举一个实际例子",
                ].map((a) => (
                  <button
                    key={a}
                    disabled={!!busy || !result}
                    onClick={() => ask(a)}
                  >
                    {a}
                  </button>
                ))}
                <button disabled={!!busy} onClick={() => train(q, 1)}>
                  给我出一道类似题
                </button>
                <button disabled={!!busy} onClick={() => train(q, 1, true)}>
                  给我出一道更难的题
                </button>
              </div>
              {!result && (
                <small className="muted">作答或查看答案后可展开完整讲解</small>
              )}
            </>
          )}
          {teacher ? (
            <div className="teacher-response">{teacher}</div>
          ) : (
            <div className="teacher-idle">
              <Lightbulb size={28} />
              <span>一步一步，找到答案</span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
function ExamView({ run, refresh, dashboard }) {
  const [exam, setExam] = useState(null),
    [answers, setAnswers] = useState({}),
    [index, setIndex] = useState(0),
    [result, setResult] = useState(null),
    [count, setCount] = useState(20),
    [remaining, setRemaining] = useState(0),
    [submitting, setSubmitting] = useState(false);
  const autoSubmit = useRef(false);
  useEffect(() => {
    const saved = localStorage.getItem("netwise-exam");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        api("/exams/" + data.id)
          .then((e) => {
            if (e.submitted) {
              localStorage.removeItem("netwise-exam");
              return;
            }
            setExam(e);
            setAnswers(data.answers || {});
          })
          .catch(() => localStorage.removeItem("netwise-exam"));
      } catch {
        localStorage.removeItem("netwise-exam");
      }
    }
  }, []);
  useEffect(() => {
    if (exam && !result)
      localStorage.setItem(
        "netwise-exam",
        JSON.stringify({ id: exam.id, answers }),
      );
  }, [exam, answers, result]);
  useEffect(() => {
    if (!exam || result) return;
    const timer = setTimeout(
      () =>
        api("/exams/" + exam.id + "/answers", { answers }, "PUT").catch(
          () => {},
        ),
      200,
    );
    return () => clearTimeout(timer);
  }, [exam, answers, result]);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await run("正在提交考试", () =>
        api("/exams/" + exam.id + "/submit", { answers }),
      );
      if (r) {
        setResult(r);
        localStorage.removeItem("netwise-exam");
        await refresh();
      } else autoSubmit.current = false;
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    if (!exam || result) return;
    const tick = () => {
      const t = Math.max(
        0,
        Math.ceil((new Date(exam.expiresAt) - Date.now()) / 1000),
      );
      setRemaining(t);
      if (t === 0 && !autoSubmit.current) {
        autoSubmit.current = true;
        submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam, answers, result, submitting]);
  const begin = () =>
    run("正在创建模拟考试", async () => {
      const e = await api("/exams", { count });
      setExam(e);
      setAnswers({});
      setIndex(0);
      setResult(null);
      autoSubmit.current = false;
    });
  if (result)
    return (
      <>
        <Heading
          title="考试结果"
          subtitle={`用时 ${Math.round(result.elapsed / 60000)} 分钟`}
        />
        <div className="exam-score">
          <strong>
            {result.score}
            <small>分</small>
          </strong>
          <p>
            答对 {result.results.filter((r) => r.correct).length} /{" "}
            {result.results.length} 题
          </p>
          <button
            className="primary"
            onClick={() => {
              setExam(null);
              setResult(null);
            }}
          >
            再考一次
            <RotateCcw size={17} />
          </button>
        </div>
        <div className="wrong-list">
          {result.results.map((r, i) => (
            <article className="wrong-item" key={r.questionId}>
              <span className={"badge " + (r.correct ? "green" : "red")}>
                {r.correct ? "正确" : "错误"}
              </span>
              <h3>
                {i + 1}. {r.question}
              </h3>
              <p>
                我的答案：{r.selected.join("、") || "未作答"} · 正确答案：
                {r.answer.join("、")}
              </p>
              <p>{r.analysis}</p>
            </article>
          ))}
        </div>
      </>
    );
  if (!exam)
    return (
      <>
        <Heading
          title="模拟考试"
          subtitle={
            dashboard.syllabus
              ? `${dashboard.syllabus.version} 考点 · 按本站练习配比分层抽题 · 交卷后统一评分`
              : "当前证书题库 · 限时作答 · 交卷后统一评分"
          }
        />
        <section className="exam-intro">
          <GraduationCap size={52} />
          <h2>{dashboard.certificate.shortName} 模拟测试</h2>
          {dashboard.syllabus && (
            <p className="exam-blueprint-note">
              覆盖 {dashboard.syllabus.coveredModules}{" "}
              个考点模块；抽题比例为本站练习蓝图，不代表官方考试权重。
            </p>
          )}
          <div className="exam-settings">
            <label>
              试题数量
              <select value={count} onChange={(e) => setCount(+e.target.value)}>
                {[10, 20, 40].map((n) => (
                  <option key={n} value={n}>
                    {n} 题
                  </option>
                ))}
              </select>
            </label>
            <div>
              <span>考试时间</span>
              <strong>{count * 2} 分钟</strong>
            </div>
          </div>
          <button className="primary" onClick={begin}>
            开始考试
            <ArrowRight size={18} />
          </button>
        </section>
      </>
    );
  const q = exam.questions[index],
    selected = answers[q.id] || [];
  return (
    <>
      <Heading
        title="模拟考试"
        subtitle={`已答 ${Object.values(answers).filter((a) => a.length).length} / ${exam.questions.length} 题`}
      >
        <div className="exam-timer">
          <Clock size={19} />
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </div>
      </Heading>
      <div className="practice-layout">
        <section className="question-panel">
          <span className="badge">
            第 {index + 1} 题 · {questionTypeName(q, true)}
          </span>
          <h2 className="question-text">{q.question}</h2>
          <QuestionOrigin question={q} />
          <div className="options">
            {Object.entries(q.options).map(([k, v]) => (
              <button
                disabled={remaining === 0}
                className={"option " + (selected.includes(k) ? "chosen" : "")}
                key={k}
                onClick={() =>
                  setAnswers({
                    ...answers,
                    [q.id]: isSingleSelect(q)
                      ? [k]
                      : selected.includes(k)
                        ? selected.filter((x) => x !== k)
                        : [...selected, k],
                  })
                }
              >
                <span className="option-letter">{k}</span>
                <span>{v}</span>
              </button>
            ))}
          </div>
          <div className="question-actions">
            <IconButton
              icon={ArrowLeft}
              label="上一题"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            />
            <IconButton
              icon={ArrowRight}
              label="下一题"
              disabled={index === exam.questions.length - 1}
              onClick={() => setIndex(index + 1)}
            />
            <button
              className="primary push-right"
              disabled={submitting}
              onClick={submit}
            >
              交卷
              <Check size={17} />
            </button>
          </div>
        </section>
        <aside className="teacher-panel">
          <h2>答题卡</h2>
          <div className="answer-grid">
            {exam.questions.map((q, i) => (
              <button
                key={q.id}
                className={
                  (answers[q.id]?.length ? "answered " : "") +
                  (index === i ? "current" : "")
                }
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
