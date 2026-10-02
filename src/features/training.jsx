import { useState } from "react";
import {
  ArrowRight,
  ChevronRight,
  PlugZap,
  Share2,
  Sparkles,
  Target,
} from "lucide-react";
import { Empty } from "../components/study-ui.jsx";
import React from "react";

export function TrainingView({
  questions,
  wrong,
  weak,
  queue,
  groups,
  onShareChange,
  train,
  start,
  busy,
  configured,
  settings,
}) {
  const [topic, setTopic] = useState(weak[0]?.knowledgePoint || ""),
    [count, setCount] = useState(5);
  const q =
    wrong.find((q) => q.knowledgePoint === topic) ||
    questions.find((q) => q.knowledgePoint === topic);
  return (
    <>
      {!configured && (
        <div className="alert">
          <PlugZap size={18} />
          <span>
            作者 AI 服务暂未就绪，无需配置个人 API，请联系站点管理员。
          </span>
          <button onClick={settings}>
            查看 AI 额度
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <section className="training-form">
        <h2>
          <Target size={21} />
          创建专项训练
        </h2>
        <div className="training-controls">
          <label>
            知识点
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {weak.map((m) => (
                <option key={m.knowledgePoint}>{m.knowledgePoint}</option>
              ))}
            </select>
          </label>
          <label>
            题目数量
            <div className="segmented">
              {[3, 5, 10].map((n) => (
                <button
                  className={count === n ? "selected" : ""}
                  key={n}
                  onClick={() => setCount(n)}
                >
                  {n} 题
                </button>
              ))}
            </div>
          </label>
          <button
            className="primary"
            disabled={!!busy || !configured || !q}
            onClick={() => train(q, count)}
          >
            <Sparkles size={17} />
            生成训练
          </button>
        </div>
        <div className="stage-track">
          {["基础理解", "直接计算", "变式计算", "反向推理", "综合应用"].map(
            (s, i) => (
              <React.Fragment key={s}>
                <span>
                  <b>{i + 1}</b>
                  {s}
                </span>
                {i < 4 && <ChevronRight size={16} />}
              </React.Fragment>
            ),
          )}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>待完成训练</h2>
          <span className="muted">{queue.length} 题</span>
        </div>
        {queue.length ? (
          <div className="chapter-grid">
            {[
              ...new Set(
                queue.map((q) => q.targetKnowledgePoint || q.knowledgePoint),
              ),
            ].map((t) => (
              <button
                className="chapter-item"
                key={t}
                onClick={() =>
                  start(
                    queue.filter(
                      (q) => (q.targetKnowledgePoint || q.knowledgePoint) === t,
                    ),
                    "AI 专项训练",
                  )
                }
              >
                <Sparkles size={24} />
                <div className="chapter-info">
                  <strong>{t}</strong>
                  <small>
                    {
                      queue.filter(
                        (q) =>
                          (q.targetKnowledgePoint || q.knowledgePoint) === t,
                      ).length
                    }{" "}
                    题待完成
                  </small>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Sparkles} title="暂无待完成的训练" />
        )}
      </section>
      <section className="ai-groups-section">
        <div className="section-heading">
          <div>
            <h2>
              <Share2 size={20} />
              我的 AI 题组
            </h2>
            <p className="muted">
              共享后，同证书用户可以练习题目，但看不到你的账号和学习记录。
            </p>
          </div>
          <span className="muted">{groups?.length || 0} 组</span>
        </div>
        {groups?.length ? (
          <div className="ai-group-list">
            {groups.map((group) => (
              <article className="ai-group-card" key={group.id}>
                <div>
                  <span className="badge green">AI 生成</span>
                  <strong>{group.topic}</strong>
                  <small>
                    {group.questionCount} 题 · 已完成 {group.completedCount} 题
                    · {new Date(group.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </div>
                <label className="shared-ai-toggle">
                  <input
                    type="checkbox"
                    checked={group.shared}
                    disabled={!!busy}
                    onChange={(event) =>
                      onShareChange?.(group.id, event.target.checked)
                    }
                  />
                  <span>{group.shared ? "已共享" : "仅自己使用"}</span>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Share2} title="还没有 AI 题组">
            <p>在错题本中分析错因后，可以生成第一组针对性训练。</p>
          </Empty>
        )}
      </section>
    </>
  );
}
