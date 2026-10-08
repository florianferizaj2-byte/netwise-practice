import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  NotebookPen,
  Search,
  Sparkles,
  Star,
} from "lucide-react";
import { savePracticeProgress } from "./practice-progress.js";

export function usePracticeProgress(session) {
  const [index, setIndex] = useState(session.progress?.index || 0);
  const [responses, setResponses] = useState(session.progress?.responses || {});
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!session.storageKey) return;
    try {
      savePracticeProgress(
        window.localStorage,
        session.storageKey,
        session,
        index,
        responses,
        done,
      );
    } catch {
      /* Private mode. */
    }
  }, [session, index, responses, done]);
  return { index, setIndex, responses, setResponses, done, setDone };
}

export function DesktopPracticeNav({
  questions,
  index,
  responses,
  busy,
  jumpTo,
}) {
  const pageSize = 40;
  const [page, setPage] = useState(Math.floor(index / pageSize));
  useEffect(() => {
    setPage(Math.floor(index / pageSize));
  }, [index]);
  const pages = Math.ceil(questions.length / pageSize);
  const answered = questions.filter(
    (question) => responses[question.id]?.submitted,
  ).length;
  return (
    <details className="study-answer-card" open>
      <summary>
        <strong>答题卡</strong>
        <span>
          已作答 {answered} / {questions.length}
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="question-number-grid">
        {questions
          .slice(page * pageSize, (page + 1) * pageSize)
          .map((question, offset) => {
            const position = page * pageSize + offset;
            const response = responses[question.id];
            const wrong =
              response?.submitted && response.result?.correct === false;
            const state = wrong
              ? "答错"
              : response?.submitted
                ? "已作答"
                : response?.revealed
                  ? "已查看答案"
                  : "未作答";
            return (
              <button
                key={question.id}
                disabled={!!busy}
                onClick={() => jumpTo(position)}
                className={[
                  position === index ? "current" : "",
                  response?.submitted ? "answered" : "",
                  wrong ? "wrong" : "",
                  response?.revealed ? "revealed" : "",
                ].join(" ")}
                aria-label={`第 ${position + 1} 题，${state}`}
                aria-current={position === index ? "step" : undefined}
                title={state}
              >
                {position + 1}
              </button>
            );
          })}
      </div>
      {pages > 1 && (
        <div className="study-answer-pages">
          <button
            aria-label="上一页题号"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <span>
            {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, questions.length)} /{" "}
            {questions.length}
          </span>
          <button
            aria-label="下一页题号"
            disabled={page === pages - 1}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      <div className="study-answer-legend">
        <span>
          <i className="is-current" />
          当前题
        </span>
        <span>
          <i className="is-correct" />
          已作答
        </span>
        <span>
          <i className="is-wrong" />
          答错
        </span>
        <span>
          <i className="is-revealed" />
          已看答案
        </span>
      </div>
    </details>
  );
}

export function DesktopStudyHome({
  dashboard,
  go,
  startRecommended,
  openChapter,
  favoriteCount,
  openFavorites,
  weak,
  practicePoint,
  onPlan,
  trainTask,
  busy,
  savedPractice,
  resumePractice,
  reviewWrong,
}) {
  const chapters = dashboard.chapters || [];
  const attempted = chapters.reduce(
    (sum, item) => sum + (item.attempted || 0),
    0,
  );
  const total = chapters.reduce((sum, item) => sum + (item.total || 0), 0);
  const hasActivity = attempted > 0 || dashboard.todayCount > 0;
  const fresh = !hasActivity && !savedPractice;
  const activeChapters = [...chapters]
    .sort(
      (a, b) =>
        Number(b.attempted > 0 && b.attempted < b.total) -
        Number(a.attempted > 0 && a.attempted < a.total),
    )
    .slice(0, 4);
  const weakPoints = weak
    .filter((point) => point.attemptCount && point.masteryScore < 80)
    .slice(0, 3);
  return (
    <div className="study-home">
      <div className="study-heading">
        <div>
          <p>{dashboard.certificate?.shortName}</p>
          <h1>{fresh ? "从第一组练习开始" : "接着学，再进一步"}</h1>
        </div>
        <span>
          {new Date().toLocaleDateString("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
      </div>
      <div className="study-priorities">
        <section className="study-next">
          <div>
            <span className="study-eyebrow">
              {savedPractice
                ? "上次练到这里"
                : fresh
                  ? "每天一组，建立学习节奏"
                  : "今日练习"}
            </span>
            <h2>
              {savedPractice
                ? savedPractice.title
                : "先练 10 道，找到今天的状态。"}
            </h2>
            <p>
              {savedPractice
                ? `第 ${savedPractice.index + 1} / ${savedPractice.questionIds.length} 题 · 此浏览器已保存进度`
                : fresh
                  ? "从当前证书题库开始，作答后查看解析，错题会自动收集。"
                  : `今天已作答 ${dashboard.todayCount} 题，继续练习或巩固错题。`}
            </p>
            <button
              className="primary"
              onClick={savedPractice ? resumePractice : startRecommended}
            >
              {savedPractice ? "继续上次练习" : "开始 10 题练习"}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
        <section className="study-review">
          <span>
            <NotebookPen size={18} />
            今日待复习
          </span>
          <div>
            <strong>{dashboard.dueCount}</strong>
            <span>道题</span>
          </div>
          <p>
            {dashboard.dueCount
              ? "先巩固到期错题，再开始新的练习。"
              : dashboard.wrongCount
                ? `错题本还有 ${dashboard.wrongCount} 道题，可以提前巩固。`
                : "作答中的错题会自动收进错题本。"}
          </p>
          <button
            onClick={dashboard.wrongCount ? reviewWrong : () => go("wrong")}
          >
            {dashboard.dueCount
              ? "复习到期错题"
              : dashboard.wrongCount
                ? "巩固错题"
                : "查看错题本"}
            <ArrowRight size={16} />
          </button>
        </section>
      </div>
      {hasActivity && (
        <div className="study-stats" aria-label="学习统计">
          <span>
            今日作答 <strong>{dashboard.todayCount}</strong> 题
          </span>
          <span>
            累计正确率{" "}
            <strong>
              {dashboard.accuracy == null
                ? "—"
                : `${Math.round(dashboard.accuracy * 100)}%`}
            </strong>
          </span>
          <span>
            连续学习 <strong>{dashboard.streakDays || 0}</strong> 天
          </span>
          <button onClick={() => go("mastery")}>
            查看学习分析
            <ArrowUpRight size={15} />
          </button>
        </div>
      )}
      <section className="study-chapters">
        <div className="study-section-heading">
          <div>
            <h2>{fresh ? "按章节系统练习" : "章节进度"}</h2>
            <p>
              {fresh
                ? "也可以选择自己想学的章节。"
                : `已练 ${attempted} / ${total} 道题`}
            </p>
          </div>
          <button className="text-button" onClick={() => go("chapters")}>
            全部章节
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="study-chapter-list">
          {activeChapters.map((chapter) => (
            <button
              key={chapter.name}
              onClick={() => openChapter(chapter.name)}
            >
              <BookOpen size={19} />
              <strong>{chapter.name}</strong>
              <span>
                {chapter.attempted || 0} / {chapter.total} 题
              </span>
              <div className="progress">
                <i
                  style={{
                    width: `${chapter.total ? Math.min(100, ((chapter.attempted || 0) / chapter.total) * 100) : 0}%`,
                  }}
                />
              </div>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      </section>
      <div className="study-secondary">
        <button onClick={() => go("exam")}>
          <GraduationCap size={23} />
          <span>
            <strong>模拟考试</strong>
            <small>用一次计时测试检验学习成果</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button onClick={favoriteCount ? openFavorites : () => go("chapters")}>
          <Star size={22} />
          <span>
            <strong>
              {favoriteCount
                ? `我的收藏 · ${favoriteCount} 题`
                : "积累自己的重点题"}
            </strong>
            <small>
              {favoriteCount
                ? "回顾标记过的题目"
                : "在答题时点击星标，留待复习"}
            </small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
      {hasActivity && (
        <details className="study-more">
          <summary>
            <Sparkles size={18} />
            <span>针对薄弱点继续练</span>
            <small>学习计划与专项训练</small>
            <ChevronDown size={16} />
          </summary>
          <div className="study-more-content">
            <section>
              <h2>薄弱知识点</h2>
              {weakPoints.length ? (
                weakPoints.map((point) => (
                  <button
                    className="study-weak-row"
                    key={point.knowledgePoint}
                    onClick={() => practicePoint(point.knowledgePoint)}
                  >
                    <span>{point.knowledgePoint}</span>
                    <small>掌握度 {point.masteryScore}/100</small>
                    <ChevronRight size={16} />
                  </button>
                ))
              ) : (
                <p>目前没有需要优先巩固的知识点，继续练习积累记录。</p>
              )}
            </section>
            <section>
              <h2>AI 学习计划</h2>
              {dashboard.plan?.tasks?.slice(0, 3).map((task, index) => (
                <button
                  className="study-weak-row"
                  key={index}
                  disabled={!!busy}
                  onClick={() => trainTask(task)}
                >
                  <span>{task.knowledgePoint}</span>
                  <small>{task.count} 题</small>
                  <ChevronRight size={16} />
                </button>
              ))}
              <p>结合练习记录和薄弱点，安排下一步学习。</p>
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
      )}
    </div>
  );
}

export function DesktopChapterBrowser({
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
}) {
  const [query, setQuery] = useState("");
  const sourceQuestions = [
    ...allQuestions.filter(
      (question) =>
        question.source !== "ai_generated" &&
        (bankSource === "all" || question.source === bankSource),
    ),
    ...(useSharedAi ? sharedAiQuestions : []),
  ];
  const chapters = dashboard.chapters
    .map((chapter) => ({
      ...chapter,
      questions: sourceQuestions.filter(
        (question) => question.chapter === chapter.name,
      ),
    }))
    .filter((chapter) => chapter.questions.length);
  const chapter =
    chapters.find((item) => item.name === chapterFocus) || chapters[0];
  const sections = [
    ...new Set(
      (chapter?.questions || [])
        .map((question) => question.knowledgeSection)
        .filter(Boolean),
    ),
  ];
  const currentSection = sections.includes(sectionFocus) ? sectionFocus : "";
  const scoped = (chapter?.questions || []).filter(
    (question) =>
      !currentSection || question.knowledgeSection === currentSection,
  );
  const points = [
    ...new Set(
      scoped.map(
        (question) => question.targetKnowledgePoint || question.knowledgePoint,
      ),
    ),
  ]
    .filter(Boolean)
    .map((name) => ({
      name,
      questions: scoped.filter(
        (question) =>
          (question.targetKnowledgePoint || question.knowledgePoint) === name,
      ),
    }))
    .filter((point) =>
      point.name.toLowerCase().includes(query.trim().toLowerCase()),
    );
  const selectChapter = (name) => {
    setChapterFocus(name);
    setSectionFocus("");
    setQuery("");
  };
  return (
    <div className="study-catalog">
      <div className="study-heading">
        <div>
          <p>{dashboard.certificate?.shortName}</p>
          <h1>章节练习</h1>
        </div>
        <button
          onClick={() => start(favoriteQuestions, "收藏题目")}
          disabled={!favoriteQuestions.length}
        >
          <Star size={16} />
          我的收藏
          {favoriteQuestions.length ? ` (${favoriteQuestions.length})` : ""}
        </button>
      </div>
      <div className="study-catalog-filters">
        <label>
          题库来源
          <select
            aria-label="题库来源"
            value={bankSource}
            onChange={(event) => setBankSource(event.target.value)}
          >
            <option value="all">全部内置题库</option>
            {dashboard.banks.map((bank) => (
              <option key={bank.id} value={bank.source}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
        <label className="study-shared-toggle">
          <input
            type="checkbox"
            checked={useSharedAi}
            disabled={sharedAiLoading}
            onChange={(event) => toggleSharedAi(event.target.checked)}
          />
          加入共享 AI 题目{sharedAiLoading ? "（读取中）" : ""}
        </label>
        <details className="study-source-details">
          <summary>题库来源说明</summary>
          <div>
            <p>
              当前显示 {sourceQuestions.length}{" "}
              道题。题目来源保留在每道题的详情中。
            </p>
            {dashboard.banks.map((bank) => (
              <p key={bank.id}>
                {bank.name}：
                {
                  allQuestions.filter(
                    (question) => question.source === bank.source,
                  ).length
                }{" "}
                题
              </p>
            ))}
            {dashboard.syllabus?.scopeNote && (
              <p>{dashboard.syllabus.scopeNote}</p>
            )}
          </div>
        </details>
      </div>
      <div className="study-catalog-layout">
        <nav aria-label="章节目录">
          <h2>
            全部章节 <small>{chapters.length}</small>
          </h2>
          {chapters.map((item) => (
            <button
              key={item.name}
              className={chapter?.name === item.name ? "active" : ""}
              aria-current={chapter?.name === item.name ? "page" : undefined}
              onClick={() => selectChapter(item.name)}
            >
              <span>{item.name}</span>
              <small>{item.questions.length}</small>
            </button>
          ))}
        </nav>
        <section className="study-catalog-content">
          {chapter ? (
            <>
              <div className="study-section-heading">
                <div>
                  <h2>{chapter.name}</h2>
                  <p>
                    {scoped.length} 道题
                    {currentSection && ` · ${currentSection}`}
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() =>
                    start(
                      scoped,
                      `${chapter.name}${currentSection ? ` · ${currentSection}` : ""}`,
                    )
                  }
                >
                  练习{currentSection ? "当前分类" : "本章"}
                  <ArrowRight size={16} />
                </button>
              </div>
              <div className="study-point-filters">
                {sections.length > 0 && (
                  <label>
                    分类
                    <select
                      aria-label="筛选知识分类"
                      value={currentSection}
                      onChange={(event) => {
                        setSectionFocus(event.target.value);
                        setQuery("");
                      }}
                    >
                      <option value="">全部分类</option>
                      {sections.map((name) => (
                        <option key={name}>{name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="study-point-search">
                  <Search size={17} />
                  <input
                    aria-label="搜索本章知识点"
                    placeholder="搜索本章知识点"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
              </div>
              <div className="study-point-list">
                {points.map((point) => {
                  const attempted = point.questions.filter(
                    (question) => question.attempted,
                  ).length;
                  const mastery = dashboard.mastery.find(
                    (item) => item.knowledgePoint === point.name,
                  );
                  return (
                    <div key={point.name}>
                      <BookOpen size={18} />
                      <div>
                        <strong>{point.name}</strong>
                        <small>
                          {point.questions.length} 道题
                          {mastery?.attemptCount
                            ? ` · 掌握度 ${mastery.masteryScore}/100`
                            : attempted
                              ? ` · 已练 ${attempted} 题`
                              : " · 未练习"}
                        </small>
                      </div>
                      <button
                        onClick={() =>
                          start(
                            point.questions,
                            `${chapter.name} · ${point.name}`,
                          )
                        }
                      >
                        练习
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {!points.length && (
                <div className="study-empty">
                  <Search size={30} />
                  <h3>没有找到这个知识点</h3>
                  <p>试试更短的关键词，或切换知识分类。</p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setSectionFocus("");
                    }}
                  >
                    清除筛选
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="study-empty">
              <BookOpen size={32} />
              <h2>这个来源暂无可练习题目</h2>
              <button onClick={() => setBankSource("all")}>查看全部题库</button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
