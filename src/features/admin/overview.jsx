import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Files,
  Flag,
  ListTodo,
  RefreshCw,
  Sparkles,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  date,
  Empty,
  number,
  Pagination,
  Panel,
  Resource,
  useAdmin,
  useResource,
} from "./shared.jsx";

export function Overview() {
  const { params, setParams, go } = useAdmin();
  const days = params.get("days") === "30" ? "30" : "7";
  const sort = params.get("sort") === "period" ? "period" : "total";
  const offset = params.get("offset") || "0";
  const [metric, setMetric] = useState("attempts");
  const overview = useResource("/overview?days=" + days);
  const ranking = useResource(
    "/overview/practice-ranking?" + new URLSearchParams({ days, sort, offset }),
  );

  return (
    <Resource resource={overview}>
      {(data) => (
        <div className="ac-overview">
          <div className="ac-section-toolbar">
            <div className="ac-inline">
              <div className="ac-segment" role="group" aria-label="统计时段">
                {["7", "30"].map((n) => (
                  <button
                    className={days === n ? "active" : ""}
                    aria-pressed={days === n}
                    key={n}
                    onClick={() => setParams({ days: n })}
                  >
                    近 {n} 天
                  </button>
                ))}
              </div>
              <span className="ac-muted">更新于 {date(data.updatedAt)}</span>
            </div>
            <div className="ac-inline">
              <button onClick={() => go("documents")}>
                <Files size={15} /> 导入内容草稿
              </button>
              <button
                aria-label="刷新总览"
                onClick={() => {
                  overview.reload();
                  ranking.reload();
                }}
              >
                <RefreshCw size={15} />
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
                "活跃答题用户",
                data.stats.activeLearners,
                Activity,
                "至少作答一次",
              ],
              [
                "答题次数",
                data.stats.attempts,
                BookOpen,
                `答对 ${number(data.stats.correct)} 次`,
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
                  <Icon size={17} aria-hidden="true" />
                </div>
                <strong>{number(value)}</strong>
                <small>{note}</small>
              </section>
            ))}
          </div>
          <div className="ac-overview-grid">
            <PracticeRanking days={days} sort={sort} resource={ranking} />
            <PracticeTrend
              trend={data.trend}
              metric={metric}
              setMetric={setMetric}
            />
          </div>
          <div className="ac-overview-grid ac-overview-secondary">
            <Panel title="需要关注">
              <div className="ac-todos">
                {[
                  ["待处理题目反馈", data.pending.feedback, Flag, "feedback"],
                  ["未导出草稿", data.pending.drafts, Files, "documents"],
                  ["失败或中断任务", data.pending.failedJobs, ListTodo, "jobs"],
                ].map(([label, count, Icon, path]) => (
                  <button key={path} onClick={() => go(path)}>
                    <span>
                      <Icon size={16} aria-hidden="true" />
                      {label}
                    </span>
                    <strong>{number(count)}</strong>
                    <ArrowUpRight size={15} aria-hidden="true" />
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
                  查看配置 <ArrowRight size={14} />
                </button>
              </div>
            </Panel>
            <Panel
              title="内容资产"
              actions={
                <button className="ac-link" onClick={() => go("catalog")}>
                  查看目录 <ArrowRight size={14} />
                </button>
              }
            >
              <div className="ac-asset-total">
                <strong>{number(data.stats.questions)}</strong>
                <span>道可见题目</span>
              </div>
              <div className="ac-sources">
                {Object.entries(data.stats.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([key, count]) => {
                    const label = data.sourceNames?.[key] || key;
                    return (
                      <div key={key}>
                        <span title={label}>{label}</span>
                        <i aria-hidden="true">
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
                    );
                  })}
              </div>
            </Panel>
            <Panel
              title="近期操作"
              actions={
                <button className="ac-link" onClick={() => go("audit")}>
                  查看审计 <ArrowRight size={14} />
                </button>
              }
            >
              <div className="ac-timeline">
                {data.recentAudit.length ? (
                  data.recentAudit.slice(0, 5).map((a) => (
                    <article key={a.id}>
                      <div>
                        <strong>{a.adminUsername || "管理员"}</strong>
                        <p>{a.action}</p>
                      </div>
                      <small>{date(a.createdAt)}</small>
                    </article>
                  ))
                ) : (
                  <p className="ac-muted">暂无管理员操作记录</p>
                )}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </Resource>
  );
}

function PracticeRanking({ days, sort, resource }) {
  const { go, setParams } = useAdmin();
  return (
    <Panel
      title="用户刷题排行"
      description="同一题重复作答按次数计"
      className="ac-practice-ranking"
      actions={
        <button className="ac-link" onClick={() => go("users")}>
          用户管理 <ArrowRight size={14} />
        </button>
      }
    >
      <Resource resource={resource}>
        {({ rows, total, offset, limit }) => (
          <>
            {rows.length ? (
              <div className="ac-table-scroll">
                <table
                  className="ac-table ac-ranking-table"
                  aria-label="用户刷题排行"
                >
                  <thead>
                    <tr>
                      <th scope="col">排名</th>
                      <th scope="col">用户</th>
                      {[
                        ["total", "累计答题"],
                        ["period", `近 ${days} 天`],
                      ].map(([value, label]) => (
                        <th
                          key={value}
                          scope="col"
                          aria-sort={sort === value ? "descending" : undefined}
                        >
                          <button onClick={() => setParams({ sort: value })}>
                            {label}
                            {sort === value && (
                              <ArrowDown size={12} aria-hidden="true" />
                            )}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const name = row.communityName || row.username;
                      return (
                        <tr key={row.id}>
                          <td>{offset + i + 1}</td>
                          <th scope="row">
                            <span title={name}>{name}</span>
                            {name !== row.username && (
                              <small title={row.username}>{row.username}</small>
                            )}
                          </th>
                          <td
                            className={
                              sort === "total" ? "is-sorted" : undefined
                            }
                          >
                            {number(row.totalAttempts)}
                          </td>
                          <td
                            className={
                              sort === "period" ? "is-sorted" : undefined
                            }
                          >
                            {number(row.periodAttempts)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{total ? "本页暂无用户" : "暂无注册用户"}</Empty>
            )}
            <Pagination
              total={total}
              limit={limit}
              offset={offset}
              onChange={(offset) => setParams({ offset })}
            />
          </>
        )}
      </Resource>
    </Panel>
  );
}

function PracticeTrend({ trend, metric, setMetric }) {
  const label = metric === "attempts" ? "答题次数" : "活跃答题人数";
  const peak = Math.max(...trend.map((point) => point[metric]));
  const step = Math.max(1, Math.ceil(peak / 3));
  const max = 3 * step;
  return (
    <Panel
      title="每日学习趋势"
      className="ac-practice-trend"
      actions={
        <div className="ac-segment" role="group" aria-label="趋势指标">
          {[
            ["attempts", "答题次数"],
            ["active", "活跃人数"],
          ].map(([value, text]) => (
            <button
              key={value}
              aria-pressed={metric === value}
              className={metric === value ? "active" : ""}
              onClick={() => setMetric(value)}
            >
              {text}
            </button>
          ))}
        </div>
      }
    >
      <div className="ac-chart" role="img" aria-label={`每日${label}柱状图`}>
        <div className="ac-chart-scale" aria-hidden="true">
          {[max, 2 * step, step, 0].map((value) => (
            <span key={value}>{number(value)}</span>
          ))}
        </div>
        <div className="ac-chart-columns">
          {trend.map((point, i) => (
            <div
              key={point.date}
              title={`${point.date} · ${label} ${number(point[metric])}`}
            >
              <div className="ac-chart-track">
                <span style={{ height: (point[metric] / max) * 100 + "%" }} />
              </div>
              <small>
                {trend.length === 7 ||
                i === trend.length - 1 ||
                (i % 7 === 0 && i < trend.length - 4)
                  ? point.date.slice(5)
                  : ""}
              </small>
            </div>
          ))}
        </div>
      </div>
      <details className="ac-chart-data">
        <summary>查看每日数值</summary>
        {trend.map((point) => (
          <p key={point.date}>
            {point.date} · 答题 {number(point.attempts)} 次 ·{" "}
            {number(point.active)} 人
          </p>
        ))}
      </details>
    </Panel>
  );
}
