import { useState } from "react";
import { ArrowRight, MessageCircle, RotateCcw, Sparkles } from "lucide-react";
import { api } from "../api.js";
import { sourceName } from "../question-utils.js";
import { Empty, Heading } from "../components/study-ui.jsx";

export function WrongView({
  wrong,
  start,
  train,
  busy,
  run,
  refresh,
  desktop,
  onPractice,
}) {
  const [filter, setFilter] = useState("all"),
    [count, setCount] = useState(5),
    [chapter, setChapter] = useState("");
  const filtered = wrong.filter(
    (q) =>
      (filter !== "due" || q.review?.dueAt <= new Date().toISOString()) &&
      (!chapter || q.chapter === chapter),
  );
  return (
    <>
      <Heading
        title="错题本"
        subtitle={`${wrong.length} 道错题 · 持续追踪，定期回顾`}
      >
        {(!desktop || wrong.length > 0) && (
          <button
            className="primary"
            disabled={!filtered.length}
            onClick={() => start(filtered, "错题复习")}
          >
            <RotateCcw size={17} />
            开始复习
          </button>
        )}
      </Heading>
      {(!desktop || wrong.length > 0) && (
        <div className="toolbar">
          <div className="segmented">
            <button
              className={filter === "all" ? "selected" : ""}
              onClick={() => setFilter("all")}
            >
              全部错题
            </button>
            <button
              className={filter === "due" ? "selected" : ""}
              onClick={() => setFilter("due")}
            >
              今日到期
            </button>
          </div>
          <select
            aria-label="筛选章节"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
          >
            <option value="">全部章节</option>
            {[...new Set(wrong.map((q) => q.chapter))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <label className="inline-label">
            训练题量
            <select
              aria-label="训练题量"
              value={count}
              onChange={(e) => setCount(+e.target.value)}
            >
              {[3, 5, 10].map((n) => (
                <option key={n} value={n}>
                  {n} 题
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {!filtered.length ? (
        <Empty title={wrong.length ? "没有符合条件的错题" : "还没有错题记录"}>
          <p>
            {wrong.length
              ? "可以查看全部错题，或切换其他章节。"
              : "先完成一组练习，错题会自动收集，方便下次复习。"}
          </p>
          {desktop &&
            (wrong.length ? (
              <button
                onClick={() => {
                  setFilter("all");
                  setChapter("");
                }}
              >
                查看全部错题
              </button>
            ) : (
              <button className="primary" onClick={onPractice}>
                去章节练习
                <ArrowRight size={16} />
              </button>
            ))}
        </Empty>
      ) : (
        <div className="wrong-list">
          {filtered.map((q) => (
            <article className="wrong-item" key={q.id}>
              <div className="question-meta">
                <span className="badge">{q.chapter}</span>
                <span className="badge red">错误 {q.wrongCount} 次</span>
                <span>{sourceName(q)}</span>
                <span className="push-right">
                  下次复习{" "}
                  {new Date(q.review.dueAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <h3>{q.question}</h3>
              {q.type === "short_answer" ? (
                <div className="wrong-short-answer">
                  <p>上次作答：{q.lastWrong.response || "未填写"}</p>
                  <p>参考答案：{q.expectedAnswer}</p>
                </div>
              ) : (
                <p className="answer-line">
                  上次错选 <b>{q.lastWrong.selected.join("、") || "未作答"}</b>
                  <span>
                    正确答案 <strong>{q.answer.join("、")}</strong>
                  </span>
                </p>
              )}
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
                <button onClick={() => start([q], "错题复习")}>
                  <RotateCcw size={16} />
                  再做一次
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    run("正在分析错误原因", async () => {
                      await api("/ai/analyze", { questionId: q.id });
                      await refresh();
                    })
                  }
                >
                  <MessageCircle size={16} />
                  {q.mistake ? "重新分析" : "分析错因"}
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => train(q, count)}
                >
                  <Sparkles size={16} />
                  AI 针对训练
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
