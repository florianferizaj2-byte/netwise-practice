import { useCallback, useEffect, useRef, useState } from "react";
import { reduceWebMotion } from "./web-preferences.jsx";
import {
  ArrowRight,
  ArrowUpRight,
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
import { MembershipTierArt } from "./components/membership-tier-art.jsx";
import { ContentPlaceholder } from "./components/content-placeholder.jsx";
import { membershipPurchaseUrl } from "./membership-purchase.js";
import "./vip.css";
import "./subjective-study.css";
import "./blue-membership.css";
import { PointsActivity, formatPoints } from "./components/points-activity.jsx";
import { AiPointsPricing } from "./components/ai-points-pricing.jsx";

const basePlans = [
  {
    id: "vip",
    name: "VIP",
    price: "9.9",
    points: 990,
    description: "日常巩固",
    detail: "每天进步一点，稳稳打好基础。",
  },
  {
    id: "svip",
    name: "SVIP",
    price: "19.9",
    points: 1990,
    description: "集中备考",
    detail: "围绕薄弱知识点，多练一轮。",
  },
  {
    id: "ssvip",
    name: "SSVIP",
    price: "39.9",
    points: 3990,
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
  const plans=basePlans.map(item=>({...item,points:account?.pointsPlans?.[item.id]?.dailyPoints ?? null}));
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
      behavior: reduceWebMotion() ? "auto" : "smooth",
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
          ? "签到成功，今日积分已到账，当日有效。"
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
  const points = account?.points;
  const available = formatPoints(points?.availableUnits);
  const selectedPlan = plans.find((plan) => plan.id === selected) || plans[1];
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
      <section className="vip-study-entry" aria-label="会员 AI 精讲与练习">
        <div>
          <h2>
            <BookOpen size={20} />
            AI 精讲与练习
          </h2>
          <p>
            VIP 专属：按知识点学习、填空练习，随时向 AI
            老师提问。VIP、SVIP、SSVIP 均可使用。
          </p>
        </div>
        <button
          className="primary"
          type="button"
          disabled={loading && !account}
          onClick={() => (paid ? navigate("study") : openRedemption())}
        >
          {paid ? "进入学习与练习" : "开通 VIP 后学习"}
          <ArrowRight size={17} />
        </button>
      </section>
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
              label="可用积分"
              value={account ? available : "—"}
              unit="积分"
              detail={
                account
                  ? "出题、解析、判分和老师答疑统一使用"
                  : "同步后显示剩余额度"
              }
            />
            <Quota
              icon={BookOpen}
              label="预扣积分"
              value={account ? formatPoints(points?.heldUnits) : "—"}
              unit="积分"
              detail="任务完成后按实际用量结算，失败退还"
            />
            <Quota
              icon={Target}
              label="每日签到额度"
              value={check?.configuredPoints ?? "—"}
              unit="积分"
              detail="每天手动领取，当日有效，不自动发月积分"
            />
          </div>
          <div className="vip-account-foot">
            {paid && points ? (
              <div className="vip-period">
                <div>
                  <span>
                    会员有效期至 <b>{date(points.periodEnd)}</b>
                  </span>
                  <span>{points.pendingUnits ? "本期积分待到账，请联系管理员核对发放记录" : "同一账号在网页与 App 共用积分，签到积分当日有效"}</span>
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
                {check?.grants.points ?? "—"}<small>积分</small>
              </strong>
              <span>签到积分 · 当日有效</span>
            </div>
            <div>
              <strong>
                AI<small>学习</small>
              </strong>
              <span>各项功能通用</span>
            </div>
            <div>
              <strong>
                0<small>重复扣费</small>
              </strong>
              <span>缓存结果可重复查看</span>
            </div>
          </div>
          <button
            type="button"
            className={`vip-checkin-button ${check?.claimed ? "is-claimed" : "primary"}`}
            disabled={!!busy || !account || check?.claimed || check?.canClaim === false}
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
                : check?.canClaim === false ? "暂不可领取" : "签到领取积分"}
          </button>
          {check?.disabledReason && <p className="vip-feedback" role="status">{check.disabledReason}</p>}
          <p className="vip-small-print">已有解析免费查看 · 新 AI 调用统一使用积分 · 签到积分当日有效</p>
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
            <span>参考价 · 30 天权益 · 不自动续费</span>
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
                  <MembershipTierArt plan={plan.id} />
                  <span className="vip-plan-title">
                    <strong>{plan.name}</strong>
                    <span className="vip-plan-description">
                      {plan.description}
                      {account?.plan === plan.id && <span>当前套餐</span>}
                    </span>
                  </span>
                  <span className="vip-plan-radio" aria-hidden="true">
                    {selected === plan.id && <Check size={12} />}
                  </span>
                </span>
                <span className="vip-plan-price">
                  <small>¥</small>
                  {plan.price}
                  <span>/ 30 天</span>
                </span>
                <span className="vip-plan-quantity">
                  每日签到 <strong>{plan.points ?? "—"}</strong> 积分
                </span>
                <span className="vip-plan-benefits">
                  <span>
                    <Check size={14} />
                    所有 AI 功能统一积分
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
            <div className="vip-selected-plan">
              <MembershipTierArt plan={selectedPlan.id} />
              <span>
                <strong>
                  {selectedPlan.name} · {selectedPlan.description}
                </strong>
                <small>{selectedPlan.detail}</small>
              </span>
            </div>
            <div className="vip-purchase-actions">
              <a
                className="vip-purchase-link"
                href={membershipPurchaseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                购买会员兑换码
                <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <button type="button" onClick={openRedemption}>
                已有兑换码，立即兑换
                <Ticket size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="vip-purchase-note">
            请在购买页选择 {selectedPlan.name}
            。售价与会员时长以购买页为准，购买后回到考匠输入兑换码，权益到账后即可使用。
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
              <p>购买后在这里兑换，权益绑定当前账号</p>
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
          <a
            className="vip-redeem-buy-link"
            href={membershipPurchaseUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            还没有兑换码？前往购买
            <ArrowUpRight size={15} aria-hidden="true" />
          </a>
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
              <ContentPlaceholder variant="list" rows={2} />
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

      {user?.id&&<AiPointsPricing key={"prices-"+user.id} api={api} userId={user.id} />}
      {user?.id&&<PointsActivity key={user.id} api={api} userId={user.id} />}
      <section className="vip-faq" aria-labelledby="vip-faq-title">
        <h2 id="vip-faq-title">你可能想了解</h2>
        <details>
          <summary>
            三个会员等级有什么区别？
            <ChevronDown size={16} />
          </summary>
          <p>
            会员积分改为每日签到领取，额度随会员等级和后台配置同步显示，不再整笔发放月积分。出题、解析、提示、学习计划、AI 判分和老师答疑统一使用积分，实际消耗取决于模型与用量。签到可领取当日有效的赠送积分，已签到账号不因当天升级或改配置而重复发放。
          </p>
        </details>
        <details>
          <summary>
            额度怎么算，续期会重新发放吗？
            <ChevronDown size={16} />
          </summary>
          <p>
            任务先预扣，成功后按实际用量结算，未使用的预扣退回；生成或审核失败退还该任务全部积分。优先使用先到期积分。会员按每天签到发放；已发整期余额保留，到期后转为每日领取；缓存解析、已有课程和确定性判分不收费。
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
            Free，可按活动规则领取签到积分。
          </p>
        </details>
      </section>
      <details className="vip-api-entry">
        <summary>
          <KeyRound size={16} />
          <span>作者 AI 服务</span>
          <small>无需配置 · 按使用扣额</small>
          <ChevronDown size={15} />
        </summary>
        <div>
          <p>
            所有账号统一使用作者提供的 AI
            服务。所有实际 AI 调用统一按积分结算，失败自动退还预扣；已生成题组和缓存结果可反复查看，不重复收费。
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
              ? "签到领取通用积分，兑换会员开启更多学习。"
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
        会员与积分
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
                ? "已接入作者服务，无需填写 API。所有 AI 功能统一扣积分，失败自动返还。"
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
