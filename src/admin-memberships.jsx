import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Plus,
  RefreshCw,
  Ticket,
  Ban,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { MembershipBadge } from "./components/membership-badge.jsx";
import { ContentPlaceholder } from "./components/content-placeholder.jsx";
import "./membership.css";

const labels = { free: "Free", vip: "VIP", svip: "SVIP", ssvip: "SSVIP" };
const statuses = {
  available: "可兑换",
  redeemed: "已兑换",
  revoked: "已作废",
  expired: "已过期",
};
const date = (value) => (value ? new Date(value).toLocaleString("zh-CN") : "—");
// getRandomValues also works on HTTP intranet deployments without randomUUID.
const requestId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
export { MembershipBadge };
export function AdminMembershipCodes({ api, notify }) {
  const [data, setData] = useState(null),
    [plan, setPlan] = useState(""),
    [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState(""),
    [search, setSearch] = useState("");
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [createError, setCreateError] = useState(""),
    [listError, setListError] = useState("");
  const [createPlan, setCreatePlan] = useState("vip"),
    [quantity, setQuantity] = useState("10"),
    [days, setDays] = useState("30"),
    [deadline, setDeadline] = useState("");
  const [notice, setNotice] = useState("");
  const [lastBatch, setLastBatch] = useState(null),
    [selectedIds, setSelectedIds] = useState(new Set()),
    [exporting, setExporting] = useState("");
  const request = useRef(null),
    mutating = useRef(false),
    exportRequest = useRef(false);
  const actionBusy = Boolean(busy || exporting);
  const allPageSelected =
    Boolean(data?.codes.length) &&
    data.codes.every((code) => selectedIds.has(code.id));
  const somePageSelected = data?.codes.some((code) => selectedIds.has(code.id));
  useEffect(() => {
    setSelectedIds(new Set());
  }, [plan, status, search]);
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    setLoading(true);
    setListError("");
    const params = new URLSearchParams({
      plan,
      status,
      search,
      limit: "30",
      offset: String(page * 30),
    });
    api(`/admin/membership-codes?${params}`, undefined, undefined, {
      signal: controller.signal,
    })
      .then((result) => {
        if (live) setData(result);
      })
      .catch((cause) => {
        if (live) {
          setListError(cause.message);
          setData(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [api, plan, status, search, page, revision]);

  async function generate(event) {
    event.preventDefault();
    if (mutating.current || exportRequest.current) return;
    mutating.current = true;
    setBusy("create");
    setCreateError("");
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
        request.current = { key, id: requestId() };
      const result = await api("/admin/membership-codes", {
        ...payload,
        requestId: request.current.id,
      });
      setNotice(
        `${result.repeated ? "已找回上次生成的" : "已生成"} ${result.codes.length} 个 ${labels[createPlan]} 兑换码，每码 ${days} 天。`,
      );
      setLastBatch({ id: result.batchId, count: result.codes.length });
      setSelectedIds(new Set());
      request.current = null;
      setPlan(createPlan);
      setStatus("");
      setSearch("");
      setSearchInput("");
      setPage(0);
      setRevision((value) => value + 1);
    } catch (cause) {
      setCreateError(cause.message || "创建失败，请稍后重试。");
    } finally {
      mutating.current = false;
      setBusy("");
    }
  }
  function toggleSelection(id, checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }
  function togglePage(checked) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const code of data.codes) {
        if (checked) next.add(code.id);
        else next.delete(code.id);
      }
      return next;
    });
  }
  async function exportCodes(scope, filters) {
    if (exportRequest.current || mutating.current) return;
    exportRequest.current = true;
    setExporting(scope);
    setError("");
    try {
      const result = await api("/admin/membership-codes/export", filters);
      const url = URL.createObjectURL(
        new Blob(["\uFEFF", result.text], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      try {
        document.body.appendChild(link);
        link.click();
      } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      notify(`已导出 ${result.count} 个兑换码为 TXT`);
    } catch (cause) {
      setError(cause.message || "导出失败，请稍后重试。");
    } finally {
      exportRequest.current = false;
      setExporting("");
    }
  }
  async function copy(text) {
    setError("");
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
      exportRequest.current ||
      !window.confirm(
        `作废这张 ${labels[code.plan]} ${code.durationDays} 天兑换码？作废后无法兑换。`,
      )
    )
      return;
    mutating.current = true;
    setBusy("revoke");
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
      setBusy("");
    }
  }
  return (
    <div className="membership-admin">
      <div className="membership-summary">
        {Object.entries(statuses).map(([id, label]) => (
          <div className={`membership-summary-item ${id}`} key={id}>
            <span>{label}</span>
            <strong>{data?.summary?.[id] ?? "—"}</strong>
          </div>
        ))}
      </div>
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>
              <Ticket size={20} aria-hidden="true" /> 批量创建会员兑换码
            </h2>
            <p>
              绑定会员等级与时长，用户可在网页「VIP 中心」或 App「我的 →
              兑换码」开通、续期。
            </p>
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
              disabled={actionBusy}
            >
              {["vip", "svip", "ssvip"].map((id) => (
                <option value={id} key={id}>
                  {labels[id]}
                </option>
              ))}
            </select>
          </label>
          <label>
            创建数量（1–1000）
            <input
              aria-label="生成兑换码数量"
              type="number"
              min="1"
              max="1000"
              step="1"
              required
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              disabled={actionBusy}
            />
          </label>
          <label>
            会员天数
            <input
              aria-label="兑换会员天数"
              type="number"
              min="1"
              max="365"
              step="1"
              required
              value={days}
              onChange={(event) => setDays(event.target.value)}
              disabled={actionBusy}
            />
          </label>
          <label>
            兑换截止日期（可选）
            <input
              aria-label="兑换截止日期"
              type="date"
              value={deadline}
              onChange={(event) => setDeadline(event.target.value)}
              disabled={actionBusy}
            />
          </label>
          <button className="primary" type="submit" disabled={actionBusy}>
            <Plus size={16} aria-hidden="true" />{" "}
            {busy === "create" ? "正在创建…" : "批量创建兑换码"}
          </button>
        </form>
        <p className="membership-form-hint">
          会员时长从兑换时开始计算；同等级续期会延长现有到期日，其他等级需到期后兑换。未填写截止日期的兑换码长期可兑换。
        </p>
        {createError && (
          <div className="alert error" role="alert">
            {createError}
          </div>
        )}
        {notice && (
          <div className="membership-batch-result">
            <p className="membership-notice" role="status">
              {notice}
            </p>
            {lastBatch && (
              <button
                type="button"
                disabled={actionBusy}
                onClick={() =>
                  void exportCodes("batch", { batchId: lastBatch.id })
                }
              >
                <Download size={16} aria-hidden="true" />
                {exporting === "batch"
                  ? "正在导出…"
                  : `导出本批 TXT（${lastBatch.count} 个）`}
              </button>
            )}
          </div>
        )}
      </section>
      <section className="admin-card">
        <div className="section-heading">
          <div>
            <h2>数据库中的兑换码</h2>
            <p>勾选兑换码批量导出，或导出筛选范围内的全部兑换码。</p>
          </div>
          <button
            disabled={loading || actionBusy}
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshCw size={16} aria-hidden="true" /> 刷新
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
            disabled={actionBusy}
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
            disabled={actionBusy}
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
            disabled={actionBusy}
            onChange={(event) => setSearchInput(event.target.value)}
          />
          <button type="submit" disabled={actionBusy}>
            查询
          </button>
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
        <div className="membership-export-actions">
          <span role="status">已选 {selectedIds.size} 个（可跨页勾选）</span>
          <button
            type="button"
            disabled={
              loading || Boolean(listError) || actionBusy || !selectedIds.size
            }
            onClick={() =>
              void exportCodes("selected", { ids: [...selectedIds] })
            }
          >
            <Download size={16} aria-hidden="true" />
            {exporting === "selected" ? "正在导出…" : "导出勾选 TXT"}
          </button>
          <button
            type="button"
            disabled={loading || actionBusy || !data?.total}
            onClick={() =>
              void exportCodes("filtered", { plan, status, search })
            }
          >
            <Download size={16} aria-hidden="true" />
            {exporting === "filtered"
              ? "正在导出…"
              : `导出筛选结果 TXT（${data?.total || 0} 个）`}
          </button>
          {selectedIds.size > 0 && (
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => setSelectedIds(new Set())}
            >
              清空选择
            </button>
          )}
        </div>
        <p className="membership-export-hint">
          TXT 每行一个完整兑换码。筛选导出包含所有页，单次最多 10000
          个；已兑换、作废或过期的码仍不可使用。
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {listError && (
          <div className="alert error" role="alert">
            {listError}
          </div>
        )}
        <div className="table-scroll" aria-busy={loading}>
          <table className="membership-code-table">
            <thead>
              <tr>
                <th className="membership-select-cell">
                  <input
                    type="checkbox"
                    aria-label="全选本页兑换码"
                    checked={allPageSelected}
                    ref={(element) => {
                      if (element)
                        element.indeterminate = Boolean(
                          somePageSelected && !allPageSelected,
                        );
                    }}
                    disabled={loading || actionBusy || !data?.codes.length}
                    onChange={(event) => togglePage(event.target.checked)}
                  />
                </th>
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
              {loading && !data && <tr><td colSpan={8}><ContentPlaceholder variant="list" rows={4} /></td></tr>}
              {data?.codes.map((code) => (
                <tr
                  key={code.id}
                  className={
                    selectedIds.has(code.id)
                      ? "membership-row-selected"
                      : undefined
                  }
                >
                  <td className="membership-select-cell">
                    <input
                      type="checkbox"
                      aria-label={`选择 ${code.code}`}
                      checked={selectedIds.has(code.id)}
                      disabled={loading || actionBusy}
                      onChange={(event) =>
                        toggleSelection(code.id, event.target.checked)
                      }
                    />
                  </td>
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
                          disabled={actionBusy || loading}
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
          {!loading && !data?.codes.length && (
            <p className="membership-empty">
              {listError
                  ? "兑换码暂未加载，点击刷新重试。"
                  : "没有符合条件的兑换码。"}
            </p>
          )}
        </div>
        <div className="membership-pagination">
          <span>
            {data ? `共 ${data.total} 个兑换码` : "兑换码列表"} · 第{" "}
            {page + 1} 页
          </span>
          <div>
            <button
              aria-label="上一页兑换码"
              disabled={loading || actionBusy || page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="下一页兑换码"
              disabled={
                loading || actionBusy || (page + 1) * 30 >= (data?.total || 0)
              }
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
