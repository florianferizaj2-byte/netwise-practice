import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bell, RefreshCw, X } from "lucide-react";
import { api } from "../api.js";
import { reminderClock } from "../../server/web-preference-values.js";
import "./study-reminder.css";

const learningPages = new Set([
  "practice",
  "exam",
  "study",
  "ai",
  "tutor",
  "training",
]);
const hasDialog = () =>
  !!document.querySelector(
    'dialog[open], [role="dialog"], [aria-modal="true"]',
  );
export function StudyReminder({ state, page, blocked, navigate }) {
  const [notice, setNotice] = useState(null),
    [error, setError] = useState(""),
    [eligible, setEligible] = useState(false);
  const latest = useRef(null),
    pending = useRef(null),
    running = useRef(false),
    mounted = useRef(false),
    checkRef = useRef(null);
  latest.current = { state, page, blocked };
  useEffect(() => {
    mounted.current = true;
    async function check() {
      if (!mounted.current) return;
      const current = latest.current;
      setNotice((previous) =>
        previous &&
        (previous.localDate !==
          reminderClock(Date.now(), previous.timeZone).date ||
          previous.time !== current.state.values.reminderTime ||
          previous.timeZone !== current.state.values.reminderTimeZone)
          ? null
          : previous,
      );
      const allowed =
        document.visibilityState === "visible" &&
        !current.blocked &&
        !learningPages.has(current.page) &&
        !hasDialog();
      setEligible(allowed);
      if (
        !allowed ||
        !current.state.record ||
        current.state.loading ||
        running.current
      )
        return;
      running.current = true;
      const scope = current.state.record.scope,
        version = current.state.record.version;
      if (
        !pending.current ||
        pending.current.scope !== scope ||
        pending.current.version !== version
      )
        pending.current = { scope, version, requestId: crypto.randomUUID() };
      const request = pending.current;
      try {
        const data = await api(
          "/study-reminders/check",
          { requestId: request.requestId, version },
          "POST",
        );
        if (!mounted.current || latest.current.state.record?.scope !== scope)
          return;
        const fresh = latest.current.state;
        if (data.preferences.version < fresh.record.version) return;
        if (data.preferences.version > fresh.record.version)
          fresh.accept(data.preferences);
        pending.current = null;
        setError("");
        if (!data.preferences.values.reminderEnabled) setNotice(null);
        else if (
          data.notice &&
          data.preferences.version === version &&
          latest.current.state.record.version === version
        )
          setNotice(data.notice);
      } catch {
        if (!mounted.current || latest.current.state.record?.scope !== scope)
          return;
        const values = latest.current.state.values;
        if (
          values.reminderEnabled &&
          reminderClock(Date.now(), values.reminderTimeZone).time >=
            values.reminderTime
        )
          setError("暂时无法读取学习提醒，恢复连接后会重试。");
      } finally {
        running.current = false;
        if (mounted.current && latest.current.state.record?.version !== version)
          window.setTimeout(() => void checkRef.current?.(), 0);
      }
    }
    checkRef.current = check;
    const refreshVisibility = () => {
      const c = latest.current;
      setEligible(
        document.visibilityState === "visible" &&
          !c.blocked &&
          !learningPages.has(c.page) &&
          !hasDialog(),
      );
    };
    // Observe dialogs as well as navigation: reminders must never cover an active form.
    const observer = new MutationObserver(refreshVisibility);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["open", "aria-modal", "role"],
    });
    const timer = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    void check();
    return () => {
      mounted.current = false;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    if (!state.values.reminderEnabled) {
      setNotice(null);
      setError("");
    }
    void checkRef.current?.();
  }, [
    page,
    blocked,
    state.record?.scope,
    state.record?.version,
    state.loading,
  ]);
  if (
    !eligible ||
    !state.values.reminderEnabled ||
    learningPages.has(page) ||
    blocked ||
    (!notice && !error)
  )
    return null;
  if (
    notice &&
    reminderClock(Date.now(), notice.timeZone).date !== notice.localDate
  )
    return null;
  return (
    <aside className="study-reminder" role="region" aria-label="每日学习提醒">
      <Bell size={22} aria-hidden="true" />
      <div aria-live="polite">
        <strong>
          {notice ? "给今天的学习留一点时间" : "学习提醒连接中断"}
        </strong>
        <p>
          {notice
            ? `每天 ${notice.time} · ${notice.timeZone}，按自己的节奏再进步一点。`
            : error}
        </p>
        {notice ? (
          <button
            onClick={() => {
              setNotice(null);
              navigate("plan");
            }}
          >
            查看学习计划
            <ArrowRight size={16} />
          </button>
        ) : (
          <button onClick={() => void checkRef.current?.()}>
            <RefreshCw size={16} />
            重试学习提醒
          </button>
        )}
      </div>
      <button
        className="study-reminder-close"
        aria-label="关闭本次学习提醒"
        onClick={() => {
          setNotice(null);
          setError("");
        }}
      >
        <X size={18} />
      </button>
    </aside>
  );
}
