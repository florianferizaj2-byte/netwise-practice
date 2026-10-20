import { lazy, useEffect, useRef, useState } from "react";
import { ChapterArt } from "../components/chapter-art.jsx";
import "./blue-practice-view.css";
import {
  usePracticeFlow,
  PracticeModeSwitch,
  PracticeSaveStatus,
  MemorizeStatus,
} from "../components/practice-flow.jsx";
import { PracticeModes } from "../practice-modes.jsx";
import { useDesktopWeb } from "../desktop-experience.jsx";
import {
  DesktopPracticeNav,
  usePracticeProgress,
} from "../desktop-workspace.jsx";
import {
  ArrowLeft,
  BookOpen,
  ArrowRight,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
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
import {
  PracticeAutoNext,
  usePracticeReview,
} from "../components/practice-review.jsx";
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
  onAttemptSaved,
  run,
  busy,
  train,
  configured,
  tutor,
  exit,
  blue = false,
  preferences,
  returnLabel = "返回学习总览",
}) {
  const desktop = useDesktopWeb();
  const [outcome, setOutcome] = useState({ serial: 0, streak: 0 });
  const {
    index,
    setIndex,
    responses,
    setResponses,
    done,
    setDone,
    mode,
    setMode,
  } = usePracticeProgress(session);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const started = useRef(Date.now());
  const [roundStart] = useState(() => session.startedAt || Date.now());
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - roundStart) / 1000)),
  );
  useEffect(() => {
    if (!blue || done) return;
    const timer = setInterval(
      () =>
        setElapsed(Math.max(0, Math.floor((Date.now() - roundStart) / 1000))),
      1000,
    );
    return () => clearInterval(timer);
  }, [blue, done, roundStart]);
  const q = session.questions[index];
  const current = responses[q.id] || {};
  const selected = current.selected || [];
  const memorizing = mode === "memorize";
  const flow = usePracticeFlow({
    session,
    index,
    mode,
    responses,
    setResponses,
    done,
    run,
    onSaved: onAttemptSaved,
    onConfirmed: (r) => {
      setOutcome((old) => ({
        serial: old.serial + 1,
        streak: r.correct === true ? old.streak + 1 : 0,
      }));
      review.acknowledge();
    },
  });
  const result = current.result || (memorizing ? flow.studyAnswer : null);
  const teacher = current.teacher || "";
  const hint = current.hint || 0;
  const feedbackKind = current.feedbackKind || null;
  const review = usePracticeReview({
    questionId: q.id,
    result,
    enabled: blue,
    autoNext: !memorizing && preferences?.autoNext === true,
    showAnalysis: memorizing || current.revealed || preferences?.showAnalysis,
    busy,
    done,
    last: index === session.questions.length - 1,
    next: () => jumpTo(index + 1),
    teacherOpen,
  });
  const history = session.questions
    .map((question) => responses[question.id])
    .filter((response) => response?.submitted)
    .map((response) => response.result);
  const answeredIds = new Set(history.map((item) => item.questionId));
  const revealedIds = new Set(
    session.questions
      .filter(
        (question) =>
          !responses[question.id]?.submitted &&
          (responses[question.id]?.revealed ||
            responses[question.id]?.memorized),
      )
      .map((question) => question.id),
  );
  const updateCurrent = (patch) =>
    setResponses((old) => ({
      ...old,
      [q.id]: { ...old[q.id], ...patch },
    }));
  const choose = (k) => {
    if (memorizing || result || busy || current.attemptPayload) return;
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
    review.cancel();
    setIndex(nextIndex);
    setTeacherOpen(false);
    if (desktop) window.scrollTo({ top: 0, behavior: "instant" });
    started.current = Date.now();
  };
  const submit = () => {
    if (
      memorizing ||
      current.attemptPayload ||
      busy ||
      result ||
      !selected.length ||
      (q.type === "short_answer" && !current.responseDraft?.trim())
    )
      return;
    flow.submit(
      selected,
      q.type === "short_answer" ? current.responseDraft || "" : undefined,
      Math.min(86400000, Date.now() - started.current),
    );
  };
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
  useEffect(() => {
    if (!blue || done) return;
    const keyboard = (event) => {
      if (
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        busy ||
        document.querySelector('[role="dialog"], dialog[open]') ||
        event.isComposing ||
        event.target.closest?.(
          'input,textarea,select,a,summary,[contenteditable="true"]',
        ) ||
        (event.target.closest?.("button") &&
          !event.target.closest(
            ".option,.practice-primary,.practice-mode-switch",
          ))
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        jumpTo(index - 1);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        jumpTo(index + 1);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        memorizing || result ? next() : submit();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [blue, done, busy, index, current, session, mode, result]);
  const correctCount = history.filter((h) => h.correct === true).length;
  const accuracy = history.length
    ? Math.round((correctCount / history.length) * 100)
    : null;
  if (done)
    return (
      <div className={`completion${blue ? " blue-practice-summary" : ""}`}>
        <CircleCheck size={56} />
        <h1>
          {history.length + revealedIds.size === session.questions.length
            ? "本轮练习完成"
            : "本轮练习已结束"}
        </h1>
        <p>{session.title}</p>
        <PracticeSaveStatus flow={flow} summary />
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
            {revealedIds.size}
            <small>查看答案</small>
          </strong>
          <strong>
            {Math.max(
              0,
              session.questions.length - history.length - revealedIds.size,
            )}
            <small>未作答</small>
          </strong>
        </div>
        <button className="primary" onClick={exit}>
          {returnLabel}
          <ArrowRight size={17} />
        </button>
      </div>
    );
  return (
    <div className={blue ? "blue-practice" : undefined}>
      {blue ? (
        <header className="blue-practice-heading">
          <div>
            <button
              className="blue-practice-back"
              disabled={!!busy}
              onClick={exit}
            >
              <ArrowLeft size={15} />
              {returnLabel}
            </button>
            <div className="blue-practice-title">
              <ChapterArt
                certificateId={session.certificateId}
                title={q.chapter}
              />
              <div>
                <h1>{session.title}</h1>
                <p>
                  {q.chapter} · 本轮 {session.questions.length} 题
                </p>
              </div>
            </div>
          </div>
        </header>
      ) : (
        <Heading
          title={session.title}
          subtitle={`${q.chapter}${q.knowledgeSection ? ` · ${q.knowledgeSection}` : ""} · ${q.targetKnowledgePoint || q.knowledgePoint}`}
        >
          <button onClick={exit}>
            <ArrowLeft size={16} />
            结束练习
          </button>
        </Heading>
      )}
      <div className="practice-layout">
        {blue && (
          <div className="blue-round-progress">
            <BookOpen size={22} />
            <span>
              本轮进度 <strong>{history.length}</strong> /{" "}
              {session.questions.length} 题已答
            </span>
            <div
              className="progress"
              role="progressbar"
              aria-label="本轮作答进度"
              aria-valuemin={0}
              aria-valuemax={session.questions.length}
              aria-valuenow={history.length}
            >
              <i
                style={{
                  width: `${(history.length / session.questions.length) * 100}%`,
                }}
              />
            </div>
            <span
              className="blue-round-clock"
              title="从本轮开始计算，包含暂时离开页面的时间"
            >
              <Clock size={19} />
              本轮用时{" "}
              <time>
                {Math.floor(elapsed / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(elapsed % 60).toString().padStart(2, "0")}
              </time>
            </span>
          </div>
        )}
        <section className="question-panel">
          <PracticeModeSwitch
            mode={mode}
            setMode={(value) => {
              review.cancel();
              setMode(value);
            }}
            disabled={!!busy}
          />
          <PracticeModes outcome={outcome} />
          <div className="question-top">
            <span>
              第 <b>{index + 1}</b> / {session.questions.length} 题
            </span>
            <span
              className={
                "badge " + (q.source === "ai_generated" ? "brand" : "")
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
          <div className={`progress${blue ? " blue-question-position" : ""}`}>
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
          <QuestionOrigin question={q} compact={blue} />
          <MemorizeStatus flow={flow} visible={memorizing && !current.result} />
          {q.type === "short_answer" ? (
            !memorizing && (
              <div className="short-answer-editor">
                <label htmlFor={`short-answer-${q.id}`}>我的作答</label>
                <textarea
                  id={`short-answer-${q.id}`}
                  rows={5}
                  maxLength={5000}
                  placeholder="在这里填写配置命令、计算过程或文字答案…"
                  value={result?.response ?? current.responseDraft ?? ""}
                  disabled={
                    memorizing || !!result || !!busy || !!current.attemptPayload
                  }
                  onChange={(event) =>
                    updateCurrent({ responseDraft: event.target.value })
                  }
                />
                {!result && !memorizing && (
                  <div
                    className="short-answer-self-rate"
                    role="group"
                    aria-label="自我评估答案"
                  >
                    <span>对照题意完成作答后，自评：</span>
                    <button
                      type="button"
                      className={selected[0] === "A" ? "selected correct" : ""}
                      disabled={!!busy || !!current.attemptPayload}
                      onClick={() => updateCurrent({ selected: ["A"] })}
                    >
                      我答对了
                    </button>
                    <button
                      type="button"
                      className={selected[0] === "B" ? "selected review" : ""}
                      disabled={!!busy || !!current.attemptPayload}
                      onClick={() => updateCurrent({ selected: ["B"] })}
                    >
                      需要复习
                    </button>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="options">
              {Object.entries(q.options).map(([k, v]) => (
                <button
                  key={k}
                  disabled={
                    memorizing || !!result || !!busy || !!current.attemptPayload
                  }
                  aria-pressed={selected.includes(k)}
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
              {review.expanded &&
                q.type === "short_answer" &&
                result.expectedAnswer && (
                  <div className="expected-answer">{result.expectedAnswer}</div>
                )}
              {review.expanded ? (
                <p>{result.analysis}</p>
              ) : (
                <button
                  className="practice-analysis-reveal"
                  type="button"
                  onClick={review.reveal}
                >
                  展开答案解析
                </button>
              )}
            </div>
          )}
          <PracticeAutoNext review={review} />
          <PracticeSaveStatus current={current} flow={flow} />
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
            {blue && (
              <button
                disabled={!!busy || index === 0}
                onClick={() => jumpTo(index - 1)}
              >
                <ArrowLeft size={16} />
                上一题
              </button>
            )}
            <button
              disabled={!!busy || hint >= 3 || !!result}
              onClick={() => ask("给我提示", hint + 1)}
            >
              <Lightbulb size={17} />
              给我提示 {hint}/3
            </button>
            <button
              className="text-button"
              disabled={
                memorizing || !!busy || !!result || !!current.attemptPayload
              }
              onClick={() =>
                run("正在查看答案", async () => {
                  const revealed = await flow.reveal();
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
            {result || memorizing ? (
              <>
                {result?.correct === false && (
                  <button
                    className="ai-analysis-button"
                    onClick={analyzeMistake}
                    disabled={!!busy}
                  >
                    <MessageCircle size={17} />
                    AI 解析
                  </button>
                )}
                {result?.correct === true &&
                  current.submitted &&
                  session.title === "错题复习" && (
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
                  className="primary push-right practice-primary"
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
                className="primary push-right practice-primary"
                disabled={
                  !selected.length ||
                  (q.type === "short_answer" &&
                    !current.responseDraft?.trim()) ||
                  !!busy ||
                  !!current.attemptPayload
                }
                onClick={submit}
              >
                {current.saveStatus === "pending"
                  ? "正在保存作答…"
                  : q.type === "short_answer"
                    ? "提交自评"
                    : "提交答案"}
                <Check size={17} />
              </button>
            )}
          </div>
          {blue && (
            <div className="blue-practice-shortcuts">
              <span>
                {memorizing
                  ? "Enter 下一题 · ← → 切换题目 · 背题不计入答题成绩"
                  : "Enter 提交或进入下一题 · ← → 切换题目"}
              </span>
              {!result && (
                <button
                  disabled={!!busy || index === session.questions.length - 1}
                  onClick={() => jumpTo(index + 1)}
                >
                  跳过此题
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          )}
        </section>
        <aside className="teacher-panel">
          {blue && (
            <div className="blue-answer-stats">
              <div>
                <span>已答</span>
                <strong>
                  {history.length} <small>/ {session.questions.length}</small>
                </strong>
              </div>
              <div>
                <span>正确率</span>
                <strong>{accuracy === null ? "—" : accuracy + "%"}</strong>
              </div>
            </div>
          )}
          {desktop && (
            <DesktopPracticeNav
              pageSize={blue ? 20 : 40}
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
          {tutor && (
            <button disabled={!!busy} onClick={() => tutor(q)}>
              <BookOpen size={17} />
              AI 精讲这个知识点
            </button>
          )}
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
          {blue && (
            <div className="blue-practice-end">
              <p>提交后查看答案与解析，错题自动收录。</p>
              <button disabled={!!busy} onClick={() => setDone(true)}>
                结束本轮练习
              </button>
              <small>结束后查看本轮结果</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
