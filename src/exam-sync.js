const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function validAnswers(session, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const questions = new Map(session.questions.map((q) => [q.id, q]));
  return Object.fromEntries(
    Object.entries(raw).filter(([id, values]) => {
      const q = questions.get(id);
      return (
        q &&
        Array.isArray(values) &&
        values.length <= (q.type === "multiple_choice" ? 20 : 1) &&
        values.every(
          (value) =>
            typeof value === "string" && Object.hasOwn(q.options, value),
        ) &&
        new Set(values).size === values.length
      );
    }),
  );
}

// Saves are serialized. Only edits made on this device remain pending; a
// conflict never silently replaces either device's work.
export function createExamSync(request) {
  let state = {
    session: null,
    answers: {},
    pending: {},
    version: 0,
    status: "saved",
    conflict: null,
    failures: 0,
  };
  let generation = 0,
    saving = null;
  const listeners = new Set();
  const update = (patch) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  function conflict(details) {
    update({
      status: "conflict",
      conflict: { answers: details.answers, version: details.version },
    });
  }
  return {
    snapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      generation++;
      saving = null;
      update({
        session: null,
        answers: {},
        pending: {},
        version: 0,
        status: "saved",
        conflict: null,
        failures: 0,
      });
    },
    restore(session, backup) {
      generation++;
      saving = null;
      const pending =
        backup?.id === session.id && !session.submitted
          ? validAnswers(session, backup.pending)
          : {};
      const version = session.answersVersion || 0;
      update({
        session,
        version,
        pending,
        answers: { ...session.answers, ...pending },
        status: "saved",
        conflict: null,
        failures: 0,
      });
      if (Object.keys(pending).length) {
        if (backup.version !== version)
          conflict({ answers: session.answers, version });
        else update({ status: "pending" });
      }
    },
    choose(id, selected) {
      if (
        !state.session ||
        state.session.submitted ||
        Date.now() >= Date.parse(state.session.expiresAt)
      )
        return;
      update({
        answers: { ...state.answers, [id]: selected },
        pending: { ...state.pending, [id]: selected },
        status: state.conflict ? "conflict" : "pending",
        failures: 0,
      });
    },
    checkpoint() {
      return state.session
        ? {
            id: state.session.id,
            version: state.version,
            pending: state.pending,
          }
        : null;
    },
    resolveConflict(choice) {
      if (!state.conflict) return;
      const { answers, version } = state.conflict;
      const pending = choice === "local" ? state.pending : {};
      update({
        version,
        pending,
        answers: { ...answers, ...pending },
        conflict: null,
        status: Object.keys(pending).length ? "pending" : "saved",
        failures: 0,
      });
    },
    save() {
      if (saving) return saving;
      if (!state.session || state.session.submitted || state.conflict)
        return Promise.resolve(false);
      const epoch = generation;
      const operation = (async () => {
        while (epoch === generation && Object.keys(state.pending).length) {
          const { session, answers, pending, version } = state;
          update({ status: "saving" });
          try {
            const response = await request(
              `/exams/${session.id}/answers`,
              { answers, expectedVersion: version },
              "PUT",
            );
            if (epoch !== generation) return false;
            if (response.expired) {
              update({ status: "expired" });
              return false;
            }
            const remaining = Object.fromEntries(
              Object.entries(state.pending).filter(
                ([id, value]) => !equal(value, pending[id]),
              ),
            );
            update({
              version: response.version,
              pending: remaining,
              status: Object.keys(remaining).length ? "pending" : "saved",
              failures: 0,
            });
          } catch (error) {
            if (epoch !== generation) return false;
            if (error.code === "EXAM_ANSWERS_CONFLICT" && error.details)
              conflict(error.details);
            else update({ status: "error", failures: state.failures + 1 });
            return false;
          }
        }
        return epoch === generation && !Object.keys(state.pending).length;
      })();
      saving = operation;
      operation.finally(() => {
        if (saving === operation) saving = null;
      });
      return operation;
    },
    async submit() {
      const epoch = generation;
      await this.save();
      if (epoch !== generation) return null;
      const { session, answers, version, pending } = state;
      if (state.conflict) throw new Error("请先处理答案同步冲突，再交卷");
      if (
        Object.keys(pending).length &&
        Date.now() < Date.parse(session.expiresAt)
      )
        throw new Error("有答案尚未保存，请联网后重试保存，再交卷");
      try {
        const result = await request(`/exams/${session.id}/submit`, {
          answers,
          expectedVersion: version,
        });
        if (epoch !== generation) return null;
        update({
          session: { ...session, submitted: true, result },
          pending: {},
          status: "saved",
        });
        return result;
      } catch (error) {
        if (
          epoch === generation &&
          error.code === "EXAM_ANSWERS_CONFLICT" &&
          error.details
        )
          conflict(error.details);
        throw error;
      }
    },
  };
}
