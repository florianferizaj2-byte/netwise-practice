import { useState } from "react";
import { Save, X } from "lucide-react";
import { api } from "../api.js";
import { questionTypeName } from "../question-utils.js";
import { IconButton } from "../components/study-ui.jsx";

export function AdminQuestionEditor({ question, busy, run, onClose, onSaved }) {
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
    knowledgePoint:
      question.targetKnowledgePoint || question.knowledgePoint || "",
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
  const update = (field, value) =>
    setDraft((old) => ({ ...old, [field]: value }));
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
          ...(question.classificationCertificateId ? { certificateId: question.classificationCertificateId } : {}),
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
            ? {
                sharedKind: draft.sharedKind,
                ...(draft.sharedStem.trim()
                  ? { sharedStem: draft.sharedStem.trim() }
                  : {}),
                ...(draft.sharedOrder
                  ? { sharedOrder: Number(draft.sharedOrder) }
                  : {}),
              }
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
            <select
              value={draft.type}
              onChange={(event) => updateType(event.target.value)}
            >
              <option value="single_choice">单选题</option>
              <option value="multiple_choice">多选题</option>
              <option value="true_false">判断题</option>
            </select>
          </label>
          <label>
            题干
            <textarea
              rows="4"
              value={draft.question}
              onChange={(event) => update("question", event.target.value)}
            />
          </label>
          <div className="admin-editor-options">
            {optionKeys.map((key) => (
              <label key={key}>
                选项 {key}
                <input
                  value={draft.options[key] || ""}
                  onChange={(event) => updateOption(key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <label>
            正确答案
            <input
              value={draft.answer}
              onChange={(event) => update("answer", event.target.value)}
              placeholder="例如：A 或 A、C"
            />
          </label>
          <label>
            解析
            <textarea
              rows="5"
              value={draft.analysis}
              onChange={(event) => update("analysis", event.target.value)}
            />
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
                <input
                  value={draft.sharedGroupId}
                  onChange={(event) =>
                    update("sharedGroupId", event.target.value)
                  }
                  placeholder="例如 case-2026-001"
                />
              </label>
              <label>
                共用类型
                <select
                  value={draft.sharedKind}
                  onChange={(event) => update("sharedKind", event.target.value)}
                >
                  <option value="stem">共用题干 / 病例</option>
                  <option value="options">共用备选答案</option>
                </select>
              </label>
              <label>
                小题顺序
                <input
                  type="number"
                  min="1"
                  max="200"
                  value={draft.sharedOrder}
                  onChange={(event) =>
                    update("sharedOrder", event.target.value)
                  }
                  placeholder="可选"
                />
              </label>
              <label>
                共用材料
                <textarea
                  rows="3"
                  value={draft.sharedStem}
                  onChange={(event) => update("sharedStem", event.target.value)}
                  placeholder="可选；留空时由题库标记自动归纳"
                />
              </label>
            </div>
          </div>
          <div className="admin-editor-grid">
            <label>
              章节
              <input
                value={draft.chapter}
                onChange={(event) => update("chapter", event.target.value)}
              />
            </label>
            <label>
              二级分类
              <input
                value={draft.knowledgeSection}
                onChange={(event) =>
                  update("knowledgeSection", event.target.value)
                }
              />
            </label>
            <label>
              知识点
              <input
                value={draft.knowledgePoint}
                onChange={(event) =>
                  update("knowledgePoint", event.target.value)
                }
              />
            </label>
            <label>
              难度
              <select
                value={draft.difficulty}
                onChange={(event) => update("difficulty", event.target.value)}
              >
                <option value="easy">基础</option>
                <option value="medium">进阶</option>
                <option value="hard">挑战</option>
              </select>
            </label>
            <label>
              标签
              <input
                value={draft.tags}
                onChange={(event) => update("tags", event.target.value)}
                placeholder="用顿号分隔"
              />
            </label>
          </div>
          <div className="question-report-actions">
            <button type="button" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="primary" disabled={!!busy}>
              <Save size={16} /> 保存修改
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
