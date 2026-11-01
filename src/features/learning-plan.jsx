import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react";
import { api } from "../api.js";
import "./learning-plan.css";

const addDays = (date, n) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
const monday = (date) =>
  addDays(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
const dateLabel = (date) =>
  `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;
const statusLabels = {
  pending: "未开始",
  "in-progress": "进行中",
  complete: "已完成",
  canceled: "已取消",
  unavailable: "题目已调整",
};
export function LearningPlanView({ start, run, busy, certificateName }) {
  const [data, setData] = useState(null),
    [loading, setLoading] = useState(true),
    [failure, setFailure] = useState("");
  const [selected, setSelected] = useState(""),
    [week, setWeek] = useState("");
  const [mode, setMode] = useState(null),
    [form, setForm] = useState({}),
    [formError, setFormError] = useState("");
  const modal = useRef(null);
  // Keep the same operation after a lost acknowledgement; the server may already have saved it.
  const pendingRequest = useRef(null);
  const plan = data?.plan;
  async function load() {
    const next = await api("/learning-plan", undefined, undefined, {
      cache: false,
    });
    setData(next);
    setFailure("");
    setSelected((old) => old || next.today);
    setWeek((old) => old || monday(next.today));
    return next;
  }
  useEffect(() => {
    let active = true;
    api("/learning-plan", undefined, undefined, { cache: false })
      .then((next) => {
        if (active) {
          setData(next);
          setSelected(next.today);
          setWeek(monday(next.today));
        }
      })
      .catch((e) => {
        if (active) setFailure(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (mode) modal.current?.showModal();
    else modal.current?.close();
  }, [mode]);
  const openCreate = () => {
    pendingRequest.current = null;
    setForm({
      weeks: plan?.weeks || 4,
      dailyCount: plan?.dailyCount || 10,
      startDate: data.today,
    });
    setFormError("");
    setMode("create");
  };
  const openAdd = () => {
    pendingRequest.current = null;
    setForm({
      date:
        selected >= plan.startDate &&
        selected <= addDays(plan.startDate, plan.weeks * 7 - 1)
          ? selected
          : plan.startDate,
      kind: "chapter",
      chapter: data.chapters[0]?.title || "",
      count: 10,
    });
    setFormError("");
    setMode("add");
  };
  const update = (key, value) => {
    pendingRequest.current = null;
    setForm((old) => ({ ...old, [key]: value }));
  };
  const mutate = (label, operation) =>
    run(label, async () => {
      try {
        await operation();
        await load();
      } catch (e) {
        try {
          await load();
        } catch {}
        throw e;
      }
    });
  const submit = (event) => {
    event.preventDefault();
    run(mode === "create" ? "正在安排学习计划" : "正在添加任务", async () => {
      try {
        if (!pendingRequest.current)
          pendingRequest.current =
            mode === "create"
              ? {
                  url: "/learning-plan",
                  body: {
                    requestId: crypto.randomUUID(),
                    expectedPlanId: plan?.id || null,
                    revision: plan?.revision || 0,
                    ...form,
                  },
                }
              : {
                  url: "/learning-plan/tasks",
                  body: {
                    requestId: crypto.randomUUID(),
                    planId: plan.id,
                    revision: plan.revision,
                    ...form,
                  },
                };
        const { url, body } = pendingRequest.current;
        await api(url, body);
        setMode(null);
        pendingRequest.current = null;
        await load();
      } catch (e) {
        if (e.status >= 400 && e.status < 500) pendingRequest.current = null;
        setFormError(e.message);
        try {
          await load();
        } catch {}
        throw e;
      }
    });
  };
  const practice = (task) =>
    run("正在恢复计划任务", async () => {
      const session = await api(
        `/learning-plan/${plan.id}/tasks/${task.id}/session`,
        {},
      );
      start(session.questions, session.title, {
        planTask: session.planTask,
        progress: session.progress,
      });
    });
  const retry = () =>
    run("正在读取学习计划", async () => {
      setLoading(true);
      try {
        await load();
      } catch (e) {
        setFailure(e.message);
        throw e;
      } finally {
        setLoading(false);
      }
    });
  const tasks = plan?.tasks || [],
    valid = tasks.filter((t) => !t.canceled && t.count > 0);
  const weekly = week
    ? valid.filter((t) => t.date >= week && t.date <= addDays(week, 6))
    : [];
  const weeklyDone = weekly.filter((t) => t.status === "complete").length;
  const todayTasks = tasks.filter((t) => t.date === selected);
  const dayValid = todayTasks.filter((t) => !t.canceled && t.count > 0),
    dayDone = dayValid.filter((t) => t.status === "complete").length;
  const time = tasks.reduce((n, t) => n + t.timeMs, 0);
  return (
    <section className="learning-plan-view">
      <header className="lp-heading">
        <div>
          <h1>学习计划</h1>
          <p>把目标拆成每天的小进步。</p>
        </div>
        <div>
          <button
            onClick={openCreate}
            disabled={!!busy || !data?.chapters.length}
          >
            <Settings2 size={17} />
            {plan ? "调整计划" : "创建计划"}
          </button>
          {plan && (
            <button className="lp-text" onClick={openAdd} disabled={!!busy}>
              <Plus size={18} />
              添加任务
            </button>
          )}
        </div>
      </header>
      {failure && (
        <div className="lp-error" role="alert">
          <span>{failure}</span>
          <button onClick={retry} disabled={!!busy}>
            <RefreshCw size={16} />
            重新读取
          </button>
        </div>
      )}
      {loading ? (
        <p role="status">正在读取学习计划…</p>
      ) : !data ? null : !plan ? (
        <div className="lp-empty">
          <CalendarDays size={44} />
          <h2>给下一步进步，安排一个时间</h2>
          <p>
            {certificateName} · 按章节安排每天的练习，做过的任务会自动记录。
          </p>
          <button
            className="lp-primary"
            onClick={openCreate}
            disabled={!!busy || !data.chapters.length}
          >
            {data.chapters.length
              ? "建立我的学习计划"
              : "当前证书暂无可安排的客观题"}
            <ArrowRight size={17} />
          </button>
        </div>
      ) : (
        <>
          <section className="lp-banner">
            <div>
              <span className="lp-badge">我的复习计划</span>
              <h2>{plan.weeks} 周章节复习计划</h2>
              <p>{certificateName}</p>
              <small>
                每日章节练习 {plan.dailyCount} 题，错题任务按已有记录安排
              </small>
            </div>
            <div className="lp-calendar-art" aria-hidden="true">
              <div className="lp-calendar-rings">
                <i />
                <i />
                <i />
              </div>
              <div className="lp-calendar-squares">
                {Array.from({ length: 12 }, (_, i) => (
                  <span key={i} />
                ))}
              </div>
            </div>
            <div className="lp-banner-stat">
              <span>所选周已完成</span>
              <strong>
                {weeklyDone}
                <small> / {weekly.length} 项</small>
              </strong>
              <div className="lp-track">
                <i
                  style={{
                    width: weekly.length
                      ? `${(weeklyDone / weekly.length) * 100}%`
                      : "0%",
                  }}
                />
              </div>
            </div>
            <div className="lp-banner-stat">
              <span>本计划作答用时</span>
              <strong>
                {Math.floor(time / 60000)}
                <small> 分钟</small>
              </strong>
            </div>
          </section>
          <section className="lp-week">
            <header>
              <h2>本周安排</h2>
              <div>
                <button
                  aria-label="上一周"
                  onClick={() => {
                    const w = addDays(week, -7);
                    setWeek(w);
                    setSelected(w);
                  }}
                  disabled={!!busy}
                >
                  <ChevronLeft size={18} />
                </button>
                <strong>
                  {dateLabel(week)} — {dateLabel(addDays(week, 6))}
                </strong>
                <button
                  aria-label="下一周"
                  onClick={() => {
                    const w = addDays(week, 7);
                    setWeek(w);
                    setSelected(w);
                  }}
                  disabled={!!busy}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
              <button
                onClick={() => {
                  setSelected(data.today);
                  setWeek(monday(data.today));
                }}
              >
                回到今天
              </button>
            </header>
            <div className="lp-days">
              {Array.from({ length: 7 }, (_, i) => {
                const date = addDays(week, i),
                  day = valid.filter((t) => t.date === date),
                  complete =
                    day.length > 0 && day.every((t) => t.status === "complete");
                return (
                  <button
                    key={date}
                    className={date === selected ? "selected" : ""}
                    aria-pressed={date === selected}
                    onClick={() => setSelected(date)}
                  >
                    <span>
                      {
                        [
                          "周一",
                          "周二",
                          "周三",
                          "周四",
                          "周五",
                          "周六",
                          "周日",
                        ][i]
                      }
                    </span>
                    <strong>{Number(date.slice(8))}</strong>
                    <small>
                      {date === data.today
                        ? "今天"
                        : complete
                          ? "已完成"
                          : day.length
                            ? `${day.length} 项任务`
                            : "暂无任务"}
                    </small>
                  </button>
                );
              })}
            </div>
          </section>
          <div className="lp-layout">
            <section className="lp-tasks">
              <header>
                <h2>{selected === data.today ? "今日任务" : "当天任务"}</h2>
                <span>{dateLabel(selected)}</span>
                <small>
                  已完成 {dayDone} / {dayValid.length} 项
                </small>
              </header>
              {!todayTasks.length ? (
                <div className="lp-no-tasks">
                  <BookOpen size={30} />
                  <p>这一天没有安排任务。</p>
                  <button onClick={openAdd} disabled={!!busy}>
                    添加一项练习
                  </button>
                </div>
              ) : (
                todayTasks.map((task) => (
                  <article
                    key={task.id}
                    className={`lp-task ${task.status}`}
                    data-plan-task={task.id}
                  >
                    <span className="lp-task-symbol">
                      {task.status === "complete" ? (
                        <Check size={26} />
                      ) : task.kind === "wrong" ? (
                        <RefreshCw size={26} />
                      ) : (
                        <BookOpen size={26} />
                      )}
                    </span>
                    <div>
                      <h3>{task.chapter}</h3>
                      <p>
                        {task.kind === "wrong" ? "错题巩固" : "章节练习"} ·{" "}
                        {task.count} 题
                      </p>
                      <small>
                        {statusLabels[task.status]}
                        {task.answered > 0
                          ? ` · 已答 ${task.answered} / ${task.count} 题`
                          : ""}
                      </small>
                      {task.adjustedCount > 0 && (
                        <p>
                          有 {task.adjustedCount} 题已调整，按当前可练题目完成。
                        </p>
                      )}
                      {task.answered > 0 && (
                        <div className="lp-track">
                          <i
                            style={{
                              width: `${(task.answered / task.count) * 100}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="lp-task-actions">
                      {!task.canceled && task.count > 0 && (
                        <button
                          className={
                            task.status === "complete" ? "" : "lp-primary"
                          }
                          onClick={() => practice(task)}
                          disabled={!!busy}
                        >
                          {task.status === "complete"
                            ? "回顾本次作答"
                            : task.status === "in-progress"
                              ? "继续练习"
                              : "开始练习"}
                          <ArrowRight size={16} />
                        </button>
                      )}
                      <button
                        className="lp-text"
                        onClick={() =>
                          mutate(
                            task.canceled ? "正在恢复任务" : "正在取消任务",
                            () =>
                              api(
                                `/learning-plan/${plan.id}/tasks/${task.id}`,
                                {
                                  revision: plan.revision,
                                  canceled: !task.canceled,
                                },
                                "PUT",
                              ),
                          )
                        }
                        disabled={!!busy}
                      >
                        {task.canceled ? "恢复任务" : "取消任务"}
                      </button>
                    </div>
                  </article>
                ))
              )}
              <footer>
                <Clock size={17} />
                <span>按自己的节奏完成，作答后进度自动保存。</span>
              </footer>
            </section>
            <aside className="lp-route">
              <h2>
                <BookOpen size={23} />
                复习路线
              </h2>
              {Array.from({ length: plan.weeks }, (_, i) => {
                const date = addDays(plan.startDate, i * 7),
                  weekTasks = valid.filter(
                    (t) => t.date >= date && t.date <= addDays(date, 6),
                  ),
                  done =
                    weekTasks.length > 0 &&
                    weekTasks.every((t) => t.status === "complete");
                return (
                  <button
                    key={i}
                    onClick={() => {
                      setSelected(date);
                      setWeek(monday(date));
                    }}
                  >
                    <span className={done ? "done" : ""}>
                      {done ? <Check size={16} /> : i + 1}
                    </span>
                    <div>
                      <strong>第 {i + 1} 周</strong>
                      <small>
                        {dateLabel(date)} — {dateLabel(addDays(date, 6))}
                      </small>
                      <p>
                        {done
                          ? "已完成"
                          : `${weekTasks.filter((t) => t.status === "complete").length} / ${weekTasks.length} 项完成`}
                      </p>
                    </div>
                    <ChevronRight size={15} />
                  </button>
                );
              })}
              <p className="lp-note">
                开始：{dateLabel(plan.startDate)}
                <br />
                结束：{dateLabel(addDays(plan.startDate, plan.weeks * 7 - 1))}
              </p>
            </aside>
          </div>
        </>
      )}
      <dialog
        ref={modal}
        className="lp-dialog"
        aria-labelledby="lp-dialog-title"
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setMode(null);
        }}
      >
        <form onSubmit={submit}>
          <header>
            <h2 id="lp-dialog-title">
              {mode === "add"
                ? "添加学习任务"
                : plan
                  ? "调整复习计划"
                  : "建立复习计划"}
            </h2>
            <button
              type="button"
              aria-label="关闭"
              onClick={() => setMode(null)}
              disabled={!!busy}
            >
              <X size={19} />
            </button>
          </header>
          {mode === "create" ? (
            <>
              <label>
                开始日期
                <input
                  aria-label="开始日期"
                  type="date"
                  required
                  value={form.startDate || ""}
                  onChange={(e) => update("startDate", e.target.value)}
                  disabled={!!busy}
                />
              </label>
              <label>
                计划周期
                <select
                  aria-label="计划周期"
                  value={form.weeks || 4}
                  onChange={(e) => update("weeks", Number(e.target.value))}
                  disabled={!!busy}
                >
                  {[1, 2, 4, 6, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} 周
                    </option>
                  ))}
                </select>
              </label>
              <label>
                每日章节题量
                <select
                  aria-label="每日章节题量"
                  value={form.dailyCount || 10}
                  onChange={(e) => update("dailyCount", Number(e.target.value))}
                  disabled={!!busy}
                >
                  {[10, 20, 30].map((n) => (
                    <option key={n} value={n}>
                      {n} 题
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {plan
                  ? "调整后开启一轮新计划，原有任务和作答记录会保留。"
                  : "按现有章节安排每天的练习，实际题量取决于章节题库。"}
              </p>
            </>
          ) : (
            <>
              <label>
                任务日期
                <input
                  aria-label="任务日期"
                  type="date"
                  min={plan?.startDate}
                  max={
                    plan
                      ? addDays(plan.startDate, plan.weeks * 7 - 1)
                      : undefined
                  }
                  required
                  value={form.date || ""}
                  onChange={(e) => update("date", e.target.value)}
                  disabled={!!busy}
                />
              </label>
              <label>
                练习内容
                <select
                  aria-label="练习内容"
                  value={form.kind || "chapter"}
                  onChange={(e) => update("kind", e.target.value)}
                  disabled={!!busy}
                >
                  <option value="chapter">章节练习</option>
                  <option value="wrong">错题巩固</option>
                </select>
              </label>
              {form.kind !== "wrong" && (
                <label>
                  选择章节
                  <select
                    aria-label="选择章节"
                    value={form.chapter || ""}
                    onChange={(e) => update("chapter", e.target.value)}
                    disabled={!!busy}
                  >
                    {data?.chapters.map((c) => (
                      <option value={c.title} key={c.title}>
                        {c.title} · {c.count} 题
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label>
                本次题量
                <input
                  aria-label="本次题量"
                  type="number"
                  min="1"
                  max="50"
                  required
                  value={form.count || ""}
                  onChange={(e) => update("count", Number(e.target.value))}
                  disabled={!!busy}
                />
              </label>
            </>
          )}
          {formError && (
            <p className="lp-form-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="lp-primary" disabled={!!busy}>
            {busy ? "正在保存…" : "保存安排"}
            <Check size={17} />
          </button>
        </form>
      </dialog>
    </section>
  );
}
