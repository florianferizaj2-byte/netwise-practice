import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  LoaderCircle,
  RefreshCw,
  X,
} from "lucide-react";
import { api } from "../../api.js";

export const AdminContext = createContext(null);
export const useAdmin = () => useContext(AdminContext);
export const endpoint = "/admin/console";
export const call = (url, body, method, options) =>
  api(endpoint + url, body, method, { cache: false, ...options });
export const requestId = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const date = (value) =>
  value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
export const number = (value) => Number(value || 0).toLocaleString("zh-CN");
export const labels = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
  short_answer: "简答题",
  draft: "草稿",
  exported: "已导出 · 待发布",
  integrated: "运行库已匹配",
  queued: "排队中",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  interrupted: "已中断",
  cancelled: "已取消",
  open: "待处理",
  processing: "处理中",
  resolved: "已解决",
  ignored: "已忽略",
  check: "内容检查",
  scan: "重合扫描",
  generate: "AI 生成",
};
export function useResource(url, { poll = false } = {}) {
  const [state, setState] = useState({ data: null, error: "", loading: true }),
    [tick, setTick] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    let timer;
    const load = async (initial = false) => {
      if (initial)
        setState((s) => ({ ...s, data: null, error: "", loading: true }));
      try {
        const data = await call(url, undefined, "GET", {
          signal: controller.signal,
        });
        if (live) {
          setState({ data, error: "", loading: false });
          if (
            data.job &&
            !["queued", "running"].includes(data.job.status) &&
            timer
          )
            clearInterval(timer);
        }
      } catch (e) {
        if (live && !controller.signal.aborted)
          setState((s) => ({ ...s, error: e.message, loading: false }));
      }
    };
    void load(true);
    timer = poll
      ? setInterval(() => {
          if (!document.hidden) void load();
        }, 2200)
      : null;
    return () => {
      live = false;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [url, tick, poll]);
  return { ...state, reload: () => setTick((v) => v + 1) };
}
export function Resource({ resource, children }) {
  if (resource.loading && !resource.data)
    return (
      <div className="ac-state" role="status">
        <LoaderCircle className="ac-spin" size={24} />
        正在读取管理数据…
      </div>
    );
  if (resource.error)
    return (
      <div className="ac-state ac-error" role="alert">
        <AlertCircle />
        <strong>{resource.error}</strong>
        <button onClick={resource.reload}>
          <RefreshCw size={15} />
          重新读取
        </button>
      </div>
    );
  return children(resource.data);
}
export function Status({ value, children }) {
  return (
    <span className={`ac-status ac-status-${value}`}>
      {children || labels[value] || value}
    </span>
  );
}
export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}) {
  return (
    <section className={"ac-panel " + className}>
      {(title || actions) && (
        <header className="ac-panel-head">
          <div>
            <h2>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
export function Empty({ children = "没有符合条件的数据", action }) {
  return (
    <div className="ac-empty">
      <span className="ac-empty-mark">—</span>
      <strong>{children}</strong>
      {action}
    </div>
  );
}
export function Table({ columns, rows, rowKey = "id", caption }) {
  return rows.length ? (
    <div className="ac-table-scroll">
      <table className="ac-table">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={typeof rowKey === "function" ? rowKey(r) : r[rowKey] || i}>
              {columns.map((c) => (
                <td key={c.key}>
                  {c.render ? c.render(r) : (r[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}
export function Pagination({ total, limit = 30, offset = 0, onChange }) {
  return (
    <div className="ac-pagination">
      <span>
        共 {number(total)} 条 · 第 {Math.floor(offset / limit) + 1} /{" "}
        {Math.max(1, Math.ceil(total / limit))} 页
      </span>
      <div>
        <button
          aria-label="上一页"
          disabled={!offset}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          aria-label="下一页"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
  dirty = false,
}) {
  const ref = useRef();
  const close = () => {
    if (!dirty || window.confirm("有尚未保存的修改，确定放弃吗？")) onClose();
  };
  const closing = useRef(close);
  closing.current = close;
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const cancel = (e) => {
      e.preventDefault();
      closing.current();
    };
    el.addEventListener("cancel", cancel);
    return () => el.removeEventListener("cancel", cancel);
  }, []);
  return (
    <dialog
      ref={ref}
      className={"ac-dialog " + (wide ? "ac-dialog-wide" : "")}
      aria-labelledby="ac-dialog-title"
    >
      <header>
        <h2 id="ac-dialog-title">{title}</h2>
        <button onClick={close} aria-label="关闭">
          <X size={18} />
        </button>
      </header>
      <div className="ac-dialog-body">{children}</div>
    </dialog>
  );
}
export function download(name, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DownloadButton({ name, data, children = "导出 JSON" }) {
  return (
    <button onClick={() => download(name, data)}>
      <Download size={15} />
      {children}
    </button>
  );
}
export function SearchField({
  value,
  onSearch,
  placeholder = "搜索",
  label = "搜索",
}) {
  const [draft, setDraft] = useState(value || "");
  useEffect(() => setDraft(value || ""), [value]);
  return (
    <form
      className="ac-search-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(draft);
      }}
    >
      <input
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button type="submit">搜索</button>
    </form>
  );
}
export function QuestionPreview({ question: q }) {
  return (
    <article className="ac-question-preview">
      <div className="ac-badges">
        <Status value="draft">{labels[q.type]}</Status>
        <span>
          {q.chapter} / {q.knowledgeSection} / {q.knowledgePoint}
        </span>
      </div>
      <code className="ac-muted">{q.id}</code>
      {q.sharedStem && (
        <blockquote>
          <strong>共用材料</strong>
          <p>{q.sharedStem}</p>
        </blockquote>
      )}
      {(q.images || []).map((image, i) => (
        <img
          className="ac-question-image"
          src={image.src}
          alt={image.alt || "题目配图"}
          key={i}
        />
      ))}
      <h3>{q.question}</h3>
      <ol className="ac-options">
        {Object.entries(q.options || {}).map(([k, v]) => (
          <li key={k}>
            <strong>{k}</strong>
            <span>{v}</span>
          </li>
        ))}
      </ol>
      <div className="ac-answer">
        <Check size={17} />
        <strong>
          参考答案：{q.expectedAnswer || (q.answer || []).join("、")}
        </strong>
      </div>
      <h4>解析</h4>
      <p>{q.analysis}</p>
    </article>
  );
}
