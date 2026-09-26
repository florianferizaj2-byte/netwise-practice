import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import { PracticeModes } from "./practice-modes.jsx";
import {
  LayoutDashboard,
  BookOpen,
  NotebookPen,
  Sparkles,
  ChartNoAxesCombined,
  Settings,
  Network,
  ArrowRight,
  ArrowLeft,
  Check,
  X,
  Clock,
  ChevronRight,
  ChevronDown,
  LoaderCircle,
  Eye,
  EyeOff,
  Trash2,
  Save,
  PlugZap,
  Lightbulb,
  MessageCircle,
  RotateCcw,
  Menu,
  Target,
  GraduationCap,
  CalendarDays,
  RefreshCw,
  CircleCheck,
  TriangleAlert,
  LockKeyhole,
  UserRound,
  LogOut,
  Download,
  ExternalLink,
  BadgeInfo,
  Monitor,
  Award,
  Banknote,
  ShieldCheck,
  CalendarClock,
  FileText,
  Layers3,
  BriefcaseBusiness,
  Scale,
  Compass,
  Stethoscope,
  Landmark,
  Megaphone,
  Heart,
  Globe2,
  ThumbsUp,
  Flag,
  Star,
  Share2,
  Users,
  Ban,
  ScanSearch,
  List,
  Search,
  Pencil,
} from "lucide-react";
import "./style.css";

async function api(url, body, method) {
  const res = await fetch("/api" + url, {
    method: method || (body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || "请求失败");
    error.status = res.status;
    throw error;
  }
  return data;
}
async function streamApi(url, body, onEvent) {
  const res = await fetch("/api" + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    const error = new Error(data?.error || "请求失败");
    error.status = res.status;
    throw error;
  }
  if (!res.body) throw new Error("浏览器不支持 AI 流式响应");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;
  const consume = (chunk) => {
    buffer += chunk;
    const records = buffer.split(/\r?\n\r?\n/);
    buffer = records.pop() || "";
    for (const record of records) {
      const line = record
        .split(/\r?\n/)
        .find((part) => part.startsWith("data:"));
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        throw new Error("AI 流式响应格式不合法");
      }
      onEvent?.(event);
      if (event.type === "done") result = event.result;
      if (event.type === "error")
        throw new Error(event.message || "AI 生成失败");
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    consume(decoder.decode(value, { stream: true }));
  }
  consume(decoder.decode());
  if (!result) throw new Error("AI 流式响应提前结束");
  return result;
}
const pct = (x) =>
  x === null || x === undefined ? "--" : Math.round(x * 100) + "%";
const diff = { easy: "基础", medium: "进阶", hard: "挑战" };
const sources = {
  practice: "原创练习题",
  official_like: "仿真练习题",
  past_exam: "历年真题",
  user_collection: "真题汇编（用户提供）",
  syllabus_practice: "HCIA V2.0 大纲仿真题",
  user_recall_collection: "第三方公开回忆题（用户提供）",
  user_simulation_collection: "第三方原创模拟题（用户提供）",
  user_external_2026_h1: "2026上半年网络工程师模拟题（用户提供）",
  user_external_2026_h1_lastset: "2026上半年网络工程师最后一套卷（用户提供）",
  ai_generated: "AI 生成练习题",
  admin_generated: "管理员 AI 扩充题",
};
const sourceName = (q) => q.sourceLabel || sources[q.source] || q.source;
const isSingleSelect = (question) =>
  question.type === "single_choice" || question.type === "true_false";
const questionTypeName = (question, compact = false) => {
  if (question.type === "true_false") return "判断题";
  if (question.type === "multiple_choice") return compact ? "多选" : "多选题";
  if (question.type === "short_answer") return compact ? "简答" : "简答题";
  return compact ? "单选" : "单选题";
};
const veterinaryModules = ["基础科目", "预防科目", "临床科目", "综合科目"];
const questionImages = (question) => {
  const images = Array.isArray(question?.images) ? question.images : [];
  const legacy = question?.image
    ? Array.isArray(question.image)
      ? question.image
      : [question.image]
    : [];
  return [...images, ...legacy]
    .map((image) =>
      typeof image === "string" ? { src: image } : image,
    )
    .filter((image) => image?.src);
};
function QuestionImage({ image, index }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="question-image-missing" role="status">
        <TriangleAlert size={18} />
        <span>第 {index + 1} 张题图暂时无法加载</span>
      </div>
    );
  return (
    <figure className="question-image-card">
      <img
        src={image.src}
        alt={image.alt || `题目配图 ${index + 1}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>
  );
}
function QuestionImages({ question }) {
  const images = questionImages(question);
  if (!images.length) return null;
  return (
    <div className="question-images" aria-label="题目图片">
      {images.map((image, index) => (
        <QuestionImage key={`${image.src}-${index}`} image={image} index={index} />
      ))}
    </div>
  );
}
const sharedMarker = (question) => {
  const match = String(question?.question || "").match(
    /^\s*题共用(题干|备选答案)\)\s*/,
  );
  if (!match && !question?.sharedGroupId) return null;
  const inferredKind = match?.[1] === "题干"
    ? "stem"
    : match?.[1] === "备选答案"
      ? "options"
      : question?.sharedStem
        ? "stem"
        : "options";
  return {
    kind: question?.sharedKind || inferredKind,
    label: match?.[1] || (question?.sharedKind === "stem" || question?.sharedStem ? "题干" : "备选答案"),
    text: match ? String(question.question).slice(match[0].length).trim() : String(question.question || ""),
  };
};
const optionSignature = (question) => JSON.stringify(question?.options || {});
const commonPrefix = (values) => {
  if (!values.length) return "";
  let prefix = values[0];
  for (const value of values.slice(1)) {
    let end = 0;
    while (end < prefix.length && end < value.length && prefix[end] === value[end]) end += 1;
    prefix = prefix.slice(0, end);
    if (!prefix) break;
  }
  return prefix.replace(/[\s,，。；;：:、]+$/g, "").trim();
};
function buildVeterinaryGroups(questions) {
  const groups = [];
  const explicitGroups = new Map();
  questions.forEach((question, index) => {
    const marker = sharedMarker(question);
    if (question.sharedGroupId) {
      let group = explicitGroups.get(question.sharedGroupId);
      if (!group) {
        group = {
          id: `explicit:${question.sharedGroupId}`,
          key: `explicit:${question.sharedGroupId}`,
          kind: question.sharedKind || marker?.kind || "stem",
          questions: [],
          indexes: [],
          stem: question.sharedStem || "",
        };
        explicitGroups.set(question.sharedGroupId, group);
        groups.push(group);
      }
      group.questions.push(question);
      group.indexes.push(index);
      group.kind ||= question.sharedKind || marker?.kind || "stem";
      if (!group.stem && question.sharedStem) group.stem = question.sharedStem;
      return;
    }
    const kind = marker?.kind || null;
    const candidate = marker ? `${kind}:${optionSignature(question)}` : null;
    const previous = groups[groups.length - 1];
    const canJoinInferred =
      Boolean(candidate && previous && previous.key === candidate) &&
      (kind === "options" ||
        commonPrefix([
          ...previous.questions.map(
            (item) => sharedMarker(item)?.text || item.question,
          ),
          marker?.text || question.question,
        ]).length >= 16);
    if (!canJoinInferred) {
      groups.push({
        id: candidate || `single:${question.id}`,
        key: candidate,
        kind,
        questions: [question],
        indexes: [index],
        stem: question.sharedStem || "",
      });
      return;
    }
    previous.questions.push(question);
    previous.indexes.push(index);
    previous.kind ||= kind;
    if (!previous.stem && question.sharedStem) previous.stem = question.sharedStem;
  });
  return groups.map((group) => {
    const markedTexts = group.questions
      .map((question) => sharedMarker(question)?.text || question.question)
      .filter(Boolean);
    const inferredStem = group.kind === "stem" ? commonPrefix(markedTexts) : "";
    return {
      ...group,
      shared: Boolean(
        group.kind || group.questions.some((question) => question.sharedGroupId),
      ),
      stem: (group.stem || inferredStem).trim(),
    };
  }).sort((a, b) => Math.min(...a.indexes) - Math.min(...b.indexes));
}
const questionTextForGroup = (question, group) => {
  const marker = sharedMarker(question);
  let text = marker?.text || question.question;
  if (group?.kind === "stem" && group.stem && text.startsWith(group.stem))
    text = text.slice(group.stem.length).trim();
  return text.replace(/^[-—:：，,。\s]+/, "").trim();
};
const navs = [
  ["home", "学习总览", LayoutDashboard],
  ["guide", "证书指南", BadgeInfo],
  ["chapters", "章节练习", BookOpen],
  ["wrong", "错题本", NotebookPen],
  ["training", "AI 专项训练", Sparkles],
  ["community", "共享题库", Globe2],
  ["chat", "社区交流", MessageCircle],
  ["mastery", "知识掌握度", ChartNoAxesCombined],
  ["exam", "模拟考试", GraduationCap],
  ["admin", "管理员面板", ShieldCheck],
];
function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </button>
  );
}
function Empty({ icon: Icon = BookOpen, title, children }) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function QuestionOrigin({ question }) {
  if (question.sourceVerification)
    return (
      <p className="question-origin verified-scope">
        题目性质：{question.sourceVerification}
      </p>
    );
  if (!question.provenance?.length) return null;
  return (
    <p className="question-origin">
      来源：
      {question.provenance
        .map(
          (p) =>
            `${p.file.replace("（含答案解析）.docx", "")} · 第 ${p.questionNumber} 题`,
        )
        .join("；")}
      <span>按原文收录，未核实官方出处与考试年份</span>
    </p>
  );
}
const reportReasons = [
  { value: "wrong_answer", label: "答案或解析有误" },
  { value: "ambiguous", label: "题干或选项表述有问题" },
  { value: "duplicate", label: "题目重复" },
  { value: "other", label: "其他异常" },
];
function QuestionReport({ question, busy, run }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("wrong_answer");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [reportError, setReportError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => {
    setOpen(false);
    setKind("wrong_answer");
    setNote("");
    setSubmitted(false);
    setReportError("");
  }, [question.id]);
  const submit = async () => {
    if (sending || busy) return;
    setSending(true);
    setReportError("");
    const saved = await run("正在提交题目举报", () =>
      api(`/questions/${encodeURIComponent(question.id)}/feedback`, {
        kind,
        ...(note.trim() ? { note: note.trim() } : {}),
      }).catch((error) => {
        setReportError(error.status === 401 ? "登录已失效，请重新登录后提交举报。" : error.message);
        throw error;
      }),
    );
    setSending(false);
    if (saved) {
      setSubmitted(true);
      setOpen(false);
      setNote("");
    }
  };
  return (
    <div className="question-report">
      <button
        type="button"
        className={"report-trigger" + (submitted ? " reported" : "")}
        disabled={!!busy}
        onClick={() => setOpen(true)}
      >
        <Flag size={16} />
        {submitted ? "已举报" : "举报题目"}
      </button>
      {open && (
        <div className="report-backdrop" role="presentation">
          <section
            className="question-report-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-report-title"
          >
            <div className="question-report-head">
              <div>
                <span className="report-kicker">题目反馈</span>
                <h2 id="question-report-title">这道题哪里需要修正？</h2>
              </div>
              <IconButton
                icon={X}
                label="关闭举报窗口"
                disabled={sending}
                onClick={() => setOpen(false)}
              />
            </div>
            <div className="report-reasons">
              {reportReasons.map((reason) => (
                <label key={reason.value}>
                  <input
                    type="radio"
                    name={`report-reason-${question.id}`}
                    value={reason.value}
                    checked={kind === reason.value}
                    onChange={() => setKind(reason.value)}
                  />
                  <span>{reason.label}</span>
                </label>
              ))}
            </div>
            <label className="report-note-label">
              补充说明 <span>选填</span>
              <textarea
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="例如：第 3 个选项与解析中的结论不一致"
              />
              <small>{note.length} / 500</small>
            </label>
            {reportError && <div className="alert error" role="alert">{reportError}</div>}
            <div className="question-report-actions">
              <button type="button" disabled={sending} onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                className="primary"
                disabled={!!busy || sending}
                onClick={submit}
              >
                <Flag size={16} /> 提交举报
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function QuestionFavorite({ question, busy, run, onChanged }) {
  const [favorite, setFavorite] = useState(!!question.favorite);
  const [saving, setSaving] = useState(false);
  useEffect(() => setFavorite(!!question.favorite), [question.id, question.favorite]);
  const toggle = async () => {
    if (saving || busy) return;
    setSaving(true);
    const saved = await run("正在保存收藏状态", () =>
      api(
        `/questions/${encodeURIComponent(question.id)}/favorite`,
        { favorite: !favorite },
        "PUT",
      ),
    );
    setSaving(false);
    if (saved) {
      setFavorite(saved.favorite);
      await onChanged?.();
    }
  };
  return (
    <button
      type="button"
      className={"favorite-trigger" + (favorite ? " active" : "")}
      disabled={!!busy || saving}
      onClick={toggle}
      title={favorite ? "取消收藏题目" : "收藏题目"}
    >
      <Star size={16} fill={favorite ? "currentColor" : "none"} />
      {favorite ? "已收藏" : "收藏题目"}
    </button>
  );
}
function AdminQuestionEditor({ question, busy, run, onClose, onSaved }) {
  const initialOptionKeys = ["A", "B", "C", "D", "E"].filter((key) =>
    Object.prototype.hasOwnProperty.call(question.options || {}, key),
  );
  const [draft, setDraft] = useState(() => ({
    type: question.type,
    question: question.question,
    options: { ...question.options },
    answer: (question.answer || []).join("、"),
    analysis: question.analysis || "",
    chapter: question.chapter || "",
    knowledgeSection: question.knowledgeSection || "",
    knowledgePoint: question.targetKnowledgePoint || question.knowledgePoint || "",
    difficulty: question.difficulty || "medium",
    tags: (question.tags || ["管理员修订"]).join("、"),
    images: (question.images || [])
      .map((image) => image.src)
      .filter(Boolean)
      .join("\n"),
    sharedGroupId: question.sharedGroupId || "",
    sharedKind: question.sharedKind || "stem",
    sharedStem: question.sharedStem || "",
    sharedOrder: question.sharedOrder || "",
  }));
  const update = (field, value) => setDraft((old) => ({ ...old, [field]: value }));
  const optionKeys =
    draft.type === "true_false"
      ? ["A", "B"]
      : ["A", "B", "C", "D", ...(initialOptionKeys.includes("E") ? ["E"] : [])];
  const updateType = (value) =>
    setDraft((old) => ({
      ...old,
      type: value,
      options:
        value === "true_false"
          ? old.options
          : { C: old.options.C || "", D: old.options.D || "", ...old.options },
    }));
  const updateOption = (key, value) =>
    setDraft((old) => ({ ...old, options: { ...old.options, [key]: value } }));
  const save = async (event) => {
    event.preventDefault();
    const answer = draft.answer
      .toUpperCase()
      .split(/[,，、;；/\s]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const tags = draft.tags
      .split(/[,，、;；/\n]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    const images = draft.images
      .split(/\n+/)
      .map((src) => src.trim())
      .filter(Boolean)
      .map((src) => ({ src, alt: "执兽题目配图" }));
    const result = await run("正在保存题目修改", () =>
      api(
        `/admin/questions/${encodeURIComponent(question.id)}`,
        {
          type: draft.type,
          question: draft.question.trim(),
          options: Object.fromEntries(
            optionKeys.map((key) => [key, (draft.options[key] || "").trim()]),
          ),
          answer,
          analysis: draft.analysis.trim(),
          chapter: draft.chapter.trim(),
          ...(draft.knowledgeSection.trim()
            ? { knowledgeSection: draft.knowledgeSection.trim() }
            : {}),
          knowledgePoint: draft.knowledgePoint.trim(),
          difficulty: draft.difficulty,
          ...(tags.length ? { tags } : {}),
          images,
          ...(draft.sharedGroupId.trim()
            ? { sharedGroupId: draft.sharedGroupId.trim() }
            : {}),
          ...(draft.sharedGroupId.trim()
            ? { sharedKind: draft.sharedKind, ...(draft.sharedStem.trim() ? { sharedStem: draft.sharedStem.trim() } : {}), ...(draft.sharedOrder ? { sharedOrder: Number(draft.sharedOrder) } : {}) }
            : {}),
        },
        "PUT",
      ),
    );
    if (result) {
      await onSaved?.(result.question);
      onClose();
    }
  };
  return (
    <div className="admin-editor-backdrop" role="presentation">
      <section
        className="admin-question-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-question-editor-title"
      >
        <div className="question-report-head">
          <div>
            <span className="report-kicker">管理员处理反馈</span>
            <h2 id="admin-question-editor-title">修改题目</h2>
          </div>
          <IconButton icon={X} label="关闭题目编辑" onClick={onClose} />
        </div>
        <form className="admin-editor-form" onSubmit={save}>
          <div className="admin-editor-meta">
            <span className="badge">{questionTypeName(question)}</span>
            <span>{question.id}</span>
          </div>
          <label>
            题型
            <select value={draft.type} onChange={(event) => updateType(event.target.value)}>
              <option value="single_choice">单选题</option>
              <option value="multiple_choice">多选题</option>
              <option value="true_false">判断题</option>
            </select>
          </label>
          <label>
            题干
            <textarea rows="4" value={draft.question} onChange={(event) => update("question", event.target.value)} />
          </label>
          <div className="admin-editor-options">
            {optionKeys.map((key) => (
              <label key={key}>
                选项 {key}
                <input value={draft.options[key] || ""} onChange={(event) => updateOption(key, event.target.value)} />
              </label>
            ))}
          </div>
          <label>
            正确答案
            <input value={draft.answer} onChange={(event) => update("answer", event.target.value)} placeholder="例如：A 或 A、C" />
          </label>
          <label>
            解析
            <textarea rows="5" value={draft.analysis} onChange={(event) => update("analysis", event.target.value)} />
          </label>
          <div className="admin-editor-media">
            <label>
              题目图片地址
              <textarea
                rows="3"
                value={draft.images}
                onChange={(event) => update("images", event.target.value)}
                placeholder="每行一个图片地址；可填 /vet-images/xxx.png 或完整图片 URL"
              />
              <small>题图会在执兽专项刷题区的题干前展示。</small>
            </label>
            <div className="admin-editor-grid">
              <label>
                共用题干组 ID
                <input value={draft.sharedGroupId} onChange={(event) => update("sharedGroupId", event.target.value)} placeholder="例如 case-2026-001" />
              </label>
              <label>
                共用类型
                <select value={draft.sharedKind} onChange={(event) => update("sharedKind", event.target.value)}>
                  <option value="stem">共用题干 / 病例</option>
                  <option value="options">共用备选答案</option>
                </select>
              </label>
              <label>
                小题顺序
                <input type="number" min="1" max="200" value={draft.sharedOrder} onChange={(event) => update("sharedOrder", event.target.value)} placeholder="可选" />
              </label>
              <label>
                共用材料
                <textarea rows="3" value={draft.sharedStem} onChange={(event) => update("sharedStem", event.target.value)} placeholder="可选；留空时由题库标记自动归纳" />
              </label>
            </div>
          </div>
          <div className="admin-editor-grid">
            <label>
              章节
              <input value={draft.chapter} onChange={(event) => update("chapter", event.target.value)} />
            </label>
            <label>
              二级分类
              <input value={draft.knowledgeSection} onChange={(event) => update("knowledgeSection", event.target.value)} />
            </label>
            <label>
              知识点
              <input value={draft.knowledgePoint} onChange={(event) => update("knowledgePoint", event.target.value)} />
            </label>
            <label>
              难度
              <select value={draft.difficulty} onChange={(event) => update("difficulty", event.target.value)}>
                <option value="easy">基础</option>
                <option value="medium">进阶</option>
                <option value="hard">挑战</option>
              </select>
            </label>
            <label>
              标签
              <input value={draft.tags} onChange={(event) => update("tags", event.target.value)} placeholder="用顿号分隔" />
            </label>
          </div>
          <div className="question-report-actions">
            <button type="button" onClick={onClose}>取消</button>
            <button type="submit" className="primary" disabled={!!busy}>
              <Save size={16} /> 保存修改
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
const AUTH_LOOP_STEPS = [
  {
    eyebrow: "01 · 错题定位",
    title: "先找到真正的薄弱点",
    description: "错题、章节与知识点会沉淀成清晰的下一步。",
    progress: 36,
    icon: Target,
  },
  {
    eyebrow: "02 · AI 解析",
    title: "每一道题，都讲到你听懂",
    description: "围绕你的错题生成专项训练，把理解变成能力。",
    progress: 68,
    icon: Sparkles,
  },
  {
    eyebrow: "03 · 掌握提升",
    title: "下一次遇到，答得更稳",
    description: "掌握度与学习记录持续更新，进步看得见。",
    progress: 92,
    icon: ChartNoAxesCombined,
  },
];

function AuthScreen({ onAuth, initialError = "" }) {
  const [mode, setMode] = useState("login"),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [confirmPassword, setConfirmPassword] = useState(""),
    [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false);
  const [loopIndex, setLoopIndex] = useState(0);
  const isLogin = mode === "login";
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      return undefined;
    const timer = window.setInterval(() => {
      setLoopIndex((index) => (index + 1) % AUTH_LOOP_STEPS.length);
    }, 3600);
    return () => window.clearInterval(timer);
  }, []);
  const loop = AUTH_LOOP_STEPS[loopIndex];
  const LoopIcon = loop.icon;
  const submit = async (e) => {
    e.preventDefault();
    if (!isLogin && password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/auth/${mode === "login" ? "login" : "register"}`, {
          username,
          password,
        });
      const session = await api("/auth/me");
      if (!session.authenticated)
        throw new Error("登录凭据未能保存，请允许本站 Cookie，并使用同一个网站地址登录。HTTPS 部署请检查安全 Cookie 配置。");
      onAuth(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-page">
      <div className="auth-ambient auth-ambient-one" />
      <div className="auth-ambient auth-ambient-two" />
      <section className="auth-shell">
        <div className="auth-showcase">
          <div className="auth-showcase-grid" aria-hidden="true" />
          <div className="auth-showcase-header">
            <div className="auth-brand-lockup">
              <span className="auth-brand-logo">
                <img src="/kaojiang-logo-192.png" alt="" />
              </span>
              <span>
                <strong>考匠</strong>
                <small>AceExam</small>
              </span>
            </div>
            <span className="auth-status">
              <i /> 认证考试训练平台
            </span>
          </div>
          <div className="auth-hero-copy">
            <span className="auth-kicker">
              <Sparkles size={15} /> 把时间花在真正的进步上
            </span>
            <h2>
              把每一次刷题，
              <br />
              <em>变成稳稳的掌握。</em>
            </h2>
            <p>
              按证书定位范围，追踪每一个薄弱知识点，
              <br className="auth-desktop-break" />
              让下一道题刚好比上一道更懂你。
            </p>
          </div>
          <div className="auth-feature-grid">
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <Target size={18} />
              </span>
              <span>
                <strong>范围清晰</strong>
                <small>围绕证书知识点练习</small>
              </span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <ChartNoAxesCombined size={18} />
              </span>
              <span>
                <strong>越练越准</strong>
                <small>掌握度与错题自动沉淀</small>
              </span>
            </div>
            <div className="auth-feature">
              <span className="auth-feature-icon">
                <Users size={18} />
              </span>
              <span>
                <strong>共享题库</strong>
                <small>AI 好题审核后共同练</small>
              </span>
            </div>
          </div>
          <div className="auth-cycle-card auth-community-card" aria-live="polite">
            <div className="auth-cycle-orbit auth-community-orbit" aria-hidden="true">
              <span className="auth-orbit-pulse" />
              <LoopIcon size={22} />
            </div>
            <div className="auth-loop-copy" key={loopIndex}>
              <div className="auth-community-heading">
                <small>{loop.eyebrow}</small>
                <span className="auth-community-pill">
                  <i /> 共享中
                </span>
              </div>
              <strong>{loop.title}</strong>
              <p>{loop.description}</p>
              <div className="auth-progress" aria-label={`学习闭环进度 ${loop.progress}%`}>
                <i style={{ width: `${loop.progress}%` }} />
                <span>{loop.progress}%</span>
              </div>
            </div>
          </div>
          <p className="auth-showcase-footnote">
            <ShieldCheck size={16} /> 学习记录按账号保存，换设备也能继续
          </p>
        </div>
        <section className="auth-panel">
          <div className="auth-panel-topline">
            <span>{isLogin ? "欢迎回来" : "从今天开始"}</span>
            <span className="auth-panel-step">{isLogin ? "01 / 02" : "01 / 01"}</span>
          </div>
          <p className="eyebrow">{isLogin ? "继续你的备考节奏" : "创建你的学习空间"}</p>
          <h1>{isLogin ? "登录学习账户" : "创建学习账户"}</h1>
          <p className="auth-panel-intro">
            {isLogin
              ? "欢迎回来，接着完成今天最值得练习的一组题。"
              : "注册后选择报考证书，马上开始一套属于你的练习路径。"}
          </p>
          <form onSubmit={submit}>
            <label>
              <span className="auth-field-label">
                <UserRound size={15} /> 账号
              </span>
              <span className="auth-input-wrap">
                <UserRound size={17} />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength="3"
                  maxLength="40"
                  autoComplete="username"
                  placeholder="输入你的学习账号"
                  required
                />
              </span>
            </label>
            <label>
              <span className="auth-field-label">
                <LockKeyhole size={15} /> 密码
              </span>
              <span className="auth-input-wrap">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength="8"
                  maxLength="128"
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  placeholder="至少 8 位字符"
                  required
                />
              </span>
            </label>
            {!isLogin && (
              <label>
                <span className="auth-field-label">
                  <LockKeyhole size={15} /> 确认密码
                </span>
                <span className="auth-input-wrap">
                  <LockKeyhole size={17} />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength="8"
                    maxLength="128"
                    autoComplete="new-password"
                    placeholder="再次输入密码"
                    required
                  />
                </span>
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={busy}>
              {busy ? (
                <>
                  <LoaderCircle className="auth-spinner" size={17} /> 处理中...
                </>
              ) : (
                <>
                  {isLogin ? "进入我的学习空间" : "注册并开始学习"}
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
          <div className="auth-panel-divider">
            <span>或</span>
          </div>
          <button
            className="text-button auth-switch"
            onClick={() => {
              setMode(isLogin ? "register" : "login");
              setConfirmPassword("");
              setError("");
            }}
          >
            {isLogin ? "还没有学习账户？立即注册" : "已经有账户？返回登录"}
          </button>
          <a
            className="auth-app-download"
            href="/downloads/kaojiang-v0.2.8.apk"
            download="kaojiang-v0.2.8.apk"
          >
            <Download size={16} />
            下载考匠 App · Android v0.2.8
          </a>
          <p className="auth-privacy-note">
            <ShieldCheck size={14} /> 你的学习数据与 AI 配置仅属于当前账号
          </p>
        </section>
      </section>
    </main>
  );
}
function AnnouncementModal({ onClose }) {
  return (
    <div
      className="announcement-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="announcement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <header className="announcement-header">
          <div className="announcement-heading">
            <span className="announcement-icon">
              <Megaphone size={22} />
            </span>
            <div>
              <span className="announcement-kicker">考匠 · 更新公告</span>
              <h2 id="announcement-title">移动端 v0.2.8 更新</h2>
              <p>页面切换更顺畅，题库加载更轻快。</p>
            </div>
          </div>
          <IconButton icon={X} label="关闭网站公告" onClick={onClose} />
        </header>
        <div className="announcement-body">
          <div className="announcement-highlight">
                <strong>考匠 App v0.2.8 已发布</strong>
                <span>
                  在登录页或账号菜单点击“下载 App”即可获取最新版 Android 安装包，登录后连接现有网站后端。
                </span>
          </div>
          <ul className="announcement-list">
            <li>
              <span>01</span>
              <div>
                <strong>页面切换保留进度</strong>
                <p>返回已访问的模块时保留滚动位置和当前练习，隐藏页面会暂停社区轮询和循环动效。</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>题库缓存与断网阅读</strong>
                <p>目录和已访问的普通题目可立即读取缓存；缓存按账号与证书隔离，断网时仍能查看已缓存内容。</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>更轻的题目请求</strong>
                <p>练习题按批次加载，减少重复请求；服务端新增分页题目和轻量学习统计接口。</p>
              </div>
            </li>
          </ul>
          <p className="announcement-footnote">
            App 当前提供 Android v0.2.8 安装包；正式考试信息仍请以对应认证机构和相关主管部门的最新公告为准。
          </p>
        </div>
        <footer className="announcement-footer">
          <small>公告关闭后，本次浏览器将不再重复提示。</small>
          <button className="primary" onClick={onClose}>
            知道了，开始学习
            <ArrowRight size={16} />
          </button>
        </footer>
      </section>
    </div>
  );
}
function SponsorModal({ onClose }) {
  return (
    <div
      className="sponsor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="sponsor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sponsor-title"
      >
        <header>
          <div>
            <span className="sponsor-kicker">支持考匠</span>
            <h2 id="sponsor-title">赞助作者</h2>
            <p>如果这个学习工具对你有帮助，欢迎请作者喝杯咖啡。</p>
          </div>
          <IconButton icon={X} label="关闭赞助作者" onClick={onClose} />
        </header>
        <div className="sponsor-content">
          <img src="/sponsor-wechat.jpg" alt="微信赞助二维码" />
          <strong>使用微信扫一扫</strong>
          <p>感谢你的支持，我会继续维护题库和学习功能。</p>
        </div>
        <footer>
          <button onClick={onClose}>暂时关闭</button>
        </footer>
      </section>
    </div>
  );
}
function CertificatePicker({ certificates, onSelect }) {
  const [busy, setBusy] = useState("");
  return (
    <main className="auth-page">
      <section className="auth-panel certificate-panel">
        <div className="auth-mark">
          <GraduationCap size={28} />
        </div>
        <p className="eyebrow">第一步</p>
        <h1>选择要报考的证书</h1>
        <p>
          题库、章节和练习推荐会围绕所选证书的知识点组织，之后可在账号设置中切换。
        </p>
        <div className="certificate-list">
          {certificates.map((certificate) => (
            <button
              key={certificate.id}
              className="certificate-option"
              disabled={!!busy}
              onClick={async () => {
                setBusy(certificate.id);
                try {
                  await onSelect(certificate.id);
                } finally {
                  setBusy("");
                }
              }}
            >
              <GraduationCap size={22} />
              <span>
                <strong>{certificate.name}</strong>
                <small>{certificate.description}</small>
                {certificate.syllabus && (
                  <small className="certificate-meta">
                    {certificate.syllabus.version} ·{" "}
                    {certificate.syllabus.examCodeLabel || "考试代码"}{" "}
                    {certificate.syllabus.examCode}（报名前复核）
                  </small>
                )}
              </span>
              <ChevronRight size={18} />
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
function App() {
  const [page, setPage] = useState(location.hash.slice(1) || "home"),
    [auth, setAuth] = useState(null),
    [bankSource, setBankSource] = useState("all"),
    [chapterFocus, setChapterFocus] = useState(""),
    [sectionFocus, setSectionFocus] = useState(""),
    [dashboard, setDashboard] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [mobile, setMobile] = useState(false),
    [session, setSession] = useState(null),
    [wrong, setWrong] = useState([]),
    [allQuestions, setAllQuestions] = useState([]),
    [queue, setQueue] = useState([]),
    [useSharedAi, setUseSharedAi] = useState(false),
    [sharedAiQuestions, setSharedAiQuestions] = useState([]),
    [sharedAiLoading, setSharedAiLoading] = useState(false),
    [aiGroups, setAiGroups] = useState([]),
    [announcementOpen, setAnnouncementOpen] = useState(false),
    [sponsorOpen, setSponsorOpen] = useState(false),
    [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const refresh = async () => {
    const [d, w, q] = await Promise.all([
      api("/dashboard"),
      api("/wrong"),
      api("/questions"),
    ]);
    setDashboard(d);
    setWrong(w);
    setAllQuestions(q);
  };
  useEffect(() => {
    api("/auth/me")
      .then(setAuth)
      .catch((e) => {
        setError(e.message);
        setAuth({ authenticated: false, user: null, certificates: [] });
      });
  }, []);
  useEffect(() => {
    if (auth?.authenticated && auth.user?.certificateId)
      refresh().catch((e) => setError(e.message));
    const h = () => setPage(location.hash.slice(1) || "home");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, [auth?.authenticated, auth?.user?.certificateId]);
  useEffect(() => {
    if (!auth?.authenticated || !auth.user?.certificateId || !dashboard) return;
    try {
      if (localStorage.getItem("netwise-announcement-2026-09-v7") !== "seen")
        setAnnouncementOpen(true);
    } catch {
      setAnnouncementOpen(true);
    }
  }, [auth?.authenticated, auth?.user?.certificateId, dashboard]);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const closeOnOutsideClick = (event) => {
      if (!accountMenuRef.current?.contains(event.target))
        setAccountMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);
  const dismissAnnouncement = () => {
    setAnnouncementOpen(false);
    try {
      localStorage.setItem("netwise-announcement-2026-09-v7", "seen");
    } catch {
      // Private browsing may disable localStorage; closing still works for this render.
    }
  };
  const go = (p) => {
    setPage(p);
    if (p !== "chapters") setChapterFocus("");
    location.hash = p;
    setMobile(false);
    setError("");
  };
  const signOut = async () => {
    setAccountMenuOpen(false);
    setError("");
    try {
      await api("/auth/logout", {}, "POST");
      setDashboard(null);
      setSession(null);
      setMobile(false);
      setPage("home");
      location.hash = "home";
      setAuth({ authenticated: false, user: null, certificates: [] });
    } catch (e) {
      setError(e.message);
    }
  };
  const run = async (label, fn) => {
    setBusy(label);
    setError("");
    try {
      return await fn();
    } catch (e) {
      if (e.status === 401) {
        setDashboard(null);
        setSession(null);
        setQueue([]);
        setAllQuestions([]);
        setWrong([]);
        setSharedAiQuestions([]);
        setAiGroups([]);
        setAuth({ authenticated: false, user: null, certificates: [] });
        setError("登录已失效，请重新登录后继续。");
      } else {
        setError(e.message);
      }
      return null;
    } finally {
      setBusy("");
    }
  };
  const start = (questions, title = "自由练习") => {
    if (!questions.length) {
      setError("暂无可练习题目");
      return;
    }
    setSession({
      questions,
      title,
      certificateId: auth.user?.certificateId || dashboard?.certificate?.id || null,
      key: Date.now(),
    });
    go("practice");
  };
  const openChapter = (name) => {
    setChapterFocus(name);
    setSectionFocus("");
    go("chapters");
  };
  const questionsForChapter = (name) => [
    ...allQuestions.filter(
      (q) =>
        q.chapter === name &&
        q.source !== "ai_generated" &&
        (bankSource === "all" || q.source === bankSource),
    ),
    ...(useSharedAi
      ? sharedAiQuestions.filter((q) => q.chapter === name)
      : []),
  ];
  const selectedChapter = dashboard?.chapters?.find(
    (chapter) => chapter.name === chapterFocus,
  );
  const selectedChapterQuestions = selectedChapter
    ? questionsForChapter(selectedChapter.name)
    : [];
  const selectedChapterSections = selectedChapter?.sections || [];
  const selectedSectionQuestions = sectionFocus
    ? selectedChapterQuestions.filter(
        (question) => question.knowledgeSection === sectionFocus,
      )
    : selectedChapterQuestions;
  const knowledgePointName = (point) =>
    typeof point === "string" ? point : point?.name || "";
  const selectedSectionPoints =
    selectedChapterSections.find((section) => section.name === sectionFocus)
      ?.knowledgePoints || [];
  const selectedKnowledgePoints = selectedChapter
    ? [
        ...new Set([
          ...(sectionFocus
            ? selectedSectionPoints.map(knowledgePointName)
            : selectedChapterSections.length
              ? []
              : (selectedChapter.knowledgePoints || []).map(
                  knowledgePointName,
                )),
          ...selectedSectionQuestions.map(
            (question) =>
              question.targetKnowledgePoint || question.knowledgePoint,
          ),
        ]),
      ].filter(Boolean)
    : [];
  const favoriteQuestions = allQuestions.filter((question) => question.favorite);
  const train = async (q, count = 5, harder = false) =>
    run(`准备生成 ${count} 道针对题`, async () => {
      const r = await streamApi(
        "/ai/train/stream",
        { questionId: q.id, count, harder },
        (event) => {
          if (event.message) setBusy(event.message);
        },
      );
      setNotice(r.cached ? "已载入缓存训练题" : "针对训练已生成");
      await refresh();
      start(r.questions, "AI 针对训练");
      return r;
    });
  const toggleSharedAi = async (checked) => {
    setUseSharedAi(checked);
    if (!checked) {
      setSharedAiQuestions([]);
      return;
    }
    setSharedAiLoading(true);
    setError("");
    try {
      setSharedAiQuestions(await api("/questions/shared-ai"));
    } catch (e) {
      setUseSharedAi(false);
      setSharedAiQuestions([]);
      setError(e.message);
    } finally {
      setSharedAiLoading(false);
    }
  };
  const loadSharedAi = async () => {
    setSharedAiLoading(true);
    setError("");
    try {
      const questions = await api("/questions/shared-ai");
      setSharedAiQuestions(questions);
      return questions;
    } catch (e) {
      setError(e.message);
      return [];
    } finally {
      setSharedAiLoading(false);
    }
  };
  useEffect(() => {
    if (!auth?.authenticated || !auth.user?.certificateId) return;
    let active = true;
    if (page === "training") {
      Promise.all([api("/queue"), api("/ai/groups")])
        .then(([nextQueue, nextGroups]) => {
          if (!active) return;
          setQueue(nextQueue);
          setAiGroups(nextGroups);
        })
        .catch((e) => { if (active) setError(e.message); });
    }
    if (page === "community") {
      setSharedAiLoading(true);
      api("/questions/shared-ai")
        .then((questions) => { if (active) setSharedAiQuestions(questions); })
        .catch((e) => { if (active) setError(e.message); })
        .finally(() => { if (active) setSharedAiLoading(false); });
    }
    return () => { active = false; };
  }, [page, auth?.authenticated, auth?.user?.certificateId]);
  if (auth === null)
    return (
      <div className="loading-page">
        <LoaderCircle className="spin" />
        <p>正在检查登录状态</p>
      </div>
    );
  if (!auth.authenticated)
    return (
      <AuthScreen
        initialError={error}
        onAuth={(result) => {
          setError("");
          setAuth(result);
        }}
      />
    );
  if (!auth.user.certificateId)
    return (
      <CertificatePicker
        certificates={auth.certificates}
        onSelect={async (certificateId) => {
          const result = await api(
            "/auth/certificate",
            { certificateId },
            "PUT",
          );
          setAuth((old) => ({ ...old, user: result.user }));
        }}
      />
    );
  if (!dashboard)
    return (
      <div className="loading-page">
        {error ? (
          <>
            <TriangleAlert />
            <p>{error}</p>
            <button onClick={() => location.reload()}>重新加载</button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" />
            <p>正在加载学习记录</p>
          </>
        )}
      </div>
    );
  const weak = [...dashboard.mastery].sort(
    (a, b) => a.masteryScore - b.masteryScore || b.wrongCount - a.wrongCount,
  );
  const recommendedModules = dashboard.syllabus
    ? [...dashboard.syllabus.modules]
        .sort(
          (a, b) =>
            a.attempted - b.attempted ||
            (a.accuracy ?? 1) - (b.accuracy ?? 1) ||
            b.weight - a.weight ||
            a.order - b.order,
        )
        .slice(0, 3)
    : [];
  const recommendedChapterNames = new Set(
    recommendedModules.map((module) => module.name),
  );
  const recommendedQuestions = allQuestions
    .filter(
      (question) =>
        question.source !== "ai_generated" &&
        (!recommendedChapterNames.size ||
          recommendedChapterNames.has(question.chapter)),
    )
    .sort(() => Math.random() - 0.5)
    .slice(0, 10);
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a className="brand" href="#home" onClick={() => go("home")}>
          <span className="brand-icon">
            <img src="/kaojiang-logo-192.png" alt="" />
          </span>
          <strong>
            考匠<span>AceExam</span>
          </strong>
        </a>
        <div className="workspace-label">
          {dashboard.certificate?.shortName} · 学习工作台
        </div>
        <nav>
          {navs
            .filter(([id]) => id !== "admin" || dashboard.user?.isAdmin)
            .map(([id, label, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => go(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "wrong" && dashboard.wrongCount > 0 && (
                <small>{dashboard.wrongCount}</small>
              )}
            </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button
              className="local-profile account-trigger"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <span className="account-avatar" aria-hidden="true">
                <UserRound size={18} />
              </span>
              <strong>{dashboard.user?.username || "学习账户"}</strong>
              <ChevronDown size={16} />
            </button>
            {accountMenuOpen && (
              <div className="account-menu" role="menu">
                <a
                  className="account-menu-link"
                  role="menuitem"
                  href="/downloads/kaojiang-v0.2.8.apk"
                  download="kaojiang-v0.2.8.apk"
                  onClick={() => setAccountMenuOpen(false)}
                >
                  <Download size={17} />
                  下载 App
                </a>
                <button role="menuitem" onClick={signOut}>
                  <UserRound size={17} />
                  切换账号
                </button>
                <button className="danger" role="menuitem" onClick={signOut}>
                  <LogOut size={17} />
                  退出登录
                </button>
              </div>
            )}
          </div>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => go("settings")}
          >
            <Settings size={19} />
            设置
            <ChevronRight size={15} />
          </button>
          <button
            className={page === "about" ? "active" : ""}
            onClick={() => go("about")}
          >
            <BadgeInfo size={19} />
            关于考匠
            <ChevronRight size={15} />
          </button>
          <button
            className="sponsor-sidebar-button"
            onClick={() => setSponsorOpen(true)}
          >
            <Heart size={17} />
            赞助作者
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <IconButton
              icon={Menu}
              label="展开导航"
              className="mobile-menu icon-button"
              onClick={() => setMobile(!mobile)}
            />
            <span>我的学习空间</span>
            <ChevronRight size={14} />
            <strong>
              {navs.find((n) => n[0] === page)?.[1] ||
                {
                  settings: "设置",
                  about: "关于考匠",
                  practice: session?.title || "练习中",
                }[
                  page
                ] ||
                "学习总览"}
            </strong>
          </div>
          <span className="date">
            <CalendarDays size={15} />
            {new Date().toLocaleDateString("zh-CN", {
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
        </header>
        <main>
          {error && (
            <div className="alert error" role="alert">
              <TriangleAlert size={18} />
              <span>{error}</span>
              <IconButton
                icon={X}
                label="关闭错误"
                onClick={() => setError("")}
              />
            </div>
          )}
          {notice && (
            <div className="alert success" role="status">
              <Check size={18} />
              <span>{notice}</span>
              <IconButton
                icon={X}
                label="关闭通知"
                onClick={() => setNotice("")}
              />
            </div>
          )}
          {busy && (
            <div className="alert working" role="status">
              <LoaderCircle size={18} className="spin" />
              <span>{busy}</span>
            </div>
          )}
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">持续练习，逐步掌握</div>
                  <h1>今天，离掌握更近一步。</h1>
                  <p>
                    {dashboard.certificate?.shortName}{" "}
                    <span className="dot">·</span> 我的学习总览
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => start(recommendedQuestions, "今日推荐练习")}
                >
                  开始推荐练习
                  <ArrowRight size={17} />
                </button>
              </div>
              {dashboard.syllabus && (
                <section className="syllabus-banner">
                  <div className="syllabus-version">
                    <span className="badge green">官方范围已核实</span>
                    <strong>{dashboard.certificate.shortName}</strong>
                    <small>
                      考试范围核实于 {dashboard.syllabus.verifiedAt} ·{" "}
                      {dashboard.syllabus.examCodeLabel || "考试代码"}{" "}
                      {dashboard.syllabus.examCode}（报名前复核）
                    </small>
                  </div>
                  <div className="syllabus-coverage">
                    <strong>{pct(dashboard.syllabus.coverage)}</strong>
                    <span>本站题库覆盖度</span>
                    <div className="progress">
                      <i style={{ width: pct(dashboard.syllabus.coverage) }} />
                    </div>
                  </div>
                  <div className="syllabus-facts">
                    <span>
                      <b>{dashboard.syllabus.coveredModules}</b> /{" "}
                      {dashboard.syllabus.modules.length} 个模块已有题
                    </span>
                    <span>
                      <b>{dashboard.syllabus.questionCount}</b> /{" "}
                      {dashboard.syllabus.targetQuestionCount} 道目标题量
                    </span>
                    <span>
                      今日推荐：
                      {recommendedModules
                        .map((module) => module.name)
                        .join("、")}
                    </span>
                  </div>
                  <p>{dashboard.syllabus.scopeNote}</p>
                  <div className="syllabus-links">
                    {dashboard.syllabus.sourceUrls.map((source) => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <CircleCheck size={15} />
                        {source.name}
                      </a>
                    ))}
                  </div>
                </section>
              )}
              <div className="stats">
                {[
                  ["今日已练", dashboard.todayCount, "题", BookOpen],
                  ["累计正确率", pct(dashboard.accuracy), "", Target],
                  ["待复习错题", dashboard.dueCount, "题", RotateCcw],
                  ["今日专注", dashboard.minutes, "分钟", Clock],
                ].map(([label, value, unit, Icon]) => (
                  <div className="stat" key={label}>
                    <div>
                      <span>{label}</span>
                      <Icon size={18} />
                    </div>
                    <strong>
                      {value}
                      <small>{unit}</small>
                    </strong>
                    <span className="stat-note">
                      {label === "今日已练"
                        ? `每日目标 30 题 · 已完成 ${Math.min(100, Math.round((dashboard.todayCount / 30) * 100))}%`
                        : label === "累计正确率"
                          ? `累计完成 ${dashboard.totalCount} 次作答`
                          : label === "待复习错题"
                            ? "按间隔复习计划安排"
                            : "每一次投入都算数"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="overview-grid">
                <section className="daily-section">
                  <div className="section-heading">
                    <h2>
                      <Sparkles size={20} />
                      AI 今日学习
                    </h2>
                    <span className="badge green">
                      {dashboard.plan ? "已生成" : "待安排"}
                    </span>
                  </div>
                  {dashboard.plan ? (
                    <>
                      <p className="plan-summary">{dashboard.plan.summary}</p>
                      <div className="plan-list">
                        {dashboard.plan.tasks.map((t, i) => (
                          <button
                            key={i}
                            disabled={!!busy}
                            onClick={() =>
                              train(
                                wrong.find(
                                  (q) => q.knowledgePoint === t.knowledgePoint,
                                ) ||
                                  allQuestions.find(
                                    (q) =>
                                      q.knowledgePoint === t.knowledgePoint,
                                  ),
                                t.count,
                              )
                            }
                          >
                            <span className="number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <strong>{t.knowledgePoint}</strong>
                              <small>{t.focus}</small>
                            </span>
                            <b>AI · {t.count} 题</b>
                            <ArrowRight size={17} />
                          </button>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() =>
                          run("正在更新今日学习计划", async () => {
                            await api("/ai/daily", { refresh: true });
                            await refresh();
                          })
                        }
                      >
                        <RefreshCw size={15} />
                        重新安排
                      </button>
                    </>
                  ) : (
                    <div className="daily-empty">
                      <span className="ai-symbol">
                        <Sparkles size={30} />
                      </span>
                      <h3>让下一道题，更有针对性</h3>
                      <p>
                        {dashboard.aiConfigured
                          ? "根据你的练习记录，安排今天的学习重点。"
                          : "连接你的 AI 服务，开启今日学习计划。"}
                      </p>
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() =>
                          dashboard.aiConfigured
                            ? run("正在分析弱点并安排今日学习", async () => {
                                await api("/ai/daily", {});
                                await refresh();
                              })
                            : go("settings")
                        }
                      >
                        {dashboard.aiConfigured
                          ? "生成今日计划"
                          : "配置 AI 服务"}
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  )}
                </section>
                <section className="weak-section">
                  <div className="section-heading">
                    <h2>{dashboard.plan ? "今日薄弱点" : "重点关注"}</h2>
                    <button
                      className="text-button"
                      onClick={() => go("mastery")}
                    >
                      全部
                      <ChevronRight size={15} />
                    </button>
                  </div>
                  {(dashboard.plan?.weaknesses.length
                    ? dashboard.plan.weaknesses
                        .map((w) =>
                          weak.find(
                            (m) => m.knowledgePoint === w.knowledgePoint,
                          ),
                        )
                        .filter(Boolean)
                    : weak
                  )
                    .slice(0, 4)
                    .map((m, i) => (
                      <button
                        className="weak-row"
                        key={m.knowledgePoint}
                        onClick={() =>
                          start(
                            allQuestions.filter(
                              (q) => q.knowledgePoint === m.knowledgePoint,
                            ),
                            m.knowledgePoint,
                          )
                        }
                      >
                        <div>
                          <span className={"topic-dot tone-" + i} />
                          <strong>{m.knowledgePoint}</strong>
                          <b>
                            {m.attemptCount ? m.masteryScore : "--"}
                            <small> / 100</small>
                          </b>
                        </div>
                        <div className="progress">
                          <i style={{ width: m.masteryScore + "%" }} />
                        </div>
                        <small>
                          {m.attemptCount
                            ? `${m.attemptCount} 次练习 · 正确率 ${pct(m.accuracy)}`
                            : "尚未练习"}
                        </small>
                        {dashboard.plan?.weaknesses.find(
                          (w) => w.knowledgePoint === m.knowledgePoint,
                        )?.reason && (
                          <p className="weak-reason">
                            {
                              dashboard.plan.weaknesses.find(
                                (w) => w.knowledgePoint === m.knowledgePoint,
                              ).reason
                            }
                          </p>
                        )}
                      </button>
                    ))}
                </section>
              </div>
              <section className="chapters-section">
                <div className="section-heading">
                  <h2>章节练习</h2>
                  <button
                    className="text-button"
                    onClick={() => go("chapters")}
                  >
                    查看全部章节
                    <ArrowRight size={15} />
                  </button>
                </div>
                <ChapterGrid
                  chapters={dashboard.chapters.slice(0, 6).map((chapter) => {
                    const questions = questionsForChapter(chapter.name);
                    return { ...chapter, questions, total: questions.length };
                  })}
                  start={start}
                  expand={openChapter}
                />
              </section>
              <div className="bottom-band">
                <img
                  src="/network-rack.jpg"
                  alt="网络机房中的服务器与交换设备"
                />
                <div>
                  <Network size={28} />
                  <span>
                    <strong>
                      {dashboard.certificate.shortName} · 知识体系
                    </strong>
                    <small>
                      {dashboard.syllabus
                        ? `${dashboard.syllabus.version} · ${dashboard.syllabus.modules.length} 个考点模块`
                        : "从基础概念，到岗位实操"}
                    </small>
                  </span>
                </div>
                <button onClick={() => go("exam")}>
                  进入模拟考试
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {page === "chapters" && (
            <>
              <Heading
                title={
                  !chapterFocus
                    ? "章节练习"
                    : sectionFocus
                      ? `${sectionFocus} · 三级知识点`
                      : selectedChapterSections.length
                        ? `${chapterFocus} · 二级分类`
                        : `${chapterFocus} · 知识点`
                }
                subtitle={
                  chapterFocus
                    ? sectionFocus
                      ? `${selectedSectionQuestions.length} 道题 · ${selectedKnowledgePoints.length} 个考点`
                      : selectedChapterSections.length
                        ? `${selectedChapterQuestions.length} 道题 · ${selectedChapterSections.filter((section) => section.total > 0).length} 个二级分类`
                        : `${selectedChapterQuestions.length} 道题 · ${selectedKnowledgePoints.length} 个知识点`
                    : `${dashboard.chapters.length} 个${dashboard.syllabus ? "考点模块" : "章节"} · ${dashboard.banks.map((bank) => `${allQuestions.filter((q) => q.source === bank.source).length} 道${bank.name}`).join(" · ")}`
                }
              />
              {dashboard.syllabus && (
                <div className="source-notice">
                  <CircleCheck size={19} />
                  <div>
                    <strong>
                      {dashboard.certificate.id === "veterinary-practitioner"
                        ? "执兽题库统一归档"
                        : "题库来源分级已启用"}
                    </strong>
                    <p>
                      {dashboard.certificate.id === "veterinary-practitioner"
                        ? "现有执兽题目统一显示为“管理员添加”，原始 PDF 文件、题号和来源类型仍保留在题目 provenance 中。"
                        : "当前收录的是依据官方 V2.0 范围编写的原创仿真题。尚未发现华为官方公开的完整历年真题库，因此不会把第三方 Dump 标成官方真题。"}
                    </p>
                  </div>
                </div>
              )}
              <div className="bank-filter-row">
                <label className="bank-filter">
                  题库来源
                  <select
                    aria-label="题库来源"
                    value={bankSource}
                    onChange={(e) => setBankSource(e.target.value)}
                  >
                    <option value="all">全部内置题库</option>
                    {dashboard.banks.map((bank) => (
                      <option key={bank.id} value={bank.source}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="shared-ai-toggle">
                  <input
                    type="checkbox"
                    checked={useSharedAi}
                    disabled={sharedAiLoading}
                    onChange={(event) => toggleSharedAi(event.target.checked)}
                  />
                  <span>使用其他用户生成的 AI 题目</span>
                  {useSharedAi && (
                    <small>
                      {sharedAiLoading
                        ? "读取中"
                        : `${sharedAiQuestions.length} 题`}
                    </small>
                  )}
                </label>
              </div>
              <button
                className="favorite-practice-entry"
                disabled={!favoriteQuestions.length}
                onClick={() => start(favoriteQuestions, "收藏题目")}
              >
                <span className="favorite-practice-icon">
                  <Star size={20} fill="currentColor" />
                </span>
                <span className="favorite-practice-copy">
                  <strong>收藏题目</strong>
                  <small>
                    {favoriteQuestions.length
                      ? `${favoriteQuestions.length} 道已收藏题目`
                      : "在答题页点击星标收藏题目"}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
              {!chapterFocus ? (
                <ChapterGrid
                  chapters={dashboard.chapters
                    .map((chapter) => {
                      const questions = questionsForChapter(chapter.name);
                      return { ...chapter, questions, total: questions.length };
                    })
                    .filter((chapter) => chapter.total > 0)}
                  start={start}
                  expand={openChapter}
                />
              ) : selectedChapter ? (
                selectedChapterSections.length && !sectionFocus ? (
                  <KnowledgeSectionGrid
                    chapter={selectedChapter.name}
                    sections={selectedChapterSections}
                    questions={selectedChapterQuestions}
                    start={start}
                    select={(name) => setSectionFocus(name)}
                    back={() => setChapterFocus("")}
                  />
                ) : (
                  <KnowledgePointGrid
                    chapter={`${selectedChapter.name}${sectionFocus ? ` · ${sectionFocus}` : ""}`}
                    points={selectedKnowledgePoints}
                    questions={selectedSectionQuestions}
                    mastery={dashboard.mastery}
                    start={start}
                    back={() =>
                      sectionFocus
                        ? setSectionFocus("")
                        : setChapterFocus("")
                    }
                    backLabel={sectionFocus ? "返回二级分类" : "返回章节"}
                    allLabel={sectionFocus ? "练习本分类全部题" : "练习本章全部题"}
                  />
                )
              ) : (
                <Empty title="找不到这个科目">
                  <button className="primary" onClick={() => setChapterFocus("")}>
                    返回章节
                  </button>
                </Empty>
              )}
            </>
          )}
          {page === "guide" && (
            <CertificateGuideView
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
            />
          )}
          {page === "wrong" && (
            <WrongView
              wrong={wrong}
              start={start}
              train={train}
              busy={busy}
              run={run}
              refresh={refresh}
            />
          )}
          {page === "training" && (
            <>
              <Heading
                title="AI 专项训练"
                subtitle="围绕薄弱知识，从基础理解到综合应用"
              />
              <TrainingView
                questions={allQuestions}
                wrong={wrong}
                weak={weak}
                 queue={queue}
                 groups={aiGroups}
                 onShareChange={(id, shared) =>
                   run("正在保存共享设置", async () => {
                     await api(`/ai/groups/${id}/share`, { shared }, "PUT");
                     setAiGroups((old) =>
                       old.map((group) =>
                         group.id === id ? { ...group, shared } : group,
                       ),
                     );
                     await loadSharedAi();
                     await refresh();
                   })
                 }
                train={train}
                start={start}
                busy={busy}
                configured={dashboard.aiConfigured}
                settings={() => go("settings")}
              />
            </>
          )}
          {page === "community" && (
            <CommunityView
              questions={sharedAiQuestions}
              loading={sharedAiLoading}
              stats={dashboard.community}
              reload={loadSharedAi}
              start={start}
            />
          )}
          {page === "chat" && <CommunityChatView currentUserId={auth.user?.id} />}
          {page === "about" && <AboutView onSponsor={() => setSponsorOpen(true)} />}
          {page === "mastery" && (
            <>
              <Heading
                title="知识掌握度"
                subtitle="长期表现 · 近期正确率 · 练习频率"
              />
              <div className="mastery-summary">
                <strong>
                  {dashboard.mastery.filter((m) => m.masteryScore >= 80).length}
                  <small>个知识点已掌握</small>
                </strong>
                <strong>
                  {dashboard.mastery.filter((m) => m.attemptCount).length}
                  <small>个知识点已练习</small>
                </strong>
                <strong>
                  {dashboard.totalCount}
                  <small>次累计作答</small>
                </strong>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>知识点</th>
                      <th>掌握度</th>
                      <th>正确 / 错误</th>
                      <th>近期正确率</th>
                      <th>平均用时</th>
                      <th>连续正确</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {weak.map((m) => (
                      <tr key={m.knowledgePoint}>
                        <td>
                          <strong>{m.knowledgePoint}</strong>
                          <small>{m.chapter}</small>
                        </td>
                        <td>
                          <div className="mastery-meter">
                            <div className="progress">
                              <i style={{ width: m.masteryScore + "%" }} />
                            </div>
                            <b>{m.masteryScore}</b>
                          </div>
                        </td>
                        <td>
                          {m.correctCount} / {m.wrongCount}
                        </td>
                        <td>{m.attemptCount ? pct(m.recentAccuracy) : "--"}</td>
                        <td>
                          {m.attemptCount
                            ? Math.round(m.averageTime / 1000) + " 秒"
                            : "--"}
                        </td>
                        <td>{m.consecutiveCorrect}</td>
                        <td>
                          <IconButton
                            icon={ArrowRight}
                            label={`练习${m.knowledgePoint}`}
                            onClick={() =>
                              start(
                                allQuestions.filter(
                                  (q) => q.knowledgePoint === m.knowledgePoint,
                                ),
                                m.knowledgePoint,
                              )
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {page === "settings" && (
            <SettingsView
              run={run}
              busy={busy}
              notify={setNotice}
              refresh={refresh}
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
              onUserUpdated={(user) =>
                setAuth((old) => ({ ...old, user }))
              }
              onCertificateChange={async (certificateId) => {
                const result = await api(
                  "/auth/certificate",
                  { certificateId },
                  "PUT",
                );
                localStorage.removeItem("netwise-exam");
                setSession(null);
                setQueue([]);
                setBankSource("all");
                setUseSharedAi(false);
                setSharedAiQuestions([]);
                setAuth((old) => ({ ...old, user: result.user }));
                setNotice(`已切换到 ${result.user.certificate.shortName}`);
              }}
            />
          )}
          {page === "admin" && dashboard.user?.isAdmin && (
            <AdminView
              run={run}
              busy={busy}
              notify={setNotice}
              certificates={auth.certificates}
              currentCertificateId={auth.user.certificateId}
            />
          )}
          {page === "practice" &&
            (session ? (
              <Practice
                key={session.key}
                session={session}
                refresh={refresh}
                run={run}
                busy={busy}
                 train={train}
                 configured={dashboard.aiConfigured}
                 community={dashboard.community}
                 exit={() => go("home")}
              />
            ) : (
              <Empty title="选择一组题目开始练习">
                <button className="primary" onClick={() => go("chapters")}>
                  选择章节
                </button>
              </Empty>
            ))}
          {page === "exam" && (
            <ExamView run={run} refresh={refresh} dashboard={dashboard} />
          )}
        </main>
        <footer>
          考匠 · AceExam<span>职业认证机考练习平台</span>
          <span className="local-status">
            <i />
            题库与学习数据保存在服务器
          </span>
        </footer>
      </div>
      {announcementOpen && <AnnouncementModal onClose={dismissAnnouncement} />}
      {sponsorOpen && <SponsorModal onClose={() => setSponsorOpen(false)} />}
    </div>
  );
}
function Heading({ title, subtitle, children }) {
  return (
    <div className="page-heading compact">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
function ChapterGrid({ chapters, start, expand }) {
  return (
    <div className="chapter-grid">
      {chapters.map((c, i) => (
        <article className="chapter-item" key={c.name}>
          <div className={"chapter-icon tone-" + (i % 4)}>
            <Network size={22} />
          </div>
          <div className="chapter-info">
            <strong>{c.name}</strong>
            <small>
              {c.total} 题 <span>·</span> 已练 {c.attempted} 题
            </small>
            {c.targetQuestionCount && (
              <small className="module-meta">
                题库 {c.total}/{c.targetQuestionCount} · 本站配比 {c.weight}%
              </small>
            )}
            <div className="progress">
              <i
                style={{
                  width: Math.min(100, (c.attempted / c.total) * 100) + "%",
                }}
              />
            </div>
            <div className="chapter-category-actions">
              <button
                className="text-button"
                disabled={!c.questions?.length}
                onClick={() => start(c.questions || [], c.name)}
              >
                练习本级题库
                <ArrowRight size={14} />
              </button>
              {(c.sections?.length || c.knowledgePoints?.length) > 0 && (
                <button
                  className="text-button"
                  onClick={() => expand(c.name)}
                >
                  展开下一级
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
function KnowledgeSectionGrid({
  chapter,
  sections,
  questions,
  start,
  select,
  back,
}) {
  const groups = sections.map((section) => {
    const sectionQuestions = questions.filter(
      (question) => question.knowledgeSection === section.name,
    );
    return {
      ...section,
      questions: sectionQuestions,
      attempted: sectionQuestions.filter((question) => question.attempted).length,
    };
  });
  return (
    <>
      <div className="chapter-drilldown-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          返回章节
        </button>
        <button
          className="primary"
          disabled={!questions.length}
          onClick={() => start(questions, chapter)}
        >
          练习本章全部题
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="knowledge-point-grid">
        {groups.map((group, index) => (
          <article
            className="knowledge-point-item knowledge-section-item"
            key={group.name}
          >
            <div className={"knowledge-point-icon tone-" + (index % 4)}>
              <Network size={19} />
            </div>
            <div className="knowledge-point-info">
              <strong>{group.name}</strong>
              <small>
                {group.questions.length} 题 <span>·</span> 已练 {group.attempted} 题
              </small>
              <div className="progress">
                <i
                  style={{
                    width:
                      group.questions.length > 0
                        ? Math.min(100, (group.attempted / group.questions.length) * 100) + "%"
                      : "0%",
                  }}
                />
              </div>
              <div className="chapter-category-actions">
                <button
                  className="text-button"
                  disabled={!group.questions.length}
                  onClick={() =>
                    start(group.questions, `${chapter} · ${group.name}`)
                  }
                >
                  练习本分类
                  <ArrowRight size={14} />
                </button>
                <button
                  className="text-button"
                  onClick={() => select(group.name)}
                >
                  展开考点
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
function KnowledgePointGrid({
  chapter,
  points,
  questions,
  mastery,
  start,
  back,
  backLabel = "返回章节",
  allLabel = "练习本章全部题",
}) {
  const pointNames = points
    .map((point) => (typeof point === "string" ? point : point?.name || ""))
    .filter(Boolean);
  const groups = pointNames.map((knowledgePoint) => {
    const pointQuestions = questions.filter(
      (question) =>
        (question.targetKnowledgePoint || question.knowledgePoint) ===
        knowledgePoint,
    );
    return {
      knowledgePoint,
      questions: pointQuestions,
      attempted: pointQuestions.filter((question) => question.attempted).length,
    };
  });
  return (
    <>
      <div className="chapter-drilldown-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          {backLabel}
        </button>
        <button
          className="primary"
          disabled={!questions.length}
          onClick={() => start(questions, chapter)}
        >
          {allLabel}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="knowledge-point-grid">
        {groups.map((group, index) => (
          <button
            className="knowledge-point-item"
            key={group.knowledgePoint}
            disabled={!group.questions.length}
            onClick={() =>
              start(group.questions, chapter + " · " + group.knowledgePoint)
            }
          >
            <div
              className={"knowledge-point-icon tone-" + (index % 4)}
            >
              <Target size={19} />
            </div>
            <div className="knowledge-point-info">
              <strong>{group.knowledgePoint}</strong>
              <small>
                {group.questions.length} 题 <span>·</span> 已练{" "}
                {group.attempted} 题
              </small>
              <div className="progress">
                <i
                  style={{
                    width:
                      group.questions.length > 0
                        ? Math.min(
                            100,
                            (group.attempted / group.questions.length) * 100,
                          ) + "%"
                        : "0%",
                  }}
                />
              </div>
              <span className="knowledge-point-enter">
                进入题库
                <ArrowRight size={13} />
              </span>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
    </>
  );
}
function CertificateGuideView({ certificates, currentCertificateId }) {
  const [selectedId, setSelectedId] = useState(currentCertificateId);
  useEffect(() => setSelectedId(currentCertificateId), [currentCertificateId]);
  const certificate =
    certificates.find((item) => item.id === selectedId) || certificates[0];
  const guide = certificate?.guide;
  const isNetworkGuide = ["network-engineer", "hcia-datacom"].includes(
    certificate?.id,
  );
  const factIcons = [
    BadgeInfo,
    Banknote,
    ShieldCheck,
    CalendarClock,
    FileText,
    Layers3,
  ];
  if (!guide)
    return (
      <Empty icon={BadgeInfo} title="这张证书的指南正在整理">
        <p>考试规则确认后会在这里发布。</p>
      </Empty>
    );
  const careerGroups = [
    {
      title: "适合谁考",
      hint: "人群",
      icon: Compass,
      items: guide.career.bestFor,
    },
    {
      title: "对应岗位",
      hint: "方向",
      icon: BriefcaseBusiness,
      items: guide.career.roles,
    },
    {
      title: "主要价值",
      hint: "收益",
      icon: Award,
      items: guide.career.value,
    },
    {
      title: "现实边界",
      hint: "注意",
      icon: Scale,
      items: guide.career.limitations,
    },
  ];
  return (
    <div className={`certificate-guide-page guide-theme-${certificate.id}`}>
      <Heading title="证书指南" subtitle="考试规则、考点范围、成本与职业价值">
        <span className="guide-verified">
          <CircleCheck size={15} />
          信息核对于 {guide.verifiedAt}
        </span>
      </Heading>

      <div className="certificate-guide-switcher" role="tablist">
        {certificates.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={selectedId === item.id}
            className={selectedId === item.id ? "selected" : ""}
            onClick={() => setSelectedId(item.id)}
          >
            <span className="guide-tab-icon">
              {item.id === "network-engineer" ? (
                <Landmark size={18} />
              ) : item.id === "ncre-ms-office" ? (
                <FileText size={18} />
              ) : item.id === "veterinary-practitioner" ? (
                <Stethoscope size={18} />
              ) : (
                <Network size={18} />
              )}
            </span>
            <span>
              <strong>{item.shortName}</strong>
              <small>
                {item.id === currentCertificateId
                  ? "当前报考证书"
                  : "查看证书资料"}
              </small>
            </span>
            {selectedId === item.id ? (
              <CircleCheck size={17} />
            ) : (
              <ChevronRight size={17} />
            )}
          </button>
        ))}
        <p>切换这里只查看资料，不会改变你的当前题库。</p>
      </div>

      <section className="certificate-guide-hero">
        <div className="guide-identity">
          <div className="guide-document-meta">
            <span>{guide.badge}</span>
            <span>EXAM GUIDE · 2026</span>
          </div>
          <div className="guide-title-lockup">
            <span className="guide-emblem">
              <Award size={30} strokeWidth={1.7} />
            </span>
            <div>
              <h1>{guide.title}</h1>
              <strong>{guide.subtitle}</strong>
            </div>
          </div>
          <p>{guide.overview}</p>
          <a
            className="guide-official-link"
            href={guide.sources[0].url}
            target="_blank"
            rel="noreferrer"
          >
            查看官方介绍
            <ExternalLink size={15} />
          </a>
        </div>
        <div className="guide-fact-board">
          <header>
            <span>报考速览</span>
            <strong>先看清这 {guide.facts.length} 项</strong>
          </header>
          <div className="guide-facts">
            {guide.facts.map((fact, index) => {
              const FactIcon = factIcons[index % factIcons.length];
              return (
                <div key={fact.label}>
                  <span className="guide-fact-icon">
                    <FactIcon size={17} />
                  </span>
                  <span>{fact.label}</span>
                  <strong>{fact.value}</strong>
                  <small>{fact.note}</small>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <div className="certificate-guide-layout">
        <div className="guide-primary-column">
          <section className="guide-section guide-schedule">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">01 · TIME</span>
                <h2>
                  <CalendarDays size={20} />
                  {guide.schedule.title}
                </h2>
              </div>
              <span className="badge green">{guide.schedule.status}</span>
            </div>
            <div className="guide-timeline">
              {guide.schedule.items.map((item, index) => (
                <div key={`${item.date}-${item.title}`}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <time>{item.date}</time>
                  <span>
                    <strong>{item.title}</strong>
                    <p>{item.detail}</p>
                  </span>
                </div>
              ))}
            </div>
            <p className="guide-section-note">{guide.schedule.note}</p>
          </section>

          <section className="guide-section">
            <div className="section-heading">
              <div>
                <span className="guide-section-index">02 · EXAM</span>
                <h2>
                  <Monitor size={20} />
                  考试方式与通过要求
                </h2>
              </div>
            </div>
            <dl className="guide-detail-list">
              {guide.examDetails.map((item, index) => (
                <div key={item.label}>
                  <dt>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {item.label}
                  </dt>
                  <dd>
                    <strong>{item.value}</strong>
                    {item.detail && <small>{item.detail}</small>}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <aside className="guide-must-know">
          <div className="guide-must-know-heading">
            <span>
              <TriangleAlert size={19} />
            </span>
            <div>
              <small>BEFORE YOU BOOK</small>
              <h2>报名前必须知道</h2>
            </div>
          </div>
          <ol>
            {guide.mustKnow.map((item, index) => (
              <li key={item}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{item}</p>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      <section className="guide-section guide-knowledge">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">03 · SYLLABUS</span>
            <h2>
              <Target size={20} />
              核心考点
            </h2>
          </div>
          <span>{guide.knowledgeAreas.length} 个知识领域</span>
        </div>
        <div className="guide-knowledge-grid">
          {guide.knowledgeAreas.map((area, index) => (
            <article key={area.name}>
              <div>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <Target size={15} />
              </div>
              <h3>{area.name}</h3>
              <div className="guide-topic-list">
                {area.topics.map((topic) => (
                  <span key={topic}>{topic}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="guide-section guide-career">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">04 · CAREER</span>
            <h2>
              <GraduationCap size={20} />
              职业前景与证书价值
            </h2>
          </div>
        </div>
        <p className="guide-career-summary">{guide.career.positioning}</p>
        <div className="guide-career-columns">
          {careerGroups.map(({ title, hint, icon: Icon, items }) => (
            <article key={title}>
              <header>
                <span>
                  <Icon size={17} />
                </span>
                <div>
                  <small>{hint}</small>
                  <h3>{title}</h3>
                </div>
              </header>
              <ul>
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {isNetworkGuide && (
        <section className="certificate-choice-band">
          <header>
            <span>怎么选</span>
            <strong>同一套网络基础，两种职业价值</strong>
          </header>
          <div className="guide-choice-track">
            <article>
              <Landmark size={21} />
              <span>国家资格与职称使用</span>
              <strong>软考网络工程师</strong>
              <p>适合国企、事业单位、职称聘任依据和需要广泛网络知识的场景。</p>
            </article>
            <article>
              <Target size={21} />
              <span>两证共同基础</span>
              <strong>TCP/IP · VLAN · OSPF · ACL · NAT</strong>
              <p>知识重叠明显，基础阶段可以共用学习成果。</p>
            </article>
            <article>
              <Network size={21} />
              <span>数通实操与华为生态</span>
              <strong>HCIA-Datacom</strong>
              <p>适合 ICT、网络运维、系统集成岗位，并继续进阶 HCIP/HCIE。</p>
            </article>
          </div>
        </section>
      )}

      <section className="guide-section guide-sources">
        <div className="section-heading">
          <div>
            <span className="guide-section-index">05 · SOURCES</span>
            <h2>
              <CircleCheck size={20} />
              官方核对入口
            </h2>
          </div>
          <span>费用、日期与规则变化时以官方页面为准</span>
        </div>
        <div>
          {guide.sources.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              <span className="guide-source-icon">
                <FileText size={17} />
              </span>
              <span>
                <strong>{source.name}</strong>
                <small>{source.scope}</small>
              </span>
              <ExternalLink size={16} />
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
function WrongView({ wrong, start, train, busy, run, refresh }) {
  const [filter, setFilter] = useState("all"),
    [count, setCount] = useState(5),
    [chapter, setChapter] = useState("");
  const filtered = wrong.filter(
    (q) =>
      (filter !== "due" || q.review?.dueAt <= new Date().toISOString()) &&
      (!chapter || q.chapter === chapter),
  );
  return (
    <>
      <Heading
        title="错题本"
        subtitle={`${wrong.length} 道错题 · 持续追踪，定期回顾`}
      >
        <button
          className="primary"
          disabled={!filtered.length}
          onClick={() => start(filtered, "错题复习")}
        >
          <RotateCcw size={17} />
          开始复习
        </button>
      </Heading>
      <div className="toolbar">
        <div className="segmented">
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            全部错题
          </button>
          <button
            className={filter === "due" ? "selected" : ""}
            onClick={() => setFilter("due")}
          >
            今日到期
          </button>
        </div>
        <select
          aria-label="筛选章节"
          value={chapter}
          onChange={(e) => setChapter(e.target.value)}
        >
          <option value="">全部章节</option>
          {[...new Set(wrong.map((q) => q.chapter))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="inline-label">
          训练题量
          <select
            aria-label="训练题量"
            value={count}
            onChange={(e) => setCount(+e.target.value)}
          >
            {[3, 5, 10].map((n) => (
              <option key={n} value={n}>
                {n} 题
              </option>
            ))}
          </select>
        </label>
      </div>
      {!filtered.length ? (
        <Empty title={wrong.length ? "没有符合条件的错题" : "还没有错题记录"}>
          <p>完成练习后，答错的题目会出现在这里。</p>
        </Empty>
      ) : (
        <div className="wrong-list">
          {filtered.map((q) => (
            <article className="wrong-item" key={q.id}>
              <div className="question-meta">
                <span className="badge">{q.chapter}</span>
                <span className="badge red">错误 {q.wrongCount} 次</span>
                <span>{sourceName(q)}</span>
                <span className="push-right">
                  下次复习{" "}
                  {new Date(q.review.dueAt).toLocaleDateString("zh-CN")}
                </span>
              </div>
              <h3>{q.question}</h3>
              {q.type === "short_answer" ? (
                <div className="wrong-short-answer">
                  <p>上次作答：{q.lastWrong.response || "未填写"}</p>
                  <p>参考答案：{q.expectedAnswer}</p>
                </div>
              ) : (
                <p className="answer-line">
                  上次错选 <b>{q.lastWrong.selected.join("、") || "未作答"}</b>
                  <span>
                    正确答案 <strong>{q.answer.join("、")}</strong>
                  </span>
                </p>
              )}
              {q.mistake && (
                <div className="mistake-detail">
                  <Sparkles size={17} />
                  <div>
                    <strong>{q.mistake.weakKnowledge}</strong>
                    <p>{q.mistake.reason}</p>
                    <small>{q.mistake.mistakeType}</small>
                  </div>
                </div>
              )}
              <div className="item-actions">
                <button onClick={() => start([q], "错题复习")}>
                  <RotateCcw size={16} />
                  再做一次
                </button>
                <button
                  disabled={!!busy}
                  onClick={() =>
                    run("正在分析错误原因", async () => {
                      await api("/ai/analyze", { questionId: q.id });
                      await refresh();
                    })
                  }
                >
                  <MessageCircle size={16} />
                  {q.mistake ? "重新分析" : "分析错因"}
                </button>
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() => train(q, count)}
                >
                  <Sparkles size={16} />
                  AI 针对训练
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
function TrainingView({
  questions,
  wrong,
  weak,
  queue,
  groups,
  onShareChange,
  train,
  start,
  busy,
  configured,
  settings,
}) {
  const [topic, setTopic] = useState(weak[0]?.knowledgePoint || ""),
    [count, setCount] = useState(5);
  const q =
    wrong.find((q) => q.knowledgePoint === topic) ||
    questions.find((q) => q.knowledgePoint === topic);
  return (
    <>
      {!configured && (
        <div className="alert">
          <PlugZap size={18} />
          <span>尚未连接 AI 服务</span>
          <button onClick={settings}>
            前往设置
            <ArrowRight size={16} />
          </button>
        </div>
      )}
      <section className="training-form">
        <h2>
          <Target size={21} />
          创建专项训练
        </h2>
        <div className="training-controls">
          <label>
            知识点
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              {weak.map((m) => (
                <option key={m.knowledgePoint}>{m.knowledgePoint}</option>
              ))}
            </select>
          </label>
          <label>
            题目数量
            <div className="segmented">
              {[3, 5, 10].map((n) => (
                <button
                  className={count === n ? "selected" : ""}
                  key={n}
                  onClick={() => setCount(n)}
                >
                  {n} 题
                </button>
              ))}
            </div>
          </label>
          <button
            className="primary"
            disabled={!!busy || !configured || !q}
            onClick={() => train(q, count)}
          >
            <Sparkles size={17} />
            生成训练
          </button>
        </div>
        <div className="stage-track">
          {["基础理解", "直接计算", "变式计算", "反向推理", "综合应用"].map(
            (s, i) => (
              <React.Fragment key={s}>
                <span>
                  <b>{i + 1}</b>
                  {s}
                </span>
                {i < 4 && <ChevronRight size={16} />}
              </React.Fragment>
            ),
          )}
        </div>
      </section>
      <section>
        <div className="section-heading">
          <h2>待完成训练</h2>
          <span className="muted">{queue.length} 题</span>
        </div>
        {queue.length ? (
          <div className="chapter-grid">
            {[
              ...new Set(
                queue.map((q) => q.targetKnowledgePoint || q.knowledgePoint),
              ),
            ].map((t) => (
              <button
                className="chapter-item"
                key={t}
                onClick={() =>
                  start(
                    queue.filter(
                      (q) => (q.targetKnowledgePoint || q.knowledgePoint) === t,
                    ),
                    "AI 专项训练",
                  )
                }
              >
                <Sparkles size={24} />
                <div className="chapter-info">
                  <strong>{t}</strong>
                  <small>
                    {
                      queue.filter(
                        (q) =>
                          (q.targetKnowledgePoint || q.knowledgePoint) === t,
                      ).length
                    }{" "}
                    题待完成
                  </small>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={Sparkles} title="暂无待完成的训练" />
        )}
      </section>
      <section className="ai-groups-section">
        <div className="section-heading">
          <div>
            <h2>
              <Share2 size={20} />
              我的 AI 题组
            </h2>
            <p className="muted">
              共享后，同证书用户可以练习题目，但看不到你的账号和学习记录。
            </p>
          </div>
          <span className="muted">{groups?.length || 0} 组</span>
        </div>
        {groups?.length ? (
          <div className="ai-group-list">
            {groups.map((group) => (
              <article className="ai-group-card" key={group.id}>
                <div>
                  <span className="badge green">AI 生成</span>
                  <strong>{group.topic}</strong>
                  <small>
                    {group.questionCount} 题 · 已完成 {group.completedCount} 题 ·{" "}
                    {new Date(group.createdAt).toLocaleDateString("zh-CN")}
                  </small>
                </div>
                <label className="shared-ai-toggle">
                  <input
                    type="checkbox"
                    checked={group.shared}
                    disabled={!!busy}
                    onChange={(event) =>
                      onShareChange?.(group.id, event.target.checked)
                    }
                  />
                  <span>{group.shared ? "已共享" : "仅自己使用"}</span>
                </label>
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={Share2} title="还没有 AI 题组">
            <p>在错题本中分析错因后，可以生成第一组针对性训练。</p>
          </Empty>
        )}
      </section>
    </>
  );
}
function CommunityView({ questions, loading, stats, reload, start }) {
  const [chapter, setChapter] = useState(""),
    [sort, setSort] = useState("latest");
  const chapters = [...new Set(questions.map((q) => q.chapter))].sort();
  const filtered = questions
    .filter((q) => !chapter || q.chapter === chapter)
    .sort((a, b) => {
      if (sort === "helpful")
        return (b.feedback?.helpful || 0) - (a.feedback?.helpful || 0);
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    });
  return (
    <>
      <Heading
        title="共享 AI 题库"
        subtitle="用户共同贡献的变式题，练习记录彼此独立"
      >
        <button onClick={reload} disabled={loading}>
          <RefreshCw size={16} className={loading ? "spin" : ""} />
          刷新题库
        </button>
      </Heading>
      <div className="stats community-stats">
        {[
          ["共享题目", stats?.sharedQuestionCount || 0, "题", Globe2],
          ["贡献用户", stats?.contributorCount || 0, "人", Users],
          ["累计练习", stats?.attemptCount || 0, "次", BookOpen],
          ["我的贡献", stats?.myQuestionCount || 0, "题", Share2],
        ].map(([label, value, unit, Icon]) => (
          <div className="stat" key={label}>
            <div>
              <span>{label}</span>
              <Icon size={18} />
            </div>
            <strong>
              {value}
              <small>{unit}</small>
            </strong>
            <span className="stat-note">
              {label === "我的贡献" ? "审核通过后可被同证书用户练习" : "同证书范围"}
            </span>
          </div>
        ))}
      </div>
      <div className="community-notice">
        <Share2 size={19} />
        <div>
          <strong>一起把题库做大，也把题目做稳</strong>
          <p>
            AI 题经过服务端校验和独立审核才会进入共享列表。练习后可以反馈答案错误、表述不清或题目重复，帮助后续整理题库。
          </p>
        </div>
      </div>
      <div className="toolbar community-toolbar">
        <label className="inline-label">
          章节
          <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
            <option value="">全部章节</option>
            {chapters.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="inline-label">
          排序
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="latest">最新生成</option>
            <option value="helpful">最多有帮助反馈</option>
          </select>
        </label>
        <span className="muted">{filtered.length} 道可练习</span>
      </div>
      {loading ? (
        <div className="alert working">
          <LoaderCircle size={18} className="spin" />
          <span>正在读取共享题库</span>
        </div>
      ) : filtered.length ? (
        <div className="community-list">
          {filtered.map((q) => (
            <article className="community-card" key={q.id}>
              <div className="question-meta">
                <span className="badge green">AI 生成</span>
                <span className="badge">{q.chapter}</span>
                <span>{diff[q.difficulty] || "练习"}</span>
                <span className="push-right feedback-count">
                  <ThumbsUp size={14} /> {q.feedback?.helpful || 0}
                </span>
              </div>
              <h3>{q.question}</h3>
              <p className="community-topic">{q.knowledgePoint}</p>
              <button
                className="primary"
                onClick={() => start([q], "共享 AI 练习")}
              >
                开始练习
                <ArrowRight size={16} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Empty icon={Globe2} title="共享题库还在增长中">
          <p>先从错题本生成一组 AI 训练题，审核通过后就能贡献给同证书用户。</p>
        </Empty>
      )}
    </>
  );
}
const mergeCommunityMessages = (current, incoming) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => {
    const created = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    return created || String(a.id).localeCompare(String(b.id));
  });
};
const formatCommunityBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};
const formatCommunityTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
};
function CommunityChatView({ currentUserId }) {
  const [room, setRoom] = useState(null),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [attachment, setAttachment] = useState(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [sending, setSending] = useState(false),
    [hasMore, setHasMore] = useState(false),
    [before, setBefore] = useState(""),
    [chatError, setChatError] = useState(""),
    [leaderboards, setLeaderboards] = useState(null),
    [leaderboardOpen, setLeaderboardOpen] = useState(false),
    [leaderboardBusy, setLeaderboardBusy] = useState(false),
    [leaderboardError, setLeaderboardError] = useState(""),
    [leaderboardTab, setLeaderboardTab] = useState("answered");
  const leaderboardTypes = [
    ["answered", "刷题量", "题"],
    ["accuracy", "正确率", "%"],
    ["streakDays", "坚持天数", "天"],
    ["submitted", "提交题目", "题"],
  ];
  const activeBoard = leaderboards?.[leaderboardTab];
  const leaderboardUnit = leaderboardTypes.find(([id]) => id === leaderboardTab)?.[2] || "";
  const openLeaderboard = async () => {
    if (leaderboardOpen) {
      setLeaderboardOpen(false);
      return;
    }
    setLeaderboardOpen(true);
    setLeaderboardBusy(true);
    setLeaderboardError("");
    try {
      setLeaderboards(await api("/community/leaderboards"));
    } catch (error) {
      setLeaderboardError(error.message);
    } finally {
      setLeaderboardBusy(false);
    }
  };
  const messagesRef = useRef(null);
  const firstLoadRef = useRef(true);
  useEffect(() => {
    let active = true;
    const loadLatest = async (initial = false) => {
      try {
        const result = await api("/community/messages?limit=50");
        if (!active) return;
        setRoom(result.room);
        setMessages((current) =>
          initial ? result.messages : mergeCommunityMessages(current, result.messages),
        );
        setHasMore((current) => (initial ? result.hasMore : current || result.hasMore));
        if (initial) setBefore(result.nextBefore || "");
        setChatError("");
      } catch (error) {
        if (active) setChatError(error.message);
      } finally {
        if (active && initial) setLoading(false);
      }
    };
    loadLatest(true);
    const timer = window.setInterval(() => loadLatest(false), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!firstLoadRef.current || loading || !messages.length) return;
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
    firstLoadRef.current = false;
  }, [loading, messages.length]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await api("/community/messages?limit=50");
      setRoom(result.room);
      setMessages((current) => mergeCommunityMessages(current, result.messages));
      setHasMore((current) => current || result.hasMore);
      if (!before) setBefore(result.nextBefore || "");
      setChatError("");
    } catch (error) {
      setChatError(error.message);
    } finally {
      setRefreshing(false);
    }
  };
  const loadOlder = async () => {
    if (!hasMore || !before || loadingMore) return;
    const element = messagesRef.current;
    const previousHeight = element?.scrollHeight || 0;
    const previousTop = element?.scrollTop || 0;
    setLoadingMore(true);
    try {
      const result = await api(
        `/community/messages?limit=50&before=${encodeURIComponent(before)}`,
      );
      setMessages((current) => mergeCommunityMessages(result.messages, current));
      setBefore(result.nextBefore || "");
      setHasMore(result.hasMore);
      setRoom(result.room);
      setChatError("");
      window.requestAnimationFrame(() => {
        if (element) element.scrollTop = element.scrollHeight - previousHeight + previousTop;
      });
    } catch (error) {
      setChatError(error.message);
    } finally {
      setLoadingMore(false);
    }
  };
  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!supported.includes(file.type)) {
      setChatError("只支持 JPG、PNG、GIF 或 WebP 图片");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setChatError("单张图片不能超过 6MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        setChatError("图片读取失败，请重试");
        return;
      }
      setAttachment({
        name: file.name,
        size: file.size,
        mimeType: file.type,
        data: dataUrl.slice(comma + 1),
        preview: dataUrl,
      });
      setChatError("");
    };
    reader.onerror = () => setChatError("图片读取失败，请重试");
    reader.readAsDataURL(file);
  };
  const send = async () => {
    const text = draft.trim();
    if (sending || (!text && !attachment)) return;
    setSending(true);
    try {
      const result = await api(
        "/community/messages",
        {
          ...(text ? { text } : {}),
          ...(attachment
            ? { image: { data: attachment.data, mimeType: attachment.mimeType } }
            : {}),
        },
        "POST",
      );
      setRoom(result.room);
      setMessages((current) => mergeCommunityMessages(current, [result.message]));
      setDraft("");
      setAttachment(null);
      setChatError("");
      window.requestAnimationFrame(() => {
        const element = messagesRef.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    } catch (error) {
      setChatError(error.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <Heading title="考匠社区" subtitle="一个公共大群 · 不加好友 · 和所有正在努力的人交流">
        <button onClick={openLeaderboard} aria-expanded={leaderboardOpen}>
          <ChartNoAxesCombined size={16} />排行榜
        </button>
        <button onClick={refresh} disabled={refreshing || loading}>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          刷新消息
        </button>
      </Heading>
      {leaderboardOpen && (
        <section className="community-leaderboards" aria-label="社区排行榜">
          <div className="community-leaderboard-tabs" role="tablist" aria-label="榜单类型">
            {leaderboardTypes.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={leaderboardTab === id}
                className={leaderboardTab === id ? "active" : ""}
                onClick={() => setLeaderboardTab(id)}
              >{label}</button>
            ))}
          </div>
          <p className="community-leaderboard-rule">
            {leaderboardTab === "accuracy"
              ? `至少作答 ${leaderboards?.accuracyMinAttempts ?? 20} 题参与正确率排行`
              : leaderboardTab === "streakDays"
                ? "按北京时间计算连续刷题天数；今天未刷时保留昨日连续记录"
                : leaderboardTab === "submitted"
                  ? "统计通过双重核验并提交到服务器的题目"
                  : "统计累计作答次数"}
          </p>
          {leaderboardBusy && <p className="community-leaderboard-empty"><LoaderCircle size={18} className="spin" />正在读取榜单…</p>}
          {leaderboardError && <p className="community-leaderboard-error" role="alert">{leaderboardError}</p>}
          {!leaderboardBusy && !leaderboardError && !activeBoard?.top.length && (
            <p className="community-leaderboard-empty">这个榜单还没有记录，开始刷题吧。</p>
          )}
          {!!activeBoard?.top.length && (
            <ol className="community-leaderboard-list">
              {activeBoard.top.map((entry) => (
                <li key={entry.userId} className={entry.userId === currentUserId ? "own" : ""}>
                  <strong className="community-leaderboard-rank">{entry.rank}</strong>
                  <span>{entry.name}{entry.userId === currentUserId ? " · 我" : ""}</span>
                  {leaderboardTab === "accuracy" && <small>{entry.correct}/{entry.answered} 题正确</small>}
                  <b>{entry.value}{leaderboardUnit}</b>
                </li>
              ))}
            </ol>
          )}
          {activeBoard?.me && activeBoard.me.rank > activeBoard.top.length && (
            <div className="community-leaderboard-me">我的排名 #{activeBoard.me.rank} · {activeBoard.me.value}{leaderboardUnit}</div>
          )}
        </section>
      )}
      {chatError && (
        <div className="alert error" role="alert">
          <TriangleAlert size={18} />
          <span>{chatError}</span>
          <IconButton icon={X} label="关闭社区提示" onClick={() => setChatError("")} />
        </div>
      )}
      {room && (
        <section className="chat-room-summary">
          <div className="chat-room-icon"><Users size={23} /></div>
          <div className="chat-room-copy">
            <strong>{room.name}</strong>
            <p>{room.description}</p>
            <small>{room.memberCount} 位成员 · {room.messageCount} 条消息</small>
          </div>
          <div className="chat-room-storage">
            <span>公共存储</span>
            <strong>{formatCommunityBytes(room.storageUsedBytes)} / {formatCommunityBytes(room.storageLimitBytes)}</strong>
          </div>
        </section>
      )}
      <section className="community-chat-shell">
        <div className="community-chat-messages" ref={messagesRef}>
          {hasMore && (
            <button className="chat-load-more" onClick={loadOlder} disabled={loadingMore}>
              {loadingMore ? <LoaderCircle size={15} className="spin" /> : <ChevronDown size={15} />}
              {loadingMore ? "正在加载" : "加载更早消息"}
            </button>
          )}
          {loading ? (
            <div className="chat-empty"><LoaderCircle size={24} className="spin" /><span>正在进入考匠社区…</span></div>
          ) : messages.length ? (
            messages.map((message) => {
              const own = message.userId === currentUserId;
              return (
                <article className={`chat-message-row ${own ? "own" : ""}`} key={message.id}>
                  <div className="chat-message-block">
                    <div className="chat-author">
                      <strong>{own ? "我" : message.authorName || "考匠用户"}</strong>
                      <time>{formatCommunityTime(message.createdAt)}</time>
                    </div>
                    <div className={`chat-bubble ${own ? "own" : ""}`}>
                      {message.text && <p className="chat-text">{message.text}</p>}
                      {message.imageUrl && (
                        <img className="chat-image" src={message.imageUrl} alt="社区图片" loading="lazy" />
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="chat-empty"><MessageCircle size={28} /><strong>社区还没有消息</strong><span>发一条文字、Emoji 或图片，和大家打个招呼吧。</span></div>
          )}
        </div>
        <div className="community-chat-composer">
          {attachment && (
            <div className="chat-attachment-preview">
              <img src={attachment.preview} alt={attachment.name} />
              <div><strong>{attachment.name}</strong><small>{formatCommunityBytes(attachment.size)}</small></div>
              <button type="button" onClick={() => setAttachment(null)} aria-label="移除图片"><X size={16} /></button>
            </div>
          )}
          <div className="chat-emoji-row" aria-label="常用 Emoji">
            {['😀', '👏', '💪', '📚', '🎉', '❤️'].map((emoji) => (
              <button type="button" className="chat-emoji-button" key={emoji} onClick={() => setDraft((value) => value + emoji)}>{emoji}</button>
            ))}
          </div>
          <div className="chat-input-row">
            <label className="chat-attach" title="发送图片">
              <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={chooseImage} />
              <FileText size={18} />
              <span>图片</span>
            </label>
            <textarea
              value={draft}
              maxLength={2000}
              placeholder="输入消息，Enter 发送，Shift + Enter 换行"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button className="primary chat-send" onClick={send} disabled={sending || (!draft.trim() && !attachment)}>
              {sending ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
              {sending ? "发送中" : "发送"}
            </button>
          </div>
          <div className="chat-composer-foot"><span>仅支持文字、Emoji 和图片 · 图片单张最大 6MB</span><small>{draft.length} / 2000</small></div>
        </div>
      </section>
    </>
  );
}
function AboutView({ onSponsor }) {
  return (
    <>
      <Heading title="关于考匠" subtitle="让学习回到每个人手里">
        <button onClick={onSponsor}><Heart size={16} />赞助作者</button>
      </Heading>
      <section className="about-hero-card">
        <div className="about-hero-mark">考</div>
        <div>
          <span className="eyebrow">考匠 · AceExam</span>
          <h2>把精练题、碎片时间和现代化 AI 教育放在一起。</h2>
          <p>网站端与移动端共用账号、题库和学习记录，也共用考匠社区。</p>
        </div>
      </section>
      <section className="about-author-card">
        <div className="section-heading">
          <div><h2>作者想说</h2><p>我做考匠，起初只是因为相信：</p></div>
          <BadgeInfo size={23} />
        </div>
        <p>每一个认真学习的人，都应该拥有一条不被费用和时间挡住的路。</p>
        <p>我希望，让暂时无力承担学费的同学，也能接触到经过整理、真正精练有用的题目；让没有时间参加补课的同学，也能利用通勤、排队和睡前的碎片时间，一点点向前进步；让每个人都能体验到更现代、更贴近自己的 AI 教育。</p>
        <p>考匠网站永久免费。唯一可能产生费用的部分，是 AI 供应商收取的 API 使用费，这笔费用不会进入作者口袋。</p>
        <p>如果考匠对你有帮助，欢迎打赏一笔小小的支持，帮助我们持续维护题库、改进体验，让考匠社区越来越好。</p>
      </section>
      <div className="about-value-grid">
        <article><BookOpen size={20} /><strong>精练题库</strong><span>围绕真实学习目标整理练习。</span></article>
        <article><Clock size={20} /><strong>碎片学习</strong><span>随时打开，利用几分钟持续进步。</span></article>
        <article><Sparkles size={20} /><strong>AI 助学</strong><span>解析、错因和变式训练按账号独立配置。</span></article>
      </div>
      <div className="about-footnote"><span>愿每一次短暂练习，都能变成看得见的进步。</span><button className="primary" onClick={onSponsor}><Heart size={16} />去赞助作者</button></div>
    </>
  );
}
function SettingsView({
  run,
  busy,
  notify,
  refresh,
  certificates,
  currentCertificateId,
  onUserUpdated,
  onCertificateChange,
}) {
  const [s, setS] = useState(null),
    [communityProfile, setCommunityProfile] = useState(null),
    [communityName, setCommunityName] = useState(""),
    [key, setKey] = useState(""),
    [show, setShow] = useState(false),
    [dirty, setDirty] = useState(false),
    [deepSeekGuideOpen, setDeepSeekGuideOpen] = useState(false),
    [authorDeployOpen, setAuthorDeployOpen] = useState(false),
    [authorPassword, setAuthorPassword] = useState(""),
    [authorDeployError, setAuthorDeployError] = useState(""),
    [authorDeployBusy, setAuthorDeployBusy] = useState(false);
  const load = () => api("/settings").then(setS);
  useEffect(() => {
    load();
    api("/community/profile")
      .then(({ profile }) => {
        setCommunityProfile(profile);
        setCommunityName(profile.name);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!deepSeekGuideOpen) return;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDeepSeekGuideOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [deepSeekGuideOpen]);
  if (!s) return <LoaderCircle className="spin" />;
  const change = (field, value) => {
    setS({ ...s, [field]: value });
    setDirty(true);
  };
  const save = () =>
    run("正在保存 AI 配置", async () => {
      await api(
        "/settings",
        {
          baseUrl: s.baseUrl,
          model: s.model,
          temperature: +s.temperature,
          ...(key ? { apiKey: key } : {}),
        },
        "PUT",
      );
      setKey("");
      setShow(false);
      setDirty(false);
      await load();
      await refresh();
      notify("AI 配置已保存");
    });
  const useDeepSeekDefaults = () => {
    setS({
      ...s,
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.3,
    });
    setDirty(true);
    setDeepSeekGuideOpen(false);
    notify("已填入 DeepSeek 推荐参数，请粘贴 API Key");
  };
  const saveCommunityName = () => {
    const name = communityName.trim();
    if (!name) {
      notify("社区昵称不能为空");
      return;
    }
    run("正在保存社区昵称", async () => {
      const result = await api("/community/profile", { name }, "PUT");
      setCommunityProfile(result.profile);
      setCommunityName(result.profile.name);
      onUserUpdated?.(result.user);
      notify("社区昵称已保存");
    });
  };
  const deployAuthorApi = () => {
    if (!authorPassword.trim() || authorDeployBusy) return;
    setAuthorDeployError("");
    setAuthorDeployBusy(true);
    run("正在部署作者 API", async () => {
      try {
        await api(
          "/settings/author-deploy",
          { password: authorPassword },
          "POST",
        );
        setKey("");
        setShow(false);
        setDirty(false);
        setAuthorPassword("");
        setAuthorDeployOpen(false);
        setDeepSeekGuideOpen(false);
        await load();
        await refresh();
        notify("作者 API 已部署到当前账号");
      } catch (error) {
        setAuthorDeployError(error.message);
      } finally {
        setAuthorDeployBusy(false);
      }
    });
  };
  return (
    <>
      <Heading title="设置" subtitle="报考证书、AI 服务与调用用量" />
      <section className="certificate-settings">
        <div className="section-heading">
          <div>
            <h2>
              <GraduationCap size={21} />
              报考证书
            </h2>
            <p>切换后，章节、推荐练习、错题本和模拟考试会使用对应题库。</p>
          </div>
          <span className="badge green">账号设置</span>
        </div>
        <div className="certificate-settings-list">
          {certificates.map((certificate) => {
            const selected = certificate.id === currentCertificateId;
            return (
              <button
                key={certificate.id}
                className={
                  "certificate-setting " + (selected ? "selected" : "")
                }
                disabled={!!busy || selected}
                onClick={() =>
                  run(`正在切换到 ${certificate.shortName}`, () =>
                    onCertificateChange(certificate.id),
                  )
                }
              >
                <span className="certificate-setting-icon">
                  {selected ? <Check size={18} /> : <GraduationCap size={18} />}
                </span>
                <span>
                  <strong>{certificate.name}</strong>
                  <small>{certificate.description}</small>
                  {certificate.syllabus && (
                    <small className="certificate-setting-meta">
                      {certificate.syllabus.version} ·{" "}
                      {certificate.syllabus.examCodeLabel || "考试代码"}{" "}
                      {certificate.syllabus.examCode}
                    </small>
                  )}
                </span>
                <b>{selected ? "当前证书" : "切换"}</b>
              </button>
            );
          })}
        </div>
      </section>
      <section className="community-profile-settings">
        <div className="section-heading">
          <div>
            <h2><MessageCircle size={21} />社区昵称</h2>
            <p>这个名字只会显示在考匠社区公共大群里，不影响登录账号。</p>
          </div>
          <span className="badge">同步到 App</span>
        </div>
        <div className="community-profile-form">
          <label>
            群内显示名称
            <input
              value={communityName}
              maxLength={24}
              placeholder={communityProfile ? "输入社区昵称" : "正在读取…"}
              disabled={!communityProfile || !!busy}
              onChange={(event) => setCommunityName(event.target.value)}
            />
          </label>
          <button
            className="primary"
            disabled={!communityProfile || !!busy || !communityName.trim() || communityName.trim() === communityProfile.name}
            onClick={saveCommunityName}
          >
            <Save size={16} />保存昵称
          </button>
        </div>
      </section>
      <div className="settings-tabs">
        <span>AI 设置</span>
      </div>
      <section className="settings-layout">
        <div className="settings-form">
          <div className="settings-form-heading">
            <h2>
              <PlugZap size={21} />
              AI 服务连接
            </h2>
            <button
              className="deepseek-guide-trigger"
              onClick={() => setDeepSeekGuideOpen(true)}
            >
              <BookOpen size={16} />
              DeepSeek 配置教程
            </button>
          </div>
          {!s.encryptionReady && (
            <div className="alert error">
              服务器尚未配置加密主密钥，无法保存 API Key。
            </div>
          )}
          <label>
            API Base URL
            <input
              type="url"
              placeholder="https://api.example.com/v1"
              value={s.baseUrl}
              onChange={(e) => change("baseUrl", e.target.value)}
            />
          </label>
          <label>
            API Key
            <div className="key-input">
              <input
                aria-label="API Key"
                type={show ? "text" : "password"}
                value={key}
                placeholder={
                  s.hasKey ? "已保存 · 输入新 Key 可修改" : "输入 API Key"
                }
                autoComplete="off"
                spellCheck="false"
                onChange={(e) => {
                  setKey(e.target.value);
                  setDirty(true);
                }}
              />
              <IconButton
                icon={show ? EyeOff : Eye}
                label={show ? "隐藏 API Key" : "显示 API Key"}
                disabled={!key}
                onClick={() => setShow(!show)}
              />
              <IconButton
                icon={Trash2}
                label="删除已保存 API Key"
                disabled={!s.hasKey || !!busy}
                onClick={() =>
                  run("正在删除 API Key", async () => {
                    await api("/settings/key", null, "DELETE");
                    setKey("");
                    await load();
                    await refresh();
                    notify("API Key 已删除");
                  })
                }
              />
            </div>
            <small className="field-state">
              {s.hasKey ? "已加密保存 · 原值不回传浏览器" : "尚未保存"}
            </small>
          </label>
          <label>
            模型名称
            <input
              placeholder="输入服务商提供的模型名称"
              value={s.model}
              onChange={(e) => change("model", e.target.value)}
            />
          </label>
          <div className="form-row">
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={s.temperature}
                onChange={(e) => change("temperature", e.target.value)}
              />
            </label>
          </div>
          <div className="item-actions">
            <button
              className="primary"
              disabled={!!busy || !s.encryptionReady}
              onClick={save}
            >
              <Save size={16} />
              保存配置
            </button>
            <button
              disabled={!!busy || !s.hasKey || dirty}
              onClick={() =>
                run("正在测试连接", async () => {
                  const r = await api("/ai/test", {});
                  notify(r.message);
                  await load();
                })
              }
            >
              <PlugZap size={16} />
              测试连接
            </button>
            {dirty && <small className="muted">有未保存的修改</small>}
          </div>
        </div>
        <aside className="usage-section">
          <h2>调用用量</h2>
          <div className="usage-period">今日</div>
          <div className="usage-values">
            <div>
              <strong>{s.usage.today.calls}</strong>
              <span>调用次数</span>
            </div>
            <div>
              <strong>{s.usage.today.total_tokens.toLocaleString()}</strong>
              <span>Token</span>
            </div>
          </div>
          <div className="usage-period">累计</div>
          <div className="usage-values">
            <div>
              <strong>{s.usage.total.calls}</strong>
              <span>调用次数</span>
            </div>
            <div>
              <strong>{s.usage.total.total_tokens.toLocaleString()}</strong>
              <span>Token</span>
            </div>
          </div>
          <dl>
            <dt>输入 Token</dt>
            <dd>{s.usage.total.prompt_tokens.toLocaleString()}</dd>
            <dt>输出 Token</dt>
            <dd>{s.usage.total.completion_tokens.toLocaleString()}</dd>
            <dt>未返回用量的调用</dt>
            <dd>{s.usage.total.unknownUsage}</dd>
          </dl>
          <button
            className="text-button"
            onClick={() => run("正在刷新用量", load)}
          >
            <RefreshCw size={15} />
            刷新统计
          </button>
        </aside>
      </section>
      {deepSeekGuideOpen && (
        <div
          className="guide-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget)
              setDeepSeekGuideOpen(false);
          }}
        >
          <section
            className="deepseek-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deepseek-guide-title"
          >
            <header>
              <div>
                <span className="guide-kicker">从零开始</span>
                <h2 id="deepseek-guide-title">配置 DeepSeek API</h2>
                <p>
                  按下面五步操作。完成后，网站里的 AI 解析和专项训练就能使用。
                </p>
              </div>
              <IconButton
                icon={X}
                label="关闭 DeepSeek 配置教程"
                onClick={() => setDeepSeekGuideOpen(false)}
              />
            </header>

            <ol className="guide-steps">
              <li>
                <span>1</span>
                <div>
                  <strong>注册并登录 DeepSeek 开放平台</strong>
                  <p>这里是开发者控制台，和普通聊天页面不是同一个入口。</p>
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开 DeepSeek 开放平台
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>2</span>
                <div>
                  <strong>给 API 账户充值</strong>
                  <p>
                    API 按实际调用量计费。聊天产品的会员或余额通常不能直接抵扣
                    API 费用。
                  </p>
                  <a
                    href="https://platform.deepseek.com/top_up"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开官方充值页面
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>3</span>
                <div>
                  <strong>创建 API Key</strong>
                  <p>
                    点击“创建 API Key”，复制生成的密钥。密钥通常以 sk-
                    开头，关闭页面后可能无法再次完整查看。
                  </p>
                  <a
                    href="https://platform.deepseek.com/api_keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开官方 API Keys 页面
                    <ExternalLink size={14} />
                  </a>
                </div>
              </li>
              <li>
                <span>4</span>
                <div>
                  <strong>填写本站设置</strong>
                  <dl className="guide-values">
                    <dt>API Base URL</dt>
                    <dd>https://api.deepseek.com</dd>
                    <dt>API Key</dt>
                    <dd>粘贴刚才复制的 sk- 密钥</dd>
                    <dt>模型名称</dt>
                    <dd>deepseek-chat</dd>
                    <dt>Temperature</dt>
                    <dd>0.3</dd>
                    <dt>输出长度</dt>
                    <dd>由模型服务商自动决定</dd>
                  </dl>
                </div>
              </li>
              <li>
                <span>5</span>
                <div>
                  <strong>保存并测试</strong>
                  <p>
                    先点“保存配置”，再点“测试连接”。看到连接成功就配置完成了。
                  </p>
                </div>
              </li>
            </ol>

            <div className="guide-help">
              <strong>测试失败时先检查</strong>
              <p>
                Key 是否完整、API 账户是否有余额、模型名是否为
                deepseek-chat。不要把 API Key 发给别人或放进截图。
              </p>
              <a
                href="https://api-docs.deepseek.com/"
                target="_blank"
                rel="noreferrer"
              >
                查看 DeepSeek 官方 API 文档
                <ExternalLink size={14} />
              </a>
            </div>

            {authorDeployOpen && (
              <form
                className="author-api-deploy"
                onSubmit={(event) => {
                  event.preventDefault();
                  deployAuthorApi();
                }}
              >
                <div className="author-api-deploy-copy">
                  <strong>使用作者 API</strong>
                  <p>输入部署密码后，将 DeepSeek 配置保存到当前账号。</p>
                </div>
                <div className="author-api-deploy-row">
                  <label>
                    部署密码
                    <input
                      type="password"
                      value={authorPassword}
                      onChange={(event) => {
                        setAuthorPassword(event.target.value);
                        setAuthorDeployError("");
                      }}
                      autoComplete="current-password"
                      placeholder="输入部署密码"
                      autoFocus
                      required
                    />
                  </label>
                  <button
                    className="primary"
                    type="submit"
                    disabled={authorDeployBusy || !!busy || !authorPassword.trim()}
                  >
                    {authorDeployBusy ? (
                      <>
                        <LoaderCircle className="spin" size={16} /> 部署中...
                      </>
                    ) : (
                      <>
                        <PlugZap size={16} /> 一键部署
                      </>
                    )}
                  </button>
                </div>
                {authorDeployError && (
                  <p className="author-api-deploy-error" role="alert">
                    {authorDeployError}
                  </p>
                )}
              </form>
            )}

            <footer>
              <button
                className="author-api-trigger"
                type="button"
                onClick={() => {
                  setAuthorDeployOpen((open) => !open);
                  setAuthorDeployError("");
                }}
                disabled={!!busy || authorDeployBusy}
              >
                <LockKeyhole size={15} />
                {authorDeployOpen ? "收起作者 API" : "使用作者 API"}
              </button>
              <button onClick={() => setDeepSeekGuideOpen(false)}>
                稍后配置
              </button>
              <button className="primary" onClick={useDeepSeekDefaults}>
                <PlugZap size={16} />
                一键填入推荐配置
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
function AdminView({
  run,
  busy,
  notify,
  certificates,
  currentCertificateId,
}) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [taxonomy, setTaxonomy] = useState(null);
  const [settings, setSettings] = useState(null);
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [users, setUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [similar, setSimilar] = useState(null);
  const [threshold, setThreshold] = useState("0.78");
  const [generated, setGenerated] = useState([]);
  const [audit, setAudit] = useState([]);
  const [adminQuestions, setAdminQuestions] = useState([]);
  const [adminQuestionTotal, setAdminQuestionTotal] = useState(0);
  const [questionPage, setQuestionPage] = useState(0);
  const [questionChapter, setQuestionChapter] = useState("");
  const [questionKnowledgeSection, setQuestionKnowledgeSection] = useState("");
  const [questionKnowledgePoint, setQuestionKnowledgePoint] = useState("");
  const [questionSource, setQuestionSource] = useState("");
  const [questionSearchInput, setQuestionSearchInput] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionLoading, setQuestionLoading] = useState(false);
  const [feedbackRows, setFeedbackRows] = useState([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackPage, setFeedbackPage] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [certificateId, setCertificateId] = useState(
    currentCertificateId || certificates[0]?.id || "",
  );
  const [chapter, setChapter] = useState("");
  const [knowledgeSection, setKnowledgeSection] = useState("");
  const [knowledgePoint, setKnowledgePoint] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState("");

  const loadOverview = async () => setOverview(await api("/admin/overview"));
  const loadUsers = async (search = userSearch) =>
    setUsers((await api(`/admin/users?search=${encodeURIComponent(search)}`)).users);
  const loadAudit = async () => setAudit((await api("/admin/audit?limit=30")).entries);
  const loadQuestions = async (page = questionPage) => {
    setQuestionLoading(true);
    try {
      const params = new URLSearchParams({
        certificateId,
        limit: "50",
        offset: String(page * 50),
      });
      if (questionChapter) params.set("chapter", questionChapter);
      if (questionKnowledgeSection)
        params.set("knowledgeSection", questionKnowledgeSection);
      if (questionKnowledgePoint)
        params.set("knowledgePoint", questionKnowledgePoint);
      if (questionSource) params.set("source", questionSource);
      if (questionSearch) params.set("search", questionSearch);
      const result = await api(`/admin/questions?${params.toString()}`);
      setAdminQuestions(result.questions);
      setAdminQuestionTotal(result.total);
    } finally {
      setQuestionLoading(false);
    }
  };
  const loadFeedback = async (page = feedbackPage) => {
    setFeedbackLoading(true);
    setFeedbackError("");
    try {
      const params = new URLSearchParams({
        certificateId,
        limit: "50",
        offset: String(page * 50),
      });
      const result = await api(`/admin/feedback?${params.toString()}`);
      setFeedbackRows(result.feedback);
      setFeedbackTotal(result.total);
      return result;
    } catch (error) {
      setFeedbackError(error.message);
      throw error;
    } finally {
      setFeedbackLoading(false);
    }
  };
  const load = async () => {
    const [nextOverview, nextTaxonomy, nextSettings, nextUsers, nextAudit] =
      await Promise.all([
        api("/admin/overview"),
        api("/admin/options"),
        api("/admin/settings"),
        api("/admin/users"),
        api("/admin/audit?limit=30"),
      ]);
    setOverview(nextOverview);
    setTaxonomy(nextTaxonomy);
    setSettings(nextSettings);
    setUsers(nextUsers.users);
    setAudit(nextAudit.entries);
  };
  useEffect(() => {
    load().catch(() => {});
  }, []);
  useEffect(() => {
    if (tab !== "questions" || !taxonomy) return;
    loadQuestions(questionPage).catch(() => {});
  }, [
    tab,
    taxonomy,
    certificateId,
    questionPage,
    questionChapter,
    questionKnowledgeSection,
    questionKnowledgePoint,
    questionSource,
    questionSearch,
  ]);
  useEffect(() => {
    if (tab !== "feedback") return;
    loadFeedback(feedbackPage).catch(() => {});
  }, [tab, certificateId, feedbackPage]);
  useEffect(() => {
    const item = taxonomy?.certificates.find((entry) => entry.id === certificateId);
    const nextChapter = item?.chapters.find((entry) => entry.name === chapter) || item?.chapters[0];
    if (nextChapter && nextChapter.name !== chapter) setChapter(nextChapter.name);
    const sections = nextChapter?.sections || [];
    const nextSection = sections.some((section) => section.name === knowledgeSection)
      ? knowledgeSection
      : sections[0]?.name || "";
    if (nextSection !== knowledgeSection) setKnowledgeSection(nextSection);
    const selectedSection = sections.find((section) => section.name === nextSection);
    const sectionPoints = selectedSection?.knowledgePoints || nextChapter?.knowledgePoints || [];
    const nextPoint = sectionPoints.includes(knowledgePoint)
      ? knowledgePoint
      : sectionPoints[0] || "";
    if (nextPoint !== knowledgePoint) setKnowledgePoint(nextPoint);
  }, [taxonomy, certificateId, chapter, knowledgeSection, knowledgePoint]);
  const selectedCertificate = taxonomy?.certificates.find(
    (entry) => entry.id === certificateId,
  );
  const selectedChapter = selectedCertificate?.chapters.find(
    (entry) => entry.name === chapter,
  );
  const selectedSection = selectedChapter?.sections?.find(
    (entry) => entry.name === knowledgeSection,
  );
  const changeCertificate = (value) => {
    setCertificateId(value);
    setChapter("");
    setKnowledgeSection("");
    setKnowledgePoint("");
    setQuestionChapter("");
    setQuestionKnowledgeSection("");
    setQuestionKnowledgePoint("");
    setQuestionPage(0);
    setFeedbackPage(0);
  };
  const saveSettings = () =>
    run("正在保存管理员 AI 配置", async () => {
      await api(
        "/admin/settings",
        {
          baseUrl: settings.baseUrl,
          model: settings.model,
          temperature: +settings.temperature,
          ...(adminKey ? { apiKey: adminKey } : {}),
        },
        "PUT",
      );
      setAdminKey("");
      setShowKey(false);
      setSettings(await api("/admin/settings"));
      notify("管理员 AI 配置已保存");
    });
  const testSettings = () =>
    run("正在测试管理员 AI", async () => {
      const result = await api("/admin/ai/test", {});
      notify(result.message);
    });
  const generate = () =>
    run("正在扩充共享题库", async () => {
      const result = await api(
        "/admin/questions/generate",
        {
          certificateId,
          chapter,
          ...(knowledgeSection ? { knowledgeSection } : {}),
          knowledgePoint,
          count: +count,
          ...(difficulty ? { difficulty } : {}),
        },
        "POST",
      );
      setGenerated(result.questions || []);
      notify(
        `已向共享题库写入 ${result.inserted} 道题${
          result.skipped?.length ? `，跳过 ${result.skipped.length} 道重复题` : ""
        }`,
      );
      await loadOverview();
      await loadAudit();
    });
  const scan = () =>
    run("正在扫描题目重合度", async () => {
      setSimilar(
        await api(
          `/admin/questions/similar?certificateId=${encodeURIComponent(
            certificateId,
            )}&threshold=${encodeURIComponent(threshold)}&limit=500`,
        ),
      );
      setTab("quality");
    });
  const removeQuestion = (question, afterDelete = scan) => {
    if (!window.confirm(`确定删除这道题吗？\n\n${question.question}`)) return;
    run("正在删除题目", async () => {
      await api(
        `/admin/questions/${encodeURIComponent(question.id)}`,
        { confirm: true, reason: "管理员处理高重合题目" },
        "DELETE",
      );
      notify("题目已删除，并已记录管理员操作");
      await afterDelete?.();
      await loadOverview();
      await loadAudit();
    });
  };
  const cancelFeedback = (row) => {
    if (!window.confirm(`确定取消这条用户反馈吗？\n\n${row.question.question}`)) return;
    run("正在取消用户反馈", async () => {
      await api(
        "/admin/feedback",
        { userId: row.userId, questionId: row.questionId },
        "DELETE",
      );
      const result = await loadFeedback(feedbackPage);
      if (!result.feedback.length && feedbackPage > 0)
        setFeedbackPage((page) => Math.max(0, page - 1));
      await loadAudit();
      notify("这条用户反馈已取消");
    });
  };
  const afterQuestionSaved = async () => {
    setEditingQuestion(null);
    if (tab === "feedback") await loadFeedback(feedbackPage);
    if (tab === "questions") await loadQuestions(questionPage);
    await loadOverview();
    await loadAudit();
    notify("题目已修改，并已记录管理员操作");
  };
  const toggleBan = (user) => {
    const banned = !user.bannedAt;
    if (
      !window.confirm(
        banned
          ? `确定封禁用户 ${user.username} 吗？封禁后会立即退出其登录会话。`
          : `确定解封用户 ${user.username} 吗？`,
      )
    )
      return;
    run(banned ? "正在封禁用户" : "正在解封用户", async () => {
      await api(
        `/admin/users/${encodeURIComponent(user.id)}/ban`,
        { banned, ...(banned ? { reason: "管理员处理" } : {}) },
        "PUT",
      );
      await loadUsers();
      await loadAudit();
      await loadOverview();
      notify(banned ? "用户已封禁" : "用户已解封");
    });
  };
  const updateSettings = (field, value) =>
    setSettings((old) => ({ ...old, [field]: value }));
  const statItems = overview
    ? [
        ["注册用户", overview.stats.users, Users],
        ["已封禁用户", overview.stats.bannedUsers, Ban],
        ["题库题目", overview.stats.questions, BookOpen],
        ["管理员扩充题", overview.stats.adminGenerated, Sparkles],
      ]
    : [];
  const selectedQuestionChapter = selectedCertificate?.chapters.find(
    (item) => item.name === questionChapter,
  );
  const selectedQuestionSection = selectedQuestionChapter?.sections?.find(
    (item) => item.name === questionKnowledgeSection,
  );
  const questionTotalPages = Math.max(1, Math.ceil(adminQuestionTotal / 50));
  const feedbackTotalPages = Math.max(1, Math.ceil(feedbackTotal / 50));
  return (
    <>
      <Heading title="管理员面板" subtitle="控制 AI 题库、内容质量和用户安全">
        <span className="badge green">
          <ShieldCheck size={15} /> 管理员权限
        </span>
      </Heading>
      <div className="admin-tabs" role="tablist" aria-label="管理员功能">
        {[
          ["overview", "总览"],
          ["generate", "扩充题库"],
          ["questions", "题目列表"],
          ["feedback", "用户反馈"],
          ["quality", "重合检测"],
          ["users", "用户管理"],
          ["api", "管理员 API"],
          ["audit", "操作审计"],
        ].map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <div className="admin-stat-grid">
            {statItems.map(([label, value, Icon]) => (
              <div className="admin-stat" key={label}>
                <span>{label}</span>
                <Icon size={19} />
                <strong>{value.toLocaleString()}</strong>
              </div>
            ))}
          </div>
          <div className="admin-overview-grid">
            <section className="admin-card admin-quick-card">
              <div className="section-heading">
                <div>
                  <h2>
                    <Sparkles size={20} /> 题库运营
                  </h2>
                  <p>用管理员 API 按证书和知识点扩充共享题库。</p>
                </div>
              </div>
              <div className="admin-quick-actions">
                <button className="primary" onClick={() => setTab("generate")}>
                  <Sparkles size={16} /> 扩充题库
                </button>
                <button onClick={scan}>
                  <ScanSearch size={16} /> 扫描高重合题
                </button>
                <button onClick={() => setTab("questions")}>
                  <List size={16} /> 查看题目列表
                </button>
                <button onClick={() => setTab("feedback")}>
                  <Flag size={16} /> 处理用户反馈
                </button>
                <button onClick={() => setTab("users")}>
                  <Users size={16} /> 管理用户
                </button>
              </div>
              <p className="admin-tip">
                点击“扫描高重合题”后开始查重。删除内置题会记录标记，服务重启后也不会自动恢复。
              </p>
            </section>
            <section className="admin-card">
              <div className="section-heading">
                <h2>
                  <Clock size={20} /> 最近操作
                </h2>
                <button className="text-button" onClick={() => setTab("audit")}>
                  查看全部 <ArrowRight size={15} />
                </button>
              </div>
              {overview?.recentAudit?.length ? (
                <div className="admin-audit-list">
                  {overview.recentAudit.slice(0, 6).map((entry) => (
                    <div className="admin-audit-row" key={entry.id}>
                      <strong>{entry.adminUsername || "管理员"}</strong>
                      <span>{entry.action}</span>
                      <small>{new Date(entry.createdAt).toLocaleString("zh-CN")}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">还没有管理员操作记录。</p>
              )}
            </section>
          </div>
        </>
      )}
      {tab === "generate" && (
        <div className="admin-overview-grid">
          <section className="admin-card">
            <div className="section-heading">
              <div>
                <h2>
                  <Sparkles size={20} /> 按知识点扩充共享题库
                </h2>
                <p>题目会经过程序校验和独立审核，写入后所有同证书用户可见。</p>
              </div>
              <span className="badge green">管理员专用 API</span>
            </div>
            {!settings?.hasKey && (
              <div className="alert error">请先在“管理员 API”中配置你的 API Key。</div>
            )}
            <div className="admin-form-grid">
              <label>
                证书
                <select
                  aria-label="扩充证书"
                  value={certificateId}
                  onChange={(event) => changeCertificate(event.target.value)}
                >
                  {(taxonomy?.certificates || certificates).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.shortName || item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                章节模块
                <select
                  aria-label="扩充章节"
                  value={chapter}
                  onChange={(event) => {
                    setChapter(event.target.value);
                    setKnowledgeSection("");
                    setKnowledgePoint("");
                  }}
                >
                  {(selectedCertificate?.chapters || []).map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedChapter?.sections?.length > 0 && (
                <label>
                  二级分类
                  <select
                    aria-label="扩充二级分类"
                    value={knowledgeSection}
                    onChange={(event) => {
                      setKnowledgeSection(event.target.value);
                      setKnowledgePoint("");
                    }}
                  >
                    {(selectedChapter.sections || []).map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="wide">
                知识点
                <select
                  aria-label="扩充知识点"
                  value={knowledgePoint}
                  onChange={(event) => setKnowledgePoint(event.target.value)}
                >
                  {(
                    selectedSection?.knowledgePoints ||
                    selectedChapter?.knowledgePoints ||
                    []
                  ).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                题量
                <select value={count} onChange={(event) => setCount(event.target.value)}>
                  {[1, 3, 5, 10, 20].map((value) => (
                    <option key={value} value={value}>
                      {value} 道
                    </option>
                  ))}
                </select>
              </label>
              <label>
                难度
                <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
                  <option value="">自适应</option>
                  <option value="easy">基础</option>
                  <option value="medium">进阶</option>
                  <option value="hard">挑战</option>
                </select>
              </label>
            </div>
            <div className="item-actions">
              <button
                className="primary"
                disabled={!!busy || !settings?.hasKey || !knowledgePoint}
                onClick={generate}
              >
                <Sparkles size={16} /> 生成并写入共享题库
              </button>
              <small className="muted">每次最多 20 道，重复或审核不通过的题不会写入。</small>
            </div>
          </section>
          <section className="admin-card">
            <div className="section-heading">
              <h2>
                <Check size={20} /> 最近生成结果
              </h2>
              <span className="badge">{generated.length} 道</span>
            </div>
            {generated.length ? (
              <div className="admin-generated-list">
                {generated.map((question) => (
                  <article key={question.id} className="admin-question-preview">
                    <div className="question-meta">
                      <span className="badge green">已入库</span>
                      {question.knowledgeSection && <span>{question.knowledgeSection}</span>}
                      <span>{question.knowledgePoint}</span>
                      <span>{diff[question.difficulty] || question.difficulty}</span>
                    </div>
                    <strong>{question.question}</strong>
                    <small>{question.id}</small>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">生成成功后会在这里显示题目摘要。</p>
            )}
          </section>
        </div>
      )}
      {tab === "questions" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>
                <List size={20} /> 题目列表
              </h2>
              <p>按证书、章节、二级分类、知识点、来源或关键词查看题目，并可直接处理单题。</p>
            </div>
            <span className="badge green">共 {adminQuestionTotal.toLocaleString()} 道</span>
          </div>
          <form
            className="admin-question-toolbar"
            onSubmit={(event) => {
              event.preventDefault();
              setQuestionPage(0);
              setQuestionSearch(questionSearchInput.trim());
            }}
          >
            <label>
              证书
              <select
                value={certificateId}
                onChange={(event) => changeCertificate(event.target.value)}
              >
                {(taxonomy?.certificates || certificates).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.shortName || item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              章节
              <select
                value={questionChapter}
                onChange={(event) => {
                  setQuestionChapter(event.target.value);
                  setQuestionKnowledgeSection("");
                  setQuestionKnowledgePoint("");
                  setQuestionPage(0);
                }}
              >
                <option value="">全部章节</option>
                {(selectedCertificate?.chapters || []).map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              二级分类
              <select
                value={questionKnowledgeSection}
                onChange={(event) => {
                  setQuestionKnowledgeSection(event.target.value);
                  setQuestionKnowledgePoint("");
                  setQuestionPage(0);
                }}
              >
                <option value="">全部分类</option>
                {(selectedQuestionChapter?.sections || []).map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              知识点
              <select
                value={questionKnowledgePoint}
                onChange={(event) => {
                  setQuestionKnowledgePoint(event.target.value);
                  setQuestionPage(0);
                }}
              >
                <option value="">全部知识点</option>
                {(
                  selectedQuestionSection?.knowledgePoints ||
                  selectedQuestionChapter?.knowledgePoints ||
                  []
                ).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              来源
              <select
                value={questionSource}
                onChange={(event) => {
                  setQuestionSource(event.target.value);
                  setQuestionPage(0);
                }}
              >
                <option value="">全部来源</option>
                {Object.entries(sources).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-question-search">
              题目搜索
              <div>
                <input
                  value={questionSearchInput}
                  onChange={(event) => setQuestionSearchInput(event.target.value)}
                  placeholder="题干、题号、ID；支持 * 和 ?"
                  autoComplete="off"
                />
                <button type="submit" className="primary" disabled={questionLoading}>
                  <Search size={16} /> 搜索
                </button>
              </div>
              <small>普通文字为包含搜索；例如：*本病*、vet-2009-*、*防治?</small>
            </label>
          </form>
          {questionLoading ? (
            <div className="admin-list-loading">
              <LoaderCircle className="spin" size={22} /> 正在读取题目列表…
            </div>
          ) : adminQuestions.length ? (
            <div className="admin-question-list">
              {adminQuestions.map((question, rowIndex) => (
                <article className="admin-list-question" key={question.id}>
                  <div className="admin-list-question-head">
                    <div className="question-meta">
                      <span className="badge green">#{questionPage * 50 + rowIndex + 1}</span>
                      <span>{sourceName(question)}</span>
                      <span>{question.chapter}</span>
                      {question.knowledgeSection && <span>{question.knowledgeSection}</span>}
                      <span>{question.targetKnowledgePoint || question.knowledgePoint}</span>
                      {question.feedback?.reportTotal ? (
                        <span className="badge red">
                          <Flag size={13} /> 异常反馈 {question.feedback.reportTotal}
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="danger-button"
                      onClick={() =>
                        removeQuestion(question, () => loadQuestions(questionPage))
                      }
                    >
                      <Trash2 size={15} /> 删除
                    </button>
                  </div>
                  <strong>{question.question}</strong>
                  <small className="admin-question-id">{question.id}</small>
                  <details>
                    <summary>查看选项、答案与解析</summary>
                    <div className="admin-question-details">
                      <div className="admin-option-list">
                        {Object.entries(question.options || {}).map(([key, value]) => (
                          <span key={key}>
                            <b>{key}</b> {value}
                          </span>
                        ))}
                      </div>
                      <p>
                        <b>答案：{question.answer?.join("、")}</b>
                        <br />
                        {question.analysis}
                      </p>
                      {question.feedbackDetails?.length ? (
                        <div className="admin-feedback-details">
                          <strong>异常反馈记录</strong>
                          {question.feedbackDetails.map((item, index) => (
                            <div key={`${item.createdAt}-${index}`}>
                              <span>
                                {reportReasons.find((reason) => reason.value === item.kind)?.label || item.kind}
                              </span>
                              {item.note && <p>{item.note}</p>}
                              <small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </details>
                </article>
              ))}
            </div>
          ) : (
            <Empty icon={List} title="没有匹配的题目">
              <p>调整筛选条件或关键词后再试。</p>
            </Empty>
          )}
          <div className="admin-pagination">
            <button
              disabled={questionLoading || questionPage === 0}
              onClick={() => setQuestionPage((page) => Math.max(0, page - 1))}
            >
              <ArrowLeft size={16} /> 上一页
            </button>
            <span>
              第 {Math.min(questionPage + 1, questionTotalPages)} / {questionTotalPages} 页 · 每页 50 题
            </span>
            <button
              disabled={questionLoading || questionPage >= questionTotalPages - 1}
              onClick={() => setQuestionPage((page) => Math.min(questionTotalPages - 1, page + 1))}
            >
              下一页 <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      {tab === "feedback" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>
                <Flag size={20} /> 用户反馈
              </h2>
              <p>集中查看用户在做题区提交的异常反馈。你可以先修改题目，或确认后取消这条反馈。</p>
            </div>
            <div className="admin-inline-controls">
              <label>
                证书
                <select value={certificateId} onChange={(event) => changeCertificate(event.target.value)}>
                  {(taxonomy?.certificates || certificates).map((item) => (
                    <option key={item.id} value={item.id}>{item.shortName || item.name}</option>
                  ))}
                </select>
              </label>
              <span className="badge red">待处理 {feedbackTotal.toLocaleString()} 条</span>
            </div>
          </div>
          {feedbackError ? (
            <div className="alert error" role="alert">
              <span>反馈读取失败：{feedbackError}</span>
              <button disabled={feedbackLoading} onClick={() => loadFeedback().catch(() => {})}>重新读取</button>
            </div>
          ) : feedbackLoading ? (
            <div className="admin-list-loading">
              <LoaderCircle className="spin" size={22} /> 正在读取用户反馈…
            </div>
          ) : feedbackRows.length ? (
            <div className="admin-feedback-list">
              {feedbackRows.map((row) => {
                const reason = reportReasons.find((item) => item.value === row.kind);
                return (
                  <article className="admin-feedback-item" key={`${row.userId}-${row.questionId}`}>
                    <div className="admin-feedback-item-head">
                      <div className="question-meta">
                        <span className="badge red"><Flag size={13} /> {reason?.label || row.kind}</span>
                        <span>{row.username || "匿名用户"}</span>
                        <span>{row.question.chapter}</span>
                        {row.question.knowledgeSection && <span>{row.question.knowledgeSection}</span>}
                        <span>{row.question.targetKnowledgePoint || row.question.knowledgePoint}</span>
                      </div>
                      <small>{new Date(row.createdAt).toLocaleString("zh-CN")}</small>
                    </div>
                    <strong>{row.question.question}</strong>
                    <div className="admin-feedback-item-meta">
                      <span>{sourceName(row.question)}</span>
                      <span>正确答案：{row.question.answer?.join("、")}</span>
                      <span className="admin-question-id">{row.questionId}</span>
                    </div>
                    <div className="admin-feedback-note">
                      <b>用户说明</b>
                      <p>{row.note || "用户未补充说明。"}</p>
                    </div>
                    <div className="item-actions">
                      <button className="primary" disabled={!!busy} onClick={() => setEditingQuestion(row.question)}>
                        <Pencil size={15} /> 修改题目
                      </button>
                      <button className="danger-button" disabled={!!busy} onClick={() => cancelFeedback(row)}>
                        <X size={15} /> 取消反馈
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty icon={Flag} title="暂无待处理反馈">
              <p>用户提交题目异常后，会在这里集中显示。</p>
            </Empty>
          )}
          <div className="admin-pagination">
            <button
              disabled={feedbackLoading || feedbackPage === 0}
              onClick={() => setFeedbackPage((page) => Math.max(0, page - 1))}
            >
              <ArrowLeft size={16} /> 上一页
            </button>
            <span>
              第 {Math.min(feedbackPage + 1, feedbackTotalPages)} / {feedbackTotalPages} 页 · 每页 50 条
            </span>
            <button
              disabled={feedbackLoading || feedbackPage >= feedbackTotalPages - 1}
              onClick={() => setFeedbackPage((page) => Math.min(feedbackTotalPages - 1, page + 1))}
            >
              下一页 <ArrowRight size={16} />
            </button>
          </div>
        </section>
      )}
      {tab === "quality" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>
                <ScanSearch size={20} /> 高重合题检测
              </h2>
              <p>按题干和选项的字符片段计算相似度，只展示同章节、同证书的候选对。</p>
            </div>
            <div className="admin-inline-controls">
              <label>
                证书
                <select value={certificateId} onChange={(event) => changeCertificate(event.target.value)}>
                  {(taxonomy?.certificates || certificates).map((item) => (
                    <option key={item.id} value={item.id}>{item.shortName || item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                阈值
                <input aria-label="相似度阈值" type="number" min="0.5" max="0.99" step="0.01" value={threshold} onChange={(event) => setThreshold(event.target.value)} />
              </label>
              <button className="primary" disabled={!!busy} onClick={scan}>
                <RefreshCw size={16} /> 扫描
              </button>
            </div>
          </div>
          {similar ? (
            similar.pairs.length ? (
              <div className="similar-list">
                {similar.pairs.map((pair) => (
                  <article className="similar-pair" key={`${pair.left.id}-${pair.right.id}`}>
                    <div className="similar-score">{Math.round(pair.score * 100)}% 相似</div>
                    {[pair.left, pair.right].map((question, index) => (
                      <div className="similar-question" key={question.id}>
                        <div className="question-meta">
                          <span className="badge">{index ? "题目 B" : "题目 A"}</span>
                          <span>{sourceName(question)}</span>
                          <span>{question.knowledgePoint}</span>
                        </div>
                        <strong>{question.question}</strong>
                        <small>{question.id}</small>
                        <button className="danger-button" onClick={() => removeQuestion(question)}>
                          <Trash2 size={15} /> 删除这道题
                        </button>
                      </div>
                    ))}
                  </article>
                ))}
              </div>
            ) : (
              <Empty icon={Check} title="暂未发现超过阈值的题目">
                <p>可以降低阈值后再次扫描。</p>
              </Empty>
            )
          ) : (
            <Empty icon={ScanSearch} title="还没有开始扫描">
              <p>选择证书和阈值后，点击扫描查看重合候选。</p>
            </Empty>
          )}
        </section>
      )}
      {tab === "users" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>
                <Users size={20} /> 用户管理
              </h2>
              <p>封禁会立即撤销该用户的登录会话；管理员账号不能被普通管理员互相封禁。</p>
            </div>
            <div className="admin-inline-controls">
              <input aria-label="搜索用户" placeholder="搜索账号" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} />
              <button onClick={() => run("正在搜索用户", () => loadUsers())}><RefreshCw size={16} /> 搜索</button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-users-table">
              <thead>
                <tr><th>账号</th><th>证书</th><th>注册时间</th><th>状态</th><th /></tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td><strong>{user.username}</strong>{user.isAdmin && <small>管理员</small>}</td>
                    <td>{certificates.find((item) => item.id === user.certificateId)?.shortName || "未选择"}</td>
                    <td>{new Date(user.createdAt).toLocaleString("zh-CN")}</td>
                    <td>{user.bannedAt ? <span className="badge red">已封禁</span> : <span className="badge green">正常</span>}</td>
                    <td>{!user.isAdmin && <button className={user.bannedAt ? "" : "danger-button"} onClick={() => toggleBan(user)}>{user.bannedAt ? "解封" : "封禁"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "api" && settings && (
        <section className="admin-card admin-settings-card">
          <div className="section-heading">
            <div>
              <h2>
                <PlugZap size={20} /> 管理员 AI 服务
              </h2>
              <p>这里只服务管理员扩充题库，与普通用户各自的 AI 配置完全隔离。</p>
            </div>
            <span className={settings.hasKey ? "badge green" : "badge red"}>{settings.hasKey ? "已配置" : "未配置"}</span>
          </div>
          {!settings.encryptionReady && <div className="alert error">服务器未配置 AI_MASTER_KEY，不能保存 API Key。</div>}
          <div className="admin-form-grid">
            <label className="wide">API Base URL<input aria-label="管理员 API Base URL" value={settings.baseUrl} onChange={(event) => updateSettings("baseUrl", event.target.value)} placeholder="https://api.example.com/v1" /></label>
            <label className="wide">API Key<div className="key-input"><input aria-label="管理员 API Key" type={showKey ? "text" : "password"} value={adminKey} onChange={(event) => setAdminKey(event.target.value)} placeholder={settings.hasKey ? "已保存 · 输入新 Key 可修改" : "输入管理员 API Key"} autoComplete="off" /><IconButton icon={showKey ? EyeOff : Eye} label={showKey ? "隐藏管理员 API Key" : "显示管理员 API Key"} disabled={!adminKey} onClick={() => setShowKey((old) => !old)} /><IconButton icon={Trash2} label="删除管理员 API Key" disabled={!settings.hasKey || !!busy} onClick={() => run("正在删除管理员 API Key", async () => { await api("/admin/settings/key", null, "DELETE"); setSettings(await api("/admin/settings")); notify("管理员 API Key 已删除"); })} /></div><small className="field-state">{settings.hasKey ? "已加密保存 · 原值不回传浏览器" : "尚未保存"}</small></label>
            <label>模型名称<input aria-label="管理员模型名称" value={settings.model} onChange={(event) => updateSettings("model", event.target.value)} placeholder="deepseek-chat" /></label>
            <label>Temperature<input type="number" min="0" max="2" step="0.1" value={settings.temperature} onChange={(event) => updateSettings("temperature", event.target.value)} /></label>
          </div>
          <div className="item-actions"><button className="primary" disabled={!!busy || !settings.encryptionReady} onClick={saveSettings}><Save size={16} /> 保存管理员配置</button><button disabled={!!busy || !settings.hasKey} onClick={testSettings}><PlugZap size={16} /> 测试管理员 AI</button></div>
          <div className="admin-usage"><span>今日调用 <strong>{settings.usage.today.calls}</strong></span><span>今日 Token <strong>{settings.usage.today.total_tokens.toLocaleString()}</strong></span><span>累计调用 <strong>{settings.usage.total.calls}</strong></span><span>累计 Token <strong>{settings.usage.total.total_tokens.toLocaleString()}</strong></span></div>
        </section>
      )}
      {tab === "audit" && (
        <section className="admin-card">
          <div className="section-heading"><div><h2><Clock size={20} /> 操作审计</h2><p>管理员的配置、扩题、删题、封禁操作都会保留时间和目标记录。</p></div><button onClick={() => run("正在刷新审计记录", loadAudit)}><RefreshCw size={16} /> 刷新</button></div>
          <div className="admin-audit-list admin-audit-full">{audit.length ? audit.map((entry) => <div className="admin-audit-row" key={entry.id}><strong>{entry.adminUsername || "管理员"}</strong><span>{entry.action} · {entry.targetType}{entry.targetId ? ` · ${entry.targetId}` : ""}</span><small>{new Date(entry.createdAt).toLocaleString("zh-CN")}</small></div>) : <p className="muted">暂无记录。</p>}</div>
        </section>
      )}
      {editingQuestion && (
        <AdminQuestionEditor
          question={editingQuestion}
          busy={busy}
          run={run}
          onClose={() => setEditingQuestion(null)}
          onSaved={afterQuestionSaved}
        />
      )}
    </>
  );
}
function Practice(props) {
  if (props.session?.certificateId === "veterinary-practitioner")
    return <VeterinaryPractice {...props} />;
  return <GenericPractice {...props} />;
}
function GenericPractice({ session, refresh, run, busy, train, configured, exit }) {
  const [outcome, setOutcome] = useState({ serial: 0, streak: 0 });
  const [index, setIndex] = useState(0),
    [responses, setResponses] = useState({}),
    [done, setDone] = useState(false),
    [teacherOpen, setTeacherOpen] = useState(false);
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
    started.current = Date.now();
  };
  const submit = () =>
    run("正在记录作答", async () => {
      const r = await api("/attempts", {
        questionId: q.id,
        selected,
        ...(q.type === "short_answer" ? { response: current.responseDraft || "" } : {}),
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
          <div className="practice-question-nav">
            <div className="practice-question-nav-head">
              <strong>题目导航</strong>
              <small>可直接选择题号，已作答题目会保留状态</small>
            </div>
            <div className="question-number-grid">
              {session.questions.map((question, questionIndex) => {
                const isAnswered = answeredIds.has(question.id);
                const isWrong = isAnswered && responses[question.id]?.result?.correct === false;
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
                    title={isWrong ? "回答错误" : isAnswered ? "回答正确" : isRevealed ? "已查看答案" : "未作答"}
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
                onChange={(event) => updateCurrent({ responseDraft: event.target.value })}
              />
              {!result && (
                <div className="short-answer-self-rate" role="group" aria-label="自我评估答案">
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
                {feedbackKind === "wrong_answer" ? "已反馈答案问题" : "答案有问题"}
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
                  (q.type === "short_answer" && !current.responseDraft?.trim()) ||
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
function VeterinaryPractice({ session, refresh, run, busy, train, exit }) {
  const [outcome, setOutcome] = useState({ serial: 0, streak: 0 });
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState({});
  const [done, setDone] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [navFilter, setNavFilter] = useState("all");
  const [navChapter, setNavChapter] = useState(
    session.questions[0]?.chapter || veterinaryModules[0],
  );
  const [navPage, setNavPage] = useState(0);
  const [jumpValue, setJumpValue] = useState("1");
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
      updateCurrent({ teacher: `${analysis.weakKnowledge}\n\n${analysis.reason}` });
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
      updateCurrent({ teacher: answer.text, ...(level ? { hint: level } : {}) });
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
    if (
      navPageIndexes.length &&
      navPageIndexes.length + indexes.length > 50
    ) {
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
          const first = session.questions.findIndex((question) => question.chapter === module);
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
            <i style={{ width: ((index + 1) / session.questions.length) * 100 + "%" }} />
          </div>
          <div className="vet-question-nav">
            <div className="practice-question-nav-head vet-nav-head">
              <div>
                <strong>执兽答题卡</strong>
                <small>
                  当前 {q.chapter} · 已完成 {history.length} / {session.questions.length}
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
                        <option key={module} value={module} disabled={!chapterCount(module)}>
                          {module.replace("科目", "")}（{chapterCount(module)}题）
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
                    第 {currentNavPage + 1} / {navPages.length} 页 · 每页最多 50 题
                  </span>
                  <button
                    type="button"
                    disabled={!!busy || currentNavPage >= navPages.length - 1}
                    onClick={() =>
                      setNavPage((page) => Math.min(navPages.length - 1, page + 1))
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
                        isAnswered && responses[question.id]?.result?.correct === false;
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
                          ].filter(Boolean).join(" ")}
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
                  <span><i className="current" />当前</span>
                  <span><i className="answered" />已作答</span>
                  <span><i className="wrong" />答错</span>
                  <span><i className="shared" />共用题干组</span>
                </div>
              </>
            )}
          </div>
          {group?.shared && (
            <section className={`vet-shared-card ${group.kind || "stem"}`}>
              <div className="vet-shared-card-head">
                <span>{group.kind === "options" ? "共用备选答案" : "共用题干 / 病例材料"}</span>
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
                      <span>{childResult ? (childResult.correct ? "答对" : "需复习") : "待作答"}</span>
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
          {group?.kind === "options" && <div className="vet-options-label">本题从共用备选答案中选择</div>}
          {renderOptions()}
          {result && (
            <div className={`result-block ${result.correct === false ? "wrong" : ""}`}>
              <h3>
                {result.correct === undefined ? "答案解析" : result.correct ? "回答正确" : "这道题还需要巩固"}
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
            <button disabled={!!busy || hint >= 3 || !!result} onClick={() => ask("给我提示", hint + 1)}>
              <Lightbulb size={17} /> 给我提示 {hint}/3
            </button>
            <button
              className="text-button"
              disabled={!!busy || !!result}
              onClick={() =>
                run("正在查看答案", async () => {
                  const revealed = await api(`/questions/${q.id}/reveal`, {});
                  setOutcome((old) => ({ serial: old.serial + 1, streak: 0 }));
                  updateCurrent({ result: revealed, submitted: false, revealed: true });
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
                  <button className="ai-analysis-button" onClick={analyzeMistake} disabled={!!busy}>
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
                <button className="primary push-right" onClick={next} disabled={!!busy}>
                  {index === session.questions.length - 1 ? "完成练习" : group?.shared && group.indexes.indexOf(index) < group.questions.length - 1 ? "下一小题" : "下一题"}
                  <ArrowRight size={17} />
                </button>
              </>
            ) : (
              <button className="primary push-right" disabled={!selected.length || !!busy} onClick={submit}>
                提交本题 <Check size={17} />
              </button>
            )}
          </div>
        </section>
        <aside className="teacher-panel vet-teacher-panel">
          <h2><Stethoscope size={21} /> 兽医考点教练</h2>
          <p className="vet-teacher-note">当前知识点：{q.knowledgePoint}</p>
          <button className="teacher-open" onClick={() => setTeacherOpen(!teacherOpen)}>
            <MessageCircle size={17} /> 问 AI <ChevronRight size={16} />
          </button>
          {teacherOpen && (
            <>
              <div className="teacher-actions">
                {["为什么我错了？", "详细讲解", "换一种方法解释", "举一个实际病例"].map((action) => (
                  <button key={action} disabled={!!busy || !result} onClick={() => ask(action)}>{action}</button>
                ))}
                <button disabled={!!busy} onClick={() => train(q, 1)}>生成一道同知识点题</button>
                <button disabled={!!busy} onClick={() => train(q, 1, true)}>生成一道进阶病例题</button>
              </div>
              {!result && <small className="muted">完成本题或查看答案后，可让 AI 结合兽医知识点讲解。</small>}
            </>
          )}
          {teacher ? <div className="teacher-response">{teacher}</div> : <div className="teacher-idle"><Lightbulb size={28} /><span>从病例线索找到诊断方向</span></div>}
        </aside>
      </div>
    </>
  );
}
function ExamView({ run, refresh, dashboard }) {
  const [exam, setExam] = useState(null),
    [answers, setAnswers] = useState({}),
    [index, setIndex] = useState(0),
    [result, setResult] = useState(null),
    [count, setCount] = useState(20),
    [remaining, setRemaining] = useState(0),
    [submitting, setSubmitting] = useState(false);
  const examBlueprint = dashboard.syllabus?.examBlueprint;
  const examModules = dashboard.syllabus?.modules || [];
  const autoSubmit = useRef(false);
  useEffect(() => {
    const saved = localStorage.getItem("netwise-exam");
    if (saved) {
      try {
        const data = JSON.parse(saved);
        api("/exams/" + data.id)
          .then((e) => {
            if (e.submitted) {
              localStorage.removeItem("netwise-exam");
              return;
            }
            setExam(e);
            setAnswers(data.answers || {});
          })
          .catch(() => localStorage.removeItem("netwise-exam"));
      } catch {
        localStorage.removeItem("netwise-exam");
      }
    }
  }, []);
  useEffect(() => {
    if (exam && !result)
      localStorage.setItem(
        "netwise-exam",
        JSON.stringify({ id: exam.id, answers }),
      );
  }, [exam, answers, result]);
  useEffect(() => {
    if (!exam || result) return;
    const timer = setTimeout(
      () =>
        api("/exams/" + exam.id + "/answers", { answers }, "PUT").catch(
          () => {},
        ),
      200,
    );
    return () => clearTimeout(timer);
  }, [exam, answers, result]);
  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const r = await run("正在提交考试", () =>
        api("/exams/" + exam.id + "/submit", { answers }),
      );
      if (r) {
        setResult(r);
        localStorage.removeItem("netwise-exam");
        await refresh();
      } else autoSubmit.current = false;
    } finally {
      setSubmitting(false);
    }
  };
  useEffect(() => {
    if (!exam || result) return;
    const tick = () => {
      const t = Math.max(
        0,
        Math.ceil((new Date(exam.expiresAt) - Date.now()) / 1000),
      );
      setRemaining(t);
      if (t === 0 && !autoSubmit.current) {
        autoSubmit.current = true;
        submit();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [exam, answers, result, submitting]);
  const begin = () =>
    run("正在创建模拟考试", async () => {
      const e = await api("/exams", {
        count: examBlueprint?.questionCount || count,
      });
      setExam(e);
      setAnswers({});
      setIndex(0);
      setResult(null);
      autoSubmit.current = false;
    });
  const chapterScores = examBlueprint
    ? examModules.map((module) => ({
        ...module,
        correct: result
          ? result.results.filter(
              (item) => item.chapter === module.name && item.correct,
            ).length
          : 0,
      }))
    : [];
  if (result)
    return (
      <>
        <Heading
          title="考试结果"
          subtitle={`用时 ${Math.round(result.elapsed / 60000)} 分钟`}
        />
        <div className="exam-score">
          {examBlueprint && (
            <div className={"exam-result-status " + (result.passed ? "passed" : "failed")}>
              {result.passed ? "考试通过" : "暂未通过"}
            </div>
          )}
          <strong>
            {result.score}
            <small>分</small>
          </strong>
          <p>
            {examBlueprint
              ? `答对 ${result.results.filter((r) => r.correct).length} / ${result.results.length} 题 · ${result.passed ? "达到" : "未达到"} ${result.passingScore} 分及格线`
              : `答对 ${result.results.filter((r) => r.correct).length} / ${result.results.length} 题`}
          </p>
          <button
            className="primary"
            onClick={() => {
              setExam(null);
              setResult(null);
            }}
          >
            再考一次
            <RotateCcw size={17} />
          </button>
        </div>
        {examBlueprint && (
          <div className="exam-section-scores">
            {chapterScores.map((section) => (
              <div key={section.name}>
                <span>{section.name}</span>
                <strong>
                  {section.correct} / {examBlueprint.questionsPerModule} 题
                </strong>
              </div>
            ))}
            <small>
              四科合计达到 {examBlueprint.passingScore} 分即可通过，单科不设最低分。
            </small>
          </div>
        )}
        <div className="wrong-list">
          {result.results.map((r, i) => (
            <article className="wrong-item" key={r.questionId}>
              <span className={"badge " + (r.correct ? "green" : "red")}>
                {r.correct ? "正确" : "错误"}
              </span>
              <h3>
                {i + 1}. {r.question}
              </h3>
              <QuestionImages question={r} />
              <p>
                我的答案：{r.selected.join("、") || "未作答"} · 正确答案：
                {r.answer.join("、")}
              </p>
              <p>{r.analysis}</p>
            </article>
          ))}
        </div>
      </>
    );
  if (!exam)
    return (
      <>
        <Heading
          title="模拟考试"
          subtitle={
            examBlueprint
              ? `${dashboard.syllabus.version} · 四大科目各抽 ${examBlueprint.questionsPerModule} 题 · 总分 ${examBlueprint.passingScore} 分及格`
              : dashboard.syllabus
                ? `${dashboard.syllabus.version} 考点 · 按本站练习配比分层抽题 · 交卷后统一评分`
                : "当前证书题库 · 限时作答 · 交卷后统一评分"
          }
        />
        <section className="exam-intro">
          <GraduationCap size={52} />
          <h2>{dashboard.certificate.shortName} 模拟测试</h2>
          {dashboard.syllabus && (
            <p className="exam-blueprint-note">
              {examBlueprint
                ? `基础、预防、临床、综合四科各抽 ${examBlueprint.questionsPerModule} 道题，每题 1 分，四科合计达到 ${examBlueprint.passingScore} 分即可通过。`
                : `覆盖 ${dashboard.syllabus.coveredModules} 个考点模块；抽题比例为本站练习蓝图，不代表官方考试权重。`}
            </p>
          )}
          {examBlueprint ? (
            <div className="exam-settings exam-fixed-settings">
              <div>
                <span>试题数量</span>
                <strong>{examBlueprint.questionCount} 题</strong>
              </div>
              <div>
                <span>计分方式</span>
                <strong>每题 1 分</strong>
              </div>
              <div>
                <span>及格线</span>
                <strong>{examBlueprint.passingScore} 分</strong>
              </div>
              <div>
                <span>考试时间</span>
                <strong>{Math.round(examBlueprint.durationMinutes / 60)} 小时</strong>
              </div>
            </div>
          ) : (
            <div className="exam-settings">
              <label>
                试题数量
                <select value={count} onChange={(e) => setCount(+e.target.value)}>
                  {[10, 20, 40].map((n) => (
                    <option key={n} value={n}>
                      {n} 题
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <span>考试时间</span>
                <strong>{count * 2} 分钟</strong>
              </div>
            </div>
          )}
          <button className="primary" onClick={begin}>
            开始考试
            <ArrowRight size={18} />
          </button>
        </section>
      </>
    );
  const q = exam.questions[index],
    selected = answers[q.id] || [];
  const examGroups = dashboard.certificate?.id === "veterinary-practitioner"
    ? buildVeterinaryGroups(exam.questions)
    : [];
  const examGroup = examGroups.find((group) => group.indexes.includes(index));
  return (
    <>
      <Heading
        title="模拟考试"
        subtitle={`已答 ${Object.values(answers).filter((a) => a.length).length} / ${exam.questions.length} 题`}
      >
        <div className="exam-timer">
          <Clock size={19} />
          {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
        </div>
      </Heading>
      <div className="practice-layout">
        <section className="question-panel">
          <span className="badge">
            第 {index + 1} 题 · {questionTypeName(q, true)}
          </span>
          {examGroup?.shared && (
            <section className={`vet-shared-card ${examGroup.kind || "stem"}`}>
              <div className="vet-shared-card-head">
                <span>{examGroup.kind === "options" ? "共用备选答案" : "共用题干 / 病例材料"}</span>
                <small>本组 {examGroup.questions.length} 道题</small>
              </div>
              {examGroup.kind === "stem" && examGroup.stem ? (
                <p>{examGroup.stem}</p>
              ) : examGroup.kind === "options" ? (
                <p>以下小题共用同一组选项，请根据每道题的问法分别选择答案。</p>
              ) : (
                <p>本组小题共用一段材料，请先阅读题干后逐题作答。</p>
              )}
              <div className="vet-case-steps">
                {examGroup.indexes.map((questionIndex, step) => (
                  <button
                    key={exam.questions[questionIndex].id}
                    className={questionIndex === index ? "active" : ""}
                    onClick={() => setIndex(questionIndex)}
                  >
                    <b>{step + 1}</b>
                    <span>{answers[exam.questions[questionIndex].id]?.length ? "已作答" : "待作答"}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <QuestionImages question={q} />
          <h2 className="question-text">{questionTextForGroup(q, examGroup) || q.question}</h2>
          <QuestionOrigin question={q} />
          <div className="options">
            {Object.entries(q.options).map(([k, v]) => (
              <button
                disabled={remaining === 0}
                className={"option " + (selected.includes(k) ? "chosen" : "")}
                key={k}
                onClick={() =>
                  setAnswers({
                    ...answers,
                    [q.id]: isSingleSelect(q)
                      ? [k]
                      : selected.includes(k)
                        ? selected.filter((x) => x !== k)
                        : [...selected, k],
                  })
                }
              >
                <span className="option-letter">{k}</span>
                <span>{v}</span>
              </button>
            ))}
          </div>
          <div className="question-actions">
            <IconButton
              icon={ArrowLeft}
              label="上一题"
              disabled={index === 0}
              onClick={() => setIndex(index - 1)}
            />
            <IconButton
              icon={ArrowRight}
              label="下一题"
              disabled={index === exam.questions.length - 1}
              onClick={() => setIndex(index + 1)}
            />
            <QuestionFavorite
              question={q}
              busy={submitting}
              run={run}
              onChanged={refresh}
            />
            <QuestionReport question={q} busy={submitting} run={run} />
            <button
              className="primary push-right"
              disabled={submitting}
              onClick={submit}
            >
              交卷
              <Check size={17} />
            </button>
          </div>
        </section>
        <aside className="teacher-panel">
          <h2>答题卡</h2>
          <div className="answer-grid">
            {exam.questions.map((q, i) => (
              <button
                key={q.id}
                className={
                  (answers[q.id]?.length ? "answered " : "") +
                  (index === i ? "current" : "")
                }
                onClick={() => setIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
