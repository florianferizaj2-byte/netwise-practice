import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CircleCheck,
  LoaderCircle,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import {
  api,
  cacheApiResponse,
  invalidateApiCache,
  peekCachedApi,
} from "../api.js";
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
import {
  Stem,
  StudyNotice as Notice,
  handleStudyAccessFailure as handleAccessFailure,
} from "../components/study-content.jsx";

const slow = { timeoutMs: 210000 };
const latest = (session, questionId) =>
  [...(session?.attempts || [])]
    .reverse()
    .find((row) => row.questionId === questionId);
const savedAnswers = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
};

export function StudyPractice({
  node,
  packageId,
  userId,
  active,
  onLearn,
  onNext,
  nextLabel,
  onProgress,
  onContext,
  onAccessDenied,
}) {
  const body = { nodeId: node.id, resume: true };
  const cached = peekCachedApi("/study/practice-sessions", body);
  const initial = cached?.packageId === packageId ? cached : null;
  const keyFor = (session) =>
    `aceexam-study-draft:${userId}:${session.packageId}:${session.id}`;
  const [session, setSession] = useState(initial);
  const [index, setIndex] = useState(() =>
    Math.max(
      0,
      initial?.questions.findIndex(
        (question) => !latest(initial, question.id),
      ) ?? 0,
    ),
  );
  const [draft, setDraft] = useState(() =>
    initial ? savedAnswers(keyFor(initial)).answers || {} : {},
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [redo, setRedo] = useState({}),
    [feedbackOpen, setFeedbackOpen] = useState(false),
    [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true),
    submitting = useRef(false),
    draftKey = useRef(initial ? keyFor(initial) : "");
  const requestIds = useRef(
    initial ? savedAnswers(keyFor(initial)).requests || {} : {},
  );
  const root = useRef(null),
    firstInput = useRef(null),
    answerForm = useRef(null),
    advanceButton = useRef(null),
    summary = useRef(null);
  const load = useCallback(
    async (resume = true) => {
      setBusy(true);
      setError("");
      try {
        let next = await api(
          "/study/practice-sessions",
          { nodeId: node.id, resume },
          "POST",
          resume ? { cache: { ttl: 300000 } } : {},
        );
        if (next.packageId !== packageId) {
          invalidateApiCache("/study/practice-sessions");
          next = await api(
            "/study/practice-sessions",
            { nodeId: node.id, resume },
            "POST",
            { cache: { ttl: 300000 }, force: true },
          );
        }
        if (!alive.current) return;
        draftKey.current = keyFor(next);
        const saved = savedAnswers(draftKey.current);
        setDraft(
          saved.answers && typeof saved.answers === "object"
            ? saved.answers
            : {},
        );
        requestIds.current =
          saved.requests && typeof saved.requests === "object"
            ? saved.requests
            : {};
        setSession(next);
        setRedo({});
        setFeedbackOpen(false);
        setNote("");
        setNotice("");
        const unanswered = next.questions.findIndex(
          (question) => !latest(next, question.id),
        );
        setIndex(unanswered < 0 ? 0 : unanswered);
      } catch (failure) {
        if (
          alive.current &&
          failure.name !== "CacheCancelledError" &&
          !handleAccessFailure(failure, onAccessDenied)
        )
          setError(failure.message);
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [node.id, userId, packageId, onAccessDenied],
  );
  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
      onContext(null);
    };
  }, [load]);
  useEffect(() => {
    if (session)
      cacheApiResponse("/study/practice-sessions", session, {
        nodeId: node.id,
        resume: true,
      });
  }, [session, node.id]);
  const question = session?.questions[index],
    attempt =
      question && !redo[question.id] ? latest(session, question.id) : null;
  const answered =
    session?.questions.filter((item) => latest(session, item.id)).length || 0;
  const correct =
    session?.questions.filter((item) => latest(session, item.id)?.correct)
      .length || 0;
  const complete = Boolean(session && answered === session.questions.length);
  useEffect(() => {
    if (!active || !complete) return;
    const frame = requestAnimationFrame(() =>
      summary.current?.scrollIntoView({
        block: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [active, complete]);
  useEffect(() => {
    onContext(
      active && question
        ? { sessionId: session.id, questionId: question.id }
        : null,
    );
    setFeedbackOpen(false);
    setNote("");
    setNotice("");
  }, [active, session?.id, question?.id, onContext]);
  useEffect(() => {
    if (!active || busy || !question) return;
    const frame = requestAnimationFrame(() => {
      (attempt ? advanceButton.current : firstInput.current)?.focus({
        preventScroll: true,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [active, question?.id, attempt?.id, busy]);
  const saveDraft = (answers = draft) => {
    if (!draftKey.current) return;
    try {
      localStorage.setItem(
        draftKey.current,
        JSON.stringify({ answers, requests: requestIds.current }),
      );
    } catch {
      /* Server attempts remain authoritative. */
    }
  };
  const replaceAttempt = (result) => {
    setSession((old) => ({
      ...old,
      attempts: [...old.attempts.filter((row) => row.id !== result.id), result],
    }));
    setRedo((old) => ({ ...old, [result.questionId]: false }));
    onProgress();
  };
  useEffect(() => {
    if (!attempt?.processing) return;
    let live = true;
    const timer = setInterval(() => {
      api(`/study/attempts/${encodeURIComponent(attempt.id)}`)
        .then((result) => {
          if (live) replaceAttempt(result);
        })
        .catch((failure) => {
          if (live) handleAccessFailure(failure, onAccessDenied);
        });
    }, 1800);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [attempt?.id, attempt?.processing]);
  const submit = async (event) => {
    event.preventDefault();
    if (
      submitting.current ||
      busy ||
      attempt ||
      !question ||
      !question.blanks.some((blank) => draft[question.id]?.[blank.id]?.trim())
    )
      return;
    submitting.current = true;
    setBusy(true);
    setError("");
    const answers = Object.fromEntries(
      question.blanks.map((blank) => [
        blank.id,
        draft[question.id]?.[blank.id] || "",
      ]),
    );
    const key = JSON.stringify(answers);
    if (requestIds.current[question.id]?.key !== key)
      requestIds.current[question.id] = { key, id: crypto.randomUUID() };
    saveDraft();
    try {
      const result = await api(
        `/study/practice-sessions/${session.id}/attempts`,
        {
          questionId: question.id,
          answers,
          requestId: requestIds.current[question.id].id,
        },
        "POST",
        slow,
      );
      if (alive.current) replaceAttempt(result);
    } catch (failure) {
      if (alive.current && !handleAccessFailure(failure, onAccessDenied))
        setError(failure.message);
    } finally {
      submitting.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const advance = useCallback(() => {
    if (busy || !session) return;
    if (complete) {
      if (onNext) onNext();
      else onLearn();
      return;
    }
    setIndex((current) =>
      current < session.questions.length - 1
        ? current + 1
        : Math.max(
            0,
            session.questions.findIndex((item) => !latest(session, item.id)),
          ),
    );
  }, [busy, session, complete, onNext, onLearn]);
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event) => {
      if (
        event.key !== "Enter" ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229 ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      const target = event.target;
      if (
        target.closest?.(
          "textarea, select, [contenteditable='true'], [role='dialog'], .ss-teacher, .ss-feedback-form",
        )
      )
        return;
      if (target !== document.body && !root.current?.contains(target)) return;
      if (event.repeat) {
        event.preventDefault();
        return;
      }
      if (target.closest?.("button, a")) return; // Focused controls already activate once through the browser.
      if (busy) {
        event.preventDefault();
        return;
      }
      if (attempt) {
        event.preventDefault();
        advance();
      } else if (target === document.body) {
        event.preventDefault();
        answerForm.current?.requestSubmit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, busy, attempt, advance]);
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        `/study/attempts/${attempt.id}/retry`,
        {},
        "POST",
        slow,
      );
      if (alive.current) replaceAttempt(result);
    } catch (failure) {
      if (alive.current && !handleAccessFailure(failure, onAccessDenied))
        setError(failure.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const feedback = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/study/attempts/${attempt.id}/feedback`, { note });
      if (alive.current) {
        setFeedbackOpen(false);
        setNotice("已提交复核，老师会保留你的作答记录。");
      }
    } catch (failure) {
      if (alive.current && !handleAccessFailure(failure, onAccessDenied))
        setError(failure.message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  if (!session || !question)
    return busy ? (
      <ContentPlaceholder variant="practice" rows={3} />
    ) : (
      <div className="ss-state">
        <Notice error>{error || "请先完成本课学习。"}</Notice>
        <button onClick={onLearn}>
          <BookOpen size={16} />
          回到学习
        </button>
        <button onClick={() => void load()}>
          <RefreshCw size={16} />
          重试
        </button>
      </div>
    );
  return (
    <section className="ss-practice" aria-label="填空练习" ref={root}>
      <div className="ss-practice-top">
        <div>
          <span className="ss-muted">{question.stage}练习</span>
          <h2>
            第 {index + 1} / {session.questions.length} 题
          </h2>
        </div>
        <span>
          已作答 {answered} / {session.questions.length}
        </span>
      </div>
      <div className="ss-answer-card" aria-label="切换题目">
        {session.questions.map((item, position) => (
          <button
            key={item.id}
            aria-label={`第 ${position + 1} 题${latest(session, item.id) ? "，已作答" : ""}`}
            aria-current={position === index ? "step" : undefined}
            className={`${position === index ? "active" : ""} ${latest(session, item.id) ? "answered" : ""}`}
            disabled={busy}
            onClick={() => setIndex(position)}
          >
            {position + 1}
            {latest(session, item.id) && <Check size={12} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div className="ss-question-content content-arrive" key={question.id}>
        <Stem question={question} />
        <form
          id="ss-answer-form"
          ref={answerForm}
          onSubmit={submit}
          className="ss-blanks"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              (event.nativeEvent.isComposing ||
                event.keyCode === 229 ||
                event.repeat)
            )
              event.preventDefault();
          }}
        >
          {question.blanks.map((blank, position) => (
            <label
              key={blank.id}
              htmlFor={`ss-answer-${question.id}-${blank.id}`}
            >
              <span>
                第 {position + 1} 空 · {blank.label}
                {blank.unit && `（${blank.unit}）`}
              </span>
              <input
                ref={position === 0 ? firstInput : undefined}
                id={`ss-answer-${question.id}-${blank.id}`}
                maxLength={400}
                inputMode={blank.kind === "number" ? "decimal" : "text"}
                disabled={busy || !!attempt}
                autoComplete="off"
                placeholder="输入你的答案"
                value={
                  attempt?.answers?.[blank.id] ??
                  draft[question.id]?.[blank.id] ??
                  ""
                }
                onChange={(event) => {
                  const next = {
                    ...draft,
                    [question.id]: {
                      ...draft[question.id],
                      [blank.id]: event.target.value,
                    },
                  };
                  setDraft(next);
                  saveDraft(next);
                }}
              />
            </label>
          ))}
          <button
            className="ss-hidden-submit"
            type="submit"
            tabIndex={-1}
            aria-hidden="true"
          />
        </form>
      </div>
      {error && <Notice error>{error} 你的输入仍保留在本页。</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {attempt && (
        <div
          className="ss-result content-arrive"
          aria-live="polite"
          data-correct={attempt.correct || undefined}
        >
          <h3>
            {attempt.processing
              ? "正在判分"
              : attempt.status === "pending_review"
                ? "部分答案需要复核"
                : attempt.correct
                  ? "全部答对了"
                  : "再看看这几个空"}
            <span>
              {attempt.score} / {attempt.maxScore} 分
            </span>
          </h3>
          {(attempt.processing || attempt.status === "pending_review") && (
            <p>作答已经保存。暂未确定的空不会计为错误，你可以继续学习。</p>
          )}
          <details className="ss-result-details" open={!attempt.correct}>
            <summary>查看逐空评分与参考答案</summary>
            <ul>
              {attempt.results.map((row, position) => (
                <li key={row.blankId}>
                  <strong>
                    第 {position + 1} 空：
                    {row.verdict === "correct"
                      ? "答对"
                      : row.verdict === "uncertain"
                        ? "待复核"
                        : "答错"}
                  </strong>
                  <p>
                    参考答案：{row.expectedAnswer}
                    {question.blanks.find((blank) => blank.id === row.blankId)
                      ?.unit || ""}
                  </p>
                  <p>{row.reason}</p>
                </li>
              ))}
            </ul>
          </details>
          {attempt.explanation && (
            <section>
              <h3>这题怎么理解</h3>
              <p>{attempt.explanation}</p>
            </section>
          )}
          {attempt.reviewNote && (
            <Notice>复核说明：{attempt.reviewNote}</Notice>
          )}
          <div className="ss-actions">
            {attempt.retryable && (
              <button disabled={busy} onClick={() => void retry()}>
                <RefreshCw size={16} />
                重新判分
              </button>
            )}
            {!attempt.processing && attempt.status === "graded" && (
              <button
                disabled={busy}
                onClick={() => {
                  setRedo((old) => ({ ...old, [question.id]: true }));
                  const next = { ...draft, [question.id]: {} };
                  setDraft(next);
                  delete requestIds.current[question.id];
                  saveDraft(next);
                }}
              >
                重新作答
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => setFeedbackOpen(!feedbackOpen)}
            >
              <TriangleAlert size={16} />
              申请复核
            </button>
          </div>
          {feedbackOpen && (
            <form onSubmit={feedback} className="ss-feedback-form">
              <label htmlFor="ss-feedback-note">哪里需要复核？</label>
              <textarea
                id="ss-feedback-note"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：我的表达和参考答案意思相同。"
              />
              <button disabled={busy || note.trim().length < 2}>
                提交复核
              </button>
            </form>
          )}
        </div>
      )}
      {complete && (
        <div className="ss-group-summary" role="status" ref={summary}>
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>本组已全部作答</strong>
            <p>
              已确认答对 {correct} / {session.questions.length} 题。
              {nextLabel
                ? `接下来：${nextLabel}`
                : "已到课程最后一节，可以回顾本课或再练一组。"}
            </p>
          </div>
          <button disabled={busy} onClick={() => void load(false)}>
            <RefreshCw size={15} aria-hidden="true" />
            再练一组
          </button>
        </div>
      )}
      <div className="ss-practice-footer">
        <button
          disabled={busy || index === 0}
          onClick={() => setIndex((current) => current - 1)}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          上一题
        </button>
        <span className="ss-keyboard-hint">
          <kbd>Enter</kbd>
          {attempt ? (complete ? "继续学习" : "下一题") : "提交答案"}
        </span>
        {!attempt ? (
          <button
            className="primary"
            type="submit"
            form="ss-answer-form"
            disabled={
              busy ||
              !question.blanks.some((blank) =>
                draft[question.id]?.[blank.id]?.trim(),
              )
            }
          >
            {busy ? (
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
            ) : (
              <Check size={17} aria-hidden="true" />
            )}
            {busy ? "正在判分" : "提交答案"}
          </button>
        ) : (
          <button
            className="primary"
            ref={advanceButton}
            disabled={busy}
            onClick={advance}
          >
            {complete
              ? onNext
                ? "下一知识点"
                : "回顾本课"
              : index < session.questions.length - 1
                ? "下一题"
                : "继续未完成的题"}
            <ArrowRight size={17} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
