import { lazy, useRef, useState } from "react";
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
  ChevronRight,
  CircleCheck,
  Flag,
  Lightbulb,
  MessageCircle,
  Sparkles,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../api.js";
import {
  diff,
  isSingleSelect,
  questionTypeName,
  sourceName,
} from "../question-utils.js";
import {
  QuestionFavorite,
  QuestionImages,
  QuestionOrigin,
  QuestionReport,
} from "../components/question-tools.jsx";
import { Heading } from "../components/study-ui.jsx";
const VeterinaryPractice = lazy(() =>
  import("./veterinary-practice.jsx").then((m) => ({
    default: m.VeterinaryPractice,
  })),
);

export function Practice(props) {
  if (props.session?.certificateId === "veterinary-practitioner")
    return <VeterinaryPractice {...props} />;
  return <GenericPractice {...props} />;
}

export function GenericPractice({
  session,
  refresh,
  run,
  busy,
  train,
  configured,
  exit,
}) {
  const desktop = useDesktopWeb();
  const [outcome, setOutcome] = useState({ serial: 0, streak: 0 });
  const { index, setIndex, responses, setResponses, done, setDone } =
    usePracticeProgress(session);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const started = useRef(Date.now());
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
  const choose = (k) => {
    if (result) return;
    updateCurrent({
      selected: isSingleSelect(q)
        ? [k]
        : selected.includes(k)
          ? selected.filter((x) => x !== k)
          : [...selected, k],
    });
  };
  const jumpTo = (nextIndex) => {
    if (busy || nextIndex < 0 || nextIndex >= session.questions.length) return;
    setIndex(nextIndex);
    setTeacherOpen(false);
    if (desktop) window.scrollTo({ top: 0, behavior: "instant" });
    started.current = Date.now();
  };
  const submit = () =>
    run("正在记录作答", async () => {
      const r = await api("/attempts", {
        questionId: q.id,
        selected,
        ...(q.type === "short_answer"
          ? { response: current.responseDraft || "" }
          : {}),
        timeMs: Math.min(86400000, Date.now() - started.current),
      });
      updateCurrent({ result: r, submitted: true, revealed: false });
      setOutcome((old) => ({
        serial: old.serial + 1,
        streak: r.correct === true ? old.streak + 1 : 0,
      }));
      await refresh();
    });
  const removeWrong = () =>
    run("正在移除错题", async () => {
      await api(`/wrong/${encodeURIComponent(q.id)}`, null, "DELETE");
      updateCurrent({ wrongRemoved: true });
      await refresh();
    });
  const analyzeMistake = () =>
    run("正在分析错误原因", async () => {
      const m = await api("/ai/analyze", { questionId: q.id });
      updateCurrent({ teacher: `${m.weakKnowledge}\n\n${m.reason}` });
      setTeacherOpen(true);
      await refresh();
    });
  const sendFeedback = (kind) =>
    run("正在保存题目反馈", async () => {
      await api(`/questions/${q.id}/feedback`, { kind });
      updateCurrent({ feedbackKind: kind });
    });
  const next = () => {
    if (busy) return;
    if (index === session.questions.length - 1) {
      setDone(true);
      return;
    }
    jumpTo(index + 1);
  };
  const ask = (action, level = 0) =>
    run("AI 老师正在思考", async () => {
      const r = await api("/ai/teacher", {
        questionId: q.id,
        action,
        selected,
        hintLevel: level,
      });
      updateCurrent({ teacher: r.text, ...(level ? { hint: level } : {}) });
      setTeacherOpen(true);
    });
  if (done)
    return (
      <div className="completion">
        <CircleCheck size={56} />
        <h1>本轮练习完成</h1>
        <p>{session.title}</p>
        <div className="completion-stats">
          <strong>
            {history.filter((h) => h.correct).length}
            <small>答对</small>
          </strong>
          <strong>
            {history.filter((h) => !h.correct).length}
            <small>答错</small>
          </strong>
          <strong>
            {session.questions.length - history.length}
            <small>查看答案</small>
          </strong>
        </div>
        <button className="primary" onClick={exit}>
          返回学习总览
          <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <>
      <Heading
        title={session.title}
        subtitle={`${q.chapter}${q.knowledgeSection ? ` · ${q.knowledgeSection}` : ""} · ${q.targetKnowledgePoint || q.knowledgePoint}`}
      >
        <button onClick={exit}>
          <ArrowLeft size={16} />
          结束练习
        </button>
      </Heading>
      <div className="practice-layout">
        <section className="question-panel">
          <PracticeModes outcome={outcome} />
          <div className="question-top">
            <span>
              第 <b>{index + 1}</b> / {session.questions.length} 题
            </span>
            <span
              className={
                "badge " + (q.source === "ai_generated" ? "green" : "")
              }
            >
              {sourceName(q)}
            </span>
            <label className="question-jump">
              跳转
              <select
                aria-label="选择题号"
                value={index}
                disabled={!!busy}
                onChange={(event) => jumpTo(Number(event.target.value))}
              >
                {session.questions.map((_, questionIndex) => (
                  <option key={questionIndex} value={questionIndex}>
                    第 {questionIndex + 1} 题
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="progress">
            <i
              style={{
                width: ((index + 1) / session.questions.length) * 100 + "%",
              }}
            />
          </div>
          {!desktop && (
            <div className="practice-question-nav">
              <div className="practice-question-nav-head">
                <strong>题目导航</strong>
                <small>可直接选择题号，已作答题目会保留状态</small>
              </div>
              <div className="question-number-grid">
                {session.questions.map((question, questionIndex) => {
                  const isAnswered = answeredIds.has(question.id);
                  const isWrong =
                    isAnswered &&
                    responses[question.id]?.result?.correct === false;
                  const isRevealed = revealedIds.has(question.id);
                  return (
                    <button
                      key={question.id}
                      className={[
                        questionIndex === index ? "current" : "",
                        isAnswered ? "answered" : "",
                        isWrong ? "wrong" : "",
                        isRevealed ? "revealed" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      aria-label={`第 ${questionIndex + 1} 题`}
                      title={
                        isWrong
                          ? "回答错误"
                          : isAnswered
                            ? "回答正确"
                            : isRevealed
                              ? "已查看答案"
                              : "未作答"
                      }
                      aria-current={
                        questionIndex === index ? "step" : undefined
                      }
                      disabled={!!busy}
                      onClick={() => jumpTo(questionIndex)}
                    >
                      {questionIndex + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="question-meta">
            <span className="badge">{questionTypeName(q)}</span>
            <span>{diff[q.difficulty]}</span>
            {q.stage && <span>{q.stage}</span>}
          </div>
          <QuestionImages question={q} />
          <h2 className="question-text">{q.question}</h2>
          <QuestionOrigin question={q} />
          {q.type === "short_answer" ? (
            <div className="short-answer-editor">
              <label htmlFor={`short-answer-${q.id}`}>我的作答</label>
              <textarea
                id={`short-answer-${q.id}`}
                rows={5}
                maxLength={5000}
                placeholder="在这里填写配置命令、计算过程或文字答案…"
                value={result?.response ?? current.responseDraft ?? ""}
                disabled={!!result || !!busy}
                onChange={(event) =>
                  updateCurrent({ responseDraft: event.target.value })
                }
              />
              {!result && (
                <div
                  className="short-answer-self-rate"
                  role="group"
                  aria-label="自我评估答案"
                >
                  <span>对照题意完成作答后，自评：</span>
                  <button
                    type="button"
                    className={selected[0] === "A" ? "selected correct" : ""}
                    disabled={!!busy}
                    onClick={() => updateCurrent({ selected: ["A"] })}
                  >
                    我答对了
                  </button>
                  <button
                    type="button"
                    className={selected[0] === "B" ? "selected review" : ""}
                    disabled={!!busy}
                    onClick={() => updateCurrent({ selected: ["B"] })}
                  >
                    需要复习
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="options">
              {Object.entries(q.options).map(([k, v]) => (
                <button
                  key={k}
                  disabled={!!result}
                  className={
                    "option " +
                    (selected.includes(k) ? "chosen " : "") +
                    (result?.answer.includes(k)
                      ? "correct "
                      : result && selected.includes(k)
                        ? "incorrect"
                        : "")
                  }
                  onClick={() => choose(k)}
                >
                  <span className="option-letter">{k}</span>
                  <span>{v}</span>
                  {result?.answer.includes(k) ? (
                    <Check size={20} />
                  ) : result && selected.includes(k) ? (
                    <X size={20} />
                  ) : null}
                </button>
              ))}
            </div>
          )}
          {result && (
            <div
              className={
                "result-block " + (result.correct === false ? "wrong" : "")
              }
            >
              <h3>
                {result.correct === undefined
                  ? "答案解析"
                  : result.correct
                    ? "回答正确"
                    : "这道题还需要巩固"}
                <span>
                  {q.type === "short_answer"
                    ? "参考答案"
                    : "正确答案 " + result.answer.join("、")}
                </span>
              </h3>
              {q.type === "short_answer" && result.expectedAnswer && (
                <div className="expected-answer">{result.expectedAnswer}</div>
              )}
              <p>{result.analysis}</p>
            </div>
          )}
          {result && q.source === "ai_generated" && (
            <div className="question-feedback">
              <span>这道共享 AI 题怎么样？</span>
              <button
                className={feedbackKind === "helpful" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("helpful")}
              >
                <ThumbsUp size={15} />
                {feedbackKind === "helpful" ? "已标记有帮助" : "有帮助"}
              </button>
              <button
                className={feedbackKind === "wrong_answer" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("wrong_answer")}
              >
                <Flag size={15} />
                {feedbackKind === "wrong_answer"
                  ? "已反馈答案问题"
                  : "答案有问题"}
              </button>
              <button
                className={feedbackKind === "ambiguous" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("ambiguous")}
              >
                {feedbackKind === "ambiguous" ? "已反馈表述问题" : "表述不清"}
              </button>
              <button
                className={feedbackKind === "duplicate" ? "selected" : ""}
                disabled={!!busy}
                onClick={() => sendFeedback("duplicate")}
              >
                {feedbackKind === "duplicate" ? "已反馈重复" : "题目重复"}
              </button>
            </div>
          )}
          <div className="question-actions">
            <button
              disabled={!!busy || hint >= 3 || !!result}
              onClick={() => ask("给我提示", hint + 1)}
            >
              <Lightbulb size={17} />
              给我提示 {hint}/3
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
                    <MessageCircle size={17} />
                    AI 解析
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
                    : "下一题"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <button
                className="primary push-right"
                disabled={
                  !selected.length ||
                  (q.type === "short_answer" &&
                    !current.responseDraft?.trim()) ||
                  !!busy
                }
                onClick={submit}
              >
                {q.type === "short_answer" ? "提交自评" : "提交答案"}
                <Check size={17} />
              </button>
            )}
          </div>
        </section>
        <aside className="teacher-panel">
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
            <Sparkles size={21} />
            AI 老师
          </h2>
          <button
            className="teacher-open"
            onClick={() => setTeacherOpen(!teacherOpen)}
          >
            <MessageCircle size={17} />问 AI
            <ChevronRight size={16} />
          </button>
          {teacherOpen && (
            <>
              <div className="teacher-actions">
                {[
                  "为什么我错了？",
                  "详细讲解",
                  "换一种方法解释",
                  "举一个实际例子",
                ].map((a) => (
                  <button
                    key={a}
                    disabled={!!busy || !result}
                    onClick={() => ask(a)}
                  >
                    {a}
                  </button>
                ))}
                <button disabled={!!busy} onClick={() => train(q, 1)}>
                  给我出一道类似题
                </button>
                <button disabled={!!busy} onClick={() => train(q, 1, true)}>
                  给我出一道更难的题
                </button>
              </div>
              {!result && (
                <small className="muted">作答或查看答案后可展开完整讲解</small>
              )}
            </>
          )}
          {teacher ? (
            <div className="teacher-response">{teacher}</div>
          ) : (
            <div className="teacher-idle">
              <Lightbulb size={28} />
              <span>一步一步，找到答案</span>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
