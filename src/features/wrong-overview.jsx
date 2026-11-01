import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  NotebookPen,
  RefreshCw,
  Search,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../api.js";
import { questionTypeName, sourceName } from "../question-utils.js";
import {
  QuestionImages,
  QuestionOrigin,
} from "../components/question-tools.jsx";
import { Empty, Heading } from "../components/study-ui.jsx";
import "./blue-practice-view.css";

const timestamp = (value) => Date.parse(value || "") || 0;
const date = (value) =>
  timestamp(value) ? new Date(value).toLocaleDateString("zh-CN") : "待安排";
const due = (q) =>
  !!timestamp(q.review?.dueAt) && timestamp(q.review.dueAt) <= Date.now();
function shuffle(rows) {
  const copy = [...rows];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function BlueWrongOverview({
  wrong,
  start,
  train,
  busy,
  run,
  refresh,
  onPractice,
  defaultCount = 10,
  desktop,
}) {
  const [filter, setFilter] = useState("all"),
    [chapter, setChapter] = useState(""),
    [type, setType] = useState(""),
    [search, setSearch] = useState("");
  const [order, setOrder] = useState("recent"),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState(new Set());
  const [random, setRandom] = useState(false),
    [count, setCount] = useState(defaultCount),
    [trainCount, setTrainCount] = useState(5);
  const countIsDefault = useRef(true);
  useEffect(() => {
    if (countIsDefault.current) setCount(defaultCount);
  }, [defaultCount]);
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [filter, chapter, type, search]);
  useEffect(() => {
    setSelected(
      (old) => new Set([...old].filter((id) => wrong.some((q) => q.id === id))),
    );
  }, [wrong]);
  const chapters = [...new Set(wrong.map((q) => q.chapter))];
  const filtered = useMemo(
    () =>
      wrong
        .filter(
          (q) =>
            (filter !== "due" || due(q)) &&
            (!chapter || q.chapter === chapter) &&
            (!type || q.type === type) &&
            (!search.trim() ||
              [
                q.question,
                q.chapter,
                q.targetKnowledgePoint || q.knowledgePoint,
              ]
                .filter(Boolean)
                .join(" ")
                .toLocaleLowerCase()
                .includes(search.trim().toLocaleLowerCase())),
        )
        .sort((a, b) =>
          order === "errors"
            ? b.wrongCount - a.wrongCount
            : order === "due"
              ? (timestamp(a.review?.dueAt) || Infinity) -
                (timestamp(b.review?.dueAt) || Infinity)
              : timestamp(b.lastWrong?.createdAt) -
                timestamp(a.lastWrong?.createdAt),
        ),
    [wrong, filter, chapter, type, search, order],
  );
  const selectedPool = filtered.filter((q) => selected.has(q.id));
  const pool = selectedPool.length ? selectedPool : filtered;
  const totalPages = Math.ceil(filtered.length / 5),
    currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const visible = filtered.slice(currentPage * 5, (currentPage + 1) * 5);
  const toggle = (id) =>
    setSelected((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const startReview = (rows) =>
    start(rows, "错题复习", { returnPage: "wrong" });
  const clear = () => {
    setFilter("all");
    setChapter("");
    setType("");
    setSearch("");
  };
  return (
    <div className="blue-wrong-overview">
      <Heading title="错题本" subtitle="把易错的地方，变成下一次的进步。">
        <button
          disabled={!!busy}
          onClick={() => run("正在刷新错题本", refresh)}
        >
          <RefreshCw size={16} />
          刷新错题
        </button>
      </Heading>
      <section className="blue-wrong-hero" aria-label="错题概览">
        <NotebookPen size={46} />
        <div>
          <h2>先看错因，再练一次</h2>
          <p>错题按账号与备考目标保存，复习后可查看最新状态。</p>
        </div>
        <dl>
          <div>
            <dt>全部错题</dt>
            <dd>
              {wrong.length}
              <small>道</small>
            </dd>
          </div>
          <div>
            <dt>到期复习</dt>
            <dd>
              {wrong.filter(due).length}
              <small>道</small>
            </dd>
          </div>
          <div>
            <dt>涉及章节</dt>
            <dd>
              {chapters.length}
              <small>个</small>
            </dd>
          </div>
        </dl>
      </section>
      <div className="blue-wrong-layout">
        <section className="blue-wrong-content" aria-label="错题列表">
          <div className="blue-wrong-toolbar">
            <div className="segmented" aria-label="错题范围">
              {[
                ["all", "全部错题"],
                ["due", "今日到期"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  className={filter === value ? "selected" : ""}
                  onClick={() => setFilter(value)}
                >
                  {label}
                  {value === "all"
                    ? ` ${wrong.length}`
                    : ` ${wrong.filter(due).length}`}
                </button>
              ))}
            </div>
            <label className="blue-wrong-search">
              <Search size={17} />
              <input
                aria-label="搜索错题"
                placeholder="搜索题目或知识点"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>
          <div className="blue-wrong-filters">
            <select
              aria-label="筛选章节"
              value={chapter}
              onChange={(event) => setChapter(event.target.value)}
            >
              <option value="">全部章节</option>
              {chapters.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
            <select
              aria-label="筛选题型"
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">全部题型</option>
              {[...new Set(wrong.map((q) => q.type))].map((value) => (
                <option value={value} key={value}>
                  {questionTypeName({ type: value })}
                </option>
              ))}
            </select>
            <select
              aria-label="错题排序"
              value={order}
              onChange={(event) => {
                setOrder(event.target.value);
                setPage(0);
              }}
            >
              <option value="recent">最近错答</option>
              <option value="errors">错误次数最多</option>
              <option value="due">复习时间最近</option>
            </select>
          </div>
          {filtered.length ? (
            <>
              <div className="blue-wrong-selection">
                <label>
                  <input
                    type="checkbox"
                    aria-label="选择本页错题"
                    checked={
                      visible.length > 0 &&
                      visible.every((q) => selected.has(q.id))
                    }
                    onChange={(event) =>
                      setSelected((old) => {
                        const next = new Set(old);
                        visible.forEach((q) =>
                          event.target.checked
                            ? next.add(q.id)
                            : next.delete(q.id),
                        );
                        return next;
                      })
                    }
                  />
                  选择本页
                </label>
                <span>
                  已选 {selectedPool.length} 道 · 筛选结果 {filtered.length} 道
                </span>
                {selectedPool.length > 0 && (
                  <button onClick={() => setSelected(new Set())}>
                    清空选择
                  </button>
                )}
              </div>
              <div className="wrong-list">
                {visible.map((q) => (
                  <article
                    className="wrong-item"
                    data-wrong-question={q.id}
                    key={q.id}
                  >
                    <div className="blue-wrong-item-top">
                      <input
                        type="checkbox"
                        aria-label={`选择错题 ${q.question}`}
                        checked={selected.has(q.id)}
                        onChange={() => toggle(q.id)}
                      />
                      <span className="badge">{questionTypeName(q)}</span>
                      <span className="badge">{q.chapter}</span>
                      <span className="blue-wrong-error-count">
                        错误 {q.wrongCount} 次
                      </span>
                    </div>
                    <h3>{q.question}</h3>
                    <p className="blue-wrong-point">
                      {q.targetKnowledgePoint || q.knowledgePoint} ·{" "}
                      {sourceName(q)}
                    </p>
                    <div className="blue-wrong-item-foot">
                      <span>
                        <Clock size={14} />
                        复习时间 {date(q.review?.dueAt)}
                      </span>
                      <button
                        onClick={() => startReview([q])}
                        disabled={!!busy}
                      >
                        再做一次
                        <ArrowRight size={16} />
                      </button>
                    </div>
                    <details className="blue-wrong-review">
                      <summary>回看上次作答与解析</summary>
                      {q.sharedStem && (
                        <p className="blue-wrong-shared-stem">{q.sharedStem}</p>
                      )}
                      <QuestionImages question={q} />
                      {q.type === "short_answer" ? (
                        <>
                          <p>上次作答：{q.lastWrong?.response || "未填写"}</p>
                          <p>参考答案：{q.expectedAnswer}</p>
                        </>
                      ) : (
                        <>
                          <p>
                            上次错选{" "}
                            <b>
                              {q.lastWrong?.selected?.join("、") || "未作答"}
                            </b>{" "}
                            · 正确答案 <strong>{q.answer?.join("、")}</strong>
                          </p>
                          <ul>
                            {Object.entries(q.options || {}).map(
                              ([key, value]) => (
                                <li key={key}>
                                  {key}　{value}
                                </li>
                              ),
                            )}
                          </ul>
                        </>
                      )}
                      <p>{q.analysis}</p>
                      <QuestionOrigin question={q} />
                      {q.mistake && (
                        <div className="mistake-detail">
                          <Sparkles size={17} />
                          <div>
                            <strong>{q.mistake.weakKnowledge}</strong>
                            <p>{q.mistake.reason}</p>
                            <small>{q.mistake.mistakeType}</small>
                          </div>
                        </div>
                      )}
                      <div className="item-actions">
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            run("正在分析错误原因", async () => {
                              await api("/ai/analyze", { questionId: q.id });
                              await refresh();
                            })
                          }
                        >
                          {q.mistake ? "重新分析错因" : "AI 分析错因"}
                        </button>
                        <button
                          disabled={!!busy}
                          onClick={() => train(q, trainCount)}
                        >
                          <Sparkles size={16} />
                          AI 针对训练
                        </button>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
              <nav className="blue-wrong-pagination" aria-label="错题分页">
                <button
                  aria-label="上一页错题"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  第 {currentPage + 1} / {totalPages} 页
                </span>
                <button
                  aria-label="下一页错题"
                  disabled={currentPage + 1 >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </nav>
            </>
          ) : (
            <Empty
              title={wrong.length ? "没有符合条件的错题" : "还没有错题记录"}
            >
              <p>
                {wrong.length
                  ? "试试其他章节、题型或搜索关键词。"
                  : "先完成一组练习，错题会自动收集在这里。"}
              </p>
              <button
                className="primary"
                onClick={wrong.length ? clear : onPractice}
              >
                {wrong.length ? "查看全部错题" : "去章节练习"}
                <ArrowRight size={16} />
              </button>
            </Empty>
          )}
        </section>
        <aside className="blue-wrong-settings-wrap" aria-label="错题复习设置">
          <details className="blue-wrong-settings" open={desktop || undefined}>
            <summary>
              <h2>
                <BookOpen size={22} />
                错题复习
              </h2>
              <span>{pool.length} 道可复习</span>
            </summary>
            <p>
              {selectedPool.length
                ? "复习你选中的题目"
                : "从当前筛选结果中复习"}
            </p>
            <div className="blue-wrong-pool">
              可复习 <strong>{pool.length}</strong> 道题
            </div>
            <fieldset>
              <legend>练习方式</legend>
              <div className="segmented">
                {[
                  [false, "顺序练习"],
                  [true, "随机练习"],
                ].map(([value, label]) => (
                  <button
                    key={label}
                    aria-pressed={random === value}
                    className={random === value ? "selected" : ""}
                    onClick={() => setRandom(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>每次题量</legend>
              <div className="segmented">
                {[5, 10, 20, 30, "all"].map((value) => (
                  <button
                    key={value}
                    aria-pressed={count === value}
                    className={count === value ? "selected" : ""}
                    onClick={() => {
                      countIsDefault.current = false;
                      setCount(value);
                    }}
                  >
                    {value === "all" ? "全部" : `${value} 题`}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="primary"
              disabled={!pool.length || !!busy}
              onClick={() =>
                startReview(
                  (random ? shuffle(pool) : pool).slice(
                    0,
                    count === "all" ? undefined : count,
                  ),
                )
              }
            >
              开始复习（
              {Math.min(
                pool.length,
                count === "all" ? pool.length : count,
              )}{" "}
              题）
              <ArrowRight size={17} />
            </button>
            <small>复习记录自动保存，答对后可移出错题本。</small>
            <label className="blue-wrong-train-count">
              AI 训练题量
              <select
                aria-label="训练题量"
                value={trainCount}
                onChange={(event) => setTrainCount(Number(event.target.value))}
              >
                {[3, 5, 10].map((value) => (
                  <option value={value} key={value}>
                    {value} 题
                  </option>
                ))}
              </select>
            </label>
            <p className="blue-wrong-train-hint">
              展开单题解析后，可分析错因或生成针对训练。
            </p>
          </details>
        </aside>
      </div>
    </div>
  );
}
