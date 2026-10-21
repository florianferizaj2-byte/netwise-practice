import { useEffect, useRef, useState } from "react";
import { BookOpen, CheckCircle2, LoaderCircle, RotateCcw } from "lucide-react";
import { api } from "../api.js";
import { readPracticeProgress } from "../practice-progress.js";

// Ordinary practice may reveal answers. Keep only a few in mounted memory;
// exams and the interactive tutor never use this hook or this cache.
export function usePracticeFlow({
  session,
  index,
  mode,
  responses,
  setResponses,
  onSaved,
  onConfirmed,
  run,
  done,
}) {
  const answers = useRef(new Map());
  const answerRequests = useRef(new Set());
  const pending = useRef(new Set());
  const active = useRef(true);
  const latest = useRef(null);
  const [, redraw] = useState(0);
  const [answerError, setAnswerError] = useState(null);
  const question = session.questions[index];
  latest.current = { questionId: question.id, onSaved, onConfirmed, run };
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      for (const controller of answerRequests.current) controller.abort();
      answerRequests.current.clear();
      answers.current.clear();
    };
  }, []);
  const patch = (id, value) => {
    if (active.current)
      setResponses((old) => ({ ...old, [id]: { ...old[id], ...value } }));
    else if (session.storageKey) {
      // A save may finish after returning to the chapter list. Update only its
      // own checkpoint; never overwrite a later round or another account.
      try {
        const saved = readPracticeProgress(localStorage, session.storageKey);
        if (
          saved?.startedAt === session.startedAt &&
          JSON.stringify(saved.questionIds) ===
            JSON.stringify(session.questions.map((q) => q.id))
        )
          localStorage.setItem(
            session.storageKey,
            JSON.stringify({
              ...saved,
              responses: {
                ...saved.responses,
                [id]: { ...saved.responses[id], ...value },
              },
              updatedAt: Date.now(),
            }),
          );
      } catch {
        /* The server record remains the source of truth. */
      }
    }
  };
  const load = (q) => {
    const existing = answers.current.get(q.id);
    if (existing) return existing.promise;
    const controller = new AbortController();
    const entry = { controller };
    answerRequests.current.add(controller);
    answers.current.set(q.id, entry);
    entry.promise = api(
      `/questions/${encodeURIComponent(q.id)}/reveal`,
      {},
      "POST",
      { timeoutMs: 10000, signal: controller.signal },
    )
      .then((value) => {
        entry.value = value;
        if (active.current) {
          setAnswerError((old) => (old?.id === q.id ? null : old));
          redraw((n) => n + 1);
        }
        return value;
      })
      .catch((error) => {
        if (answers.current.get(q.id) === entry) answers.current.delete(q.id);
        if (
          active.current &&
          latest.current.questionId === q.id &&
          !controller.signal.aborted
        )
          setAnswerError({ id: q.id, message: error.message });
        throw error;
      })
      .finally(() => answerRequests.current.delete(controller));
    // Bound memory even in a session containing thousands of questions.
    for (const id of answers.current.keys()) {
      if (answers.current.size <= 6) break;
      if (id !== q.id) answers.current.delete(id);
    }
    return entry.promise;
  };
  useEffect(() => {
    const upcoming = done ? [] : session.questions.slice(index, index + 3);
    const ids = new Set(upcoming.map((q) => q.id));
    // Fast jumps cancel warmups that are no longer near the current question.
    for (const [id, entry] of answers.current)
      if (!entry.value && !ids.has(id)) {
        entry.controller.abort();
        answers.current.delete(id);
      }
    for (const q of upcoming) void load(q).catch(() => {});
  }, [session, index, done]);
  const studyAnswer = answers.current.get(question.id)?.value;
  useEffect(() => {
    if (
      mode === "memorize" &&
      studyAnswer &&
      !responses[question.id]?.memorized &&
      !responses[question.id]?.submitted
    )
      patch(question.id, { memorized: true });
  }, [
    mode,
    question.id,
    studyAnswer,
    responses[question.id]?.memorized,
    responses[question.id]?.submitted,
  ]);

  const save = async (payload) => {
    const id = payload.questionId;
    if (pending.current.has(id)) return;
    pending.current.add(id);
    patch(id, {
      saveStatus: "pending",
      saveError: "",
      attemptPayload: payload,
    });
    try {
      const result = await api("/attempts", payload);
      patch(id, {
        result,
        submitted: true,
        revealed: false,
        memorized: false,
        saveStatus: "saved",
        saveError: "",
        attemptPayload: null,
      });
      latest.current.onSaved?.(id);
      if (active.current) {
        if (latest.current.questionId === id)
          latest.current.onConfirmed?.(result);
      }
    } catch (error) {
      patch(id, { saveStatus: "error", saveError: error.message });
      if (active.current && error.status === 401)
        void latest.current.run?.("登录已失效", () => Promise.reject(error));
    } finally {
      pending.current.delete(id);
    }
  };
  const submit = (selected, response, timeMs) => {
    const current = responses[question.id];
    if (
      current?.submitted ||
      current?.attemptPayload ||
      pending.current.has(question.id)
    )
      return;
    const payload = {
      questionId: question.id,
      selected: [...selected],
      timeMs,
      clientAttemptId: crypto.randomUUID(),
      ...(response !== undefined ? { response } : {}),
      ...(session.planTask ? { planTask: session.planTask } : {}),
    };
    const answer = answers.current.get(question.id)?.value;
    if (answer)
      patch(question.id, {
        result: {
          ...answer,
          questionId: question.id,
          selected: [...selected],
          correct:
            question.type === "short_answer"
              ? selected[0] === "A"
              : JSON.stringify([...selected].sort()) ===
                JSON.stringify([...answer.answer].sort()),
          ...(response !== undefined ? { response } : {}),
        },
        submitted: false,
        revealed: false,
      });
    void save(payload);
  };
  const retry = (id = question.id) => {
    const payload = responses[id]?.attemptPayload;
    if (payload) void save(payload);
  };
  const unsettled = session.questions
    .map((q) => ({ id: q.id, ...responses[q.id] }))
    .filter((r) => r.saveStatus === "pending" || r.saveStatus === "error");
  useEffect(() => {
    if (!unsettled.length) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsettled.length]);
  return {
    submit,
    retry,
    studyAnswer,
    answerError: answerError?.id === question.id ? answerError.message : "",
    retryAnswer: () => {
      setAnswerError(null);
      void load(question).catch(() => {});
    },
    reveal: () => load(question),
    unsettled,
  };
}

export function PracticeModeSwitch({ mode, setMode, disabled, children }) {
  return (
    <div className="practice-mode-bar">
      <div role="group" aria-label="练习模式" className="practice-mode-switch">
        <button
          type="button"
          aria-pressed={mode === "practice"}
          disabled={disabled}
          onClick={() => setMode("practice")}
        >
          练习模式
        </button>
        <button
          type="button"
          aria-pressed={mode === "memorize"}
          disabled={disabled}
          onClick={() => setMode("memorize")}
        >
          <BookOpen size={15} />
          背题模式
        </button>
      </div>
      <span>
        {mode === "memorize"
          ? "直接看答案与解析 · Enter 下一题"
          : "选择答案后 Enter 提交 · 再按 Enter 下一题"}
      </span>
      {children}
    </div>
  );
}

export function PracticeSaveStatus({ current, flow, summary = false }) {
  const failed = flow.unsettled.filter((r) => r.saveStatus === "error");
  const pending = flow.unsettled.length - failed.length;
  if (summary || failed.length) {
    if (!flow.unsettled.length) return null;
    return (
      <div className="practice-save-status" role="status">
        <span>
          {pending ? `${pending} 题正在保存；` : ""}
          {failed.length
            ? `${failed.length} 题尚未保存到账号，请重试同步。${failed[0].saveError || ""}`
            : "可继续浏览，保存完成后更新记录。"}
        </span>
        {!!failed.length && (
          <button
            type="button"
            onClick={() => failed.forEach((r) => flow.retry(r.id))}
          >
            <RotateCcw size={14} />
            重试保存
          </button>
        )}
      </div>
    );
  }
  if (!current?.saveStatus) return null;
  return (
    <div className="practice-save-status" role="status">
      {current.saveStatus === "pending" ? (
        <>
          <LoaderCircle size={14} />
          <span>作答正在后台保存，可以继续下一题。</span>
        </>
      ) : (
        <>
          <CheckCircle2 size={14} />
          <span>作答已保存</span>
        </>
      )}
    </div>
  );
}

export function MemorizeStatus({ flow, visible }) {
  if (!visible || flow.studyAnswer) return null;
  return (
    <div className="practice-save-status" role="status">
      <span>{flow.answerError || "正在准备答案与解析…"}</span>
      {flow.answerError && (
        <button type="button" onClick={flow.retryAnswer}>
          重新加载答案
        </button>
      )}
    </div>
  );
}
