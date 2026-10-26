import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { api } from "./api.js";
import { createExamSync } from "./exam-sync.js";

export function useExamSession({ userId, certificateId, run, refresh }) {
  const key = `kaojiang-exam-v2:${userId}:${certificateId}`;
  const sync = useMemo(
    () =>
      createExamSync((url, body, method) =>
        api(url, body, method, { timeoutMs: 10000 }),
      ),
    [key],
  );
  const state = useSyncExternalStore(sync.subscribe, sync.snapshot);
  const [index, setIndex] = useState(0),
    [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false),
    [recent, setRecent] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadError, setLoadError] = useState(""),
    [loadRevision, setLoadRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const interaction = useRef(0);
  const busy = useRef(false),
    autoSubmit = useRef(null),
    actions = useRef({ run, refresh });
  actions.current = { run, refresh };
  useEffect(() => {
    let live = true;
    const revision = ++interaction.current;
    const current = () => live && revision === interaction.current;
    setLoading(true);
    setRecent([]);
    setHistory([]);
    setIndex(0);
    autoSubmit.current = null;
    setLoadError("");
    (async () => {
      let backup;
      try {
        backup = JSON.parse(localStorage.getItem(key) || "null");
      } catch {
        /* Storage is optional. */
      }
      let legacy;
      if (!backup)
        try {
          legacy = JSON.parse(localStorage.getItem("netwise-exam") || "null");
        } catch {
          /* Old storage can be corrupt. */
        }
      const history = await api("/exams");
      if (!current()) return;
      setRecent(history.sessions.filter((exam) => !exam.submitted));
      setHistory(history.sessions);
      const savedId = backup?.id || legacy?.id;
      if (savedId) {
        try {
          const session = await api(`/exams/${encodeURIComponent(savedId)}`);
          if (current()) {
            // Legacy local answers have no server revision. Ask the learner
            // before merging them, after ownership has been checked by the API.
            const migrated = legacy
              ? {
                  id: session.id,
                  version: -1,
                  pending: Object.fromEntries(
                    Object.entries(legacy.answers || {}).filter(
                      ([id, values]) =>
                        JSON.stringify(values) !==
                        JSON.stringify(session.answers[id] || []),
                    ),
                  ),
                }
              : backup;
            sync.restore(session, migrated);
            if (
              Number.isInteger(backup?.index) &&
              backup.index >= 0 &&
              backup.index < session.questions.length
            )
              setIndex(backup.index);
            if (legacy)
              try {
                localStorage.removeItem("netwise-exam");
              } catch {
                /* Optional storage. */
              }
          }
        } catch (error) {
          if (current()) setLoadError(error.message);
        }
      }
    })()
      .catch((error) => {
        if (current()) setLoadError(error.message);
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [key, sync, loadRevision]);
  useEffect(() => {
    if (!state.session) return;
    try {
      if (state.session.submitted) localStorage.removeItem(key);
      else
        localStorage.setItem(
          key,
          JSON.stringify({ ...sync.checkpoint(), index }),
        );
    } catch {
      /* Saving to the server remains available in private browsing. */
    }
  }, [key, state, sync, index]);
  useEffect(() => {
    const retry = state.status === "error" && state.failures <= 4;
    if (state.status !== "pending" && !retry) return;
    const timer = setTimeout(
      () => void sync.save(),
      retry ? Math.min(30000, 1000 * 2 ** state.failures) : 200,
    );
    return () => clearTimeout(timer);
  }, [sync, state.status, state.pending, state.failures]);
  useEffect(() => {
    const online = () => {
      if (sync.snapshot().status !== "conflict") void sync.save();
    };
    const leaving = (event) => {
      if (!Object.keys(sync.snapshot().pending).length) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", leaving);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", leaving);
    };
  }, [sync]);
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setSubmitting(true);
    try {
      await actions.current.run("正在提交考试", async () => {
        const result = await sync.submit();
        if (result) await actions.current.refresh();
        return result;
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }
  useEffect(() => {
    if (!state.session || state.session.submitted) return;
    const tick = () => {
      const value = Math.max(
        0,
        Math.ceil((Date.parse(state.session.expiresAt) - Date.now()) / 1000),
      );
      setRemaining(value);
      if (
        !value &&
        autoSubmit.current !== state.session.id &&
        !sync.snapshot().conflict
      ) {
        autoSubmit.current = state.session.id;
        void submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sync, state.session?.id, state.session?.submitted, state.conflict]);
  const start = (session) => {
    interaction.current++;
    setLoading(false);
    sync.restore(session);
    setIndex(0);
    autoSubmit.current = null;
  };
  const resume = (summary) =>
    actions.current.run("正在恢复考试", async () => {
      start(await api(`/exams/${summary.id}`));
    });
  return {
    exam: state.session,
    answers: state.answers,
    result: state.session?.result,
    index,
    setIndex,
    remaining,
    submitting,
    reset: () => {
      interaction.current++;
      sync.reset();
      setIndex(0);
      setLoading(false);
      setRecent([]);
      setLoadRevision((value) => value + 1);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Optional storage. */
      }
    },
    start,
    resume,
    submit,
    pause: async () => {
      if (busy.current) return;
      busy.current = true;
      setSubmitting(true);
      try {
        await actions.current.run("正在保存考试进度", async () => {
          if (!(await sync.save()) || sync.snapshot().conflict)
            throw new Error("答案尚未同步，请先完成保存后再返回考试设置");
          if (Date.now() >= Date.parse(sync.snapshot().session.expiresAt)) {
            autoSubmit.current = null;
            throw new Error("考试时间已到，请先完成交卷");
          }
          interaction.current++;
          sync.reset();
          setIndex(0);
          autoSubmit.current = null;
          try {
            localStorage.removeItem(key);
          } catch {
            /* Server progress remains available. */
          }
          setLoadRevision((value) => value + 1);
        });
      } finally {
        busy.current = false;
        setSubmitting(false);
      }
    },
    recent,
    history,
    loading,
    loadError,
    retryLoad: () => setLoadRevision((value) => value + 1),
    choose: sync.choose,
    save: () => sync.save(),
    saveState: state.status,
    resolveConflict: (choice) => {
      sync.resolveConflict(choice);
      if (choice === "local") void sync.save();
    },
  };
}
