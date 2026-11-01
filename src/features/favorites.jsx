import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Search,
  Star,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { api } from "../api.js";
import { Heading, Empty } from "../components/study-ui.jsx";
import { questionTypeName } from "../question-utils.js";
import "./favorites.css";
import {
  useKnowledgeFavorites,
  KnowledgeFavorites,
  KnowledgePreview,
} from "./knowledge-favorites.jsx";

export function FavoritesView({
  defaultCount = 5,
  start,
  run,
  refresh,
  busy,
  onChapters,
  onStudy,
  onStudyDirectory,
}) {
  const knowledge = useKnowledgeFavorites();
  const [tab, setTab] = useState("questions");
  const [questions, setQuestions] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [search, setSearch] = useState(""),
    [chapter, setChapter] = useState(""),
    [type, setType] = useState(""),
    [unattempted, setUnattempted] = useState(false);
  const [order, setOrder] = useState("recent"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(new Set());
  const [random, setRandom] = useState(true),
    [count, setCount] = useState(defaultCount);
  const countUsesDefault=useRef(true);
  useEffect(()=>{if(countUsesDefault.current)setCount(defaultCount);},[defaultCount]);
  async function load() {
    let rows;
    try {
      rows = await api("/favorites", undefined, undefined, {
        cache: false,
      });
    } catch (e) {
      setError(e.message);
      throw e;
    }
    setQuestions(rows);
    setError("");
    setSelected(
      (previous) =>
        new Set([...previous].filter((id) => rows.some((q) => q.id === id))),
    );
    return rows;
  }
  useEffect(() => {
    let active = true;
    api("/favorites", undefined, undefined, { cache: false })
      .then((rows) => {
        if (active) setQuestions(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => setPage(0), [search, chapter, type, unattempted, order]);
  const filtered = useMemo(
    () =>
      questions
        .filter(
          (q) =>
            (!chapter || q.chapter === chapter) &&
            (!type || q.type === type) &&
            (!unattempted || !q.attempted) &&
            (!search.trim() ||
              [q.question, q.chapter, q.knowledgePoint]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase()
                .includes(search.trim().toLocaleLowerCase())),
        )
        .sort((a, b) =>
          order === "chapter"
            ? String(a.chapter).localeCompare(String(b.chapter), "zh-CN") ||
              a.id.localeCompare(b.id)
            : String(b.favoritedAt || "").localeCompare(
                String(a.favoritedAt || ""),
              ) || a.id.localeCompare(b.id),
        ),
    [questions, chapter, type, unattempted, search, order],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 8)),
    currentPage = Math.min(page, pageCount - 1),
    visible = filtered.slice(currentPage * 8, currentPage * 8 + 8);
  const selectedRows = questions.filter((q) => selected.has(q.id));
  const toggle = (id) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else if (next.size < 50) next.add(id);
      return next;
    });
  async function remove(ids) {
    await run("正在更新收藏", async () => {
      let failure;
      for (const id of ids) {
        try {
          await api(
            "/questions/" + encodeURIComponent(id) + "/favorite",
            { favorite: false },
            "PUT",
          );
        } catch (e) {
          failure = e;
          break;
        }
      }
      await load();
      await refresh();
      if (failure) throw failure;
    });
  }
  function practice(rows, title = "收藏练习") {
    const list = [...rows];
    if (random)
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    start(count === "all" ? list : list.slice(0, count), title);
  }
  const disabled = loading || !!busy || !!error;
  async function loadAll() {
    const results = await Promise.allSettled([load(), knowledge.reload()]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) throw failed.reason;
  }
  return (
    <div className="favorites-view">
      <Heading title="我的收藏" subtitle="把值得回看的题目和知识点，留在这里。">
        <button
          onClick={() => run("正在刷新收藏", loadAll)}
          disabled={loading || knowledge.loading || !!busy}
        >
          <RefreshCw size={17} />
          刷新收藏
        </button>
      </Heading>
      <section className="favorites-banner" aria-label="收藏概览">
        <Star size={42} />
        <div>
          <h2>重点内容，随时回看</h2>
          <p>按章节整理，再用练习巩固理解。</p>
        </div>
        <div>
          <span>收藏题目</span>
          <strong>
            {loading || error ? "—" : questions.length}
            <small> 道</small>
          </strong>
        </div>
        <div>
          <span>尚未练习</span>
          <strong>
            {loading || error
              ? "—"
              : questions.filter((q) => !q.attempted).length}
            <small> 道</small>
          </strong>
        </div>
        <div>
          <span>收藏知识点</span>
          <strong>
            {knowledge.loading || knowledge.error
              ? "—"
              : knowledge.items.length}
            <small> 个</small>
          </strong>
        </div>
      </section>
      <nav className="favorites-tabs" aria-label="收藏内容类型">
        <button
          aria-pressed={tab === "questions"}
          onClick={() => setTab("questions")}
        >
          题目 {loading || error ? "—" : questions.length}
        </button>
        <button
          aria-pressed={tab === "knowledge"}
          onClick={() => setTab("knowledge")}
        >
          知识点{" "}
          {knowledge.loading || knowledge.error ? "—" : knowledge.items.length}
        </button>
      </nav>
      {error && tab === "questions" && (
        <div role="alert" className="favorites-error">
          {error}
          <button
            onClick={() =>
              run("正在重试", async () => {
                await load();
                setError("");
              })
            }
          >
            重新读取
          </button>
        </div>
      )}
      {tab === "questions" ? (
        <div className="favorites-layout">
          <section aria-label="收藏题目列表">
            <div className="favorites-filters">
              <label className="favorites-search">
                <Search size={17} />
                <input
                  type="search"
                  aria-label="搜索收藏内容"
                  placeholder="搜索题目或知识点"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="收藏章节"
                value={chapter}
                onChange={(e) => setChapter(e.target.value)}
              >
                <option value="">全部章节</option>
                {[...new Set(questions.map((q) => q.chapter))]
                  .sort()
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
              <select
                aria-label="收藏题型"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">全部题型</option>
                {[...new Set(questions.map((q) => q.type))].map((t) => (
                  <option key={t} value={t}>
                    {questionTypeName({ type: t })}
                  </option>
                ))}
              </select>
              <select
                aria-label="收藏排序"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="recent">最近收藏</option>
                <option value="chapter">按章节</option>
              </select>
            </div>
            {loading ? (
              <p role="status">正在读取账号收藏…</p>
            ) : error ? null : !visible.length ? (
              <Empty
                icon={Star}
                title={questions.length ? "没有匹配的收藏" : "还没有收藏题目"}
              >
                <p>
                  {questions.length
                    ? "调整筛选条件再试试。"
                    : "练习时点击星标，就能在这里回顾。"}
                </p>
                <button onClick={onChapters}>前往章节练习</button>
              </Empty>
            ) : (
              visible.map((q) => (
                <article
                  className="favorite-question"
                  key={q.id}
                  data-favorite-question={q.id}
                >
                  <div className="favorite-question-meta">
                    <input
                      type="checkbox"
                      aria-label={"选择收藏题目：" + q.question}
                      checked={selected.has(q.id)}
                      disabled={
                        disabled || (!selected.has(q.id) && selected.size >= 50)
                      }
                      onChange={() => toggle(q.id)}
                    />
                    <span>{questionTypeName(q)}</span>
                    <span>{q.chapter}</span>
                    <small>{q.knowledgePoint}</small>
                    <button
                      aria-label={"取消收藏：" + q.question}
                      disabled={disabled}
                      onClick={() => remove([q.id])}
                    >
                      <Star size={20} fill="currentColor" />
                    </button>
                  </div>
                  <h2>{q.question}</h2>
                  <footer>
                    <span>
                      {q.attempted ? "已练习" : "未练习"}
                      {q.favoritedAt &&
                        " · 收藏于 " +
                          new Date(q.favoritedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <button
                      disabled={disabled}
                      onClick={() => start([q], "收藏题目")}
                    >
                      查看题目
                      <ArrowRight size={17} />
                    </button>
                  </footer>
                </article>
              ))
            )}
            <div className="favorites-batch">
              <label>
                <input
                  type="checkbox"
                  aria-label="选择本页收藏"
                  checked={
                    visible.length > 0 &&
                    visible.every((q) => selected.has(q.id))
                  }
                  disabled={disabled || !visible.length}
                  onChange={() =>
                    setSelected((previous) => {
                      const next = new Set(previous),
                        all = visible.every((q) => next.has(q.id));
                      for (const q of visible) {
                        if (all) next.delete(q.id);
                        else if (next.size < 50) next.add(q.id);
                      }
                      return next;
                    })
                  }
                />
                本页全选
              </label>
              <span>已选 {selected.size} 题</span>
              <button
                disabled={disabled || !selectedRows.length}
                onClick={() => practice(selectedRows, "所选收藏练习")}
              >
                <BookOpen size={16} />
                练习所选
              </button>
              <button
                disabled={disabled || !selectedRows.length}
                onClick={() => remove([...selected])}
              >
                <Trash2 size={16} />
                取消收藏
              </button>
              <small>最多选择 50 题</small>
            </div>
            {pageCount > 1 && (
              <nav className="favorites-pages" aria-label="收藏分页">
                <button
                  disabled={disabled || currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  上一页
                </button>
                <span>
                  {currentPage + 1} / {pageCount}
                </span>
                <button
                  disabled={disabled || currentPage >= pageCount - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  下一页
                </button>
              </nav>
            )}
          </section>
          <div className="favorite-side">
            <aside className="favorites-practice">
              <h2>
                <BookOpen size={22} />
                收藏练习
              </h2>
              <p>从当前筛选范围中抽题，复习重点。</p>
              <div className="favorites-total">
                可练习 <strong>{filtered.length}</strong> 道题
              </div>
              <fieldset>
                <legend>练习方式</legend>
                <div className="favorites-choice">
                  {[
                    [true, "随机练习"],
                    [false, "顺序练习"],
                  ].map(([value, text]) => (
                    <button
                      key={text}
                      aria-pressed={random === value}
                      onClick={() => setRandom(value)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="favorites-unattempted">
                <input
                  type="checkbox"
                  checked={unattempted}
                  onChange={(e) => setUnattempted(e.target.checked)}
                />
                仅未练题目
              </label>
              <fieldset>
                <legend>每次题量</legend>
                <div className="favorites-choice">
                  {[5, 10, 20, 30, "all"].map((n) => (
                    <button
                      key={n}
                      aria-pressed={count === n}
                      onClick={() => {countUsesDefault.current=false;setCount(n);}}
                    >
                      {n === "all" ? "全部" : n + "题"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <button
                className="favorites-start"
                disabled={disabled || !filtered.length}
                onClick={() => practice(filtered)}
              >
                开始练习
                <ArrowRight size={18} />
              </button>
              <p className="favorites-note">
                提交后查看结果与解析，学习记录保存到当前账号。
              </p>
            </aside>
            <KnowledgePreview
              state={knowledge}
              onStudy={onStudy}
              onAll={() => setTab("knowledge")}
            />
          </div>
        </div>
      ) : (
        <KnowledgeFavorites
          state={knowledge}
          run={run}
          busy={busy}
          onStudy={onStudy}
          onDirectory={onStudyDirectory}
          onChapters={onChapters}
        />
      )}
    </div>
  );
}
