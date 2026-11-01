import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "../api.js";
import { Empty } from "../components/study-ui.jsx";
import "./knowledge-favorites.css";

export function useKnowledgeFavorites() {
  const [items, setItems] = useState([]),
    [supported, setSupported] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const live = useRef(true),
    reading = useRef(0);
  async function reload() {
    const request = ++reading.current;
    if (live.current) {
      setLoading(true);
      setError("");
    }
    try {
      const [rows, info] = await Promise.all([
        api("/knowledge-favorites", undefined, undefined, { cache: false }),
        api("/knowledge-favorites/info", undefined, undefined, {
          cache: false,
        }),
      ]);
      if (!Array.isArray(rows) || typeof info.supported !== "boolean")
        throw new Error("知识点收藏格式无法识别，请重新读取。");
      if (live.current && request === reading.current) {
        setItems(rows);
        setSupported(info.supported);
      }
      return rows;
    } catch (e) {
      if (live.current && request === reading.current) setError(e.message);
      throw e;
    } finally {
      if (live.current && request === reading.current) setLoading(false);
    }
  }
  useEffect(() => {
    live.current = true;
    void reload().catch(() => {});
    return () => {
      live.current = false;
      reading.current++;
    };
  }, []);
  return { items, loading, error, supported, reload };
}

export function KnowledgePreview({ state, onStudy, onAll }) {
  return (
    <section className="knowledge-preview" aria-label="收藏的知识点">
      <header>
        <h2>
          <Bookmark size={21} />
          收藏的知识点
        </h2>
        <span>
          {state.loading || state.error ? "—" : state.items.length} 个
        </span>
      </header>
      {state.loading ? (
        <p role="status">正在读取…</p>
      ) : state.error ? (
        <div role="alert">
          <p>{state.error}</p>
          <button onClick={() => void state.reload().catch(() => {})}>
            重新读取知识点
          </button>
        </div>
      ) : !state.items.length ? (
        <p>
          {state.supported === false
            ? "当前证书暂无精讲知识目录，题目收藏仍可使用。"
            : "在精讲页收藏知识点，随时回来复习。"}
        </p>
      ) : (
        state.items.slice(0, 4).map((item) => (
          <button
            key={item.id}
            onClick={() => onStudy(item)}
            disabled={!item.lessonNodeId || !item.current}
          >
            <Bookmark size={16} />
            <span>
              {item.title}
              <small>{item.chapter}</small>
            </span>
            <ArrowRight size={16} />
          </button>
        ))
      )}
      <button onClick={onAll}>
        查看全部知识点
        <ArrowRight size={16} />
      </button>
    </section>
  );
}

export function KnowledgeFavorites({
  state,
  run,
  busy,
  onStudy,
  onDirectory,
  onChapters,
}) {
  const [query, setQuery] = useState(""),
    [chapter, setChapter] = useState(""),
    [order, setOrder] = useState("recent"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(new Set());
  const filtered = useMemo(
    () =>
      state.items
        .filter(
          (n) =>
            (!chapter || n.chapter === chapter) &&
            (!query.trim() ||
              [n.title, n.chapter, n.section]
                .join(" ")
                .toLowerCase()
                .includes(query.trim().toLowerCase())),
        )
        .sort((a, b) =>
          order === "chapter"
            ? a.chapter.localeCompare(b.chapter, "zh-CN") ||
              a.title.localeCompare(b.title, "zh-CN")
            : String(b.favoritedAt).localeCompare(String(a.favoritedAt)) ||
              a.id.localeCompare(b.id),
        ),
    [state.items, query, chapter, order],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 8)),
    current = Math.min(page, pages - 1),
    visible = filtered.slice(current * 8, current * 8 + 8);
  const disabled = !!busy || state.loading || !!state.error;
  useEffect(() => {
    setPage(0);
  }, [query, chapter, order]);
  useEffect(() => {
    setSelected(
      (old) =>
        new Set([...old].filter((id) => state.items.some((n) => n.id === id))),
    );
  }, [state.items]);
  async function remove(ids) {
    await run("正在更新知识点收藏", async () => {
      let failure;
      for (const id of ids) {
        try {
          await api(
            "/knowledge-favorites/" + encodeURIComponent(id),
            { favorite: false },
            "PUT",
          );
        } catch (e) {
          failure = e;
          break;
        }
      }
      await state.reload();
      if (failure) throw failure;
    });
  }
  return (
    <section className="knowledge-favorites" aria-label="收藏知识点列表">
      <div className="favorites-filters">
        <label className="favorites-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="搜索收藏知识点"
            placeholder="搜索知识点或章节"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="知识点收藏章节"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
        >
          <option value="">全部章节</option>
          {[...new Set(state.items.map((n) => n.chapter))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="知识点收藏排序"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="recent">最近收藏</option>
          <option value="chapter">按章节</option>
        </select>
      </div>
      {state.loading ? (
        <p role="status">正在读取知识点收藏…</p>
      ) : state.error ? (
        <div className="favorites-error" role="alert">
          <p>{state.error}</p>
          <button onClick={() => void state.reload().catch(() => {})}>
            <RefreshCw size={16} />
            重新读取知识点
          </button>
        </div>
      ) : !visible.length ? (
        <Empty
          icon={Bookmark}
          title={
            state.items.length
              ? "没有匹配的知识点"
              : state.supported === false
                ? "当前证书暂未开放知识目录"
                : "还没有收藏知识点"
          }
        >
          <p>
            {state.items.length
              ? "调整搜索或章节筛选再试试。"
              : state.supported === false
                ? "题目收藏和章节练习仍可使用。"
                : "学习精讲时点击收藏，就能在这里找到。"}
          </p>
          <button
            onClick={state.supported === false ? onChapters : onDirectory}
          >
            {state.supported === false ? "前往章节练习" : "前往精讲目录"}
          </button>
        </Empty>
      ) : (
        <div className="knowledge-items">
          {visible.map((item) => (
            <article
              key={item.id}
              className="favorite-knowledge"
              data-favorite-knowledge={item.id}
            >
              <div>
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  disabled={
                    disabled || (!selected.has(item.id) && selected.size >= 50)
                  }
                  aria-label={"选择收藏知识点：" + item.title}
                  onChange={() =>
                    setSelected((old) => {
                      const next = new Set(old);
                      if (next.has(item.id)) next.delete(item.id);
                      else if (next.size < 50) next.add(item.id);
                      return next;
                    })
                  }
                />
                <span>{item.kind === "lesson" ? "精讲小节" : "知识点"}</span>
                <span>{item.chapter}</span>
                <button
                  aria-label={"取消收藏知识点：" + item.title}
                  disabled={disabled}
                  onClick={() => remove([item.id])}
                >
                  <Bookmark size={19} fill="currentColor" />
                </button>
              </div>
              <h2>{item.title}</h2>
              <p>
                {item.section}
                {item.completedBefore ? " · 曾完成学习" : ""}
              </p>
              <footer>
                <span>
                  {item.current
                    ? item.available
                      ? "可以学习"
                      : "课程准备中"
                    : "目录已更新，暂不可用"}{" "}
                  · 收藏于{" "}
                  {new Date(item.favoritedAt).toLocaleDateString("zh-CN")}
                </span>
                <button
                  disabled={disabled || !item.current || !item.lessonNodeId}
                  onClick={() => onStudy(item)}
                >
                  查看精讲
                  <ArrowRight size={17} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}
      <div className="favorites-batch">
        <label>
          <input
            type="checkbox"
            aria-label="选择本页知识点"
            disabled={disabled || !visible.length}
            checked={
              !!visible.length && visible.every((n) => selected.has(n.id))
            }
            onChange={() =>
              setSelected((old) => {
                const next = new Set(old),
                  all = visible.every((n) => next.has(n.id));
                for (const n of visible) {
                  if (all) next.delete(n.id);
                  else if (next.size < 50) next.add(n.id);
                }
                return next;
              })
            }
          />
          本页全选
        </label>
        <span>已选 {selected.size} 个</span>
        <button
          disabled={disabled || !selected.size}
          onClick={() => remove([...selected])}
        >
          <Trash2 size={16} />
          取消所选收藏
        </button>
        <small>最多选择 50 个</small>
      </div>
      {pages > 1 && (
        <nav className="favorites-pages" aria-label="知识点收藏分页">
          <button
            disabled={disabled || current === 0}
            onClick={() => setPage(current - 1)}
          >
            上一页
          </button>
          <span>
            {current + 1} / {pages}
          </span>
          <button
            disabled={disabled || current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            下一页
          </button>
        </nav>
      )}
      <p className="knowledge-favorites-note">
        <BookOpen size={16} />
        收藏随账号保存，学习精讲仍按当前会员权限开放。
      </p>
    </section>
  );
}
