import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarCheck2,
  Check,
  ChevronDown,
  CircleCheck,
  Crown,
  Gift,
  History,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Ticket,
  TriangleAlert,
} from "lucide-react";
import { MembershipBadge } from "./components/membership-badge.jsx";
import "./vip.css";

const plans = [
  {
    id: "vip",
    name: "VIP",
    price: "9.9",
    questions: 100,
    description: "日常巩固",
    detail: "每天进步一点，稳稳打好基础。",
  },
  {
    id: "svip",
    name: "SVIP",
    price: "19.9",
    questions: 300,
    description: "集中备考",
    detail: "围绕薄弱知识点，多练一轮。",
  },
  {
    id: "ssvip",
    name: "SSVIP",
    price: "39.9",
    questions: 600,
    description: "高频冲刺",
    detail: "为密集练习，留足出题空间。",
  },
];
const date = (value) =>
  value ? new Date(value).toLocaleDateString("zh-CN") : "—";
export { useMembershipAccount } from "./use-membership-account.js";

export function VipView({
  api,
  user,
  membership,
  navigate,
  focusRedemption = false,
}) {
  const { account, loading, error, reload, replace } = membership;
  const [selected, setSelected] = useState("svip");
  const [busy, setBusy] = useState("");
  const [checkError, setCheckError] = useState("");
  const [checkNotice, setCheckNotice] = useState("");
  const [code, setCode] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const codeInput = useRef(null);
  const redemptionPanel = useRef(null);
  const historyDetails = useRef(null);
  const mutating = useRef(false);
  const live = useRef(true);
  const historyRevision = useRef(0);
  const initialPlan = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      historyRevision.current++;
    };
  }, []);
  useEffect(() => {
    if (!account || initialPlan.current) return;
    initialPlan.current = true;
    if (plans.some((plan) => plan.id === account.plan))
      setSelected(account.plan);
  }, [account]);
  function openRedemption() {
    redemptionPanel.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "center",
    });
    codeInput.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (focusRedemption) openRedemption();
  }, [focusRedemption]);
  async function loadHistory() {
    const request = ++historyRevision.current;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const data = await api("/account/redemptions");
      if (live.current && request === historyRevision.current)
        setHistory(data.redemptions);
    } catch (cause) {
      if (live.current && request === historyRevision.current)
        setHistoryError(cause.message || "兑换记录暂时无法读取。");
    } finally {
      if (live.current && request === historyRevision.current)
        setHistoryLoading(false);
    }
  }
  async function checkIn() {
    if (mutating.current || account?.checkIn?.claimed) return;
    mutating.current = true;
    setBusy("check-in");
    setCheckError("");
    setCheckNotice("");
    try {
      const data = await api("/account/check-in", {});
      if (!live.current) return;
      replace(data);
      setCheckNotice(
        data.claimed
          ? "签到成功，今日学习机会已到账。"
          : "今天已经领过了，明天再来。",
      );
    } catch (cause) {
      if (live.current) setCheckError(cause.message || "签到失败，请重试。");
    } finally {
      mutating.current = false;
      if (live.current) setBusy("");
    }
  }
  async function redeem(event) {
    event.preventDefault();
    if (mutating.current || !code.trim()) return;
    mutating.current = true;
    setBusy("redeem");
    setRedeemError("");
    setResult(null);
    try {
      const data = await api("/account/redeem", { code: code.trim() });
      if (!live.current) return;
      replace(data.entitlements);
      setSelected(
        data.entitlements.plan === "free" ? "svip" : data.entitlements.plan,
      );
      setResult(data);
      setCode("");
      historyRevision.current++;
      setHistoryLoading(false);
      setHistory(null);
      if (historyDetails.current?.open) void loadHistory();
    } catch (cause) {
      if (live.current)
        setRedeemError(cause.message || "兑换失败，请检查兑换码。");
    } finally {
      mutating.current = false;
      if (live.current) setBusy("");
    }
  }
  const paid = !!account && account.plan !== "free";
  const check = account?.checkIn;
  const generation = account?.generation;
  const available =
    (generation?.remaining || 0) + (check?.remaining.generations || 0) * 10;
  const selectedPlan = plans.find((plan) => plan.id === selected) || plans[1];
  const progress = generation?.limit
    ? Math.min(100, Math.max(0, (generation.used / generation.limit) * 100))
    : 0;
  return (
    <div className="vip-page">
      <header className="vip-heading">
        <div>
          <span className="vip-eyebrow">KAOJIANG MEMBERSHIP</span>
          <h1>
            VIP 中心<span>让每一次练习，更有收获。</span>
          </h1>
          <p>专属新题、详细解析、错因分析，在这里开启。</p>
        </div>
        <div className="vip-heading-actions">
          <button
            type="button"
            className="vip-icon-button"
            onClick={() => void reload()}
            disabled={loading || !!busy}
            aria-label="刷新会员权益与额度"
            title="刷新权益"
          >
            <RefreshCw size={17} className={loading ? "spin" : ""} />
          </button>
          <button type="button" onClick={openRedemption}>
            <Ticket size={17} />
            兑换会员
          </button>
        </div>
      </header>
      {error && (
        <div className="vip-inline-alert" role="alert">
          <TriangleAlert size={17} />
          <span>
            {error}
            {account ? " 当前显示上次读取的权益。" : ""}
          </span>
          <button
            type="button"
            disabled={loading || !!busy}
            onClick={() => void reload()}
          >
            重试
          </button>
        </div>
      )}
      {account?.aiServiceAvailable === false && (
        <p className="vip-service-note">
          AI 服务暂时不可用，账户额度已保留，请稍后再试。
        </p>
      )}
      <div className="vip-layout">
        <section
          className="vip-account vip-surface"
          aria-labelledby="vip-account-title"
          aria-busy={loading}
        >
          <div className="vip-account-heading">
            <div className="vip-account-identity">
              <span
                className={`vip-account-icon vip-tone-${account?.plan || "free"}`}
              >
                <Crown size={23} />
              </span>
              <div>
                <h2 id="vip-account-title">
                  {user?.username || "我的账号"}
                  <span>的会员权益</span>
                </h2>
                <p>
                  {!account
                    ? loading
                      ? "正在同步账号权益…"
                      : "权益暂未同步"
                    : paid
                      ? account.expiresAt
                        ? `有效期至 ${date(account.expiresAt)}`
                        : "会员权益已生效"
                      : "免费学习，签到也能体验 AI"}
                </p>
              </div>
            </div>
            {account ? (
              <MembershipBadge plan={account.plan} />
            ) : (
              <span className="vip-pending">待同步</span>
            )}
          </div>
          <div className="vip-quota-grid">
            <Quota
              icon={Sparkles}
              label="AI 新题"
              value={account ? available : "—"}
              unit="道"
              detail={
                account
                  ? `会员 ${generation?.remaining || 0} 道 · 今日奖励 ${check?.remaining.generations || 0} 组`
                  : "同步后显示剩余额度"
              }
            />
            <Quota
              icon={BookOpen}
              label="详细解析"
              value={account ? check?.remaining.explanations || 0 : "—"}
              unit="次"
              detail="解析或提示每次扣 1 次，失败返还"
            />
            <Quota
              icon={Target}
              label="错因分析"
              value={account ? check?.remaining.analyses || 0 : "—"}
              unit="次"
              detail="错因分析或 AI 学习计划每次扣 1 次"
            />
          </div>
          <div className="vip-account-foot">
            {paid && generation ? (
              <div className="vip-period">
                <div>
                  <span>
                    本期会员出题已用 <b>{generation.used}</b> /{" "}
                    {generation.limit} 道
                  </span>
                  <span>本期至 {date(generation.periodEnd)}</span>
                </div>
                <div
                  className="vip-meter"
                  role="progressbar"
                  aria-label="本期会员出题额度使用比例"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(progress)}
                >
                  <i style={{ width: `${progress}%` }} />
                </div>
              </div>
            ) : (
              <span>
                <ShieldCheck size={15} />
                权益绑定当前账号，网页与 App 同步
              </span>
            )}
          </div>
        </section>

        <section
          className="vip-checkin vip-surface"
          aria-labelledby="vip-checkin-title"
        >
          <div className="vip-section-heading">
            <span className="vip-small-icon">
              <CalendarCheck2 size={21} />
            </span>
            <div>
              <h2 id="vip-checkin-title">每日签到</h2>
              <p>给坚持一点奖励</p>
            </div>
            {check?.claimed && <CircleCheck size={19} className="vip-green" />}
          </div>
          <div className="vip-rewards">
            <div>
              <strong>
                5<small>次</small>
              </strong>
              <span>详细解析</span>
            </div>
            <div>
              <strong>
                1<small>组</small>
              </strong>
              <span>AI 新题</span>
            </div>
            <div>
              <strong>
                3<small>次</small>
              </strong>
              <span>错因分析</span>
            </div>
          </div>
          <button
            type="button"
            className={`vip-checkin-button ${check?.claimed ? "is-claimed" : "primary"}`}
            disabled={!!busy || !account || check?.claimed}
            onClick={() => void checkIn()}
          >
            {busy === "check-in" ? (
              <LoaderCircle size={17} className="spin" />
            ) : check?.claimed ? (
              <Check size={17} />
            ) : (
              <Gift size={17} />
            )}
            {busy === "check-in"
              ? "领取中…"
              : check?.claimed
                ? "今日已签到"
                : "签到领取学习机会"}
          </button>
          <p className="vip-small-print">1 组 = 10 道题 · 奖励当日有效</p>
          {checkNotice && (
            <p className="vip-feedback" role="status">
              {checkNotice}
            </p>
          )}
          {checkError && (
            <p className="vip-form-error" role="alert">
              {checkError}
            </p>
          )}
        </section>

        <section className="vip-plans" aria-labelledby="vip-plans-title">
          <div className="vip-section-title">
            <div>
              <h2 id="vip-plans-title">找到适合你的学习节奏</h2>
              <p>三档权益，按练习频率选择</p>
            </div>
            <span>30 天权益 · 不自动续费</span>
          </div>
          <fieldset className="vip-plan-grid">
            <legend className="vip-sr-only">选择会员套餐以查看权益</legend>
            {plans.map((plan) => (
              <label
                key={plan.id}
                className={`vip-plan vip-tone-${plan.id} ${selected === plan.id ? "is-selected" : ""}`}
              >
                <input
                  type="radio"
                  name="vip-plan"
                  value={plan.id}
                  checked={selected === plan.id}
                  onChange={() => setSelected(plan.id)}
                />
                <span className="vip-plan-top">
                  <strong>{plan.name}</strong>
                  <span className="vip-plan-radio" aria-hidden="true">
                    {selected === plan.id && <Check size={12} />}
                  </span>
                </span>
                <span className="vip-plan-description">
                  {plan.description}
                  {account?.plan === plan.id && <span>当前套餐</span>}
                </span>
                <span className="vip-plan-price">
                  <small>¥</small>
                  {plan.price}
                  <span>/ 30 天</span>
                </span>
                <span className="vip-plan-quantity">
                  <strong>{plan.questions}</strong> 道 AI 新题
                </span>
                <span className="vip-plan-benefits">
                  <span>
                    <Check size={14} />
                    详细解析
                  </span>
                  <span>
                    <Check size={14} />
                    错因分析
                  </span>
                  <span>
                    <Check size={14} />
                    额外签到奖励
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className={`vip-plan-choice vip-tone-${selected}`}>
            <div>
              <strong>
                {selectedPlan.name} · {selectedPlan.description}
              </strong>
              <span>{selectedPlan.detail}</span>
            </div>
            <button type="button" className="primary" onClick={openRedemption}>
              使用兑换码开通
              <ArrowRight size={16} />
            </button>
          </div>
          <p className="vip-purchase-note">
            当前通过兑换码开通，到账等级与时长以兑换码为准。
          </p>
        </section>

        <section
          ref={redemptionPanel}
          className="vip-redemption vip-surface"
          aria-labelledby="vip-redemption-title"
        >
          <div className="vip-section-heading">
            <span className="vip-small-icon">
              <Ticket size={21} />
            </span>
            <div>
              <h2 id="vip-redemption-title">兑换会员</h2>
              <p>已有兑换码？在这里开通</p>
            </div>
          </div>
          <div className="vip-redeem-account">
            <span>到账账号</span>
            <strong>{user?.username}</strong>
          </div>
          <form onSubmit={redeem} className="vip-redeem-form">
            <label htmlFor="vip-redeem-code">会员兑换码</label>
            <input
              ref={codeInput}
              id="vip-redeem-code"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setRedeemError("");
                setResult(null);
              }}
              placeholder="输入或粘贴兑换码"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={80}
              disabled={!!busy}
              aria-invalid={!!redeemError}
              aria-describedby={
                redeemError ? "vip-redeem-error" : "vip-redeem-hint"
              }
            />
            {redeemError && (
              <p id="vip-redeem-error" className="vip-form-error" role="alert">
                {redeemError}
              </p>
            )}
            <button
              className="primary"
              type="submit"
              disabled={!!busy || !code.trim()}
            >
              {busy === "redeem" ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <KeyRound size={16} />
              )}
              {busy === "redeem" ? "正在兑换…" : "确认兑换"}
            </button>
            <p id="vip-redeem-hint" className="vip-small-print">
              每码限用一次。会员有效期内支持同等级续期；其他等级可在到期后兑换。
            </p>
          </form>
          {result && (
            <div className="vip-redeem-success" role="status">
              <CircleCheck size={21} />
              <div>
                <strong>
                  {result.alreadyRedeemed
                    ? "这张码已兑换到你的账号"
                    : `${result.redemption.plan.toUpperCase()} 兑换成功`}
                </strong>
                <p>本次权益到期日 {date(result.redemption.expiresAt)}</p>
              </div>
            </div>
          )}
          <details
            ref={historyDetails}
            className="vip-history"
            onToggle={(event) => {
              if (event.currentTarget.open && !history && !historyLoading)
                void loadHistory();
            }}
          >
            <summary>
              <History size={16} />
              兑换记录
              <ChevronDown size={15} />
            </summary>
            {historyLoading ? (
              <p className="vip-history-empty" role="status">
                正在读取兑换记录…
              </p>
            ) : historyError ? (
              <div className="vip-history-error" role="alert">
                <p>{historyError}</p>
                <button type="button" onClick={() => void loadHistory()}>
                  重新读取
                </button>
              </div>
            ) : history?.length ? (
              <ul>
                {history.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <MembershipBadge plan={entry.plan} />
                      <span>{entry.durationDays} 天</span>
                    </div>
                    <p>
                      {date(entry.redeemedAt)} 兑换<span>已到账</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="vip-history-empty">暂无兑换记录</p>
            )}
          </details>
        </section>

        <section className="vip-benefits" aria-label="会员功能说明">
          <div>
            <span className="vip-benefit-icon">
              <Sparkles size={19} />
            </span>
            <h3>围绕知识点出题</h3>
            <p>按薄弱处定向练习，题组随时继续。</p>
            <button type="button" onClick={() => navigate("training")}>
              去出题
              <ArrowRight size={14} />
            </button>
          </div>
          <div>
            <span className="vip-benefit-icon">
              <BookOpen size={19} />
            </span>
            <h3>读懂每一步解析</h3>
            <p>作答后看详细讲解，掌握解题思路。</p>
            <button type="button" onClick={() => navigate("chapters")}>
              去练习
              <ArrowRight size={14} />
            </button>
          </div>
          <div>
            <span className="vip-benefit-icon">
              <Target size={19} />
            </span>
            <h3>找到出错的原因</h3>
            <p>从错题回到知识点，有重点地巩固。</p>
            <button type="button" onClick={() => navigate("wrong")}>
              看错题
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
      </div>

      <section className="vip-faq" aria-labelledby="vip-faq-title">
        <h2 id="vip-faq-title">你可能想了解</h2>
        <details>
          <summary>
            三个会员等级有什么区别？
            <ChevronDown size={16} />
          </summary>
          <p>
            VIP、SVIP、SSVIP 每 30 天分别包含 100、300、600 道 AI
            新题。所有等级均可签到领取每日 5 次解析、1 组出题和 3 次分析额度，每次使用扣对应额度。
          </p>
        </details>
        <details>
          <summary>
            额度怎么算，续期会重新发放吗？
            <ChevronDown size={16} />
          </summary>
          <p>
            AI 出题优先使用当日签到机会，再使用会员额度。会员额度按首次开通起每
            30
            天更新，未用完的额度不结转；同等级续期延长有效期，不提前重置当期额度。解析、提示和分析每次扣 1 次对应额度；已有结果再次通过 AI 功能请求时也会扣额，单纯阅读当前页面不重复扣除。失败会返还对应额度。
          </p>
        </details>
        <details>
          <summary>
            网页兑换后，App 可以使用吗？
            <ChevronDown size={16} />
          </summary>
          <p>
            可以。在网页和 App
            登录同一个考匠账号，即可使用同一份会员权益和额度。会员到期后恢复
            Free，可继续签到领取学习机会。
          </p>
        </details>
      </section>
      <details className="vip-api-entry">
        <summary>
          <KeyRound size={16} />
          <span>作者 AI 服务</span>
          <small>
            无需配置 · 按使用扣额
          </small>
          <ChevronDown size={15} />
        </summary>
        <div>
          <p>
            所有账号统一使用作者提供的 AI 服务。解析、提示和分析每次扣对应额度；出题优先使用签到机会，再使用会员题数，失败自动返还。已生成题组可反复练习。
          </p>
          {account?.canManageAiService && (
            <button type="button" onClick={() => navigate("settings")}>
              管理作者服务
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </details>
    </div>
  );
}

function Quota({ icon: Icon, label, value, unit, detail }) {
  return (
    <div className="vip-quota">
      <span>
        <Icon size={16} />
        {label}
      </span>
      <strong
        className={
          typeof value === "string" && value.length > 1 ? "is-text" : ""
        }
      >
        {value}
        <small>{unit}</small>
      </strong>
      <p>{detail}</p>
    </div>
  );
}

export function MembershipSettingsEntry({ membership, onOpenVip }) {
  const { account, loading, error, reload } = membership;
  return (
    <section className="vip-settings-entry">
      <span className="vip-small-icon">
        <Crown size={24} />
      </span>
      <div>
        <h2>我的会员{account && <MembershipBadge plan={account.plan} />}</h2>
        <p>
          {!account
            ? loading
              ? "正在同步账号权益…"
              : "权益暂未同步"
            : account.plan === "free"
              ? "每日签到领 AI 机会，兑换会员开启更多练习。"
              : account.expiresAt
                ? `会员有效期至 ${date(account.expiresAt)} · 网页与 App 同步`
                : "会员权益已生效 · 网页与 App 同步"}
        </p>
        {error && (
          <p className="vip-form-error" role="alert">
            {error}
            <button
              type="button"
              disabled={loading}
              onClick={() => void reload()}
            >
              重试
            </button>
          </p>
        )}
      </div>
      <button type="button" onClick={onOpenVip}>
        会员与额度
        <ArrowRight size={16} />
      </button>
    </section>
  );
}

export function ApiAccessNotice({ membership, onOpenVip }) {
  return (
    <section className="vip-access-notice">
      <KeyRound size={21} />
      <div>
        <h2>作者 AI 服务</h2>
        <p>
          {membership.loading && !membership.account
            ? "正在读取 AI 服务状态…"
            : membership.account
              ? membership.account.aiServiceAvailable
                ? "已接入作者服务，无需填写 API。每次使用扣对应额度，失败自动返还。"
                : "作者服务暂未就绪，请联系站点管理员；你的额度会保留。"
              : "暂时无法读取服务状态，请在 VIP 中心重试。"}
        </p>
      </div>
      <button type="button" onClick={onOpenVip}>
        前往 VIP 中心
        <ArrowRight size={16} />
      </button>
    </section>
  );
}
