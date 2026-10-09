import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleCheck, Crown, LoaderCircle,
  MessageCircle, RefreshCw, Send, Target, TriangleAlert, X } from "lucide-react";
import { api } from "../api.js";
import "../subjective-study.css";

const encode = encodeURIComponent;
const slow = { timeoutMs: 210000 };
const uuid = () => crypto.randomUUID();
const statusName = { graded: "已判分", pending_review: "待复核", processing: "正在判分" };
const handleAccessFailure = (failure, onAccessDenied) => {
  if (failure.code !== "STUDY_MEMBERSHIP_REQUIRED") return false;
  onAccessDenied();
  return true;
};

function Notice({ error, children, id }) {
  return <div id={id} className={`ss-notice ${error ? "ss-error" : ""}`} role={error ? "alert" : "status"}>
    {error ? <TriangleAlert size={17} /> : <BookOpen size={17} />}<span>{children}</span>
  </div>;
}

export function LessonContent({ lesson }) {
  return <article className="ss-lesson">
    <h2>{lesson.title}</h2><p className="ss-lead">{lesson.summary}</p>
    <section><h3>记住这几个要点</h3><ol>{lesson.points.map((point, i) => <li key={i}>{point}</li>)}</ol></section>
    <section className="ss-example"><h3>看个例子</h3><p>{lesson.example}</p></section>
    <section><h3>容易弄错的地方</h3><p>{lesson.pitfall}</p></section>
  </article>;
}

function AnswerContent({ answer }) {
  return <div className="ss-teacher-answer"><p>{answer.conclusion}</p>
    {answer.points?.length > 0 && <ul>{answer.points.map((point, i) => <li key={i}>{point}</li>)}</ul>}
    {answer.example && <p className="ss-teacher-example">{answer.example}</p>}
  </div>;
}

function Teacher({ node, packageId, context, onAccessDenied }) {
  const [messages, setMessages] = useState([]), [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const live = useRef(true), request = useRef(null), list = useRef(null);
  useEffect(() => {
    live.current = true;
    api(`/study/teacher/history?nodeId=${encode(node.id)}`).then((data) => {
      if (live.current) setMessages((old) => old.length ? old : data.messages.map((row) => ({ question: row.question, answer: row.answer })));
    }).catch((failure) => { if (live.current) handleAccessFailure(failure, onAccessDenied); });
    return () => { live.current = false; };
  }, [node.id, packageId]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "instant" }); }, [messages, busy]);
  const ask = async (action, text) => {
    if (busy || !text.trim()) return;
    const body = { nodeId: node.id, message: text.trim(), action, ...(context || {}) };
    const key = JSON.stringify(body);
    if (request.current?.key !== key) request.current = { key, requestId: uuid() };
    setBusy(true); setError("");
    try {
      const result = await api("/study/teacher", { ...body, requestId: request.current.requestId }, "POST", slow);
      if (!live.current) return;
      setMessages((old) => [...old, { question: text.trim(), answer: result.answer }].slice(-12));
      setMessage(""); request.current = null;
    } catch (failure) { if (live.current && !handleAccessFailure(failure, onAccessDenied)) setError(failure.message); }
    finally { if (live.current) setBusy(false); }
  };
  return <aside className="ss-teacher" aria-label="AI 老师">
    <div className="ss-teacher-heading"><MessageCircle size={19} /><div><h2>问老师</h2><p>哪里不明白，随时问。</p></div></div>
    <div className="ss-chat" ref={list} role="log" aria-live="polite" aria-relevant="additions">
      {!messages.length && <p className="ss-muted">我会先给你一个简短解释。想了解更多，再追问就好。</p>}
      {messages.map((row, i) => <div className="ss-chat-turn" key={i}><p className="ss-student-message">{row.question}</p><AnswerContent answer={row.answer} /></div>)}
      {busy && <p className="ss-muted"><LoaderCircle className="spin" size={16} />老师正在整理回答…</p>}
    </div>
    <div className="ss-quick-actions">
      <button disabled={busy} onClick={() => void ask(context ? "hint" : "simple", context ? "给我一点提示" : "再简单一点")}>{context ? "给点提示" : "再简单一点"}</button>
      <button disabled={busy} onClick={() => void ask("example", "举个小例子")}>举个例子</button>
    </div>
    {error && <Notice error id="ss-teacher-error">{error}</Notice>}
    <form className="ss-question-form" onSubmit={(event) => { event.preventDefault(); void ask("ask", message); }}>
      <label htmlFor="ss-teacher-message">你的问题</label>
      <textarea id="ss-teacher-message" rows={3} maxLength={600} value={message} aria-invalid={!!error} aria-describedby={error ? "ss-teacher-error" : undefined} onChange={(event) => { setMessage(event.target.value); setError(""); }} placeholder="用自己的话说说哪里没理解…" />
      <button className="primary" disabled={busy || message.trim().length < 2}><Send size={16} />{busy ? "正在回答" : "问老师"}</button>
    </form>
  </aside>;
}

function Stem({ question }) {
  return <p className="ss-stem">{question.stem.split(/(\{\{b[1-3]\}\})/g).map((part, i) => {
    const match = part.match(/^\{\{(b[1-3])\}\}$/);
    return match ? <span key={i} className="ss-blank-marker">第 {question.blanks.findIndex((blank) => blank.id === match[1]) + 1} 空</span> : part;
  })}</p>;
}

function Practice({ node, userId, onLearn, onProgress, onContext, onAccessDenied }) {
  const [session, setSession] = useState(null), [index, setIndex] = useState(0), [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [redo, setRedo] = useState({}), [feedbackOpen, setFeedbackOpen] = useState(false), [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true), submitting = useRef(false), draftKey = useRef(""), requestIds = useRef({});
  const latest = (value, questionId) => [...(value?.attempts || [])].reverse().find((row) => row.questionId === questionId);
  const load = useCallback(async (resume = true) => {
    setBusy(true); setError("");
    try {
      const next = await api("/study/practice-sessions", { nodeId: node.id, resume });
      if (!alive.current) return;
      const key = `aceexam-study-draft:${userId}:${next.packageId}:${next.id}`;
      draftKey.current = key;
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* A broken local draft never blocks server recovery. */ }
      setDraft(saved.answers && typeof saved.answers === "object" ? saved.answers : {});
      requestIds.current = saved.requests && typeof saved.requests === "object" ? saved.requests : {};
      setSession(next); setRedo({}); setFeedbackOpen(false); setNote(""); setNotice("");
      const unanswered = next.questions.findIndex((question) => !latest(next, question.id));
      setIndex(unanswered < 0 ? 0 : unanswered);
    } catch (failure) { if (alive.current && !handleAccessFailure(failure, onAccessDenied)) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }, [node.id, userId, onAccessDenied]);
  useEffect(() => { alive.current = true; void load(); return () => { alive.current = false; onContext(null); }; }, [load]);
  const question = session?.questions[index], attempt = question && !redo[question.id] ? latest(session, question.id) : null;
  useEffect(() => {
    onContext(question ? { sessionId: session.id, questionId: question.id } : null);
    setFeedbackOpen(false); setNote(""); setNotice("");
  }, [session?.id, question?.id, onContext]);
  const saveDraft = (answers = draft) => {
    if (!draftKey.current) return;
    try { localStorage.setItem(draftKey.current, JSON.stringify({ answers, requests: requestIds.current })); }
    catch { /* Storage can be unavailable; server attempts remain authoritative. */ }
  };
  const replaceAttempt = (result) => {
    setSession((old) => ({ ...old, attempts: [...old.attempts.filter((row) => row.id !== result.id), result] }));
    setRedo((old) => ({ ...old, [result.questionId]: false }));
    onProgress();
  };
  useEffect(() => {
    if (!attempt?.processing) return;
    let active = true;
    const timer = setInterval(() => {
      api(`/study/attempts/${encode(attempt.id)}`).then((result) => { if (active) replaceAttempt(result); }).catch((failure) => { if (active) handleAccessFailure(failure, onAccessDenied); });
    }, 1800);
    return () => { active = false; clearInterval(timer); };
  }, [attempt?.id, attempt?.processing]);
  const submit = async (event) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    const answers = Object.fromEntries(question.blanks.map((blank) => [blank.id, draft[question.id]?.[blank.id] || ""]));
    const key = JSON.stringify(answers);
    if (requestIds.current[question.id]?.key !== key) requestIds.current[question.id] = { key, id: uuid() };
    saveDraft();
    try {
      const result = await api(`/study/practice-sessions/${session.id}/attempts`, {
        questionId: question.id, answers, requestId: requestIds.current[question.id].id,
      }, "POST", slow);
      if (alive.current) replaceAttempt(result);
    } catch (failure) { if (alive.current && !handleAccessFailure(failure, onAccessDenied)) setError(failure.message); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  };
  const retry = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try { const result = await api(`/study/attempts/${attempt.id}/retry`, {}, "POST", slow); if (alive.current) replaceAttempt(result); }
    catch (failure) { if (alive.current && !handleAccessFailure(failure, onAccessDenied)) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const feedback = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await api(`/study/attempts/${attempt.id}/feedback`, { note });
      if (alive.current) { setFeedbackOpen(false); setNotice("已提交复核，老师会保留你的作答记录。"); }
    } catch (failure) { if (alive.current && !handleAccessFailure(failure, onAccessDenied)) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  };
  if (!session) return <div className="ss-state">{busy ? <><LoaderCircle className="spin" /><p>正在准备练习…</p></> : <><Notice error>{error || "请先完成本课学习。"}</Notice><button onClick={onLearn}><BookOpen size={16} />回到学习</button><button onClick={() => void load()}><RefreshCw size={16} />重试</button></>}</div>;
  const answered = session.questions.filter((q) => latest(session, q.id)).length;
  const correct = session.questions.filter((q) => latest(session, q.id)?.correct).length;
  return <section className="ss-practice" aria-label="填空练习">
    <div className="ss-practice-top"><div><span className="ss-muted">{question.stage}练习</span><h2>第 {index + 1} / {session.questions.length} 题</h2></div><span>已作答 {answered} / {session.questions.length}</span></div>
    <div className="ss-answer-card" aria-label="切换题目">{session.questions.map((q, i) => <button key={q.id} aria-label={`第 ${i + 1} 题${latest(session, q.id) ? "，已作答" : ""}`} aria-current={i === index ? "step" : undefined} className={i === index ? "active" : ""} disabled={busy} onClick={() => setIndex(i)}>{i + 1}{latest(session, q.id) && <Check size={12} />}</button>)}</div>
    <Stem question={question} />
    <form onSubmit={submit} className="ss-blanks">
      {question.blanks.map((blank, i) => <label key={blank.id} htmlFor={`ss-answer-${question.id}-${blank.id}`}><span>第 {i + 1} 空 · {blank.label}{blank.unit && `（${blank.unit}）`}</span>
        <input id={`ss-answer-${question.id}-${blank.id}`} maxLength={400} inputMode={blank.kind === "number" ? "decimal" : "text"}
          disabled={busy || !!attempt} autoComplete="off" placeholder="输入你的答案"
          value={attempt?.answers?.[blank.id] ?? draft[question.id]?.[blank.id] ?? ""}
          onChange={(event) => { const next = { ...draft, [question.id]: { ...draft[question.id], [blank.id]: event.target.value } }; setDraft(next); saveDraft(next); }} />
      </label>)}
      {!attempt && <button className="primary" disabled={busy || !question.blanks.some((blank) => draft[question.id]?.[blank.id]?.trim())}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? "正在判分" : "提交答案"}</button>}
    </form>
    {error && <Notice error>{error} 你的输入仍保留在本页。</Notice>}
    {notice && <Notice>{notice}</Notice>}
    {attempt && <div className="ss-result" aria-live="polite">
      <h3>{attempt.processing ? "正在判分" : attempt.status === "pending_review" ? "部分答案需要复核" : attempt.correct ? "全部答对了" : "再看看这几个空"}<span>{attempt.score} / {attempt.maxScore} 分</span></h3>
      {(attempt.processing || attempt.status === "pending_review") && <p>作答已经保存。暂未确定的空不会计为错误，你可以继续学习。</p>}
      <ul>{attempt.results.map((row, i) => <li key={row.blankId}><strong>第 {i + 1} 空：{row.verdict === "correct" ? "答对" : row.verdict === "uncertain" ? "待复核" : "答错"}</strong><p>参考答案：{row.expectedAnswer}{question.blanks.find((blank) => blank.id === row.blankId)?.unit || ""}</p><p>{row.reason}</p></li>)}</ul>
      {attempt.explanation && <section><h3>这题怎么理解</h3><p>{attempt.explanation}</p></section>}
      {attempt.reviewNote && <Notice>复核说明：{attempt.reviewNote}</Notice>}
      <div className="ss-actions">
        {attempt.retryable && <button disabled={busy} onClick={() => void retry()}><RefreshCw size={16} />重新判分</button>}
        {!attempt.processing && attempt.status === "graded" && <button disabled={busy} onClick={() => { setRedo((old) => ({ ...old, [question.id]: true })); const next = { ...draft, [question.id]: {} }; setDraft(next); delete requestIds.current[question.id]; saveDraft(next); }}>重新作答</button>}
        <button disabled={busy} onClick={() => setFeedbackOpen(!feedbackOpen)}><TriangleAlert size={16} />申请复核</button>
      </div>
      {feedbackOpen && <form onSubmit={feedback} className="ss-feedback-form"><label htmlFor="ss-feedback-note">哪里需要复核？</label><textarea id="ss-feedback-note" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：我的表达和参考答案意思相同。" /><button disabled={busy || note.trim().length < 2}>提交复核</button></form>}
    </div>}
    <div className="ss-actions ss-practice-navigation"><button disabled={busy || index === 0} onClick={() => setIndex((old) => old - 1)}><ArrowLeft size={16} />上一题</button>
      {index < session.questions.length - 1 ? <button disabled={busy} className="primary" onClick={() => setIndex((old) => old + 1)}>下一题<ArrowRight size={16} /></button> : <button disabled={busy} onClick={() => void load(false)}><RefreshCw size={16} />再练一组</button>}
    </div>
    {answered === session.questions.length && <div className="ss-group-summary"><CircleCheck size={20} /><div><strong>本组已全部作答</strong><p>已确认答对 {correct} 题。重做用于巩固，掌握进度按不同题目的独立作答更新。</p></div></div>}
  </section>;
}

export function SubjectiveStudy({ user, navigate }) {
  const [catalog, setCatalog] = useState(null), [selected, setSelected] = useState(""), [chapter, setChapter] = useState("");
  const [expandedTopics, setExpandedTopics] = useState([]);
  const tabKey = `aceexam-study-tab:${user.id}:${user.certificateId}`;
  const [tab, setTab] = useState(() => { try { return localStorage.getItem(tabKey) === "practice" ? "practice" : "learn"; } catch { return "learn"; } });
  const [lesson, setLesson] = useState(null), [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true), [lessonLoading, setLessonLoading] = useState(false);
  const [error, setError] = useState(""), [lessonError, setLessonError] = useState(""), [completing, setCompleting] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(true);
  const mounted = useRef(true), reading = useRef(0);
  const revokeAccess = useCallback(() => {
    reading.current++;
    setCatalog((old) => old ? { ...old, access: false, nodes: [] } : old);
    setLesson(null); setContext(null);
  }, []);
  const selectionKey = `aceexam-study-position:${user.id}:${user.certificateId}`;
  useEffect(() => { try { localStorage.setItem(tabKey, tab); } catch { /* Optional local tab recovery. */ } }, [tabKey, tab]);
  const reload = useCallback(async () => {
    let data = await api("/study/catalog");
    if (!mounted.current) return;
    if (!data.access || (data.expiresAt && Date.parse(data.expiresAt) <= Date.now())) {
      data = { ...data, access: false, nodes: [] };
      revokeAccess();
    }
    setCatalog(data); setError("");
    setSelected((current) => {
      if (data.nodes.some((node) => node.id === current)) return current;
      let saved = ""; try { saved = localStorage.getItem(selectionKey); } catch { /* Optional local position. */ }
      return data.nodes.find((node) => node.id === saved)?.id || data.nodes.find((node) => node.available && !node.completed)?.id || data.nodes.find((node) => node.available)?.id || data.nodes[0]?.id || "";
    });
  }, [selectionKey, revokeAccess]);
  useEffect(() => { mounted.current = true; void reload().catch((failure) => { if (mounted.current) setError(failure.message); }).finally(() => { if (mounted.current) setLoading(false); }); return () => { mounted.current = false; }; }, [reload]);
  useEffect(() => {
    const refreshVisible = () => { if (!document.hidden) void reload().catch(() => {}); };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 60000);
    const remaining = catalog?.access && catalog.expiresAt ? Date.parse(catalog.expiresAt) - Date.now() : NaN;
    const expiry = Number.isFinite(remaining) && remaining <= 2147483647 ? window.setTimeout(() => {
      revokeAccess(); void reload().catch(() => {});
    }, Math.max(0, remaining)) : null;
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(timer); if (expiry !== null) window.clearTimeout(expiry);
    };
  }, [reload, catalog?.access, catalog?.expiresAt, revokeAccess]);
  const node = catalog?.nodes.find((item) => item.id === selected) || catalog?.nodes[0];
  useEffect(() => { if (node) setChapter(node.chapter); setContext(null); try { if (selected) localStorage.setItem(selectionKey, selected); } catch { /* Optional local position. */ } }, [selected, selectionKey]);
  useEffect(() => {
    const revision = ++reading.current;
    setLesson(null); setLessonError("");
    if (!node?.available || !catalog?.access) { setLessonLoading(false); return; }
    setLessonLoading(true);
    api(`/study/lessons/${encode(node.id)}`).then((data) => { if (mounted.current && reading.current === revision) setLesson(data); })
      .catch((failure) => { if (mounted.current && reading.current === revision && !handleAccessFailure(failure, revokeAccess)) setLessonError(failure.message); })
      .finally(() => { if (mounted.current && reading.current === revision) setLessonLoading(false); });
  }, [selected, node?.packageId, catalog?.access]);
  const refreshProgress = useCallback(() => { void reload().catch(() => {}); }, [reload]);
  const complete = async () => {
    setCompleting(true); setLessonError("");
    try {
      if (!node.completed) await api(`/study/lessons/${encode(node.id)}/complete`, { version: node.progressVersion });
      await reload(); if (mounted.current) setTab("practice");
    } catch (failure) { if (mounted.current && !handleAccessFailure(failure, revokeAccess)) { setLessonError(failure.message); void reload().catch(() => {}); } }
    finally { if (mounted.current) setCompleting(false); }
  };
  const chapters = [...new Set(catalog?.nodes.map((item) => item.chapter) || [])];
  const activeNodes = catalog?.nodes.filter((item) => item.chapter === chapter) || [];
  const activeSections = [...new Set(activeNodes.map((item) => item.section))].map((name) => {
    const topics = [];
    for (const item of activeNodes.filter((row) => row.section === name)) {
      const key = item.parentId || item.id;
      let topic = topics.find((row) => row.key === key);
      if (!topic) { topic = { key, name: item.parentName || item.name, units: [] }; topics.push(topic); }
      topic.units.push(item);
    }
    return { name, topics };
  });
  const siblings = node ? activeNodes.filter((item) => (item.parentId || item.id) === (node.parentId || node.id)) : [];
  const next = catalog?.nodes.find((item) => item.order > node?.order && item.available);
  const changeNode = (id) => { setSelected(id); setTab("learn"); };
  return <div className="subjective-study">
    <header className="ss-heading"><div><h1>AI 精讲与练习</h1><p>先学明白，再用填空练习巩固。</p></div><div className="ss-actions">
      <button disabled={loading} aria-label="刷新学习目录" onClick={() => { setLoading(true); void reload().catch((failure) => setError(failure.message)).finally(() => setLoading(false)); }}><RefreshCw size={17} /></button>
    </div></header>
    {error && <Notice error>{error}</Notice>}
    {loading && !catalog ? <div className="ss-state"><LoaderCircle className="spin" /><p>正在加载学习目录…</p></div> : !catalog ? <button onClick={() => void reload().catch((failure) => setError(failure.message))}>重试</button> : !catalog.access ? <div className="ss-gate"><Crown size={30} /><h2>VIP 专属的学习与练习</h2><p>开通或续期 VIP 后，可学习精讲、完成填空练习并向 AI 老师提问。VIP、SVIP、SSVIP 均可使用。</p><button className="primary" onClick={() => navigate("vip")}>开通或续期 VIP<ArrowRight size={17} /></button></div> : !catalog.supported ? <div className="ss-gate"><BookOpen size={30} /><h2>当前证书的课程正在准备</h2><p>已开放网络工程师和四川专升本计算机基础课程。你可以在侧栏切换证书，或继续普通练习。</p><button onClick={() => navigate("chapters")}>返回章节练习</button></div> : <div className="ss-layout">
      <nav className="ss-directory" aria-label="精讲与练习目录"><label htmlFor="ss-chapter">章节</label><select id="ss-chapter" value={chapter} onChange={(event) => { const first = catalog.nodes.find((item) => item.chapter === event.target.value); if (first) changeNode(first.id); }}>{chapters.map((name) => <option key={name}>{name}</option>)}</select>
        <label className="ss-compact-node" htmlFor="ss-node-select"><span>知识点与小节</span><select id="ss-node-select" aria-label="知识点与小节" value={node.id} onChange={(event) => changeNode(event.target.value)}>{activeSections.map((section) => <optgroup key={section.name} label={section.name}>{section.topics.flatMap((topic) => topic.units.map((item) => <option key={item.id} value={item.id}>{topic.units.length > 1 ? `${topic.name} · 第${item.sublesson.order}节 ${item.sublesson.title}` : item.name}{item.available ? "" : "（准备中）"}</option>))}</optgroup>)}</select></label>
        <p className="ss-directory-progress">已学 {activeNodes.filter((item) => item.completed).length} / {activeNodes.length} 节</p>
        {activeSections.map((section) => <section key={section.name}><h3>{section.name}</h3>{section.topics.map((topic) => topic.units.length === 1 ? (() => {
          const item = topic.units[0];
          return <button key={topic.key} className={item.id === selected ? "active" : ""} aria-current={item.id === selected ? "page" : undefined} onClick={() => changeNode(item.id)}>
            <span>{topic.name}<small>{item.mastery.mastered ? "已掌握" : item.completed ? "已学，继续巩固" : item.available ? "可以学习" : "准备中"}</small></span>{item.completed ? <CircleCheck size={16} /> : <ArrowRight size={15} />}
          </button>;
        })() : <div className="ss-directory-topic" key={topic.key}>
          {(() => {
            const expanded = expandedTopics.includes(topic.key);
            const currentUnit = topic.units.find((item) => item.id === selected);
            const listId = `ss-topic-units-${topic.key}`;
            return <>
              <button className={`ss-topic-summary ${currentUnit ? "active" : ""}`} aria-expanded={expanded} aria-controls={listId}
                onClick={() => setExpandedTopics((current) => expanded ? current.filter((key) => key !== topic.key) : [...current, topic.key])}>
                <span>{topic.name}<small>已学 {topic.units.filter((item) => item.completed).length} / {topic.units.length} 节{currentUnit ? ` · 当前：${currentUnit.sublesson.order}. ${currentUnit.sublesson.title}` : ""}</small></span><ChevronDown className={expanded ? "ss-topic-chevron expanded" : "ss-topic-chevron"} size={17} aria-hidden="true" />
              </button>
              <div className="ss-directory-units" id={listId} hidden={!expanded}>{topic.units.map((item) => <button key={item.id} className={item.id === selected ? "active" : ""} aria-current={item.id === selected ? "page" : undefined} onClick={() => changeNode(item.id)}>
            <span>{item.sublesson.order}. {item.sublesson.title}<small>{item.mastery.mastered ? "已掌握" : item.completed ? "已学，继续巩固" : item.available ? "可以学习" : "准备中"}</small></span>{item.completed ? <CircleCheck size={16} /> : <ArrowRight size={15} />}
              </button>)}</div>
            </>;
          })()}
        </div>)}</section>)}
      </nav>
      <div className="ss-workspace">{siblings.length > 1 && <nav className="ss-sublesson-selector" aria-label={`${node.parentName}小节`}><span>{node.parentName} · {siblings.filter((item) => item.completed).length}/{siblings.length} 节已学</span>{siblings.length > 8 ? <><label htmlFor="ss-current-unit">当前知识点的小节</label><select id="ss-current-unit" value={node.id} onChange={(event) => changeNode(event.target.value)}>{siblings.map((item) => <option key={item.id} value={item.id}>{item.sublesson.order}. {item.sublesson.title}{item.completed ? "（已学）" : ""}</option>)}</select></> : <div>{siblings.map((item) => <button key={item.id} className={item.id === node.id ? "active" : ""} aria-current={item.id === node.id ? "page" : undefined} onClick={() => changeNode(item.id)}><small>{item.sublesson.order}</small>{item.sublesson.title}</button>)}</div>}</nav>}
        <div className="ss-workspace-title"><div><p>{node.section}</p><h2>{node.parentName || node.name}</h2>{node.sublesson && <p className="ss-current-sublesson">第 {node.sublesson.order} 节 · {node.sublesson.title}</p>}</div><button aria-expanded={teacherOpen} onClick={() => setTeacherOpen(!teacherOpen)}><MessageCircle size={16} />{teacherOpen ? "收起老师" : "问老师"}</button></div>
        <div className="ss-tabs" role="tablist" aria-label="学习与练习">
          <button id="ss-learn-tab" role="tab" aria-controls="ss-learn-panel" aria-selected={tab === "learn"} className={tab === "learn" ? "active" : ""} onClick={() => { setTab("learn"); setContext(null); }}><BookOpen size={17} />学习</button>
          <button id="ss-practice-tab" role="tab" aria-controls="ss-practice-panel" aria-selected={tab === "practice"} className={tab === "practice" ? "active" : ""} onClick={() => setTab("practice")}><Target size={17} />练习</button>
        </div>
        <div className={`ss-content-layout ${teacherOpen && lesson ? "with-teacher" : ""}`}>
          <div className="ss-primary-content">
            {!node.available ? <div className="ss-state"><BookOpen size={28} /><h3>这个知识点正在准备</h3><p>讲解和练习通过审核后会出现在这里。</p>{next && <button onClick={() => changeNode(next.id)}>先学下一节已发布课程</button>}</div> : lessonLoading ? <div className="ss-state"><LoaderCircle className="spin" /><p>正在打开本课…</p></div> : lessonError && !lesson ? <Notice error>{lessonError}</Notice> : lesson && <>
              {tab === "learn" ? <div role="tabpanel" id="ss-learn-panel" aria-labelledby="ss-learn-tab"><LessonContent lesson={lesson.lesson} />{lessonError && <Notice error>{lessonError}</Notice>}<div className="ss-actions ss-lesson-actions"><button className="primary" disabled={completing} onClick={() => void complete()}>{completing ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{node.completed ? "练几道题" : "我学完了，开始练习"}</button>{next && <button onClick={() => changeNode(next.id)}>下一知识点<ArrowRight size={16} /></button>}</div></div> : <div role="tabpanel" id="ss-practice-panel" aria-labelledby="ss-practice-tab"><Practice key={`${node.id}:${lesson.packageId}`} node={node} userId={user.id} onLearn={() => setTab("learn")} onProgress={refreshProgress} onContext={setContext} onAccessDenied={revokeAccess} /></div>}
            </>}
          </div>
          {teacherOpen && lesson && <Teacher key={`${node.id}:${lesson.packageId}`} node={node} packageId={lesson.packageId} context={tab === "practice" ? context : null} onAccessDenied={revokeAccess} />}
        </div>
      </div>
    </div>}
  </div>;
}

export { Stem, statusName };
