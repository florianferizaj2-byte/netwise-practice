import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Plus,
  RefreshCw,
  Ticket,
  Ban,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import "./membership.css";

const labels = { free: "Free", vip: "VIP", svip: "SVIP", ssvip: "SSVIP" };
const statuses = {
  available: "可兑换",
  redeemed: "已兑换",
  revoked: "已作废",
  expired: "已过期",
};
const date = (value) => (value ? new Date(value).toLocaleString("zh-CN") : "—");
export function MembershipBadge({ plan = "free" }) {
  const tier = labels[plan] ? plan : "free";
  return (
    <span className={`member-tier member-tier-${tier}`}>{labels[tier]}</span>
  );
}

export function AdminMembershipCodes({ api, notify }) {
  const [data, setData] = useState(null),
    [plan, setPlan] = useState(""),
    [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [createPlan, setCreatePlan] = useState("vip"),
    [quantity, setQuantity] = useState("10"),
    [days, setDays] = useState("30"),
    [deadline, setDeadline] = useState("");
  const [notice, setNotice] = useState("");
  const request = useRef(null),
    mutating = useRef(false);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    const params = new URLSearchParams({
      plan,
      status,
      search,
      limit: "30",
      offset: String(page * 30),
    });
    api(`/admin/membership-codes?${params}`)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((cause) => {
        if (live) setError(cause.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [api, plan, status, search, page, revision]);

  async function generate(event) {
    event.preventDefault();
    if (mutating.current) return;
    mutating.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        plan: createPlan,
        quantity: Number(quantity),
        durationDays: Number(days),
        expiresAt: deadline
          ? new Date(`${deadline}T23:59:59`).toISOString()
          : null,
      };
      const key = JSON.stringify(payload);
      if (request.current?.key !== key)
        request.current = { key, id: crypto.randomUUID() };
      const result = await api("/admin/membership-codes", {
        ...payload,
        requestId: request.current.id,
      });
      setNotice(
        `${result.repeated ? "已找回上次生成的" : "已生成"} ${result.codes.length} 个 ${labels[createPlan]} 兑换码，每码 ${days} 天。`,
      );
      request.current = null;
      setPlan(createPlan);
      setStatus("");
      setSearch("");
      setSearchInput("");
      setPage(0);
      setRevision((value) => value + 1);
    } catch (cause) {
      setError(cause.message);
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      notify("兑换码已复制");
    } catch {
      setError("复制失败，请选中兑换码后手动复制。");
    }
  }
  async function revoke(code) {
    if (
      mutating.current ||
      !window.confirm(
        `作废这张 ${labels[code.plan]} ${code.durationDays} 天兑换码？作废后无法兑换。`,
      )
    )
      return;
    mutating.current = true;
    setBusy(true);
    setError("");
    try {
      await api(
        `/admin/membership-codes/${encodeURIComponent(code.id)}/revoke`,
        {},
      );
      setRevision((value) => value + 1);
      notify("兑换码已作废");
    } catch (cause) {
      setError(cause.message);
    } finally {
      mutating.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="membership-admin">
      <div className="membership-summary">
        {Object.entries(statuses).map(([id, label]) => (
          <div className={`membership-summary-item ${id}`} key={id}>
            <span>{label}</span>
            <strong>{data?.summary[id] ?? "—"}</strong>
          </div>
        ))}
      </div>
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>
              <Ticket size={20} /> 生成会员兑换码
            </h2>
            <p>绑定会员等级与时长，用户在 App「我的 → 兑换码」开通或续期。</p>
          </div>
          <span className="badge green">一次兑换 · 即刻生效</span>
        </div>
        <form className="membership-generate-form" onSubmit={generate}>
          <label>
            会员等级
            <select
              aria-label="生成兑换码等级"
              value={createPlan}
              onChange={(event) => setCreatePlan(event.target.value)}
              disabled={busy}
            >
              {["vip", "svip", "ssvip"].map((id) => (
                <option value={id} key={id}>
                  {labels[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            生成数量
            <input
              aria-label="生成兑换码数量"
              type="number"
              min="1"
              max="100"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            会员天数
            <input
              aria-label="兑换会员天数"
              type="number"
              min="1"
              max="365"
              required
              value={days}
              onChange={(event) => setDays(event.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            兑换截止日期（可选）
            <input
              aria-label="兑换截止日期"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={busy}
            />
          </label>
          <button className="primary" type="submit" disabled={busy}>
            <Plus size={16} /> {busy ? "处理中…" : "生成兑换码"}
          </button>
        </form>
        <p className="membership-form-hint">
          会员时长从兑换时开始计算；同等级续期会延长现有到期日，其他等级需到期后兑换。未填写截止日期的兑换码长期可兑换。
        </p>
        {notice && (
          <div className="membership-notice" role="status">
            {notice}
          </div>
        )}
      </section>
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>数据库中的兑换码</h2>
            <p>查看状态、复制未使用的码，或作废尚未发放的兑换码。</p>
          </div>
          <button
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={16} /> 刷新
          </button>
        </div>
        <form
          className="membership-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(searchInput.trim());
            setPage(0);
            setRevision((value) => value + 1);
          }}
        >
          <select
            aria-label="筛选会员等级"
            value={plan}
            onChange={(event) => {
              setPlan(event.target.value);
              setPage(0);
            }}
          >
            <option value="">全部等级</option>
            {["vip", "svip", "ssvip"].map((id) => (
              <option value={id} key={id}>
                {labels[id]}
              </option>
            ))}
          </select>
          <select
            aria-label="筛选兑换码状态"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(0);
            }}
          >
            <option value="">全部状态</option>
            {Object.entries(statuses).map(([id, label]) => (
              <option value={id} key={id}>
                {label}
              </option>
            ))}
          </select>
          <input
            aria-label="搜索兑换码或兑换账号"
            placeholder="搜索兑换码 / 兑换账号"
            maxLength={80}
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit">查询</button>
          <button
            type="button"
            disabled={
              loading ||
              !data?.codes.some((code) => code.status === "available")
            }
            onClick={() =>
              void copy(
                data.codes
                  .filter((code) => code.status === "available")
                  .map(
                    (code) =>
                      `${code.code}\t${labels[code.plan]}\t${code.durationDays}天`,
                  )
                  .join("\n"),
              )
            }
          >
            <Copy size={15} /> 复制本页可用码
          </button>
        </form>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="table-scroll" aria-busy={loading}>
          <table className="membership-code-table">
            <thead>
              <tr>
                <th>兑换码</th>
                <th>会员等级</th>
                <th>权益时长</th>
                <th>状态</th>
                <th>兑换账号 / 时间</th>
                <th>兑换截止</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.codes.map((code) => (
                <tr key={code.id}>
                  <td>
                    <code className="membership-code">{code.code}</code>
                    <small>{date(code.createdAt)} 生成</small>
                  </td>
                  <td>
                    <MembershipBadge plan={code.plan} />
                  </td>
                  <td>{code.durationDays} 天</td>
                  <td>
                    <span className={`membership-status ${code.status}`}>
                      {statuses[code.status]}
                    </span>
                  </td>
                  <td>
                    {code.redeemedUsername || "—"}
                    {code.redeemedAt && <small>{date(code.redeemedAt)}</small>}
                  </td>
                  <td>{code.expiresAt ? date(code.expiresAt) : "不限"}</td>
                  <td>
                    <div className="membership-row-actions">
                      <button
                        aria-label={`复制 ${code.code}`}
                        disabled={code.status !== "available"}
                        onClick={() => void copy(code.code)}
                      >
                        <Copy size={14} /> 复制
                      </button>
                      {code.status === "available" && (
                        <button
                          className="danger-button"
                          disabled={busy}
                          onClick={() => void revoke(code)}
                        >
                          <Ban size={14} /> 作废
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.codes.length && (
            <p className="membership-empty">
              {loading
                ? "正在读取兑换码…"
                : error
                  ? "兑换码暂未加载，点击刷新重试。"
                  : "没有符合条件的兑换码。"}
            </p>
          )}
        </div>
        <div className="membership-pagination">
          <span>
            {loading ? "正在同步…" : `共 ${data?.total || 0} 个兑换码`} · 第{" "}
            {page + 1} 页
          </span>
          <div>
            <button
              aria-label="上一页兑换码"
              disabled={loading || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="下一页兑换码"
              disabled={loading || (page + 1) * 30 >= (data?.total || 0)}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
