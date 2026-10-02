import { useEffect, useState } from "react";
import { ApiAccessNotice, MembershipSettingsEntry } from "../vip-view.jsx";
import {
  BookOpen,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  GraduationCap,
  LoaderCircle,
  LockKeyhole,
  MessageCircle,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { Heading, IconButton } from "../components/study-ui.jsx";

export function SettingsView({
  membership,
  onOpenVip,
  run,
  busy,
  notify,
  refresh,
  certificates,
  currentCertificateId,
  onUserUpdated,
  onCertificateChange,
}) {
  const [s, setS] = useState(null),
    [communityProfile, setCommunityProfile] = useState(null),
    [communityName, setCommunityName] = useState(""),
    [key, setKey] = useState(""),
    [show, setShow] = useState(false),
    [dirty, setDirty] = useState(false),
    [deepSeekGuideOpen, setDeepSeekGuideOpen] = useState(false),
    [authorDeployOpen, setAuthorDeployOpen] = useState(false),
    [authorPassword, setAuthorPassword] = useState(""),
    [authorDeployError, setAuthorDeployError] = useState(""),
    [authorDeployBusy, setAuthorDeployBusy] = useState(false),
    [settingsLoading, setSettingsLoading] = useState(false),
    [settingsError, setSettingsError] = useState("");
  const load = () => api("/settings").then(setS);
  useEffect(() => {
    api("/community/profile")
      .then(({ profile }) => {
        setCommunityProfile(profile);
        setCommunityName(profile.name);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!membership.account?.canManageAiService) {
      setS(null);
      setKey("");
      setShow(false);
      setDirty(false);
      setDeepSeekGuideOpen(false);
      setAuthorDeployOpen(false);
      setAuthorPassword("");
      setSettingsLoading(false);
      return;
    }
    let live = true;
    setSettingsLoading(true);
    setSettingsError("");
    api("/settings")
      .then((data) => {
        if (live) setS(data);
      })
      .catch((cause) => {
        if (live) setSettingsError(cause.message);
      })
      .finally(() => {
        if (live) setSettingsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [membership.account?.canManageAiService]);
  useEffect(() => {
    if (!deepSeekGuideOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDeepSeekGuideOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deepSeekGuideOpen]);
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
  const saveCommunityName = () => {
    const name = communityName.trim();
    if (!name) {
      notify("社区昵称不能为空");
      return;
    }
    run("正在保存社区昵称", async () => {
      const result = await api("/community/profile", { name }, "PUT");
      setCommunityProfile(result.profile);
      setCommunityName(result.profile.name);
      onUserUpdated?.(result.user);
      notify("社区昵称已保存");
    });
  };
  const deployAuthorApi = () => {
    if (!authorPassword.trim() || authorDeployBusy) return;
    setAuthorDeployError("");
    setAuthorDeployBusy(true);
    run("正在部署作者 API", async () => {
      try {
        await api(
          "/settings/author-deploy",
          { password: authorPassword },
          "POST",
        );
        setKey("");
        setShow(false);
        setDirty(false);
        setAuthorPassword("");
        setAuthorDeployOpen(false);
        setDeepSeekGuideOpen(false);
        await load();
        await refresh();
        notify("作者 API 已部署到当前账号");
      } catch (error) {
        setAuthorDeployError(error.message);
      } finally {
        setAuthorDeployBusy(false);
      }
    });
  };
  return (
    <>
      <Heading title="设置" subtitle="报考证书、AI 服务与调用用量" />
      <MembershipSettingsEntry membership={membership} onOpenVip={onOpenVip} />
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
                      {certificate.syllabus.version} ·{" "}
                      {certificate.syllabus.examCodeLabel || "考试代码"}{" "}
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
      <section className="community-profile-settings">
        <div className="section-heading">
          <div>
            <h2>
              <MessageCircle size={21} />
              社区昵称
            </h2>
            <p>这个名字只会显示在考匠社区公共大群里，不影响登录账号。</p>
          </div>
          <span className="badge">同步到 App</span>
        </div>
        <div className="community-profile-form">
          <label>
            群内显示名称
            <input
              value={communityName}
              maxLength={24}
              placeholder={communityProfile ? "输入社区昵称" : "正在读取…"}
              disabled={!communityProfile || !!busy}
              onChange={(event) => setCommunityName(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={
              !communityProfile ||
              !!busy ||
              !communityName.trim() ||
              communityName.trim() === communityProfile.name
            }
            onClick={saveCommunityName}
          >
            <Save size={16} />
            保存昵称
          </button>
        </div>
      </section>
      {!membership.account?.canManageAiService && (
        <ApiAccessNotice membership={membership} onOpenVip={onOpenVip} />
      )}
      {membership.account?.canManageAiService && settingsLoading && (
        <div className="vip-config-loading" role="status">
          <LoaderCircle className="spin" size={18} />
          正在读取作者 AI 服务设置…
        </div>
      )}
      {membership.account?.canManageAiService && settingsError && (
        <div className="vip-config-error" role="alert">
          <span>{settingsError}</span>
          <button
            disabled={!!busy}
            onClick={() =>
              run("正在读取作者 AI 服务设置", async () => {
                await load();
                setSettingsError("");
              })
            }
          >
            重新读取
          </button>
        </div>
      )}
      {membership.account?.canManageAiService && s && (
        <>
          <div className="settings-tabs">
            <span>AI 设置</span>
          </div>
          <section className="settings-layout">
            <div className="settings-form">
              <p className="hint">
                作者管理的全站 AI 服务。所有账号共用此服务并独立扣额；服务器
                AI_SERVICE_* 或 AUTHOR_API_* 环境配置优先。
              </p>
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
                      按下面五步操作。完成后，网站里的 AI
                      解析和专项训练就能使用。
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
                        API
                        按实际调用量计费。聊天产品的会员或余额通常不能直接抵扣
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

                {authorDeployOpen && (
                  <form
                    className="author-api-deploy"
                    onSubmit={(event) => {
                      event.preventDefault();
                      deployAuthorApi();
                    }}
                  >
                    <div className="author-api-deploy-copy">
                      <strong>使用作者 API</strong>
                      <p>
                        输入服务器部署密码后，将预设服务保存为作者配置，供所有账号使用。
                      </p>
                    </div>
                    <div className="author-api-deploy-row">
                      <label>
                        部署密码
                        <input
                          type="password"
                          value={authorPassword}
                          onChange={(event) => {
                            setAuthorPassword(event.target.value);
                            setAuthorDeployError("");
                          }}
                          autoComplete="current-password"
                          placeholder="输入部署密码"
                          autoFocus
                          required
                        />
                      </label>
                      <button
                        className="primary"
                        type="submit"
                        disabled={
                          authorDeployBusy || !!busy || !authorPassword.trim()
                        }
                      >
                        {authorDeployBusy ? (
                          <>
                            <LoaderCircle className="spin" size={16} />{" "}
                            部署中...
                          </>
                        ) : (
                          <>
                            <PlugZap size={16} /> 一键部署
                          </>
                        )}
                      </button>
                    </div>
                    {authorDeployError && (
                      <p className="author-api-deploy-error" role="alert">
                        {authorDeployError}
                      </p>
                    )}
                  </form>
                )}

                <footer>
                  <button
                    className="author-api-trigger"
                    type="button"
                    onClick={() => {
                      setAuthorDeployOpen((open) => !open);
                      setAuthorDeployError("");
                    }}
                    disabled={!!busy || authorDeployBusy}
                  >
                    <LockKeyhole size={15} />
                    {authorDeployOpen ? "收起作者 API" : "使用作者 API"}
                  </button>
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
      )}
    </>
  );
}
