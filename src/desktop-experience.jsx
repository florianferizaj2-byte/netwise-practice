import React, { useEffect, useRef, useState } from "react";
import { DesktopTrial } from "./desktop-trial.jsx";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Crown,
  Download,
  GraduationCap,
  Layers3,
  MessageCircle,
  Monitor,
  NotebookPen,
  Search,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  TrendingUp,
  X,
  Compass,
} from "lucide-react";

// A separate desktop surface keeps the existing mobile experience intact.
export function useDesktopWeb() {
  const query = "(min-width: 900px) and (hover: hover) and (pointer: fine)";
  const eligible = () =>
    !window.kaojiangAppleMobile &&
    !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const [desktop, setDesktop] = useState(
    () => eligible() && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const change = () => setDesktop(eligible() && media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return desktop;
}

const features = [
  {
    page: "chapters",
    name: "章节练习",
    detail: "沿着章节与知识点，把基础练扎实。",
    icon: BookOpen,
  },
  {
    page: "wrong",
    name: "错题复习",
    detail: "留下易错之处，按复习安排逐个消化。",
    icon: NotebookPen,
  },
  {
    page: "training",
    name: "AI 专项训练",
    detail: "围绕薄弱知识点，生成针对性的练习。",
    icon: Sparkles,
  },
  {
    page: "exam",
    name: "模拟考试",
    detail: "在完整的计时考试里，检验备考状态。",
    icon: GraduationCap,
  },
  {
    page: "mastery",
    name: "知识掌握度",
    detail: "从作答记录中，看见每个知识点的进步。",
    icon: TrendingUp,
  },
  {
    page: "community",
    name: "共享题库",
    detail: "发现其他学习者分享的 AI 题组。",
    icon: Layers3,
  },
  {
    page: "chat",
    name: "社区交流",
    detail: "交流备考经验，也分享你的解题思路。",
    icon: MessageCircle,
  },
  {
    page: "guide",
    name: "证书指南",
    detail: "了解目标证书，找到自己的学习方向。",
    icon: Compass,
  },
  {
    page: "vip",
    name: "会员与 AI 服务",
    detail: "查看服务额度、会员方案与兑换入口。",
    icon: Crown,
  },
];

function Wordmark({ onClick }) {
  return (
    <button
      className="desk-wordmark"
      onClick={onClick}
      aria-label="考匠品牌首页"
    >
      <img src="/kaojiang-logo-192.png" alt="" width="40" height="40" />
      <strong>考匠</strong>
      <span>AceExam</span>
    </button>
  );
}

function DesktopDialog({ children, label, onClose, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    dialog.querySelector("input")?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`desktop-experience desk-dialog ${className}`}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < rect.left ||
            event.clientX > rect.right ||
            event.clientY < rect.top ||
            event.clientY > rect.bottom
          )
            onClose();
        }
      }}
    >
      <button className="desk-close" onClick={onClose} aria-label="关闭对话框">
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}

function DesktopAuth({ api, onAuth, initialMode, onClose, initialError }) {
  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState(initialError || "");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (mode === "register" && data.get("password") !== data.get("confirm")) {
      setError("两次输入的密码不一致。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode}`, {
        username: data.get("username"),
        password: data.get("password"),
      });
      const result = await api("/auth/me");
      if (!result.authenticated)
        throw new Error("登录状态未保存，请检查浏览器的 Cookie 设置后重试。");
      onAuth(result);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <DesktopDialog
      label={mode === "login" ? "登录考匠" : "创建考匠账号"}
      onClose={onClose}
      className="desk-auth-dialog"
    >
      <img className="desk-auth-seal" src="/kaojiang-logo-192.png" alt="考匠" />
      <h2>{mode === "login" ? "欢迎回到考匠" : "开始你的进阶之路"}</h2>
      <p>
        {mode === "login"
          ? "每一次练习，都让知识更扎实。"
          : "创建账号，选择证书，开始第一组练习。"}
      </p>
      <form onSubmit={submit}>
        <label>
          账号
          <input
            autoFocus
            name="username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={40}
            pattern="[A-Za-z0-9_-]+"
            title="使用 3–40 位字母、数字、下划线或短横线"
            placeholder="字母、数字或下划线"
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            required
            minLength={8}
            maxLength={128}
            placeholder="至少 8 位密码"
          />
        </label>
        {mode === "register" && (
          <label>
            确认密码
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              placeholder="再次输入密码"
            />
          </label>
        )}
        {error && (
          <div className="desk-form-error" role="alert">
            {error}
          </div>
        )}
        <button
          className="desk-button desk-primary"
          disabled={busy}
          type="submit"
        >
          {busy
            ? "正在连接你的学习空间…"
            : mode === "login"
              ? "进入学习空间"
              : "创建账号"}
          <ArrowRight size={17} />
        </button>
      </form>
      <button
        className="desk-auth-switch"
        disabled={busy}
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
        }}
      >
        {mode === "login" ? "第一次来？创建账号" : "已有账号？直接登录"}
      </button>
      <div className="desk-auth-note">
        <ShieldCheck size={15} />
        学习记录跟随账号，在多端继续
      </div>
    </DesktopDialog>
  );
}

export function DesktopLanding({
  api,
  certificates = [],
  onAuth,
  initialError,
  authenticated = false,
  navigate,
}) {
  const [authDialog, setAuthDialog] = useState(null);
  const [certificatePreview, setCertificatePreview] = useState(null);
  const enter = (page = "home", mode = "login") =>
    authenticated ? navigate(page) : setAuthDialog({ page, mode });
  const scroll = (id) =>
    document
      .getElementById(id)
      ?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
  return (
    <div className="desktop-experience desk-landing">
      <header className="desk-site-header">
        <div className="desk-container desk-site-nav">
          <Wordmark
            onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
          />
          <nav aria-label="品牌首页导航">
            <button onClick={() => scroll("desk-method")}>学习方式</button>
            <button onClick={() => scroll("desk-features")}>全部功能</button>
            <button onClick={() => scroll("desk-certificates")}>
              备考证书
            </button>
            <button onClick={() => navigate("downloads")}>多端学习与下载</button>
          </nav>
          <div className="desk-nav-actions">
            {!authenticated && (
              <button className="desk-login" onClick={() => enter()}>
                登录
              </button>
            )}
            <button
              className="desk-button desk-primary"
              onClick={() => enter("home", "register")}
            >
              {authenticated ? "返回学习空间" : "开始学习"}
              <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
      </header>
      <main>
        <section className="desk-hero desk-container">
          <div className="desk-hero-copy">
            <div className="desk-hero-tag">
              <span className="desk-status-dot" />
              你的职业认证学习空间
            </div>
            <h1>
              把每一道题，
              <br />
              学成你的底气。
            </h1>
            <p>
              先免费试做 5 道题，无需注册。
              <br />让 AI 帮你读懂解析、看清错因，
              <br className="desk-compact-break" />
              从这一题，找到自己的学习节奏。
            </p>
            <div className="desk-hero-actions">
              <button
                className="desk-button desk-primary"
                onClick={() => scroll("desk-guest-trial")}
              >
                免费试做 5 道题
                <ArrowUpRight size={18} />
              </button>
              <button
                className="desk-button desk-secondary"
                onClick={() => scroll("desk-features")}
              >
                探索考匠
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="desk-hero-footnote">
              <span>
                <Check size={14} />
                按知识点练习
              </span>
              <span>
                <Check size={14} />
                AI 针对性训练
              </span>
              <span>
                <Check size={14} />
                学习记录同步
              </span>
            </div>
          </div>
          <div className="desk-hero-preview">
            <div className="desk-preview-caption">
              <span>先试五道，再决定怎么学。</span>
              <span>
                免费试用
                <ArrowRight size={14} />
              </span>
            </div>
            <DesktopTrial
              api={api}
              Dialog={DesktopDialog}
              onJoin={() => enter("home", "register")}
              authenticated={authenticated}
            />
            <div className="desk-preview-under">
              <span>
                <BookOpen size={15} />
                练习
              </span>
              <i />
              <span>
                <Sparkles size={15} />
                理解
              </span>
              <i />
              <span>
                <Target size={15} />
                掌握
              </span>
            </div>
          </div>
        </section>
        <section className="desk-method" id="desk-method">
          <div className="desk-container desk-method-grid">
            <div>
              <span className="desk-section-kicker">让努力更有章法</span>
              <h2>练过，更要真正掌握。</h2>
            </div>
            <div>
              <BookOpen />
              <h3>有路径地练</h3>
              <p>
                按章节与知识点推进，
                <br />
                把零散知识连成体系。
              </p>
            </div>
            <div>
              <Sparkles />
              <h3>有针对性地学</h3>
              <p>
                从错题找到薄弱点，
                <br />用 AI 训练继续巩固。
              </p>
            </div>
            <div>
              <Target />
              <h3>有依据地复盘</h3>
              <p>
                通过掌握度与模拟考试，
                <br />
                看清下一步该学什么。
              </p>
            </div>
          </div>
        </section>
        <section className="desk-container desk-features" id="desk-features">
          <div className="desk-section-heading">
            <div>
              <span className="desk-section-kicker">完整的备考工具</span>
              <h2>你的备考，一处就绪。</h2>
            </div>
            <p>
              从题库到考场，从独自钻研到交流分享。
              <br />
              每个环节，都有顺手的工具。
            </p>
          </div>
          <div className="desk-feature-grid">
            {features.map(({ page, name, detail, icon: Icon }) => (
              <button
                className="desk-feature"
                key={page}
                onClick={() => enter(page)}
              >
                <div className="desk-feature-top">
                  <Icon size={23} />
                  <ArrowUpRight size={17} />
                </div>
                <h3>{name}</h3>
                <p>{detail}</p>
                <span>进入{page === "vip" ? "会员中心" : name}</span>
              </button>
            ))}
          </div>
        </section>
        <section
          className="desk-container desk-certificate-section"
          id="desk-certificates"
        >
          <div>
            <span className="desk-section-kicker">从你的目标开始</span>
            <h2>
              选好方向，
              <br />
              下一步交给行动。
            </h2>
            <p>
              选择正在备考的证书，
              <br />
              进入对应题库与学习空间。
            </p>
            <button className="desk-text-link" onClick={() => enter("guide")}>
              查看证书指南
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="desk-certificate-list">
            {certificates.length ? (
              certificates.map((certificate) => (
                <button
                  key={certificate.id}
                  onClick={() => setCertificatePreview(certificate)}
                >
                  <span className="desk-cert-icon">
                    <GraduationCap size={21} />
                  </span>
                  <span>
                    <strong>{certificate.shortName || certificate.name}</strong>
                    <small>
                      {certificate.name !== certificate.shortName
                        ? certificate.name
                        : "题库练习与备考指南"}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))
            ) : (
              <div className="desk-certificate-empty">
                <GraduationCap size={28} />
                <h3>找到你的目标证书</h3>
                <p>登录后查看当前开放的证书与题库。</p>
                <button
                  className="desk-button desk-secondary"
                  onClick={() => enter("guide")}
                >
                  查看证书
                </button>
              </div>
            )}
          </div>
        </section>
        <section
          className="desk-container desk-device-section"
          id="desk-devices"
        >
          <div className="desk-device-art" aria-hidden="true">
            <div className="desk-device-monitor">
              <Monitor size={34} />
              <span>考匠 · 学习空间</span>
              <div>
                <i />
                <i />
                <i />
              </div>
            </div>
            <div className="desk-device-phone">
              <img src="/kaojiang-logo-192.png" alt="" />
              <span>随时继续</span>
              <i />
            </div>
          </div>
          <div>
            <span className="desk-section-kicker">学习，不必停在电脑前</span>
            <h2>
              坐下来专注，
              <br />
              走出去也能继续。
            </h2>
            <p>
              电脑上系统练习，手机上利用零碎时间。
              <br />
              登录同一账号，接着你的进度往前走。
            </p>
            <div className="desk-device-actions">
              <button className="desk-button desk-primary" onClick={() => navigate("downloads")}>
                <Monitor size={17} />查看多端学习与下载<ArrowUpRight size={16} />
              </button>
              <a className="desk-button desk-secondary" href="/app/">
                <Smartphone size={17} />
                打开手机网页版
              </a>
            </div>
          </div>
        </section>
        <section className="desk-bottom-cta desk-container">
          <div>
            <h2>下一次进步，从这一题开始。</h2>
            <p>给自己一个专注的学习空间。</p>
          </div>
          <button
            className="desk-button desk-primary"
            onClick={() => enter("home", "register")}
          >
            进入考匠
            <ArrowUpRight size={19} />
          </button>
        </section>
      </main>
      <footer className="desk-site-footer desk-container">
        <Wordmark
          onClick={() => window.scrollTo({ top: 0, behavior: "instant" })}
        />
        <span>认真练习，从容应考。</span>
        <button onClick={() => enter("about")}>
          关于考匠
          <ArrowUpRight size={14} />
        </button>
        <small>© {new Date().getFullYear()} 考匠 AceExam</small>
      </footer>
      {authDialog && (
        <DesktopAuth
          api={api}
          initialError={initialError}
          initialMode={authDialog.mode}
          onClose={() => setAuthDialog(null)}
          onAuth={(result) => {
            navigate(authDialog.page);
            onAuth(result);
          }}
        />
      )}
      {certificatePreview && (
        <DesktopDialog
          label={certificatePreview.name}
          onClose={() => setCertificatePreview(null)}
          className="desk-certificate-dialog"
        >
          <GraduationCap size={30} />
          <h2>{certificatePreview.name}</h2>
          <p>
            {certificatePreview.description ||
              "围绕证书知识体系，进行章节练习、错题复习与模拟考试。"}
          </p>
          <div className="desk-certificate-note">
            进入学习空间后，选择这张证书即可查看对应题库。已有学习记录会按证书保留。
          </div>
          <button
            className="desk-button desk-primary"
            onClick={() => {
              setCertificatePreview(null);
              enter("settings");
            }}
          >
            {authenticated ? "前往选择证书" : "登录并选择证书"}
            <ArrowRight size={17} />
          </button>
        </DesktopDialog>
      )}
    </div>
  );
}

export function DesktopCertificatePicker({
  certificates,
  onSelect,
  onSignOut,
}) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const choose = async (id) => {
    setPending(id);
    setError("");
    try {
      await onSelect(id);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setPending("");
    }
  };
  return (
    <main className="desktop-experience desk-onboarding">
      <div className="desk-onboarding-header">
        <Wordmark onClick={onSignOut} />
        <button className="desk-text-link" onClick={onSignOut}>
          退出登录
        </button>
      </div>
      <section>
        <span className="desk-section-kicker">属于你的学习空间</span>
        <h1>这一次，你想拿下哪张证书？</h1>
        <p>选择目标，开启对应题库。之后也可以在设置中切换。</p>
        {error && (
          <div role="alert" className="desk-form-error">
            {error}
          </div>
        )}
        <div className="desk-onboarding-grid">
          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              disabled={!!pending}
              onClick={() => choose(certificate.id)}
            >
              <GraduationCap size={26} />
              <strong>{certificate.shortName || certificate.name}</strong>
              <p>{certificate.description || certificate.name}</p>
              <span>
                {pending === certificate.id
                  ? "正在准备学习空间…"
                  : "选择这张证书"}
                <ArrowUpRight size={17} />
              </span>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

export function DesktopToolbar({
  pageTitle,
  navs,
  chapters,
  go,
  openChapter,
  plan,
  username,
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const shortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
        setQuery("");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const results = [
    ...navs.map(([id, label, icon]) => ({
      id,
      label,
      icon,
      hint: "功能",
      action: () => go(id),
    })),
    ...chapters.map((chapter) => ({
      id: `chapter-${chapter.name}`,
      label: chapter.name,
      icon: BookOpen,
      hint: "章节",
      action: () => openChapter(chapter.name),
    })),
  ].filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="desk-breadcrumb">
        <span>我的学习空间</span>
        <ChevronRight size={14} />
        <strong>{pageTitle}</strong>
      </div>
      <div className="desk-toolbar-actions">
        <button
          className="desk-search-trigger"
          aria-label="搜索功能与章节"
          title="搜索功能与章节（Ctrl / ⌘ + K）"
          onClick={() => {
            setQuery("");
            setSearchOpen(true);
          }}
        >
          <Search size={16} />
          <span>搜索功能与章节</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="study-download-link" onClick={() => go("downloads")}><Download size={17} />多端下载</button>
      </div>
      {searchOpen && (
        <DesktopDialog
          label="搜索功能与章节"
          className="desk-search-dialog"
          onClose={() => setSearchOpen(false)}
        >
          <div className="desk-search-field">
            <Search size={21} />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索功能、章节名称…"
              aria-label="搜索功能或章节"
            />
          </div>
          <p className="desk-search-label">
            {query ? `找到 ${results.length} 个结果` : "快速前往"}
          </p>
          <div className="desk-search-results">
            {results.map(({ id, label, icon: Icon, hint, action }) => (
              <button
                key={id}
                onClick={() => {
                  setSearchOpen(false);
                  action();
                }}
              >
                <Icon size={19} />
                <span>{label}</span>
                <small>{hint}</small>
                <ChevronRight size={15} />
              </button>
            ))}
            {!results.length && (
              <p>没有找到匹配内容，试试“错题”或章节关键词。</p>
            )}
          </div>
          <div className="desk-search-help">
            按 Esc 关闭 · 使用 Tab 选择，Enter 打开
          </div>
        </DesktopDialog>
      )}
    </>
  );
}

export { DesktopStudyHome as DesktopHome } from "./desktop-workspace.jsx";
