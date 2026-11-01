import { createContext, useContext, useEffect, useState } from "react";
import {
  Check,
  Download,
  Files,
  Plus,
  Save,
  Sparkles,
  Upload,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { makeBatch } from "./content.jsx";
import { TaxonomyEditor } from "./taxonomy-editor.jsx";
import {
  call,
  date,
  download,
  Empty,
  Modal,
  Pagination,
  Panel,
  QuestionPreview,
  requestId,
  Resource,
  SearchField,
  Status,
  Table,
  useAdmin,
  useResource,
} from "./shared.jsx";

export function Documents() {
  const { params, setParams, certificateId, go, user, run, notify, busy } =
      useAdmin(),
    list = useResource(
      "/documents?" +
        new URLSearchParams({
          certificateId,
          search: params.get("search") || "",
          offset: params.get("offset") || "0",
          limit: "30",
        }),
    ),
    catalog = useResource("/catalog");
  const documentId = params.get("document"),
    [creating, setCreating] = useState(false),
    [generation, setGeneration] = useState(false);
  const [certId, setCertId] = useState(certificateId),
    [title, setTitle] = useState("新内容批次");
  if (documentId) return <DocumentEditor key={documentId} id={documentId} />;
  const create = () =>
    void run("创建内容草稿", async () => {
      const cert = catalog.data?.certificates.find((c) => c.id === certId);
      if (!cert) throw new Error("请选择证书");
      const r = await call("/documents", makeBatch(user, cert, title));
      setCreating(false);
      go("documents", { document: r.document.id });
    });
  return (
    <>
      <div className="ac-toolbar">
        <div className="ac-inline">
          <Status value="draft">隔离草稿</Status>
          <span className="ac-muted">审核与导出不会直接改变运行中的题库</span>
        </div>
        <div className="ac-inline">
          <button onClick={() => setGeneration(true)}>
            <Sparkles size={16} />
            AI 生成草稿
          </button>
          <button
            className="ac-primary"
            onClick={() => {
              setCertId(
                certificateId || catalog.data?.certificates[0]?.id || "",
              );
              setCreating(true);
            }}
          >
            <Plus size={16} />
            新批次 / 导入
          </button>
        </div>
      </div>
      <Resource resource={list}>
        {(data) => (
          <Panel
            title="内容批次"
            description="已导出表示交接包已生成；运行库是否生效需要部署后核对。"
          >
            <div className="ac-filters">
              <SearchField
                value={params.get("search")}
                onSearch={(search) => setParams({ search })}
                placeholder="搜索批次名称"
              />
            </div>
            <Table
              rows={data.rows}
              columns={[
                {
                  key: "title",
                  label: "草稿 / 批次",
                  render: (d) => (
                    <button
                      className="ac-question-link"
                      onClick={() => go("documents", { document: d.id })}
                    >
                      <strong>{d.title}</strong>
                      <small>
                        {d.kind === "revision"
                          ? "题目修订"
                          : d.kind === "certificate"
                            ? "证书与目录"
                            : "新增题目批次"}
                      </small>
                    </button>
                  ),
                },
                {
                  key: "certificateId",
                  label: "证书",
                  render: (d) =>
                    catalog.data?.certificates.find(
                      (c) => c.id === d.certificateId,
                    )?.shortName || d.certificateId,
                },
                { key: "count", label: "题数" },
                {
                  key: "stage",
                  label: "状态",
                  render: (d) => <Status value={d.stage} />,
                },
                {
                  key: "updatedAt",
                  label: "最近保存",
                  render: (d) => date(d.updatedAt),
                },
                {
                  key: "action",
                  label: "操作",
                  render: (d) => (
                    <button
                      className="ac-link"
                      onClick={() => go("documents", { document: d.id })}
                    >
                      继续处理
                      <ArrowRight size={15} />
                    </button>
                  ),
                },
              ]}
            />
            <Pagination
              total={data.total}
              offset={data.offset}
              limit={data.limit}
              onChange={(offset) => setParams({ offset })}
            />
          </Panel>
        )}
      </Resource>
      {creating && (
        <Modal title="新建隔离批次" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <label>
              证书
              <select
                required
                value={certId}
                onChange={(e) => setCertId(e.target.value)}
              >
                <option value="">请选择</option>
                {catalog.data?.certificates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              批次名称
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </label>
            <p className="ac-note">
              创建后可上传现有批次 JSON
              文件，或逐题编辑。来源、独立复核和目录检查通过后才能导出发布包。
            </p>
            <button className="ac-primary" disabled={!!busy}>
              创建并打开编辑器
            </button>
          </form>
        </Modal>
      )}
      {generation && (
        <Generation
          catalog={catalog.data}
          onClose={() => setGeneration(false)}
        />
      )}
    </>
  );
}
function Generation({ catalog, onClose }) {
  const { certificateId, run, notify, go, busy } = useAdmin();
  const [certId, setCertId] = useState(
      certificateId || catalog?.certificates[0]?.id || "",
    ),
    [chapter, setChapter] = useState(""),
    [section, setSection] = useState(""),
    [point, setPoint] = useState(""),
    [count, setCount] = useState(5);
  const cert = catalog?.certificates.find((c) => c.id === certId),
    m = cert?.chapters.find((m) => m.name === chapter),
    s = m?.sections.find((s) => s.name === section);
  return (
    <Modal title="AI 生成待审批次" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("提交 AI 生成任务", async () => {
            const r = await call("/generation", {
              certificateId: certId,
              chapter,
              knowledgeSection: section || undefined,
              knowledgePoint: point,
              count,
              requestId: requestId(),
            });
            notify("生成任务已排队，结果将保存为待审批次");
            onClose();
            go("jobs", { job: r.job.id });
          });
        }}
      >
        <label>
          证书
          <select
            required
            value={certId}
            onChange={(e) => {
              setCertId(e.target.value);
              setChapter("");
              setSection("");
              setPoint("");
            }}
          >
            {catalog?.certificates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          章节
          <select
            required
            value={chapter}
            onChange={(e) => {
              setChapter(e.target.value);
              setSection("");
              setPoint("");
            }}
          >
            <option value="">请选择章节</option>
            {cert?.chapters.map((m) => (
              <option key={m.name}>{m.name}</option>
            ))}
          </select>
        </label>
        {m?.sections.length > 0 ? (
          <>
            <label>
              二级分类
              <select
                required
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setPoint("");
                }}
              >
                <option value="">请选择分类</option>
                {m.sections.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label>
              知识点
              <select
                required
                value={point}
                onChange={(e) => setPoint(e.target.value)}
              >
                <option value="">请选择知识点</option>
                {s?.knowledgePoints.map((p) => (
                  <option key={p.code}>{p.name}</option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label>
            知识点
            <input
              required
              value={point}
              onChange={(e) => setPoint(e.target.value)}
            />
          </label>
        )}
        <label>
          题目数量
          <input
            type="number"
            required
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          />
        </label>
        <p className="ac-note">
          此操作会调用当前配置的收费 AI
          服务，并记录实际用量。结果保存在草稿区，需要补齐来源、独立复核并通过检查后才能发布。
        </p>
        <button className="ac-primary" disabled={!!busy}>
          确认调用 AI 并生成草稿
        </button>
      </form>
    </Modal>
  );
}
const PendingJSON = createContext(null);
function DocumentEditor({ id }) {
  const { run, notify, go, busy, registerNavigationGuard } = useAdmin(),
    resource = useResource("/documents/" + encodeURIComponent(id));
  const [pendingFields, setPendingFields] = useState({});
  const pendingJSON = Object.values(pendingFields).some(Boolean);
  const [document, setDocument] = useState(null),
    [saved, setSaved] = useState(""),
    [tab, setTab] = useState("questions"),
    [index, setIndex] = useState(0),
    [report, setReport] = useState(null),
    [jobId, setJobId] = useState(null),
    [preview, setPreview] = useState(false);
  const job = useResource(jobId ? "/jobs/" + jobId : "/jobs", {
    poll: !!jobId,
  });
  useEffect(() => {
    if (resource.data) {
      setDocument(resource.data.document);
      setSaved(JSON.stringify(resource.data.document));
      if (resource.data.checkJob) {
        setJobId(resource.data.checkJob.id);
        setReport(resource.data.checkJob.result);
      }
    }
  }, [resource.data]);
  useEffect(() => {
    if (job.data?.job?.result?.reviewInputs) {
      setReport(job.data.job.result);
    }
  }, [job.data]);
  const dirty = pendingJSON || (document && JSON.stringify(document) !== saved);
  useEffect(() => {
    registerNavigationGuard(
      dirty ? () => window.confirm("有尚未保存的草稿修改，确定离开吗？") : null,
    );
    return () => registerNavigationGuard(null);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const save = async () => {
    if (pendingJSON) throw new Error("请先应用编辑器中尚未应用的 JSON 修改");
    const r = await call(
      "/documents/" + id,
      {
        kind: document.kind,
        certificateId: document.certificateId,
        title: document.title,
        revision: document.revision,
        data: document.data,
      },
      "PUT",
    );
    setDocument(r.document);
    setSaved(JSON.stringify(r.document));
    setReport(null);
    notify("草稿已保存，运行中的题库未改变");
    return r.document;
  };
  const setData = (key, value) => {
    setDocument((d) => ({ ...d, data: { ...d.data, [key]: value } }));
    setReport(null);
  };
  const updateQuestion = (field, value) =>
    setData(
      "questions",
      document.data.questions.map((q, i) =>
        i === index ? { ...q, [field]: value } : q,
      ),
    );
  const importFiles = async (files) => {
    const data = { ...document.data };
    const names = {
      "batch.json": "batch",
      "questions.json": "questions",
      "sources.json": "sources",
      "provenance.json": "provenance",
      "reviews.json": "reviews",
      "blueprint.json": "blueprint",
      "manifest.proposed.json": "manifest",
      "guide.json": "guide",
    };
    let bytes = 0;
    for (const file of files) {
      bytes += file.size;
      if (bytes > 3 * 1024 * 1024) throw new Error("单批文件总量不能超过 3MB");
      const parsed = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
      if (names[file.name]) data[names[file.name]] = parsed;
      else if (parsed.files) {
        for (const [name, value] of Object.entries(parsed.files))
          if (names[name]) data[names[name]] = value;
      } else if (parsed.batch && parsed.questions) {
        for (const key of Object.values(names))
          if (parsed[key] !== undefined) data[key] = parsed[key];
      } else throw new Error("文件名或内容不符合现有批次格式：" + file.name);
    }
    if (
      !data.batch ||
      typeof data.batch !== "object" ||
      Array.isArray(data.batch)
    )
      throw new Error("batch.json 必须是批次对象");
    for (const key of ["questions", "sources", "provenance", "reviews"])
      if (!Array.isArray(data[key])) throw new Error(key + ".json 必须是数组");
    if (data.questions.length > 50)
      throw new Error("每批最多 50 道题，请拆批导入");
    setDocument((d) => ({
      ...d,
      certificateId: data.batch.certificateId,
      data,
    }));
    setReport(null);
    setIndex(0);
    notify("文件已读入编辑器，请保存后执行检查");
  };
  const leave = () => go("documents");
  return (
    <PendingJSON.Provider value={setPendingFields}>
      <Resource resource={resource}>
        {() =>
          document && (
            <>
              <div className="ac-toolbar">
                <button onClick={leave}>
                  <ArrowLeft size={15} />
                  返回批次
                </button>
                <div className="ac-inline">
                  <Status
                    value={
                      dirty
                        ? "processing"
                        : document.exportedAt
                          ? "exported"
                          : "draft"
                    }
                  >
                    {dirty
                      ? "有未保存修改"
                      : document.exportedAt
                        ? "已导出 · 待部署"
                        : "草稿已保存"}
                  </Status>
                  <button
                    className="ac-primary"
                    disabled={!!busy || pendingJSON}
                    onClick={() => void run("保存草稿", save)}
                  >
                    <Save size={16} />
                    保存草稿
                  </button>
                </div>
              </div>
              <Panel>
                <div className="ac-document-meta">
                  <label>
                    批次名称
                    <input
                      value={document.title}
                      maxLength={120}
                      onChange={(e) =>
                        setDocument((d) => ({ ...d, title: e.target.value }))
                      }
                    />
                  </label>
                  <div>
                    <span className="ac-muted">目标证书</span>
                    <strong>{document.certificateId}</strong>
                    <small>保存于 {date(document.updatedAt)}</small>
                  </div>
                </div>
                {document.data.replacesQuestionId && (
                  <p className="ac-note">
                    修订来源：{document.data.replacesQuestionId}
                    。本草稿使用新题号，发布交接时需核对新旧题关系。
                  </p>
                )}
                <div
                  className="ac-editor-tabs"
                  role="tablist"
                  aria-label="批次编辑"
                >
                  {[
                    ["questions", "题目编辑"],
                    ["evidence", "来源与复核"],
                    ["catalog", "目录与指南"],
                    ["checks", "差异与检查"],
                  ].map(([key, label]) => (
                    <button
                      role="tab"
                      aria-selected={tab === key}
                      className={tab === key ? "active" : ""}
                      key={key}
                      onClick={() => {
                        if (pendingJSON) {
                          notify("请先应用当前 JSON 修改，再切换编辑区域");
                          return;
                        }
                        setTab(key);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="ac-editor-body">
                  {tab === "questions" && (
                    <>
                      <div className="ac-toolbar">
                        <strong>{document.data.questions.length} 道题</strong>
                        <div className="ac-inline">
                          <label className="ac-file-button">
                            <Upload size={15} />
                            导入批次 JSON
                            <input
                              aria-label="导入批次 JSON"
                              type="file"
                              multiple
                              accept=".json,application/json"
                              onChange={(e) => {
                                const files = [...e.target.files];
                                void run("读取批次文件", () =>
                                  importFiles(files),
                                );
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => {
                              setData("questions", [
                                ...document.data.questions,
                                {
                                  id: "draft-" + requestId(),
                                  type: "single_choice",
                                  question: "",
                                  options: { A: "", B: "", C: "", D: "" },
                                  answer: [],
                                  analysis: "",
                                  chapter: "",
                                  knowledgeSection: "",
                                  knowledgePoint: "",
                                  difficulty: "medium",
                                  tags: ["待审核"],
                                },
                              ]);
                              setIndex(document.data.questions.length);
                            }}
                            disabled={document.data.questions.length >= 50}
                          >
                            <Plus size={15} />
                            添加题目
                          </button>
                        </div>
                      </div>
                      {document.data.questions.length ? (
                        <div className="ac-question-editor-layout">
                          <nav aria-label="批次题目">
                            {document.data.questions.map((q, i) => (
                              <button
                                key={i}
                                className={index === i ? "active" : ""}
                                onClick={() => setIndex(i)}
                              >
                                <span>{i + 1}</span>
                                <strong>{q.question || "待填写题目"}</strong>
                              </button>
                            ))}
                          </nav>
                          <div className="ac-edit-fields">
                            {document.data.questions[index] &&
                              (() => {
                                const q = document.data.questions[index];
                                return (
                                  <>
                                    <div className="ac-two-fields">
                                      <label>
                                        题号
                                        <input
                                          value={q.id || ""}
                                          onChange={(e) =>
                                            updateQuestion("id", e.target.value)
                                          }
                                        />
                                      </label>
                                      <label>
                                        题型
                                        <select
                                          value={q.type}
                                          onChange={(e) =>
                                            updateQuestion(
                                              "type",
                                              e.target.value,
                                            )
                                          }
                                        >
                                          <option value="single_choice">
                                            单选题
                                          </option>
                                          <option value="multiple_choice">
                                            多选题
                                          </option>
                                          <option value="true_false">
                                            判断题
                                          </option>
                                          <option value="short_answer">
                                            简答题
                                          </option>
                                        </select>
                                      </label>
                                    </div>
                                    <label>
                                      题干
                                      <textarea
                                        aria-label="题干"
                                        rows={4}
                                        value={q.question || ""}
                                        onChange={(e) =>
                                          updateQuestion(
                                            "question",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                    {q.type !== "short_answer" && (
                                      <div className="ac-two-fields">
                                        {[
                                          "A",
                                          "B",
                                          ...(q.type === "true_false"
                                            ? []
                                            : ["C", "D"]),
                                          ...(q.options?.E !== undefined
                                            ? ["E"]
                                            : []),
                                        ].map((k) => (
                                          <label key={k}>
                                            选项 {k}
                                            <textarea
                                              rows={2}
                                              value={q.options?.[k] || ""}
                                              onChange={(e) =>
                                                updateQuestion("options", {
                                                  ...q.options,
                                                  [k]: e.target.value,
                                                })
                                              }
                                            />
                                          </label>
                                        ))}
                                      </div>
                                    )}
                                    <label>
                                      {q.type === "short_answer"
                                        ? "规范答案"
                                        : "正确答案字母（多项用逗号分隔）"}
                                      <input
                                        value={
                                          q.type === "short_answer"
                                            ? q.expectedAnswer || ""
                                            : (q.answer || []).join(",")
                                        }
                                        onChange={(e) =>
                                          updateQuestion(
                                            q.type === "short_answer"
                                              ? "expectedAnswer"
                                              : "answer",
                                            q.type === "short_answer"
                                              ? e.target.value
                                              : e.target.value
                                                  .toUpperCase()
                                                  .split(/[,，、\s]+/)
                                                  .filter(Boolean),
                                          )
                                        }
                                      />
                                    </label>
                                    <label>
                                      解析
                                      <textarea
                                        aria-label="解析"
                                        rows={5}
                                        value={q.analysis || ""}
                                        onChange={(e) =>
                                          updateQuestion(
                                            "analysis",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </label>
                                    <div className="ac-three-fields">
                                      {[
                                        ["chapter", "章节"],
                                        ["knowledgeSection", "二级分类"],
                                        ["knowledgePoint", "知识点"],
                                      ].map(([k, label]) => (
                                        <label key={k}>
                                          {label}
                                          <input
                                            value={q[k] || ""}
                                            onChange={(e) =>
                                              updateQuestion(k, e.target.value)
                                            }
                                          />
                                        </label>
                                      ))}
                                    </div>
                                    <label>
                                      难度
                                      <select
                                        value={q.difficulty || "medium"}
                                        onChange={(e) =>
                                          updateQuestion(
                                            "difficulty",
                                            e.target.value,
                                          )
                                        }
                                      >
                                        <option value="easy">基础</option>
                                        <option value="medium">进阶</option>
                                        <option value="hard">挑战</option>
                                      </select>
                                    </label>
                                    <details>
                                      <summary>
                                        图片、共用材料与完整题目 JSON
                                      </summary>
                                      <JSONField
                                        value={q}
                                        onChange={(value) =>
                                          setData(
                                            "questions",
                                            document.data.questions.map(
                                              (old, i) =>
                                                i === index ? value : old,
                                            ),
                                          )
                                        }
                                        label="完整题目 JSON"
                                      />
                                    </details>
                                    <div className="ac-toolbar">
                                      <button onClick={() => setPreview(true)}>
                                        预览题目
                                      </button>
                                      <button
                                        className="ac-danger-text"
                                        onClick={() => {
                                          if (
                                            window.confirm(
                                              "从当前草稿移除这道题？",
                                            )
                                          ) {
                                            setData(
                                              "questions",
                                              document.data.questions.filter(
                                                (_, i) => i !== index,
                                              ),
                                            );
                                            setIndex(0);
                                          }
                                        }}
                                      >
                                        从草稿移除
                                      </button>
                                    </div>
                                  </>
                                );
                              })()}
                          </div>
                        </div>
                      ) : (
                        <Empty
                          action={
                            <span className="ac-muted">
                              导入现有批次文件，或添加题目开始编辑。
                            </span>
                          }
                        />
                      )}
                    </>
                  )}
                  {tab === "evidence" && (
                    <>
                      <p className="ac-note">
                        沿用现有内容流程。真实来源与独立复核记录需要绑定当前题目摘要；修改题目或来源后必须重新复核。页面不会生成审核签名。
                      </p>
                      <JSONField
                        label="批次信息 batch.json"
                        value={document.data.batch}
                        onChange={(v) => setData("batch", v)}
                      />
                      <JSONField
                        label="来源 sources.json"
                        value={document.data.sources}
                        onChange={(v) => setData("sources", v)}
                      />
                      <JSONField
                        label="逐题出处 provenance.json"
                        value={document.data.provenance}
                        onChange={(v) => setData("provenance", v)}
                      />
                      <JSONField
                        label="独立复核 reviews.json"
                        value={document.data.reviews}
                        onChange={(v) => setData("reviews", v)}
                      />
                    </>
                  )}
                  {tab === "catalog" && (
                    <>
                      <p className="ac-note">
                        已有证书按当前正式目录校验。新证书需要完整
                        manifest、三级目录、guide 和可靠范围来源。
                      </p>
                      <TaxonomyEditor
                        manifest={document.data.manifest || {}}
                        onChange={(v) => setData("manifest", v)}
                      />
                      <details>
                        <summary>完整清单与指南 JSON</summary>
                        <JSONField
                          label="拟发布清单 manifest.proposed.json"
                          value={document.data.manifest || {}}
                          onChange={(v) => setData("manifest", v)}
                        />
                        <JSONField
                          label="证书指南 guide.json"
                          value={document.data.guide || {}}
                          onChange={(v) => setData("guide", v)}
                        />
                        <JSONField
                          label="练习配比 blueprint.json（未配置时为 null）"
                          value={document.data.blueprint ?? null}
                          onChange={(v) => setData("blueprint", v)}
                        />
                      </details>
                    </>
                  )}
                  {tab === "checks" && (
                    <>
                      {resource.data.baseline && (
                        <Panel
                          title="与运行原题的差异"
                          description="新题号用于保留原题历史；正式替换还需来源依据与独立复核。"
                        >
                          <Table
                            rows={Object.keys(resource.data.baseline)
                              .filter(
                                (k) =>
                                  k !== "id" &&
                                  JSON.stringify(resource.data.baseline[k]) !==
                                    JSON.stringify(
                                      document.data.questions[0]?.[k],
                                    ),
                              )
                              .map((k) => ({
                                id: k,
                                field: k,
                                before: resource.data.baseline[k],
                                after: document.data.questions[0]?.[k],
                              }))}
                            columns={[
                              { key: "field", label: "字段" },
                              {
                                key: "before",
                                label: "原题",
                                render: (r) => (
                                  <pre className="ac-diff-text">
                                    {typeof r.before === "string"
                                      ? r.before
                                      : JSON.stringify(r.before, null, 2)}
                                  </pre>
                                ),
                              },
                              {
                                key: "after",
                                label: "草稿",
                                render: (r) => (
                                  <pre className="ac-diff-text">
                                    {typeof r.after === "string"
                                      ? r.after
                                      : JSON.stringify(r.after, null, 2)}
                                  </pre>
                                ),
                              },
                            ]}
                          />
                        </Panel>
                      )}
                      <div className="ac-toolbar">
                        <div className="ac-inline">
                          <button
                            className="ac-primary"
                            disabled={!!busy || pendingJSON}
                            onClick={() =>
                              void run("保存并提交质量检查", async () => {
                                const d = dirty ? await save() : document;
                                const r = await call(
                                  "/documents/" + id + "/check",
                                  {
                                    revision: d.revision,
                                    requestId: requestId(),
                                  },
                                );
                                setJobId(r.job.id);
                                setReport(null);
                                notify("检查任务已排队");
                              })
                            }
                          >
                            <Check size={16} />
                            执行质量检查
                          </button>
                          <button
                            disabled={!!busy || dirty}
                            onClick={() =>
                              void run("检查并导出发布包", async () => {
                                const result = await call(
                                  "/documents/" + id + "/export",
                                  { revision: document.revision },
                                );
                                download(
                                  "考匠发布交接-" + id + ".json",
                                  result,
                                );
                                notify("发布包已导出，尚未部署");
                                resource.reload();
                              })
                            }
                          >
                            <Download size={15} />
                            检查并导出发布包
                          </button>
                        </div>
                        <button
                          onClick={() =>
                            download(
                              "考匠隔离草稿-" + id + ".json",
                              document.data,
                            )
                          }
                        >
                          下载隔离草稿
                        </button>
                      </div>
                      {jobId && (
                        <div className="ac-note">
                          <Status value={job.data?.job?.status || "queued"} />
                          <span>
                            {job.data?.job?.error ||
                              "检查来源、目录、题目结构、独立复核和全库重复情况。"}
                          </span>
                          {job.error && <span role="alert">{job.error}</span>}
                        </div>
                      )}
                      {report ? (
                        <>
                          <div
                            className={
                              "ac-note " + (report.ok ? "" : "ac-warning")
                            }
                          >
                            <strong>
                              {report.ok
                                ? "检查通过，可导出交接包"
                                : "检查未通过，发布导出已阻止"}
                            </strong>
                            <span>
                              {report.errors.length} 个阻断项 ·{" "}
                              {(report.duplicates || []).length} 对重复候选
                            </span>
                          </div>
                          <Table
                            rows={report.errors}
                            rowKey={(r) =>
                              r.code + ":" + r.questionId + ":" + r.message
                            }
                            columns={[
                              { key: "code", label: "检查项" },
                              { key: "questionId", label: "题号" },
                              { key: "message", label: "问题与处理依据" },
                            ]}
                          />
                          <div className="ac-toolbar">
                            <button
                              onClick={() =>
                                download("review-inputs.json", {
                                  reviewInputs: report.reviewInputs,
                                })
                              }
                            >
                              下载复核摘要
                            </button>
                            <button
                              onClick={() =>
                                download("blind-review.json", {
                                  batch: document.data.batch,
                                  sources: document.data.sources,
                                  questions: document.data.questions.map(
                                    ({
                                      answer,
                                      analysis,
                                      expectedAnswer,
                                      ...q
                                    }) => q,
                                  ),
                                })
                              }
                            >
                              下载盲解材料
                            </button>
                            <button
                              onClick={() =>
                                download("quality-report.json", report)
                              }
                            >
                              下载检查报告
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="ac-muted">
                          运行检查后展示逐题结果。缺少来源或独立复核不会被标记为通过。
                        </p>
                      )}
                      <Panel title="发布交接状态">
                        <p>
                          草稿 → 来源与独立复核 → 质量检查 → 导出发布包 →
                          代码接入与部署 → 运行库核对
                        </p>
                        <p className="ac-muted">
                          当前正式题目版本不受草稿编辑影响。导出后按
                          integration.json 执行现有验证流程。
                        </p>
                      </Panel>
                    </>
                  )}
                </div>
              </Panel>
              {preview && document.data.questions[index] && (
                <Modal title="题目预览" wide onClose={() => setPreview(false)}>
                  <QuestionPreview question={document.data.questions[index]} />
                </Modal>
              )}
            </>
          )
        }
      </Resource>
    </PendingJSON.Provider>
  );
}
function JSONField({ label, value, onChange }) {
  const text = JSON.stringify(value, null, 2),
    [draft, setDraft] = useState(text),
    [error, setError] = useState(""),
    pending = useContext(PendingJSON);
  useEffect(
    () => () =>
      pending?.((old) => {
        if (!old[label]) return old;
        const next = { ...old };
        delete next[label];
        return next;
      }),
    [label, pending],
  );
  useEffect(() => {
    setDraft(text);
    setError("");
  }, [text]);
  const apply = () => {
    try {
      const parsed = JSON.parse(draft);
      if (Array.isArray(value) && !Array.isArray(parsed))
        throw new Error("此段必须是数组");
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      )
        throw new Error("此段必须是对象");
      if (
        value === null &&
        parsed !== null &&
        (typeof parsed !== "object" || Array.isArray(parsed))
      )
        throw new Error("此段必须是对象或 null");
      onChange(parsed);
      pending?.((old) => ({ ...old, [label]: false }));
      setError("");
    } catch (e) {
      setError("JSON 格式不正确：" + e.message);
    }
  };
  return (
    <div className="ac-json-field">
      <label>
        {label}
        <textarea
          aria-label={label}
          spellCheck={false}
          rows={Math.min(16, Math.max(5, draft.split("\n").length))}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            pending?.((old) => ({ ...old, [label]: e.target.value !== text }));
          }}
        />
      </label>
      <div className="ac-inline">
        <button disabled={draft === text} onClick={apply}>
          应用此段 JSON
        </button>
        {draft !== text && (
          <span className="ac-warning">此段修改尚未应用到草稿</span>
        )}
        {error && (
          <span className="ac-error" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
