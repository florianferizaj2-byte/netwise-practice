import { useRef, useState } from "react";
import { PracticeModes } from "../practice-modes.jsx";
import { useDesktopWeb } from "../desktop-experience.jsx";
import {
  DesktopPracticeNav,
  usePracticeProgress,
} from "../desktop-workspace.jsx";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Lightbulb,
  MessageCircle,
  Stethoscope,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api.js";
import {
  buildVeterinaryGroups,
  diff,
  isSingleSelect,
  questionTextForGroup,
  questionTypeName,
  veterinaryModules,
} from "../question-utils.js";
import {
  QuestionFavorite,
  QuestionImages,
  QuestionOrigin,
  QuestionReport,
} from "../components/question-tools.jsx";
import { Heading } from "../components/study-ui.jsx";

export function VeterinaryPractice({
  session,
  refresh,
  run,
  busy,
  train,
  exit,
}) {
  const desktop = useDesktopWeb();
  const [outcome, setOutcome] = useState({ serial: 0, streak: 0 });
  const { index, setIndex, responses, setResponses, done, setDone } =
    usePracticeProgress(session);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navFilter, setNavFilter] = useState("all");
  const [navChapter, setNavChapter] = useState(
    session.questions[session.progress?.index || 0]?.chapter ||
      veterinaryModules[0],
  );
  const [navPage, setNavPage] = useState(0);
  const [jumpValue, setJumpValue] = useState(
    String((session.progress?.index || 0) + 1),
  );
  const started = useRef(Date.now());
  const groups = buildVeterinaryGroups(session.questions);
  const group =
    groups.find((item) => item.indexes.includes(index)) || groups[0];
  const q = session.questions[index];
  const current = responses[q.id] || {};
  const selected = current.selected || [];
  const result = current.result || null;
  const teacher = current.teacher || "";
  const hint = current.hint || 0;
  const feedbackKind = current.feedbackKind || null;
  const history = session.questions
    .map((question) => responses[question.id])
    .filter((response) => response?.submitted)
    .map((response) => response.result);
  const answeredIds = new Set(history.map((item) => item.questionId));
  const revealedIds = new Set(
    session.questions
      .filter((question) => responses[question.id]?.revealed)
      .map((question) => question.id),
  );
  const updateCurrent = (patch) =>
    setResponses((old) => ({
      ...old,
      [q.id]: { ...old[q.id], ...patch },
    }));
  const jumpTo = (nextIndex) => {
    if (busy || nextIndex < 0 || nextIndex >= session.questions.length) return;
    setIndex(nextIndex);
    setJumpValue(String(nextIndex + 1));
    const nextChapter = session.questions[nextIndex]?.chapter;
    if (nextChapter && nextChapter !== navChapter) {
      setNavChapter(nextChapter);
      setNavPage(0);
    }
    setTeacherOpen(false);
    if (desktop) window.scrollTo({ top: 0, behavior: "instant" });
    started.current = Date.now();
  };
  const submitJump = () => {
    const nextIndex = Number.parseInt(jumpValue, 10) - 1;
    if (Number.isInteger(nextIndex)) jumpTo(nextIndex);
  };
  const choose = (key) => {
    if (result) return;
    updateCurrent({
      selected: isSingleSelect(q)
        ? [key]
        : selected.includes(key)
          ? selected.filter((item) => item !== key)
          : [...selected, key],
    });
  };
  const submit = () =>
    run("正在记录作答", async () => {
      const answerResult = await api("/attempts", {
        questionId: q.id,
        selected,
        timeMs: Math.min(86400000, Date.now() - started.current),
      });
      updateCurrent({ result: answerResult, submitted: true, revealed: false });
      setOutcome((old) => ({
        serial: old.serial + 1,
        streak: answerResult.correct === true ? old.streak + 1 : 0,
      }));
      await refresh();
    });
  const removeWrong = () =>
    run("正在移除错题", async () => {
      await api(`/wrong/${encodeURIComponent(q.id)}`, null, "DELETE");
      updateCurrent({ wrongRemoved: true });
      await refresh();
    });
  const sendFeedback = (kind) =>
    run("正在保存题目反馈", async () => {
      await api(`/questions/${q.id}/feedback`, { kind });
      updateCurrent({ feedbackKind: kind });
    });
  const analyzeMistake = () =>
    run("正在分析错误原因", async () => {
      const analysis = await api("/ai/analyze", { questionId: q.id });
      updateCurrent({
        teacher: `${analysis.weakKnowledge}\n\n${analysis.reason}`,
      });
      setTeacherOpen(true);
      await refresh();
    });
  const ask = (action, level = 0) =>
    run("AI 老师正在思考", async () => {
      const answer = await api("/ai/teacher", {
        questionId: q.id,
        action,
        selected,
        hintLevel: level,
      });
      updateCurrent({
        teacher: answer.text,
        ...(level ? { hint: level } : {}),
      });
      setTeacherOpen(true);
    });
  const next = () => {
    if (busy) return;
    if (index === session.questions.length - 1) setDone(true);
    else jumpTo(index + 1);
  };
  const chapterCount = (name) =>
    session.questions.filter((question) => question.chapter === name).length;
  const navGroups = groups
    .map((candidate) => {
      const indexes = candidate.indexes.filter(
        (questionIndex) =>
          session.questions[questionIndex]?.chapter === navChapter,
      );
      if (!indexes.length) return null;
      const matchesFilter = indexes.some((questionIndex) => {
        const question = session.questions[questionIndex];
        const response = responses[question.id];
        const isAnswered = !!response?.submitted;
        if (navFilter === "answered") return isAnswered;
        if (navFilter === "unanswered") return !isAnswered;
        if (navFilter === "wrong") return response?.result?.correct === false;
        if (navFilter === "revealed") return !!response?.revealed;
        return true;
      });
      return matchesFilter ? indexes : null;
    })
    .filter(Boolean);
  const navPages = [];
  let navPageIndexes = [];
  navGroups.forEach((indexes) => {
    if (navPageIndexes.length && navPageIndexes.length + indexes.length > 50) {
      navPages.push(navPageIndexes);
      navPageIndexes = [];
    }
    navPageIndexes = [...navPageIndexes, ...indexes];
  });
  if (navPageIndexes.length || !navPages.length) navPages.push(navPageIndexes);
  const currentNavPage = Math.min(navPage, Math.max(0, navPages.length - 1));
  const visibleNavIndexes = navPages[currentNavPage] || [];
  const openQuestionNav = () => {
    if (!navOpen) {
      const currentPage = navPages.findIndex((page) => page.includes(index));
      setNavPage(currentPage >= 0 ? currentPage : 0);
    }
    setNavOpen((old) => !old);
  };
  const renderOptions = () => (
    <div className="options vet-options">
      {Object.entries(q.options).map(([key, value]) => (
        <button
          key={key}
          disabled={!!result}
          className={
            "option " +
            (selected.includes(key) ? "chosen " : "") +
            (result?.answer.includes(key)
              ? "correct "
              : result && selected.includes(key)
                ? "incorrect"
                : "")
          }
          onClick={() => choose(key)}
        >
          <span className="option-letter">{key}</span>
          <span>{value}</span>
          {result?.answer.includes(key) ? (
            <Check size={20} />
          ) : result && selected.includes(key) ? (
            <X size={20} />
          ) : null}
        </button>
      ))}
    </div>
  );
  if (done)
    return (
      <div className="completion vet-completion">
        <Stethoscope size={54} />
        <span className="eyebrow">执业兽医专项训练</span>
        <h1>本轮专项练习完成</h1>
        <p>{session.title}</p>
        <div className="completion-stats">
          <strong>
            {history.filter((item) => item.correct).length}
            <small>答对</small>
          </strong>
          <strong>
            {history.filter((item) => !item.correct).length}
            <small>答错</small>
          </strong>
          <strong>
            {session.questions.length - history.length}
            <small>未完成</small>
          </strong>
        </div>
        <button className="primary" onClick={exit}>
          返回执兽学习区
          <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <>
      <Heading
        title="执业兽医专项刷题"
        subtitle="基础、预防、临床、综合四科分层训练；病例题按共用题干逐问作答"
      >
        <button onClick={exit}>
          <ArrowLeft size={16} />
          结束练习
        </button>
      </Heading>
      <section className="vet-practice-banner">
        <div className="vet-practice-banner-copy">
          <span className="eyebrow">
            <Stethoscope size={15} /> 兽医全科专属练习区
          </span>
          <h2>{session.title}</h2>
          <p>
            题图会直接显示在题干前；共用题干题会先固定病例材料，再逐道保存答案。
          </p>
        </div>
        <div className="vet-practice-banner-stat">
          <strong>{history.length}</strong>
          <span>/ {session.questions.length} 已完成</span>
        </div>
      </section>
      <div className="vet-module-tabs" aria-label="执兽四大科目">
        {veterinaryModules.map((module) => {
          const first = session.questions.findIndex(
            (question) => question.chapter === module,
          );
          const active = q.chapter === module;
          return (
            <button
              key={module}
              className={active ? "active" : ""}
              disabled={first < 0 || !!busy}
              onClick={() => first >= 0 && jumpTo(first)}
            >
              <span>{module.replace("科目", "")}</span>
              <small>{chapterCount(module)} 题</small>
            </button>
          );
        })}
      </div>
      <div className="practice-layout vet-practice-layout">
        <section className="question-panel vet-question-panel">
          <PracticeModes outcome={outcome} />
          <div className="question-top">
            <span>
              第 <b>{index + 1}</b> / {session.questions.length} 题
            </span>
            <span className="badge">{q.chapter}</span>
            <label className="question-jump">
              跳转
              <input
                aria-label="输入执兽题号"
                type="number"
                min="1"
                max={session.questions.length}
                value={jumpValue}
                disabled={!!busy}
                onChange={(event) => setJumpValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitJump();
                }}
              />
              <button type="button" disabled={!!busy} onClick={submitJump}>
                确定
              </button>
            </label>
          </div>
          <div className="progress">
            <i
              style={{
                width: ((index + 1) / session.questions.length) * 100 + "%",
              }}
            />
          </div>
          <div className="vet-question-nav">
            <div className="practice-question-nav-head vet-nav-head">
              <div>
                <strong>执兽答题卡</strong>
                <small>
                  当前 {q.chapter} · 已完成 {history.length} /{" "}
                  {session.questions.length}
                </small>
              </div>
              <button
                type="button"
                className="vet-nav-toggle"
                disabled={!!busy}
                onClick={openQuestionNav}
              >
                {navOpen ? "收起题号" : "打开题号"}
                <ChevronDown size={15} className={navOpen ? "is-open" : ""} />
              </button>
            </div>
            {navOpen && (
              <>
                <div className="vet-nav-toolbar">
                  <label>
                    科目
                    <select
                      value={navChapter}
                      disabled={!!busy}
                      onChange={(event) => {
                        setNavChapter(event.target.value);
                        setNavPage(0);
                      }}
                    >
                      {veterinaryModules.map((module) => (
                        <option
                          key={module}
                          value={module}
                          disabled={!chapterCount(module)}
                        >
                          {module.replace("科目", "")}（{chapterCount(module)}
                          题）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    状态
                    <select
                      value={navFilter}
                      disabled={!!busy}
                      onChange={(event) => {
                        setNavFilter(event.target.value);
                        setNavPage(0);
                      }}
                    >
                      <option value="all">全部题目</option>
                      <option value="unanswered">未作答</option>
                      <option value="answered">已作答</option>
                      <option value="wrong">答错题</option>
                      <option value="revealed">看过答案</option>
                    </select>
                  </label>
                </div>
                <div className="vet-nav-pagebar">
                  <button
                    type="button"
                    disabled={!!busy || currentNavPage === 0}
                    onClick={() => setNavPage((page) => Math.max(0, page - 1))}
                  >
                    上一页
                  </button>
                  <span>
                    第 {currentNavPage + 1} / {navPages.length} 页 · 每页最多 50
                    题
                  </span>
                  <button
                    type="button"
                    disabled={!!busy || currentNavPage >= navPages.length - 1}
                    onClick={() =>
                      setNavPage((page) =>
                        Math.min(navPages.length - 1, page + 1),
                      )
                    }
                  >
                    下一页
                  </button>
                </div>
                {visibleNavIndexes.length ? (
                  <div className="question-number-grid">
                    {visibleNavIndexes.map((questionIndex) => {
                      const question = session.questions[questionIndex];
                      const isAnswered =
                        answeredIds.has(question.id) ||
                        !!responses[question.id]?.submitted;
                      const isWrong =
                        isAnswered &&
                        responses[question.id]?.result?.correct === false;
                      const isRevealed = revealedIds.has(question.id);
                      const sharedGroup = groups.find((candidate) =>
                        candidate.indexes.includes(questionIndex),
                      );
                      return (
                        <button
                          key={question.id}
                          className={[
                            questionIndex === index ? "current" : "",
                            isAnswered ? "answered" : "",
                            isWrong ? "wrong" : "",
                            isRevealed ? "revealed" : "",
                            sharedGroup?.shared ? "shared" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          aria-label={`第 ${questionIndex + 1} 题`}
                          disabled={!!busy}
                          onClick={() => jumpTo(questionIndex)}
                        >
                          {questionIndex + 1}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="vet-nav-empty">这个筛选条件下暂时没有题目。</p>
                )}
                <div className="vet-nav-legend">
                  <span>
                    <i className="current" />
                    当前
                  </span>
                  <span>
                    <i className="answered" />
                    已作答
                  </span>
                  <span>
                    <i className="wrong" />
                    答错
                  </span>
                  <span>
                    <i className="shared" />
                    共用题干组
                  </span>
                </div>
              </>
            )}
          </div>
          {group?.shared && (
            <section className={`vet-shared-card ${group.kind || "stem"}`}>
              <div className="vet-shared-card-head">
                <span>
                  {group.kind === "options"
                    ? "共用备选答案"
                    : "共用题干 / 病例材料"}
                </span>
                <small>本组 {group.questions.length} 道题</small>
              </div>
              {group.kind === "stem" && group.stem ? (
                <p>{group.stem}</p>
              ) : group.kind === "options" ? (
                <p>以下小题共用同一组选项，请根据每道题的问法分别选择答案。</p>
              ) : (
                <p>本组小题共用一段材料，请先阅读题干后逐题作答。</p>
              )}
              <div className="vet-case-steps">
                {group.indexes.map((questionIndex, step) => {
                  const child = session.questions[questionIndex];
                  const childResult = responses[child.id]?.result;
                  return (
                    <button
                      key={child.id}
                      className={questionIndex === index ? "active" : ""}
                      disabled={!!busy}
                      onClick={() => jumpTo(questionIndex)}
                    >
                      <b>{step + 1}</b>
                      <span>
                        {childResult
                          ? childResult.correct
                            ? "答对"
                            : "需复习"
                          : "待作答"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <div className="question-meta">
            <span className="badge">{questionTypeName(q)}</span>
            <span>{diff[q.difficulty]}</span>
            {q.knowledgeSection && <span>{q.knowledgeSection}</span>}
            <span>{q.targetKnowledgePoint || q.knowledgePoint}</span>
            {q.sharedGroupId && <span>管理员已分组</span>}
          </div>
          <QuestionImages question={q} />
          <h2 className="question-text vet-question-text">
            {questionTextForGroup(q, group) || q.question}
          </h2>
          <QuestionOrigin question={q} />
          {group?.kind === "options" && (
            <div className="vet-options-label">本题从共用备选答案中选择</div>
          )}
          {renderOptions()}
          {result && (
            <div
              className={`result-block ${result.correct === false ? "wrong" : ""}`}
            >
              <h3>
                {result.correct === undefined
                  ? "答案解析"
                  : result.correct
                    ? "回答正确"
                    : "这道题还需要巩固"}
                <span>正确答案 {result.answer.join("、")}</span>
              </h3>
              <p>{result.analysis}</p>
            </div>
          )}
          {result && q.source === "ai_generated" && (
            <div className="question-feedback">
              <span>这道共享 AI 题怎么样？</span>
              {[
                ["helpful", "有帮助"],
                ["wrong_answer", "答案有问题"],
                ["ambiguous", "表述不清"],
                ["duplicate", "题目重复"],
              ].map(([kind, label]) => (
                <button
                  key={kind}
                  className={feedbackKind === kind ? "selected" : ""}
                  disabled={!!busy}
                  onClick={() => sendFeedback(kind)}
                >
                  {feedbackKind === kind ? `已反馈${label}` : label}
                </button>
              ))}
            </div>
          )}
          <div className="question-actions">
            <button
              disabled={!!busy || hint >= 3 || !!result}
              onClick={() => ask("给我提示", hint + 1)}
            >
              <Lightbulb size={17} /> 给我提示 {hint}/3
            </button>
            <button
              className="text-button"
              disabled={!!busy || !!result}
              onClick={() =>
                run("正在查看答案", async () => {
                  const revealed = await api(`/questions/${q.id}/reveal`, {});
                  setOutcome((old) => ({ serial: old.serial + 1, streak: 0 }));
                  updateCurrent({
                    result: revealed,
                    submitted: false,
                    revealed: true,
                  });
                })
              }
            >
              查看答案
            </button>
            <QuestionFavorite
              question={q}
              busy={busy}
              run={run}
              onChanged={refresh}
            />
            <QuestionReport question={q} busy={busy} run={run} />
            {result ? (
              <>
                {result.correct === false && (
                  <button
                    className="ai-analysis-button"
                    onClick={analyzeMistake}
                    disabled={!!busy}
                  >
                    <MessageCircle size={17} /> AI 解析
                  </button>
                )}
                {result.correct === true && session.title === "错题复习" && (
                  <button
                    className="wrong-remove"
                    disabled={!!busy || current.wrongRemoved}
                    onClick={removeWrong}
                  >
                    <Trash2 size={16} />
                    {current.wrongRemoved ? "已移除错题" : "移除错题"}
                  </button>
                )}
                <button
                  className="primary push-right"
                  onClick={next}
                  disabled={!!busy}
                >
                  {index === session.questions.length - 1
                    ? "完成练习"
                    : group?.shared &&
                        group.indexes.indexOf(index) <
                          group.questions.length - 1
                      ? "下一小题"
                      : "下一题"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <button
                className="primary push-right"
                disabled={!selected.length || !!busy}
                onClick={submit}
              >
                提交本题 <Check size={17} />
              </button>
            )}
          </div>
        </section>
        <aside className="teacher-panel vet-teacher-panel">
          {desktop && (
            <DesktopPracticeNav
              questions={session.questions}
              index={index}
              responses={responses}
              busy={busy}
              jumpTo={jumpTo}
            />
          )}
          <h2>
            <Stethoscope size={21} /> 兽医考点教练
          </h2>
          <p className="vet-teacher-note">当前知识点：{q.knowledgePoint}</p>
          <button
            className="teacher-open"
            onClick={() => setTeacherOpen(!teacherOpen)}
          >
            <MessageCircle size={17} /> 问 AI <ChevronRight size={16} />
          </button>
          {teacherOpen && (
            <>
              <div className="teacher-actions">
                {[
                  "为什么我错了？",
                  "详细讲解",
                  "换一种方法解释",
                  "举一个实际病例",
                ].map((action) => (
                  <button
                    key={action}
                    disabled={!!busy || !result}
                    onClick={() => ask(action)}
                  >
                    {action}
                  </button>
                ))}
                <button disabled={!!busy} onClick={() => train(q, 1)}>
                  生成一道同知识点题
                </button>
                <button disabled={!!busy} onClick={() => train(q, 1, true)}>
                  生成一道进阶病例题
                </button>
              </div>
              {!result && (
                <small className="muted">
                  完成本题或查看答案后，可让 AI 结合兽医知识点讲解。
                </small>
              )}
            </>
          )}
          {teacher ? (
            <div className="teacher-response">{teacher}</div>
          ) : (
            <div className="teacher-idle">
              <Lightbulb size={28} />
              <span>从病例线索找到诊断方向</span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
