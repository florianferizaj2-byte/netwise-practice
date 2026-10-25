import { useEffect, useRef, useState } from "react";
import { api as defaultApi } from "../api.js";
import "./account-security.css";

export function useAccountEmailPolicy(api = defaultApi) {
  const [revision, setRevision] = useState(0);
  const [policy, setPolicy] = useState({ loading: true, required: false, error: "" });
  useEffect(() => {
    let live = true;
    setPolicy(old => ({ ...old, loading: true, error: "" }));
    api("/auth/security-config").then(result => {
      if (typeof result.emailVerificationRequired !== "boolean") throw new Error("注册设置读取失败，请重新读取");
      if (live) setPolicy({ loading: false, required: result.emailVerificationRequired, error: "" });
    }).catch(cause => { if (live) setPolicy({ loading: false, required: false, error: cause.message }); });
    return () => { live = false; };
  }, [api, revision]);
  return { ...policy, reload: () => setRevision(value => value + 1) };
}

export function EmailCodeFields({
  purpose,
  username,
  currentPassword,
  onChange,
  disabled,
  api = defaultApi,
}) {
  const [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challengeId, setChallenge] = useState("");
  const [sending, setSending] = useState(false),
    [until, setUntil] = useState(0),
    [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const inFlight = useRef(false),
    scope = useRef("");
  const scopeKey = `${purpose}:${username || ""}:${email}`;
  scope.current = scopeKey;
  useEffect(() => {
    setChallenge("");
    setCode("");
    setNotice("");
  }, [purpose, username]);
  useEffect(() => {
    onChange({ email, code, challengeId });
  }, [email, code, challengeId, onChange]);
  useEffect(() => {
    const tick = () =>
      setSeconds(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [until]);
  async function send() {
    if (inFlight.current || !email || (!username && purpose !== "bind")) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    setNotice("");
    const sentScope = scope.current;
    try {
      const result = await api("/auth/email-code", {
        purpose,
        email,
        ...(purpose === "bind" ? { currentPassword } : { username }),
      });
      if (sentScope !== scope.current) return;
      setChallenge(result.challengeId);
      setCode("");
      setUntil(Date.now() + result.retryAfter * 1000);
      setNotice(result.message);
    } catch (cause) {
      if (sentScope === scope.current) setError(cause.message);
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }
  return (
    <fieldset className="account-email-fields" disabled={disabled || sending}>
      <label>
        邮箱
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setChallenge("");
            setCode("");
            setNotice("");
            setError("");
          }}
          placeholder="可长期接收邮件的邮箱"
        />
      </label>
      <label>
        邮箱验证码
        <span className="account-code-row">
          <input
            aria-label="邮箱验证码"
            name="emailCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            value={code}
            onChange={(event) =>
              setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder="6 位验证码"
          />
          <button
            type="button"
            onClick={send}
            disabled={
              disabled ||
              sending ||
              seconds > 0 ||
              !email ||
              (purpose === "bind" ? !currentPassword : !username)
            }
          >
            {sending
              ? "发送中…"
              : seconds > 0
                ? `${seconds} 秒后重发`
                : "获取验证码"}
          </button>
        </span>
      </label>
      {notice && (
        <p className="account-security-hint" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

export function PasswordRecoveryForm({ onBack, api = defaultApi }) {
  const [username, setUsername] = useState(""),
    [proof, setProof] = useState({}),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const inFlight = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    if (data.get("password") !== data.get("confirm")) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (!proof.challengeId) {
      setError("请先获取邮箱验证码");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await api("/auth/reset-password", {
        username,
        ...proof,
        password: data.get("password"),
      });
      setDone(true);
    } catch (cause) {
      setError(cause.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="account-recovery-success">
        <h3>密码已重置</h3>
        <p>请使用新密码登录。其他设备的登录已退出，学习记录和会员权益保留。</p>
        <button className="primary desk-button desk-primary" onClick={onBack}>
          返回登录
        </button>
      </div>
    );
  return (
    <form className="account-recovery-form" onSubmit={submit}>
      <p className="account-security-hint">
        使用账号此前已绑定的邮箱验证身份。老账号请先登录，在设置中绑定邮箱；未绑定且已忘记密码的账号需联系管理员核验。
      </p>
      <fieldset disabled={busy} className="account-security-fields">
        <label>
          账号
          <input
            autoComplete="username"
            required
            minLength={3}
            maxLength={40}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="需要找回的账号"
          />
        </label>
        <EmailCodeFields
          purpose="reset"
          username={username}
          onChange={setProof}
          disabled={busy}
          api={api}
        />
        <label>
          新密码
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            placeholder="至少 8 位新密码"
          />
        </label>
        <label>
          确认新密码
          <input
            type="password"
            name="confirm"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
            placeholder="再次输入新密码"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        className="primary desk-button desk-primary"
        disabled={busy}
      >
        {busy ? "重置中…" : "验证并重置密码"}
      </button>
      <button
        type="button"
        className="text-button desk-auth-switch"
        disabled={busy}
        onClick={onBack}
      >
        返回登录
      </button>
    </form>
  );
}

export function AccountRecoveryDialog({ onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="account-recovery-dialog"
      aria-labelledby="account-recovery-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="account-recovery-title">找回密码</h2>
        <button type="button" onClick={onClose} aria-label="关闭找回密码">
          关闭
        </button>
      </header>
      <PasswordRecoveryForm onBack={onClose} />
    </dialog>
  );
}

export function AccountSecuritySettings() {
  const [state, setState] = useState(null),
    [readError, setReadError] = useState("");
  const [mode, setMode] = useState(""),
    [currentPassword, setCurrentPassword] = useState(""),
    [proof, setProof] = useState({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const inFlight = useRef(false);
  const load = () => {
    setReadError("");
    return defaultApi("/auth/security")
      .then(setState)
      .catch((cause) => setReadError(cause.message));
  };
  useEffect(() => {
    let live = true;
    defaultApi("/auth/security")
      .then((result) => {
        if (live) setState(result);
      })
      .catch((cause) => {
        if (live) setReadError(cause.message);
      });
    return () => {
      live = false;
    };
  }, []);
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    const data = new FormData(event.currentTarget);
    if (mode === "password" && data.get("password") !== data.get("confirm")) {
      setError("两次输入的新密码不一致");
      return;
    }
    if (mode === "bind" && !proof.challengeId) {
      setError("请先获取邮箱验证码");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "bind") {
        const result = await defaultApi("/auth/bind-email", {
          currentPassword,
          ...proof,
        });
        setState(result);
        setMode("");
        setMessage("邮箱已验证并绑定，可用于找回密码");
      } else {
        const result = await defaultApi("/auth/change-password", {
          currentPassword,
          password: data.get("password"),
        });
        setMessage(result.message);
        setMode("changed");
      }
      setCurrentPassword("");
    } catch (cause) {
      setError(cause.message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="account-security-settings" aria-label="账号与安全">
      <div className="section-heading">
        <div>
          <h2>账号与安全</h2>
          <p>管理登录密码，保护你的学习账号。</p>
        </div>
      </div>
      {readError && (
        <p role="alert">
          {readError} <button onClick={load}>重新读取</button>
        </p>
      )}
      {state && (
        <>
          {(state.emailVerificationRequired || state.emailBound) && <div className="account-security-row">
            <div>
              <strong>恢复邮箱</strong>
              <p>
                {state.emailBound
                  ? state.maskedEmail
                  : "尚未绑定，忘记密码后无法自助找回"}
              </p>
            </div>
            {state.emailVerificationRequired && !state.emailBound && (
              <button
                disabled={busy || mode === "changed"}
                onClick={() => {
                  setMode("bind");
                  setCurrentPassword("");
                  setError("");
                  setMessage("");
                }}
              >
                绑定邮箱
              </button>
            )}
          </div>}
          {state.emailVerificationRequired && !state.emailAvailable && (
            <p className="account-security-hint">
              邮件服务暂未开通。已有账号可以登录，也可以使用当前密码修改密码。
            </p>
          )}
          <div className="account-security-row">
            <div>
              <strong>登录密码</strong>
              <p>修改后，所有设备都需重新登录。</p>
            </div>
            <button
              disabled={busy || mode === "changed"}
              onClick={() => {
                setMode("password");
                setCurrentPassword("");
                setError("");
                setMessage("");
              }}
            >
              修改密码
            </button>
          </div>
        </>
      )}
      {["bind", "password"].includes(mode) && (
        <form className="account-security-form" onSubmit={submit}>
          <fieldset className="account-security-fields" disabled={busy}>
            <label>
              当前密码
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </label>
            {mode === "bind" ? (
              <EmailCodeFields
                key="bind"
                purpose="bind"
                currentPassword={currentPassword}
                onChange={setProof}
                disabled={busy}
              />
            ) : (
              <>
                <label>
                  新密码
                  <input
                    type="password"
                    name="password"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </label>
                <label>
                  确认新密码
                  <input
                    type="password"
                    name="confirm"
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    required
                  />
                </label>
              </>
            )}
          </fieldset>
          <div className="account-security-actions">
            <button className="primary" disabled={busy}>
              {busy
                ? "保存中…"
                : mode === "bind"
                  ? "验证并绑定邮箱"
                  : "确认修改密码"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode("");
                setCurrentPassword("");
                setError("");
              }}
            >
              取消
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {mode === "changed" && (
        <button className="primary" onClick={() => window.location.assign("/")}>
          重新登录
        </button>
      )}
    </section>
  );
}
