import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Globe2,
  LoaderCircle,
  RefreshCw,
  Share2,
  ThumbsUp,
  Users,
} from "lucide-react";
import { diff } from "../question-utils.js";
import { Empty, Heading } from "../components/study-ui.jsx";

export function CommunityView({ questions, loading, stats, reload, start }) {
  const [chapter, setChapter] = useState(""),
    [sort, setSort] = useState("latest");
  const chapters = [...new Set(questions.map((q) => q.chapter))].sort();
  const filtered = questions
    .filter((q) => !chapter || q.chapter === chapter)
    .sort((a, b) => {
      if (sort === "helpful")
        return (b.feedback?.helpful || 0) - (a.feedback?.helpful || 0);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return (
    <>
      <Heading
        title="共享 AI 题库"
        subtitle="用户共同贡献的变式题，练习记录彼此独立"
      >
        <button onClick={reload} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          刷新题库
        </button>
      </Heading>
      <div className="stats community-stats">
        {[
          ["共享题目", stats?.sharedQuestionCount || 0, "题", Globe2],
          ["贡献用户", stats?.contributorCount || 0, "人", Users],
          ["累计练习", stats?.attemptCount || 0, "次", BookOpen],
          ["我的贡献", stats?.myQuestionCount || 0, "题", Share2],
        ].map(([label, value, unit, Icon]) => (
          <div className="stat" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
            <span className="stat-note">
              {label === "我的贡献"
                ? "审核通过后可被同证书用户练习"
                : "同证书范围"}
            </span>
          </div>
        ))}
      </div>
      <div className="community-notice">
        <Share2 size={19} />
        <div>
          <strong>一起把题库做大，也把题目做稳</strong>
          <p>
            AI
            题经过服务端校验和独立审核才会进入共享列表。练习后可以反馈答案错误、表述不清或题目重复，帮助后续整理题库。
          </p>
        </div>
      </div>
      <div className="toolbar community-toolbar">
        <label className="inline-label">
          章节
          <select
            value={chapter}
            onChange={(event) => setChapter(event.target.value)}
          >
            <option value="">全部章节</option>
            {chapters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="inline-label">
          排序
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="latest">最新生成</option>
            <option value="helpful">最多有帮助反馈</option>
          </select>
        </label>
        <span className="muted">{filtered.length} 道可练习</span>
      </div>
      {loading ? (
        <div className="alert working">
          <LoaderCircle size={18} className="spin" />
          <span>正在读取共享题库</span>
        </div>
      ) : filtered.length ? (
        <div className="community-list">
          {filtered.map((q) => (
            <article className="community-card" key={q.id}>
              <div className="question-meta">
                <span className="badge green">AI 生成</span>
                <span className="badge">{q.chapter}</span>
                <span>{diff[q.difficulty] || "练习"}</span>
                <span className="push-right feedback-count">
                  <ThumbsUp size={14} /> {q.feedback?.helpful || 0}
                </span>
              </div>
              <h3>{q.question}</h3>
              <p className="community-topic">{q.knowledgePoint}</p>
              <button
                className="primary"
                onClick={() => start([q], "共享 AI 练习")}
              >
                开始练习
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Globe2} title="共享题库还在增长中">
          <p>先从错题本生成一组 AI 训练题，审核通过后就能贡献给同证书用户。</p>
        </Empty>
      )}
    </>
  );
}
