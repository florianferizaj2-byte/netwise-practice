import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  GraduationCap,
  NotebookPen,
  Search,
  Settings2,
  Sparkles,
  Star,
} from "lucide-react";
import { ChapterArt, chapterVisualFor } from "../components/chapter-art.jsx";
import {
  chapterGroups,
  practicePool,
  practicePreferenceKey,
  readPracticePreferences,
  hasPracticePreferences,
} from "../blue-practice.js";
import "./blue-workspace.css";

const percent = (n, total) => (total ? Math.min(100, (n / total) * 100) : 0);
function Progress({ answered, total }) {
  return (
    <span
      className="blue-progress"
      role="progressbar"
      aria-label="已练题目比例"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent(answered, total))}
    >
      <i style={{ width: percent(answered, total) + "%" }} />
    </span>
  );
}
function SourceNotice({ dashboard }) {
  return (
    <details className="blue-source-note">
      <summary>
        <BookOpen size={17} />
        题库范围与来源
        <ChevronDown size={16} />
      </summary>
      <div>
        {dashboard.syllabus && (
          <>
            <strong>{dashboard.syllabus.version}</strong>
            <p>{dashboard.syllabus.scopeNote}</p>
            <p>
              本站题库覆盖 {dashboard.syllabus.coveredModules} /{" "}
              {dashboard.syllabus.modules.length} 个模块；当前已收录{" "}
              {dashboard.syllabus.questionCount} 道题。
            </p>
            <div className="blue-source-links">
              {dashboard.syllabus.sourceUrls?.map((s) => (
                <a href={s.url} key={s.url} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
              ))}
            </div>
          </>
        )}
        {dashboard.banks?.map((b) => (
          <p key={b.id}>{b.name}</p>
        ))}
        <p>每道题保留具体来源。未收录的章节会显示暂无题库。</p>
      </div>
    </details>
  );
}
function ChapterCard({ chapter, certificateId, onSelect, selected }) {
  const visual = chapterVisualFor(certificateId, chapter.name);
  return (
    <button
      className={`blue-chapter-card blue-art-trigger tone-${visual?.kind === "office" ? "peach" : visual?.kind === "code" ? "purple" : ["security", "identity", "vlan", "network"].includes(visual?.kind) ? "mint" : "blue"} ${selected ? "selected" : ""}`}
      data-blue-chapter={chapter.name}
      onClick={() => onSelect(chapter.name)}
      aria-pressed={selected}
    >
      <ChapterArt certificateId={certificateId} title={chapter.name} />
      <span className="blue-chapter-copy">
        <strong>{chapter.name}</strong>
        <small>
          {visual?.topics.slice(0, 2).join(" · ") ||
            `${chapter.sections?.length || 0} 个知识分类`}
        </small>
        <span>
          {chapter.total ? (
            <>
              已练 <b>{chapter.attempted}</b> / {chapter.total} 题
            </>
          ) : (
            "章节内容准备中"
          )}
        </span>
        <Progress answered={chapter.attempted} total={chapter.total} />
      </span>
      {selected && <Check className="blue-selected-check" size={18} />}
      <ChevronRight className="blue-card-arrow" size={17} />
    </button>
  );
}

export function BlueStudyHome({
  dashboard,
  allQuestions,
  go,
  start,
  openChapter,
  weak,
  practicePoint,
  onPlan,
  trainTask,
  busy,
  savedPractice,
  resumePractice,
  favoriteCount,
  openFavorites,
}) {
  const certificateId = dashboard.certificate.id;
  const groups = useMemo(
    () => chapterGroups(dashboard, allQuestions),
    [dashboard, allQuestions],
  );
  const availableIds = new Set(allQuestions.map((q) => q.id));
  const saved = savedPractice?.questionIds.some((id) => availableIds.has(id))
    ? savedPractice
    : null;
  const savedQuestion =
    saved && allQuestions.find((q) => q.id === saved.questionIds[saved.index]);
  const next =
    groups.find(
      (c) =>
        c.name === (savedQuestion?.chapter || dashboard.lastPractice?.chapter),
    ) ||
    groups.find((c) => c.total) ||
    groups[0];
  const nextPool = practicePool(next?.questions || [], {
    range: next?.questions.some((q) => !q.attempted) ? "unattempted" : "all",
  });
  const displayed = [...groups]
    .sort(
      (a, b) => Number(b.name === next?.name) - Number(a.name === next?.name),
    )
    .slice(0, 4);
  const attempted = groups.reduce((n, c) => n + c.attempted, 0),
    total = groups.reduce((n, c) => n + c.total, 0);
  const weakPoints = weak
    .filter((p) => p.attemptCount && p.masteryScore < 80)
    .slice(0, 3);
  return (
    <section className="blue-study-view blue-home">
      <header className="blue-page-heading">
        <div>
          <h1>
            {dashboard.todayCount || saved || attempted
              ? "接着学，再进一步"
              : "从第一组练习开始"}
          </h1>
          <p>{dashboard.certificate.shortName} · 我的学习空间</p>
        </div>
        <span>
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </header>
      <div className="blue-home-priorities">
        <section className="blue-home-next blue-art-trigger">
          <div>
            <span className="blue-eyebrow">
              {saved
                ? "上次练到这里"
                : dashboard.lastPractice
                  ? "继续学习这一章"
                  : "今日练习"}
            </span>
            <h2>{saved ? saved.title : next?.name || "选择一个备考目标"}</h2>
            <p>
              {saved
                ? `第 ${saved.index + 1} / ${saved.questionIds.length} 题 · 此浏览器已保存进度`
                : next?.total
                  ? `已练 ${next.attempted} / ${next.total} 题，每次练一点，把基础学扎实。`
                  : "当前证书暂无可练习题目，试试其他备考目标。"}
            </p>
            <button
              className="blue-primary"
              disabled={!!busy || (!saved && !nextPool.length)}
              onClick={
                saved ? resumePractice : () => start(nextPool, next.name)
              }
            >
              {saved ? "继续上次练习" : `开始 ${nextPool.length} 题练习`}
              <ArrowRight size={18} />
            </button>
          </div>
          <ChapterArt
            certificateId={certificateId}
            title={savedQuestion?.chapter || next?.name}
            size="large"
          />
        </section>
        <section className="blue-home-review">
          <NotebookPen size={23} />
          <span>今日待复习</span>
          <strong>
            {dashboard.dueCount}
            <small> 道题</small>
          </strong>
          <p>
            {dashboard.wrongCount
              ? `错题本中有 ${dashboard.wrongCount} 道题，按自己的节奏巩固。`
              : "错题会自动收集，下次练习更有方向。"}
          </p>
          <button onClick={() => go("wrong")}>
            查看错题本
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <div className="blue-home-stats" aria-label="学习统计">
        <span>
          今日作答 <strong>{dashboard.todayCount}</strong> 题
        </span>
        <span>
          累计正确率{" "}
          <strong>
            {dashboard.accuracy == null
              ? "—"
              : Math.round(dashboard.accuracy * 100) + "%"}
          </strong>
        </span>
        <span>
          连续学习 <strong>{dashboard.streakDays || 0}</strong> 天
        </span>
        <button className="blue-text" onClick={() => go("mastery")}>
          查看学习分析
          <ArrowRight size={15} />
        </button>
      </div>
      <section>
        <header className="blue-section-heading">
          <div>
            <h2>章节进度</h2>
            <p>
              已练 {attempted} / {total} 道题
            </p>
          </div>
          <button className="blue-text" onClick={() => go("chapters")}>
            全部章节
            <ChevronRight size={17} />
          </button>
        </header>
        <div className="blue-home-chapters">
          {displayed.map((c) => (
            <ChapterCard
              key={c.name}
              chapter={c}
              certificateId={certificateId}
              onSelect={openChapter}
            />
          ))}
        </div>
      </section>
      <div className="blue-home-links">
        {[
          [
            GraduationCap,
            "模拟考试",
            "用一次计时测试检验学习成果",
            () => go("exam"),
          ],
          [
            Star,
            "我的收藏",
            favoriteCount
              ? `回顾标记过的 ${favoriteCount} 道题`
              : "把值得回看的内容，留在这里。",
            openFavorites,
          ],
          [
            CalendarDays,
            "学习计划",
            "把目标拆成每天的小进步。",
            () => go("plan"),
          ],
          [
            Sparkles,
            "AI 精讲与练习",
            "一次学透一个知识点。",
            () => go("study"),
          ],
        ].map(([Icon, title, note, action]) => (
          <button key={title} onClick={action}>
            <Icon size={24} />
            <span>
              <strong>{title}</strong>
              <small>{note}</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
      <details className="blue-home-more">
        <summary>
          <Sparkles size={18} />
          针对薄弱点继续练
          <ChevronDown size={17} />
        </summary>
        <div>
          <section>
            <h2>薄弱知识点</h2>
            {weakPoints.length ? (
              weakPoints.map((p) => (
                <button
                  key={p.knowledgePoint}
                  onClick={() => practicePoint(p.knowledgePoint)}
                >
                  <span>{p.knowledgePoint}</span>
                  <small>掌握度 {p.masteryScore}/100</small>
                  <ChevronRight size={16} />
                </button>
              ))
            ) : (
              <p>继续练习积累记录，找到需要巩固的知识点。</p>
            )}
          </section>
          <section>
            <h2>AI 学习计划建议</h2>
            {dashboard.plan?.tasks?.slice(0, 3).map((t, i) => (
              <button key={i} disabled={!!busy} onClick={() => trainTask(t)}>
                <span>{t.knowledgePoint}</span>
                <small>{t.count} 题</small>
                <ChevronRight size={16} />
              </button>
            ))}
            <p>结合真实练习记录和薄弱点，安排下一步学习。</p>
            <button
              disabled={!!busy}
              onClick={dashboard.aiConfigured ? onPlan : () => go("vip")}
            >
              {dashboard.aiConfigured
                ? dashboard.plan?.tasks?.length
                  ? "更新学习计划"
                  : "生成学习计划"
                : "查看 AI 服务"}
              <ArrowRight size={16} />
            </button>
          </section>
        </div>
      </details>
      <SourceNotice dashboard={dashboard} />
    </section>
  );
}

function Choices({ title, value, options, onChange }) {
  return (
    <div className="blue-choice-group">
      <strong>{title}</strong>
      <div role="group" aria-label={title}>
        {options.map(([id, label]) => (
          <button
            type="button"
            key={id}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function BlueChapterBrowser({
  defaultCount = 10,
  dashboard,
  allQuestions,
  sharedAiQuestions,
  bankSource,
  setBankSource,
  useSharedAi,
  sharedAiLoading,
  toggleSharedAi,
  chapterFocus,
  setChapterFocus,
  sectionFocus,
  setSectionFocus,
  start,
  favoriteQuestions,
  openFavorites,
  wrong,
  busy,
  savedPractice,
  resumePractice,
}) {
  const certificateId = dashboard.certificate.id;
  const key = practicePreferenceKey(dashboard.user?.id, certificateId);
  const countUsesDefault=useRef(true);
  const [preferences, setPreferences] = useState(() => {
    let storage;
    try {
      storage = window.localStorage;
    } catch {}
    countUsesDefault.current=!hasPracticePreferences(storage,key);
    return readPracticePreferences(storage, key, defaultCount);
  });
  useEffect(()=>{if(countUsesDefault.current)setPreferences(p=>p.count===defaultCount?p:{...p,count:defaultCount});},[defaultCount]);
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all"),
    [point, setPoint] = useState(""),
    [knowledgeSearch, setKnowledgeSearch] = useState(""),
    [pointLimit, setPointLimit] = useState(12);
  useEffect(() => {
    try {
      if (key) localStorage.setItem(key, JSON.stringify(preferences));
    } catch {}
  }, [key, preferences]);
  const groups = useMemo(
    () =>
      chapterGroups(
        dashboard,
        allQuestions,
        sharedAiQuestions,
        bankSource,
        useSharedAi,
      ),
    [dashboard, allQuestions, sharedAiQuestions, bankSource, useSharedAi],
  );
  const filtered = groups.filter(
    (c) =>
      (filter === "all" ||
        (filter === "unstarted" ? !c.attempted : c.status === filter)) &&
      [
        c.name,
        ...(chapterVisualFor(certificateId, c.name)?.topics || []),
        ...c.questions.map(
          (q) =>
            `${q.knowledgeSection || ""} ${q.targetKnowledgePoint || q.knowledgePoint || ""}`,
        ),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const savedQuestion =
    savedPractice &&
    allQuestions.find(
      (q) => q.id === savedPractice.questionIds[savedPractice.index],
    );
  const chapter =
    filtered.find((c) => c.name === chapterFocus) ||
    filtered.find(
      (c) =>
        c.name === (savedQuestion?.chapter || dashboard.lastPractice?.chapter),
    ) ||
    filtered[0];
  const sections = [
    ...new Set([
      ...(chapter?.sections || []).map((s) => s.name),
      ...(chapter?.questions || [])
        .map((q) => q.knowledgeSection)
        .filter(Boolean),
    ]),
  ];
  const currentSection = sections.includes(sectionFocus) ? sectionFocus : "";
  const scoped = (chapter?.questions || []).filter(
    (q) => !currentSection || q.knowledgeSection === currentSection,
  );
  const configuredPoints = (chapter?.sections || [])
    .filter((s) => !currentSection || s.name === currentSection)
    .flatMap((s) => s.knowledgePoints || [])
    .map((p) => p.name);
  const points = [
    ...new Set([
      ...configuredPoints,
      ...scoped
        .map((q) => q.targetKnowledgePoint || q.knowledgePoint)
        .filter(Boolean),
    ]),
  ].map((name) => ({
    name,
    questions: scoped.filter(
      (q) => (q.targetKnowledgePoint || q.knowledgePoint) === name,
    ),
  }));
  const currentPoint = points.some((p) => p.name === point) ? point : "";
  const pool = scoped.filter(
    (q) =>
      !currentPoint ||
      (q.targetKnowledgePoint || q.knowledgePoint) === currentPoint,
  );
  const wrongIds = useMemo(() => new Set(wrong.map((q) => q.id)), [wrong]);
  const ready = practicePool(pool, {
    ...preferences,
    wrongIds,
    order: "sequential",
  });
  const canResume =
    !!savedQuestion &&
    savedQuestion.chapter === chapter?.name &&
    (chapter?.questions || []).some((q) => q.id === savedQuestion.id);
  const attempted = groups.reduce((n, c) => n + c.attempted, 0),
    total = groups.reduce((n, c) => n + c.total, 0);
  const shownPoints = points.filter((p) =>
    p.name.toLowerCase().includes(knowledgeSearch.trim().toLowerCase()),
  );
  useEffect(() => {
    setPoint("");
    setKnowledgeSearch("");
    setPointLimit(12);
  }, [chapter?.name, currentSection]);
  const select = (name) => {
    setChapterFocus(name);
    setSectionFocus("");
    setPoint("");
  };
  const exercise = () =>
    start(
      practicePool(pool, { ...preferences, wrongIds }),
      `${chapter.name}${currentSection ? ` · ${currentSection}` : ""}${currentPoint ? ` · ${currentPoint}` : ""}`,
    );
  return (
    <section className="blue-study-view blue-catalog">
      <header className="blue-page-heading">
        <div>
          <h1>章节练习</h1>
          <p>按章节系统练习，逐步掌握每个知识点。</p>
        </div>
        <button onClick={openFavorites}>
          <Star size={17} />
          我的收藏
          {favoriteQuestions.length ? ` (${favoriteQuestions.length})` : ""}
        </button>
      </header>
      <section className="blue-catalog-hero blue-art-trigger">
        <div>
          <span className="blue-eyebrow">当前章节</span>
          <h2>{chapter?.name || "选择适合自己的章节"}</h2>
          <p>
            {chapter?.total
              ? `已练 ${chapter.attempted} / ${chapter.total} 题`
              : "当前筛选下暂无可练习题目。"}
          </p>
          <div className="blue-hero-actions">
            {canResume && (
              <button onClick={resumePractice} disabled={!!busy}>
                继续上次练习
                <ArrowRight size={17} />
              </button>
            )}
            <button
              className="blue-primary"
              disabled={!ready.length || !!busy}
              onClick={exercise}
            >
              开始练习（{ready.length} 题）
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
        {chapter && (
          <ChapterArt
            certificateId={certificateId}
            title={chapter.name}
            size="large"
          />
        )}
        <div className="blue-catalog-stat">
          <strong>{groups.length}</strong>
          <span>个章节</span>
        </div>
        <div className="blue-catalog-stat">
          <strong>{total}</strong>
          <span>道题目</span>
        </div>
        <div className="blue-catalog-stat">
          <strong>{attempted}</strong>
          <span>已练题目</span>
        </div>
      </section>
      <div className="blue-source-filters">
        <label>
          题库来源
          <select
            aria-label="题库来源"
            value={bankSource}
            onChange={(e) => setBankSource(e.target.value)}
          >
            <option value="all">全部内置题库</option>
            {dashboard.banks.map((b) => (
              <option key={b.id} value={b.source}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={useSharedAi}
            disabled={sharedAiLoading}
            onChange={(e) => toggleSharedAi(e.target.checked)}
          />
          加入共享 AI 题目{sharedAiLoading ? "（读取中）" : ""}
        </label>
        <SourceNotice dashboard={dashboard} />
      </div>
      <div className="blue-chapter-layout">
        <div>
          <header className="blue-section-heading">
            <h2>全部章节</h2>
            <span>
              <Clock size={15} />
              作答后进度自动保存
            </span>
          </header>
          <div className="blue-chapter-toolbar">
            <div role="group" aria-label="章节进度筛选">
              {[
                ["all", "全部", groups.length],
                [
                  "in-progress",
                  "进行中",
                  groups.filter((c) => c.status === "in-progress").length,
                ],
                [
                  "unstarted",
                  "未开始",
                  groups.filter((c) => !c.attempted).length,
                ],
                [
                  "complete",
                  "已完成",
                  groups.filter((c) => c.status === "complete").length,
                ],
              ].map(([id, label, n]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  onClick={() => {
                    setFilter(id);
                    setSectionFocus("");
                    setPoint("");
                  }}
                >
                  {label} <small>{n}</small>
                </button>
              ))}
            </div>
            <label className="blue-search">
              <Search size={17} />
              <input
                type="search"
                aria-label="搜索章节或知识点"
                placeholder="搜索章节或知识点"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSectionFocus("");
                  setPoint("");
                }}
              />
            </label>
          </div>
          <div className="blue-chapter-grid">
            {filtered.map((c) => (
              <ChapterCard
                key={c.name}
                chapter={c}
                certificateId={certificateId}
                selected={c.name === chapter?.name}
                onSelect={select}
              />
            ))}
          </div>
          {!filtered.length && (
            <div className="blue-empty">
              <Search size={30} />
              <h2>没有找到匹配章节</h2>
              <p>试试其他关键词，或清除进度筛选。</p>
              <button
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                清除章节筛选
              </button>
            </div>
          )}
          {chapter && (
            <section className="blue-knowledge">
              <header className="blue-section-heading">
                <div>
                  <h2>{chapter.name} · 知识点</h2>
                  <p>
                    {currentSection || "全部分类"} · {points.length} 个知识点
                  </p>
                </div>
              </header>
              <div className="blue-knowledge-filters">
                {sections.length > 0 && (
                  <label>
                    知识分类
                    <select
                      aria-label="筛选知识分类"
                      value={currentSection}
                      onChange={(e) => setSectionFocus(e.target.value)}
                    >
                      <option value="">全部分类</option>
                      {sections.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="blue-search">
                  <Search size={17} />
                  <input
                    type="search"
                    aria-label="搜索本章知识点"
                    placeholder="搜索本章知识点"
                    value={knowledgeSearch}
                    onChange={(e) => {
                      setKnowledgeSearch(e.target.value);
                      setPointLimit(12);
                    }}
                  />
                </label>
              </div>
              <div className="blue-point-list">
                {shownPoints.slice(0, pointLimit).map((p) => (
                  <article key={p.name}>
                    <BookOpen size={18} />
                    <div>
                      <strong>{p.name}</strong>
                      <small>
                        {p.questions.length} 道题 · 已练{" "}
                        {p.questions.filter((q) => q.attempted).length} 题
                      </small>
                    </div>
                    <button
                      disabled={!p.questions.length}
                      aria-pressed={currentPoint === p.name}
                      onClick={() => setPoint(p.name)}
                    >
                      选择此考点
                      <ChevronRight size={15} />
                    </button>
                  </article>
                ))}
              </div>
              {!shownPoints.length && (
                <p className="blue-empty">当前分类没有匹配的知识点。</p>
              )}
              {shownPoints.length > pointLimit && (
                <button
                  className="blue-load-points"
                  onClick={() => setPointLimit((n) => n + 12)}
                >
                  显示更多知识点（{shownPoints.length - pointLimit}）
                  <ChevronDown size={16} />
                </button>
              )}
            </section>
          )}
        </div>
        <aside
          className="blue-practice-settings blue-art-trigger"
          aria-label="练习设置"
        >
          <h2>
            <Settings2 size={23} />
            练习设置
          </h2>
          <div className="blue-settings-chapter">
            {chapter && (
              <ChapterArt certificateId={certificateId} title={chapter.name} />
            )}
            <div>
              <small>已选章节</small>
              <strong>{chapter?.name || "尚未选择"}</strong>
              <span>
                {chapter?.total || 0} 道题 · 已练 {chapter?.attempted || 0} 题
              </span>
            </div>
          </div>
          <label className="blue-point-select">
            知识点范围
            <select
              aria-label="选择练习知识点"
              value={currentPoint}
              onChange={(e) => setPoint(e.target.value)}
            >
              <option value="">当前分类全部考点</option>
              {points.map((p) => (
                <option
                  key={p.name}
                  value={p.name}
                  disabled={!p.questions.length}
                >
                  {p.name} · {p.questions.length} 题
                </option>
              ))}
            </select>
          </label>
          <Choices
            title="练习方式"
            value={preferences.order}
            options={[
              ["sequential", "顺序练习"],
              ["random", "随机练习"],
            ]}
            onChange={(order) => setPreferences((p) => ({ ...p, order }))}
          />
          <Choices
            title="题目范围"
            value={preferences.range}
            options={[
              ["all", "全部题目"],
              ["unattempted", "未做题目"],
              ["wrong", "错题重练"],
            ]}
            onChange={(range) => setPreferences((p) => ({ ...p, range }))}
          />
          <Choices
            title="每次题量"
            value={preferences.count}
            options={[
              [10, "10 题"],
              [20, "20 题"],
              [30, "30 题"],
              ["all", "全部"],
            ]}
            onChange={(count) => {countUsesDefault.current=false;setPreferences((p) => ({ ...p, count }));}}
          />
          <p className="blue-setting-note">
            {currentPoint
              ? `${currentPoint} · `
              : currentSection
                ? `${currentSection} · `
                : ""}
            当前范围可练 {ready.length} 题。
          </p>
          <button
            className="blue-primary blue-start-practice"
            disabled={!ready.length || !!busy}
            onClick={exercise}
          >
            开始练习
            <ArrowRight size={18} />
          </button>
          <small>
            {ready.length
              ? "作答后查看解析，错题自动收集。"
              : "当前范围没有题目，试试全部题目或其他章节。"}
          </small>
        </aside>
      </div>
    </section>
  );
}
