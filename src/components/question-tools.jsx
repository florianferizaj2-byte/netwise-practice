import { useEffect, useState } from "react";
import { Flag, Star, TriangleAlert, X } from "lucide-react";
import { questionImages } from "../question-utils.js";
import { api } from "../api.js";
import { IconButton } from "./study-ui.jsx";

export function QuestionImage({ image, index }) {
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

export function QuestionImages({ question }) {
  const images = questionImages(question);
  if (!images.length) return null;
  return (
    <div className="question-images" aria-label="题目图片">
      {images.map((image, index) => (
        <QuestionImage
          key={`${image.src}-${index}`}
          image={image}
          index={index}
        />
      ))}
    </div>
  );
}

export function QuestionOrigin({ question }) {
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

export const reportReasons = [
  { value: "wrong_answer", label: "答案或解析有误" },
  { value: "ambiguous", label: "题干或选项表述有问题" },
  { value: "duplicate", label: "题目重复" },
  { value: "other", label: "其他异常" },
];

export function QuestionReport({ question, busy, run }) {
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
        setReportError(
          error.status === 401
            ? "登录已失效，请重新登录后提交举报。"
            : error.message,
        );
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
            {reportError && (
              <div className="alert error" role="alert">
                {reportError}
              </div>
            )}
            <div className="question-report-actions">
              <button
                type="button"
                disabled={sending}
                onClick={() => setOpen(false)}
              >
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

export function QuestionFavorite({ question, busy, run, onChanged }) {
  const [favorite, setFavorite] = useState(!!question.favorite);
  const [saving, setSaving] = useState(false);
  useEffect(
    () => setFavorite(!!question.favorite),
    [question.id, question.favorite],
  );
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
