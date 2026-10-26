import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Users,
  Activity,
  Sparkles,
  Files,
  Flag,
  ListTodo,
  Plus,
  RefreshCw,
} from "lucide-react";
import {
  Panel,
  Resource,
  useResource,
  useAdmin,
  number,
  date,
  Status,
} from "./shared.jsx";
export function Overview() {
  const { params, setParams, go } = useAdmin(),
    days = params.get("days") || "7",
    resource = useResource("/overview?days=" + days);
  return (
    <Resource resource={resource}>
      {(data) => (
        <>
          <div className="ac-overview-banner">
            <div>
              <span className="ac-eyebrow">今天，从这里开始</span>
              <h2>让每一次管理，都更有条理。</h2>
              <p>内容审核、用户服务和任务动态，一处掌握。</p>
              <button className="ac-primary" onClick={() => go("documents")}>
                处理内容草稿
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="ac-banner-art" aria-hidden="true">
              <div />
              <div />
              <div />
              <BookOpen size={57} />
              <span>
                <ShieldMark />
              </span>
            </div>
          </div>
          <div className="ac-section-toolbar">
            <div>
              <h2>运营概览</h2>
              <span className="ac-muted">更新于 {date(data.updatedAt)}</span>
            </div>
            <div className="ac-inline">
              <div className="ac-segment">
                {["7", "30"].map((n) => (
                  <button
                    className={days === n ? "active" : ""}
                    key={n}
                    onClick={() => setParams({ days: n })}
                  >
                    近 {n} 天
                  </button>
                ))}
              </div>
              <button aria-label="刷新概览" onClick={resource.reload}>
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
          <div className="ac-metrics">
            {[
              [
                "新增用户",
                data.stats.newUsers,
                Users,
                `累计 ${number(data.stats.users)} 个账号`,
              ],
              [
                "活跃学习人数",
                data.stats.activeLearners,
                Activity,
                "以实际答题记录计算",
              ],
              [
                "练习作答",
                data.stats.attempts,
                BookOpen,
                `答对 ${number(data.stats.correct)} 题`,
              ],
              [
                "AI 调用",
                data.usage.calls,
                Sparkles,
                `${number(data.usage.tokens)} Token`,
              ],
            ].map(([label, value, Icon, note]) => (
              <section key={label}>
                <div>
                  <span>{label}</span>
                  <Icon size={19} />
                </div>
                <strong>{number(value)}</strong>
                <small>{note}</small>
              </section>
            ))}
          </div>
          <div className="ac-overview-grid">
            <Panel title="学习动态" description="按北京时间统计实际练习作答">
              <div
                className="ac-chart"
                role="img"
                aria-label={data.trend
                  .map((p) => `${p.date}：${p.attempts} 次作答`)
                  .join("；")}
              >
                {data.trend.map((p, i) => (
                  <div key={p.date} title={`${p.date}：${p.attempts} 次作答`}>
                    <span
                      style={{
                        height:
                          Math.max(
                            2,
                            (p.attempts /
                              Math.max(
                                1,
                                ...data.trend.map((p) => p.attempts),
                              )) *
                              150,
                          ) + "px",
                      }}
                    />
                    <small>
                      {days === "7" || i % 5 === 0 ? p.date.slice(5) : ""}
                    </small>
                  </div>
                ))}
              </div>
              <details className="ac-chart-data">
                <summary>查看每日数据</summary>
                {data.trend.map((p) => (
                  <p key={p.date}>
                    {p.date} · {p.attempts} 次作答 · {p.active} 人
                  </p>
                ))}
              </details>
            </Panel>
            <Panel title="需要关注" description="点击一项，直接进入处理页面">
              <div className="ac-todos">
                {[
                  ["待处理反馈", data.pending.feedback, Flag, "feedback"],
                  ["未导出草稿", data.pending.drafts, Files, "documents"],
                  ["失败或中断任务", data.pending.failedJobs, ListTodo, "jobs"],
                ].map(([label, count, Icon, path]) => (
                  <button key={path} onClick={() => go(path)}>
                    <span>
                      <Icon size={19} />
                      {label}
                    </span>
                    <strong>{number(count)}</strong>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
              <div className="ac-config-note">
                <span
                  className={
                    "ac-dot " + (data.config.configured ? "" : "muted")
                  }
                />
                <span>
                  AI 服务{data.config.configured ? "已配置" : "尚未配置"}
                </span>
                <button onClick={() => go("config")}>
                  查看配置
                  <ArrowRight size={14} />
                </button>
              </div>
            </Panel>
          </div>
          <div className="ac-overview-grid">
            <Panel
              title="内容资产"
              actions={
                <button className="ac-link" onClick={() => go("catalog")}>
                  查看目录
                  <ArrowRight size={14} />
                </button>
              }
            >
              <div className="ac-asset-total">
                <strong>{number(data.stats.questions)}</strong>
                <span>当前可用题目</span>
                <BookOpen size={30} />
              </div>
              <div className="ac-sources">
                {Object.entries(data.stats.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([key, count]) => (
                    <div key={key}>
                      <span title={key}>{data.sourceNames?.[key] || key}</span>
                      <i>
                        <b
                          style={{
                            width:
                              (count / Math.max(1, data.stats.questions)) *
                                100 +
                              "%",
                          }}
                        />
                      </i>
                      <strong>{number(count)}</strong>
                    </div>
                  ))}
              </div>
            </Panel>
            <Panel
              title="近期操作"
              actions={
                <button className="ac-link" onClick={() => go("audit")}>
                  完整审计
                  <ArrowRight size={14} />
                </button>
              }
            >
              <div className="ac-timeline">
                {data.recentAudit.length ? (
                  data.recentAudit.slice(0, 5).map((a) => (
                    <article key={a.id}>
                      <span />
                      <div>
                        <strong>{a.adminUsername || "管理员"}</strong>
                        <p>{a.action}</p>
                        <small>{date(a.createdAt)}</small>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="ac-muted">当前还没有管理操作记录。</p>
                )}
              </div>
            </Panel>
          </div>
        </>
      )}
    </Resource>
  );
}
function ShieldMark() {
  return <span>✓</span>;
}
