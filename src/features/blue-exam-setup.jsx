import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  GraduationCap,
  History,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { ChapterArt } from "../components/chapter-art.jsx";
import { Heading } from "../components/study-ui.jsx";
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
import "./blue-exam.css";

const typeNames = {
  single_choice: "单选题",
  multiple_choice: "多选题",
  true_false: "判断题",
};
export function BlueExamSetup({
  dashboard,
  catalog,
  catalogError,
  reload,
  loading,
  loadError,
  retryLoad,
  recent,
  history,
  resume,
  create,
  creating,
}) {
  const [custom, setCustom] = useState(true),
    [selected, setSelected] = useState(new Set()),
    [chapter, setChapter] = useState(""),
    [search, setSearch] = useState("");
  const [name, setName] = useState("我的知识点模拟考试"),
    [count, setCount] = useState(20),
    [duration, setDuration] = useState("auto");
  const [types, setTypes] = useState(new Set(Object.keys(typeNames))),
    [showHistory, setShowHistory] = useState(false);
  const rows = catalog?.chapters || [],
    blueprint = !custom && dashboard.syllabus?.examBlueprint;
  const allPoints = useMemo(
    () =>
      rows.flatMap((row) =>
        (row.knowledgePoints || []).map((point) => ({
          ...point,
          chapter: row.name,
        })),
      ),
    [catalog],
  );
  const available = (point) =>
    Object.entries(point.types || {}).reduce(
      (sum, [type, total]) => sum + (types.has(type) ? total : 0),
      0,
    );
  const chosen = allPoints.filter((point) => selected.has(point.id));
  const pool = (custom ? chosen : allPoints).reduce(
    (sum, point) => sum + (blueprint ? point.questionCount : available(point)),
    0,
  );
  const requested = blueprint?.questionCount || count,
    estimate = Math.min(pool, requested);
  const toggle = (id) =>
    setSelected((old) => {
      const next = new Set(old);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const invalid =
    loading ||
    creating ||
    !catalog ||
    !!catalogError ||
    !pool ||
    (!blueprint && !types.size) ||
    (custom &&
      (!chosen.length ||
        chosen.length > count ||
        chosen.some((point) => !available(point)))) ||
    !name.trim();
  const typeTotals = Object.fromEntries(
    Object.keys(typeNames).map((type) => [
      type,
      (custom ? chosen : allPoints).reduce(
        (sum, point) => sum + (point.types[type] || 0),
        0,
      ),
    ]),
  );
  const begin = () =>
    create({
      name: name.trim(),
      count: requested,
      ...(custom ? { knowledgePointIds: [...selected].sort() } : {}),
      ...(!blueprint
        ? {
            types: [...types]
              .filter((type) =>
                allPoints.some((point) => point.types[type] > 0),
              )
              .sort(),
            ...(duration !== "auto"
              ? { durationMinutes: Number(duration) }
              : {}),
          }
        : {}),
    });
  const searchValue = search.trim().toLocaleLowerCase();
  return (
    <div className="blue-exam blue-exam-setup">
      <Heading title="模拟考试" subtitle="自由组合知识点，检验你的掌握程度。">
        <button
          aria-expanded={showHistory}
          onClick={() => setShowHistory((value) => !value)}
        >
          <History size={18} />
          考试记录
        </button>
      </Heading>
      <section className="blue-exam-hero">
        <GraduationCap size={54} />
        <div>
          <h2>按你的目标，组一份试卷</h2>
          <p>选择知识点，设置题量与时长，再开始模拟考试。</p>
        </div>
        <ol>
          {["选择知识点", "设置试卷", "开始考试"].map((text, i) => (
            <li key={text}>
              <b>{i + 1}</b>
              {text}
              {i < 2 && <ChevronRight size={17} />}
            </li>
          ))}
        </ol>
      </section>
      {loading && !recent.length && (
        <ContentPlaceholder variant="list" rows={2} />
      )}
      {loadError && (
        <div className="exam-sync-message error" role="alert">
          <span>{loadError}</span>
          <button onClick={retryLoad}>重试读取考试</button>
        </div>
      )}
      {!!recent.length && (
        <section className="exam-resume-list" aria-label="未完成的考试">
          <h2>继续上次考试</h2>
          {recent.map((item) => (
            <button key={item.id} onClick={() => resume(item)}>
              <span>
                <strong>{item.name}</strong> · {item.count} 题 · 已答{" "}
                {item.answeredCount} 题
              </span>
              <span>
                {Date.parse(item.expiresAt) > Date.now()
                  ? "继续作答"
                  : "查看考试结果"}
                <ArrowRight size={16} />
              </span>
            </button>
          ))}
        </section>
      )}
      {showHistory && (
        <section className="blue-exam-history" aria-label="考试记录">
          <h2>
            最近考试 <small>最多显示最近 20 场</small>
          </h2>
          {history.length ? (
            history.map((item) => (
              <button key={item.id} onClick={() => resume(item)}>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {new Date(item.createdAt).toLocaleString("zh-CN")} ·{" "}
                    {item.count} 题
                  </small>
                </span>
                <span>
                  {item.submitted
                    ? `${item.score} / ${item.maxScore || 100} 分`
                    : "未交卷"}
                  <ChevronRight size={17} />
                </span>
              </button>
            ))
          ) : loadError ? (
            <p>考试记录暂时不可用，请重试读取。</p>
          ) : loading ? (
            <ContentPlaceholder variant="list" rows={2} />
          ) : (
            <p>还没有考试记录，完成一场模拟后会保存在这里。</p>
          )}
        </section>
      )}
      <div className="blue-exam-setup-grid">
        <section className="exam-scope-panel">
          <div className="exam-scope-heading">
            <h2>
              <BookOpen size={23} />
              选择知识点
            </h2>
            <div className="exam-scope-modes">
              <button
                className={custom ? "active" : ""}
                aria-pressed={custom}
                onClick={() => setCustom(true)}
              >
                自选知识点
              </button>
              <button
                className={!custom ? "active" : ""}
                aria-pressed={!custom}
                onClick={() => setCustom(false)}
              >
                全范围模拟
              </button>
            </div>
          </div>
          {catalogError ? (
            <div className="alert error" role="alert">
              {catalogError}
              <button onClick={reload}>重新加载</button>
            </div>
          ) : !catalog ? (
            <ContentPlaceholder variant="list" rows={4} />
          ) : custom ? (
            <>
              <div className="blue-exam-search">
                <Search size={17} />
                <input
                  aria-label="搜索考试知识点"
                  placeholder="搜索知识点或分类"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="blue-exam-chapters" aria-label="考试章节筛选">
                <button
                  aria-pressed={!chapter}
                  className={!chapter ? "selected" : ""}
                  onClick={() => setChapter("")}
                >
                  全部章节
                </button>
                {rows.map((row) => (
                  <button
                    key={row.name}
                    aria-pressed={chapter === row.name}
                    className={chapter === row.name ? "selected" : ""}
                    onClick={() => setChapter(row.name)}
                  >
                    {row.name}
                  </button>
                ))}
              </div>
              <div className="exam-scope-caption">
                <span>
                  已选 <strong>{chosen.length}</strong> 个知识点 · {pool} 道题目
                </span>
                <button
                  onClick={() => setSelected(new Set())}
                  disabled={!selected.size}
                >
                  清空选择
                </button>
              </div>
              <div className="blue-exam-point-groups">
                {rows
                  .filter((row) => !chapter || row.name === chapter)
                  .map((row) => {
                    const visible = (row.knowledgePoints || []).filter(
                      (point) =>
                        !searchValue ||
                        [point.name, point.section, row.name]
                          .join(" ")
                          .toLocaleLowerCase()
                          .includes(searchValue),
                    );
                    if (!visible.length) return null;
                    return (
                      <section key={row.name} className="blue-exam-point-group">
                        <header>
                          {dashboard.certificate.id ===
                          "veterinary-practitioner" ? (
                            <BookOpen size={22} />
                          ) : (
                            <ChapterArt
                              certificateId={dashboard.certificate.id}
                              title={row.name}
                            />
                          )}
                          <h3>{row.name}</h3>
                          <label>
                            <input
                              type="checkbox"
                              aria-label={`全选 ${row.name}`}
                              checked={visible.every((point) =>
                                selected.has(point.id),
                              )}
                              onChange={(event) =>
                                setSelected((old) => {
                                  const next = new Set(old);
                                  visible.forEach((point) =>
                                    event.target.checked
                                      ? next.add(point.id)
                                      : next.delete(point.id),
                                  );
                                  return next;
                                })
                              }
                            />
                            全选
                          </label>
                        </header>
                        <div className="blue-exam-point-grid">
                          {visible.map((point) => (
                            <label
                              key={point.id}
                              className={
                                selected.has(point.id) ? "selected" : ""
                              }
                            >
                              <input
                                type="checkbox"
                                aria-label={`${row.name} / ${point.section} / ${point.name}`}
                                checked={selected.has(point.id)}
                                onChange={() => toggle(point.id)}
                              />
                              <span>
                                <strong>{point.name}</strong>
                                <small>
                                  {point.section && point.section !== point.name
                                    ? `${point.section} · `
                                    : ""}
                                  {available(point)} 题
                                </small>
                              </span>
                            </label>
                          ))}
                        </div>
                      </section>
                    );
                  })}
              </div>
              {!allPoints.some(
                (point) =>
                  (!chapter || point.chapter === chapter) &&
                  (!searchValue ||
                    [point.name, point.section, point.chapter]
                      .join(" ")
                      .toLocaleLowerCase()
                      .includes(searchValue)),
              ) && (
                <p className="blue-exam-empty">
                  没有匹配的知识点，请换个关键词或章节。
                </p>
              )}
              <div className="blue-exam-selected">
                <strong>已选知识点</strong>
                {chosen.length ? (
                  chosen.map((point) => (
                    <button
                      key={point.id}
                      aria-label={`移除知识点 ${point.name}`}
                      onClick={() => toggle(point.id)}
                    >
                      {point.name}
                      <X size={13} />
                    </button>
                  ))
                ) : (
                  <span>勾选上方知识点，组成你的复习试卷。</span>
                )}
              </div>
            </>
          ) : (
            <div className="blue-exam-full-scope">
              <BookOpen size={38} />
              <h3>{dashboard.certificate.shortName} · 全范围模拟</h3>
              <p>
                {blueprint
                  ? `按现有方案抽取 ${blueprint.questionCount} 道题，时长 ${blueprint.durationMinutes} 分钟。`
                  : `从当前证书客观题中抽取，覆盖 ${rows.length} 个章节。`}
              </p>
              <p>
                {dashboard.syllabus?.scopeNote ||
                  "组卷仅使用当前证书的内置客观题，不混入用户共享 AI 题。"}
              </p>
              {rows.map((row) => (
                <div key={row.name}>
                  <span>{row.name}</span>
                  <strong>{row.questionCount} 题</strong>
                </div>
              ))}
            </div>
          )}
          <p className="blue-exam-boundary">
            当前为客观题模拟，主观题、Office 实操和 C
            语言上机操作题未纳入；完整共用材料按题组保留。
          </p>
        </section>
        <aside className="blue-exam-config" aria-label="试卷设置">
          <h2>
            <Settings2 size={23} />
            试卷设置
          </h2>
          <label>
            试卷名称
            <input
              aria-label="试卷名称"
              value={name}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          {blueprint ? (
            <div className="blue-exam-fixed">
              <p>
                试题数量 <strong>{blueprint.questionCount} 题</strong>
              </p>
              <p>
                考试时长 <strong>{blueprint.durationMinutes} 分钟</strong>
              </p>
              <p>
                及格线 <strong>{blueprint.passingScore} 分</strong>
              </p>
            </div>
          ) : (
            <>
              <label>
                考试题量
                <select
                  aria-label="考试题量"
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  {[10, 20, 30, 50, ...(custom ? [75, 100] : [75])].map(
                    (value) => (
                      <option key={value} value={value}>
                        {value} 题
                      </option>
                    ),
                  )}
                </select>
              </label>
              <fieldset>
                <legend>考试时长</legend>
                <div className="blue-exam-duration">
                  {[
                    ["auto", "自动"],
                    ["30", "30 分钟"],
                    ["45", "45 分钟"],
                    ["60", "60 分钟"],
                  ].map(([value, text]) => (
                    <button
                      key={value}
                      className={duration === value ? "selected" : ""}
                      aria-pressed={duration === value}
                      onClick={() => setDuration(value)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend>题型组合</legend>
                <div className="blue-exam-types">
                  {Object.entries(typeNames)
                    .filter(([type]) =>
                      allPoints.some((point) => point.types[type] > 0),
                    )
                    .map(([type, text]) => (
                      <label key={type}>
                        <input
                          type="checkbox"
                          checked={types.has(type)}
                          onChange={() =>
                            setTypes((old) => {
                              const next = new Set(old);
                              next.has(type)
                                ? next.delete(type)
                                : next.add(type);
                              return next;
                            })
                          }
                        />
                        {text}
                      </label>
                    ))}
                </div>
              </fieldset>
            </>
          )}
          <section className="blue-exam-overview" aria-label="试卷概览">
            <h3>试卷概览</h3>
            <dl>
              <div>
                <dt>知识点</dt>
                <dd>{custom ? chosen.length : allPoints.length} 个</dd>
              </div>
              <div>
                <dt>可选题池</dt>
                <dd>{pool} 题</dd>
              </div>
              <div>
                <dt>预期题量</dt>
                <dd>{estimate} 题</dd>
              </div>
              <div>
                <dt>考试时长</dt>
                <dd>
                  {blueprint?.durationMinutes ||
                    (duration === "auto"
                      ? estimate * 2
                      : Number(duration))}{" "}
                  分钟
                </dd>
              </div>
            </dl>
          </section>
          {custom && !!chosen.length && (
            <section className="blue-exam-distribution">
              <h3>所选题池分布</h3>
              {chosen.map((point) => (
                <div key={point.id}>
                  <span>{point.name}</span>
                  <i>
                    <b
                      style={{
                        width: `${pool ? (available(point) / pool) * 100 : 0}%`,
                      }}
                    />
                  </i>
                  <small>{available(point)} 题</small>
                </div>
              ))}
            </section>
          )}
          <p className="blue-exam-type-note">
            {Object.entries(typeTotals)
              .filter(
                ([type, total]) => total && (blueprint || types.has(type)),
              )
              .map(([type, total]) => `${typeNames[type]} ${total}`)
              .join(" · ") || "请选择题型和知识点"}
          </p>
          {custom && chosen.length > count && (
            <p className="alert error">
              题量不能少于所选知识点数量，请增加题量或缩小范围。
            </p>
          )}
          {custom && chosen.some((point) => !available(point)) && (
            <p className="alert error">
              部分知识点没有所选题型，请调整题型或移除这些知识点。
            </p>
          )}
          <p className="blue-exam-config-note">
            <Clock size={15} />
            交卷后统一查看成绩与解析。题量不足或完整题组限制时，实际题量以试卷为准。
          </p>
          <button className="primary" disabled={invalid} onClick={begin}>
            {creating ? "正在组卷…" : "开始考试"}
            <ArrowRight size={18} />
          </button>
        </aside>
      </div>
    </div>
  );
}
