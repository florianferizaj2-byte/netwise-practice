import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronRight,
  Download,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { appleMobile } from "../platform.js";
import {
  MOBILE_APK_NAME,
  MOBILE_DOWNLOAD_URL,
  MOBILE_VERSION,
} from "../mobile-release.js";
import { api } from "../api.js";

export const AUTH_LOOP_STEPS = [
  {
    eyebrow: "01 · 错题定位",
    title: "先找到真正的薄弱点",
    description: "错题、章节与知识点会沉淀成清晰的下一步。",
    progress: 36,
    icon: Target,
  },
  {
    eyebrow: "02 · AI 解析",
    title: "每一道题，都讲到你听懂",
    description: "围绕你的错题生成专项训练，把理解变成能力。",
    progress: 68,
    icon: Sparkles,
  },
  {
    eyebrow: "03 · 掌握提升",
    title: "下一次遇到，答得更稳",
    description: "掌握度与学习记录持续更新，进步看得见。",
    progress: 92,
    icon: ChartNoAxesCombined,
  },
];

export function AuthScreen({ onAuth, initialError = "" }) {
  const [mode, setMode] = useState("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  const [loopIndex, setLoopIndex] = useState(0);
  const isLogin = mode === "login";
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      return undefined;
    const timer = window.setInterval(() => {
      setLoopIndex((index) => (index + 1) % AUTH_LOOP_STEPS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);
  const loop = AUTH_LOOP_STEPS[loopIndex];
  const LoopIcon = loop.icon;
  const submit = async (e) => {
    e.preventDefault();
    if (!isLogin && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode === "login" ? "login" : "register"}`, {
        username,
        password,
      });
      const session = await api("/auth/me");
      if (!session.authenticated)
        throw new Error(
          "登录凭据未能保存，请允许本站 Cookie，并使用同一个网站地址登录。HTTPS 部署请检查安全 Cookie 配置。",
        );
      onAuth(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <section className="auth-shell">
        <div className="auth-showcase">
          <div className="auth-showcase-grid" aria-hidden="true" />
          <div className="auth-showcase-header">
            <div className="auth-brand-lockup">
              <span className="auth-brand-logo">
                <img src="/kaojiang-logo-192.png" alt="" />
              </span>
              <span>
                <strong>考匠</strong>
                <small>AceExam</small>
              </span>
            </div>
            <span className="auth-status">
              <i /> 认证考试训练平台
            </span>
          </div>
          <div className="auth-hero-copy">
            <span className="auth-kicker">
              <Sparkles size={15} /> 把时间花在真正的进步上
            </span>
            <h2>
              把每一次刷题，
              <br />
              <em>变成稳稳的掌握。</em>
            </h2>
            <p>
              按证书定位范围，追踪每一个薄弱知识点，
              <br className="auth-desktop-break" />
              让下一道题刚好比上一道更懂你。
            </p>
          </div>
          <div className="auth-feature-grid">
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <Target size={18} />
              </span>
              <span>
                <strong>范围清晰</strong>
                <small>围绕证书知识点练习</small>
              </span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <ChartNoAxesCombined size={18} />
              </span>
              <span>
                <strong>越练越准</strong>
                <small>掌握度与错题自动沉淀</small>
              </span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <Users size={18} />
              </span>
              <span>
                <strong>共享题库</strong>
                <small>AI 好题审核后共同练</small>
              </span>
            </div>
          </div>
          <div
            className="auth-cycle-card auth-community-card"
            aria-live="polite"
          >
            <div
              className="auth-cycle-orbit auth-community-orbit"
              aria-hidden="true"
            >
              <span className="auth-orbit-pulse" />
              <LoopIcon size={22} />
            </div>
            <div className="auth-loop-copy" key={loopIndex}>
              <div className="auth-community-heading">
                <small>{loop.eyebrow}</small>
                <span className="auth-community-pill">
                  <i /> 共享中
                </span>
              </div>
              <strong>{loop.title}</strong>
              <p>{loop.description}</p>
              <div
                className="auth-progress"
                aria-label={`学习闭环进度 ${loop.progress}%`}
              >
                <i style={{ width: `${loop.progress}%` }} />
                <span>{loop.progress}%</span>
              </div>
            </div>
          </div>
          <p className="auth-showcase-footnote">
            <ShieldCheck size={16} /> 学习记录按账号保存，换设备也能继续
          </p>
        </div>
        <section className="auth-panel">
          <div className="auth-panel-topline">
            <span>{isLogin ? "欢迎回来" : "从今天开始"}</span>
            <span className="auth-panel-step">
              {isLogin ? "01 / 02" : "01 / 01"}
            </span>
          </div>
          <p className="eyebrow">
            {isLogin ? "继续你的备考节奏" : "创建你的学习空间"}
          </p>
          <h1>{isLogin ? "登录学习账户" : "创建学习账户"}</h1>
          <p className="auth-panel-intro">
            {isLogin
              ? "欢迎回来，接着完成今天最值得练习的一组题。"
              : "注册后选择报考证书，马上开始一套属于你的练习路径。"}
          </p>
          <form onSubmit={submit}>
            <label>
              <span className="auth-field-label">
                <UserRound size={15} /> 账号
              </span>
              <span className="auth-input-wrap">
                <UserRound size={17} />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength="3"
                  maxLength="40"
                  autoComplete="username"
                  placeholder="输入你的学习账号"
                  required
                />
              </span>
            </label>
            <label>
              <span className="auth-field-label">
                <LockKeyhole size={15} /> 密码
              </span>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength="8"
                  maxLength="128"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="至少 8 位字符"
                  required
                />
              </span>
            </label>
            {!isLogin && (
              <label>
                <span className="auth-field-label">
                  <LockKeyhole size={15} /> 确认密码
                </span>
                <span className="auth-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength="8"
                    maxLength="128"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    required
                  />
                </span>
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="auth-spinner" size={17} /> 处理中...
                </>
              ) : (
                <>
                  {isLogin ? "进入我的学习空间" : "注册并开始学习"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="auth-panel-divider">
            <span>或</span>
          </div>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setConfirmPassword("");
              setError("");
            }}
          >
            {isLogin ? "还没有学习账户？立即注册" : "已经有账户？返回登录"}
          </button>
          <a
            className="auth-app-download"
            href={appleMobile ? "/app/" : MOBILE_DOWNLOAD_URL}
            download={appleMobile ? undefined : MOBILE_APK_NAME}
          >
            <Download size={16} />
            {appleMobile
              ? "打开考匠 · iPhone / iPad"
              : `下载考匠 App · Android v${MOBILE_VERSION}`}
          </a>
          {!appleMobile && (
            <a className="auth-app-download" href="/app/">
              iPhone / iPad 使用入口
            </a>
          )}
          <p className="auth-privacy-note">
            <ShieldCheck size={14} /> 你的学习数据与 AI 配置仅属于当前账号
          </p>
        </section>
      </section>
    </main>
  );
}

export function CertificatePicker({ certificates, onSelect }) {
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
                    {certificate.syllabus.version} ·{" "}
                    {certificate.syllabus.examCodeLabel || "考试代码"}{" "}
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
