import { useEffect, useRef, useState } from "react";
import { MessageCircle, Send } from "lucide-react";
import { api, cacheApiResponse } from "../api.js";
import {
  StudyNotice as Notice,
  handleStudyAccessFailure,
} from "./study-content.jsx";

export function LessonContent({ lesson }) {
  return (
    <article className="ss-lesson content-arrive">
      <h2>{lesson.title}</h2>
      <p className="ss-lead">{lesson.summary}</p>
      <section>
        <h3>记住这几个要点</h3>
        <ol>
          {lesson.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ol>
      </section>
      <section className="ss-example">
        <h3>看个例子</h3>
        <p>{lesson.example}</p>
      </section>
      <section>
        <h3>容易弄错的地方</h3>
        <p>{lesson.pitfall}</p>
      </section>
    </article>
  );
}

function AnswerContent({ answer }) {
  return (
    <div className="ss-teacher-answer content-arrive">
      <p>{answer.conclusion}</p>
      {answer.points?.length > 0 && (
        <ul>
          {answer.points.map((point, index) => (
            <li key={index}>{point}</li>
          ))}
        </ul>
      )}
      {answer.example && <p className="ss-teacher-example">{answer.example}</p>}
    </div>
  );
}

export function StudyTeacher({ node, packageId, context, onAccessDenied }) {
  const [messages, setMessages] = useState([]),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const live = useRef(true),
    request = useRef(null),
    sending = useRef(false),
    list = useRef(null);
  const historyPath = `/study/teacher/history?nodeId=${encodeURIComponent(node.id)}`;
  useEffect(() => {
    live.current = true;
    api(historyPath)
      .then((data) => {
        if (live.current)
          setMessages((old) =>
            old.length
              ? old
              : data.messages.map((row) => ({
                  question: row.question,
                  answer: row.answer,
                })),
          );
      })
      .catch((failure) => {
        if (live.current) handleStudyAccessFailure(failure, onAccessDenied);
      });
    return () => {
      live.current = false;
    };
  }, [node.id, packageId]);
  useEffect(() => {
    list.current?.scrollTo({
      top: list.current.scrollHeight,
      behavior: "instant",
    });
  }, [messages, busy]);
  const ask = async (action, text) => {
    if (sending.current || !text.trim()) return;
    const body = {
      nodeId: node.id,
      message: text.trim(),
      action,
      ...(context || {}),
    };
    const key = JSON.stringify(body);
    if (request.current?.key !== key)
      request.current = { key, requestId: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(
        "/study/teacher",
        { ...body, requestId: request.current.requestId },
        "POST",
        { timeoutMs: 210000 },
      );
      if (!live.current) return;
      setMessages((old) => {
        const next = [
          ...old,
          { question: text.trim(), answer: result.answer },
        ].slice(-12);
        cacheApiResponse(
          historyPath,
          { messages: next },
          undefined,
          undefined,
          60000,
        );
        return next;
      });
      setMessage("");
      request.current = null;
    } catch (failure) {
      if (live.current && !handleStudyAccessFailure(failure, onAccessDenied))
        setError(failure.message);
    } finally {
      sending.current = false;
      if (live.current) setBusy(false);
    }
  };
  return (
    <aside className="ss-teacher" aria-label="AI 老师">
      <div className="ss-teacher-heading">
        <MessageCircle size={19} aria-hidden="true" />
        <div>
          <h2>问老师</h2>
          <p>哪里不明白，随时问。</p>
        </div>
      </div>
      <div
        className="ss-chat"
        ref={list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {!messages.length && (
          <p className="ss-muted">
            我会先给你一个简短解释。想了解更多，再追问就好。
          </p>
        )}
        {messages.map((row, index) => (
          <div className="ss-chat-turn" key={index}>
            <p className="ss-student-message">{row.question}</p>
            <AnswerContent answer={row.answer} />
          </div>
        ))}
        {busy && (
          <div
            className="ss-thinking"
            role="status"
            aria-label="老师正在整理回答"
          >
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <div className="ss-quick-actions">
        <button
          disabled={busy}
          onClick={() =>
            void ask(
              context ? "hint" : "simple",
              context ? "给我一点提示" : "再简单一点",
            )
          }
        >
          {context ? "给点提示" : "再简单一点"}
        </button>
        <button
          disabled={busy}
          onClick={() => void ask("example", "举个小例子")}
        >
          举个例子
        </button>
      </div>
      {error && (
        <Notice error id="ss-teacher-error">
          {error}
        </Notice>
      )}
      <form
        className="ss-question-form"
        onSubmit={(event) => {
          event.preventDefault();
          void ask("ask", message);
        }}
      >
        <label htmlFor="ss-teacher-message">你的问题</label>
        <textarea
          id="ss-teacher-message"
          rows={3}
          maxLength={600}
          value={message}
          aria-invalid={!!error}
          aria-describedby={error ? "ss-teacher-error" : undefined}
          onChange={(event) => {
            setMessage(event.target.value);
            setError("");
          }}
          placeholder="用自己的话说说哪里没理解…"
        />
        <button
          className="primary"
          disabled={busy || message.trim().length < 2}
        >
          <Send size={16} aria-hidden="true" />
          {busy ? "正在回答" : "问老师"}
        </button>
      </form>
    </aside>
  );
}
