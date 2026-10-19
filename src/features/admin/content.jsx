import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Download,
  Eye,
  Files,
  Plus,
  RefreshCw,
  ScanSearch,
} from "lucide-react";
import {
  call,
  date,
  download,
  Empty,
  Modal,
  number,
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

export function makeBatch(user, cert, title = "新内容批次") {
  const runId = "web-" + requestId();
  return {
    kind: "batch",
    certificateId: cert?.id || "",
    title,
    data: {
      batch: {
        schemaVersion: 1,
        runId,
        certificateId: cert?.id || "",
        createdAt: new Date().toISOString(),
        authorContext: `web-admin:${user.id}:${runId}`,
        examVersion: cert?.syllabusVersion || "待核实版本",
        newCertificate: !cert,
        maxQuestions: 50,
        bank: {
          id: runId,
          source: runId.replaceAll("-", "_"),
          name: title,
          category: "syllabus_practice",
        },
      },
      questions: [],
      sources: [],
      provenance: [],
      reviews: [],
      blueprint: null,
    },
  };
}
export function Catalog() {
  const { certificateId, run, notify, go, user } = useAdmin(),
    resource = useResource("/catalog");
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [id, setId] = useState("");
  return (
    <>
      <div className="ac-toolbar">
        <span className="ac-muted">
          运行库目录 · 以当前服务实际加载结果为准
        </span>
        <button className="ac-primary" onClick={() => setCreating(true)}>
          <Plus size={16} />
          新证书草稿
        </button>
      </div>
      <Resource resource={resource}>
        {(data) => (
          <>
            <div className="ac-catalog-grid">
              {data.certificates
                .filter((c) => !certificateId || c.id === certificateId)
                .map((c) => (
                  <Panel
                    key={c.id}
                    title={c.shortName || c.name}
                    description={c.syllabusVersion || "大纲版本未配置"}
                    actions={<Status value="completed">已加载</Status>}
                  >
                    <div className="ac-catalog-stats">
                      <strong>
                        {number(c.questions)}
                        <small>公共题目</small>
                      </strong>
                      <strong>
                        {c.chapters.length}
                        <small>章节</small>
                      </strong>
                      <strong>
                        {number(c.active)}
                        <small>当前可用</small>
                      </strong>
                    </div>
                    <p className="ac-muted ac-tiny">
                      权重为本站练习配置；具体依据以证书来源说明为准。
                    </p>
                    <div className="ac-tree">
                      {c.chapters.map((m) => (
                        <details key={m.id || m.name}>
                          <summary>
                            <BookOpen size={15} />
                            <span>{m.name}</span>
                            <small>
                              {m.count} 题
                              {m.target ? ` / 目标 ${m.target}` : ""}
                            </small>
                          </summary>
                          {m.sections.length ? (
                            m.sections.map((s) => (
                              <div
                                className="ac-tree-section"
                                key={s.code || s.name}
                              >
                                <h4>{s.name}</h4>
                                {s.knowledgePoints.map((p) => (
                                  <button
                                    key={p.code}
                                    onClick={() =>
                                      go("questions", {
                                        certificateId: c.id,
                                        chapter: m.name,
                                        knowledgeSection: s.name,
                                        knowledgePoint: p.name,
                                      })
                                    }
                                  >
                                    <code>{p.code}</code>
                                    <span>{p.name}</span>
                                    <strong
                                      className={p.count ? "" : "ac-warning"}
                                    >
                                      {p.count} 题
                                    </strong>
                                  </button>
                                ))}
                              </div>
                            ))
                          ) : (
                            <p className="ac-muted">
                              当前未配置完整三级目录，可在目录草稿中补充。
                            </p>
                          )}
                          {m.target > m.count && (
                            <p className="ac-warning">
                              距离配置目标题量还差 {m.target - m.count} 题
                            </p>
                          )}
                        </details>
                      ))}
                    </div>
                    <div className="ac-panel-foot">
                      <button
                        onClick={() => go("questions", { certificateId: c.id })}
                      >
                        查看题目
                        <ChevronRight size={15} />
                      </button>
                      <button
                        onClick={() => {
                          const input = makeBatch(
                            user,
                            c,
                            `${c.shortName || c.name} · 目录修订`,
                          );
                          input.kind = "certificate";
                          input.data.manifest = structuredClone(c.manifest);
                          if (c.guide)
                            input.data.guide = structuredClone(c.guide);
                          void run("创建目录草稿", async () => {
                            const r = await call("/documents", input);
                            go("documents", { document: r.document.id });
                          });
                        }}
                      >
                        目录修订草稿
                        <Files size={15} />
                      </button>
                    </div>
                    <details className="ac-metadata">
                      <summary>题库摘要与范围来源</summary>
                      <code>{c.loadedDigest}</code>
                      <p>
                        内置加载 {number(c.bundled)}{" "}
                        题；摘要包含当前公共题库记录。
                      </p>
                      {c.sourceUrls.map((s, i) => (
                        <p key={i}>
                          {typeof s === "string" ? s : s.name}：
                          {typeof s === "string" ? "" : s.url}
                        </p>
                      ))}
                    </details>
                  </Panel>
                ))}
            </div>
            <p className="ac-muted ac-tiny">
              读取于 {date(data.updatedAt)} ·
              草稿和未部署发布包不计入已加载题量。
            </p>
          </>
        )}
      </Resource>
      {creating && (
        <Modal title="创建新证书草稿" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("保存证书草稿", async () => {
                const input = makeBatch(user, null, name);
                input.kind = "certificate";
                input.certificateId = id;
                input.data.batch.certificateId = id;
                input.data.manifest = {
                  schemaVersion: 1,
                  certificate: { id, name, shortName: name, description: "" },
                  guidePath: "guide.json",
                  banks: [],
                  taxonomy: { schemaVersion: 1, modules: [] },
                };
                input.data.guide = {};
                const r = await call("/documents", input);
                notify("证书草稿已保存，完善目录、范围及题目后再检查");
                setCreating(false);
                go("documents", { document: r.document.id });
              });
            }}
          >
            <label>
              证书名称
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              稳定编码
              <input
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={id}
                onChange={(e) => setId(e.target.value)}
                placeholder="例如 new-certificate"
              />
            </label>
            <p className="ac-note">
              草稿与学习入口隔离。完整三级目录、范围证据、指南和题目通过检查后，才能导出发布包。
            </p>
            <button className="ac-primary" type="submit">
              创建并继续完善
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Questions() {
  const { params, setParams, certificateId, run, notify, go, busy } =
      useAdmin(),
    catalog = useResource("/catalog");
  const query = new URLSearchParams(params);
  query.delete("document");
  const resource = useResource("/questions?" + query),
    [selected, setSelected] = useState([]),
    [question, setQuestion] = useState(null),
    [visibility, setVisibility] = useState(null);
  const [reason, setReason] = useState(""),
    [preview, setPreview] = useState(null);
  useEffect(() => {
    setSelected([]);
    setQuestion(null);
  }, [query.toString()]);
  const cert = catalog.data?.certificates.find((c) => c.id === certificateId),
    chapter = cert?.chapters.find((c) => c.name === params.get("chapter"));
  const section = chapter?.sections.find(
    (s) => s.name === params.get("knowledgeSection"),
  );
  const change = (key, value) =>
    setParams({
      [key]: value,
      ...(key === "chapter"
        ? { knowledgeSection: "", knowledgePoint: "" }
        : key === "knowledgeSection"
          ? { knowledgePoint: "" }
          : {}),
    });
  const startVisibility = (hidden) => {
    setVisibility({
      hidden,
      items: selected.map((q) => ({ id: q.id, revision: q.revision })),
    });
    setReason("");
    setPreview(null);
  };
  return (
    <>
      <Panel>
        <div className="ac-filters">
          <SearchField
            value={params.get("search")}
            onSearch={(v) => change("search", v)}
            placeholder="题干、题号、知识点；支持 * 和 ?"
          />
          <select
            aria-label="章节筛选"
            value={params.get("chapter") || ""}
            onChange={(e) => change("chapter", e.target.value)}
          >
            <option value="">全部章节</option>
            {cert?.chapters.map((c) => (
              <option key={c.name}>{c.name}</option>
            ))}
          </select>
          <select
            aria-label="二级分类筛选"
            value={params.get("knowledgeSection") || ""}
            onChange={(e) => change("knowledgeSection", e.target.value)}
          >
            <option value="">全部二级分类</option>
            {chapter?.sections.map((s) => (
              <option key={s.name}>{s.name}</option>
            ))}
          </select>
          <select
            aria-label="知识点筛选"
            value={params.get("knowledgePoint") || ""}
            onChange={(e) => change("knowledgePoint", e.target.value)}
          >
            <option value="">全部知识点</option>
            {section?.knowledgePoints.map((p) => (
              <option key={p.code}>{p.name}</option>
            ))}
          </select>
          <select
            aria-label="题型筛选"
            value={params.get("type") || ""}
            onChange={(e) => change("type", e.target.value)}
          >
            <option value="">全部题型</option>
            {[
              "single_choice",
              "multiple_choice",
              "true_false",
              "short_answer",
            ].map((t) => (
              <option key={t} value={t}>
                {
                  {
                    single_choice: "单选题",
                    multiple_choice: "多选题",
                    true_false: "判断题",
                    short_answer: "简答题",
                  }[t]
                }
              </option>
            ))}
          </select>
          <select
            aria-label="题目状态"
            value={params.get("status") || "all"}
            onChange={(e) => change("status", e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="active">使用中</option>
            <option value="hidden">已下架</option>
          </select>
          <select
            aria-label="题目排序"
            value={params.get("sort") || "id"}
            onChange={(e) => change("sort", e.target.value)}
          >
            <option value="id">按题号排序</option>
            <option value="chapter">按章节排序</option>
          </select>
          <button
            aria-label="刷新题目列表"
            onClick={() => {
              setSelected([]);
              resource.reload();
            }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <Resource resource={resource}>
          {(data) => (
            <>
              <div className="ac-table-caption">
                <strong>
                  公共题库 <span>{number(data.total)}</span>
                </strong>
                <span className="ac-muted">
                  每页 {data.limit} 条 · 选择仅作用于当前页
                </span>
              </div>
              <Table
                rows={data.rows}
                columns={[
                  {
                    key: "select",
                    label: (
                      <input
                        type="checkbox"
                        aria-label="选择本页全部题目"
                        checked={
                          !!data.rows.length &&
                          selected.length === data.rows.length
                        }
                        onChange={(e) =>
                          setSelected(e.target.checked ? data.rows : [])
                        }
                      />
                    ),
                    render: (q) => (
                      <input
                        type="checkbox"
                        aria-label={"选择题目 " + q.id}
                        checked={selected.some((s) => s.id === q.id)}
                        onChange={(e) =>
                          setSelected((s) =>
                            e.target.checked
                              ? [...s, q]
                              : s.filter((x) => x.id !== q.id),
                          )
                        }
                      />
                    ),
                  },
                  {
                    key: "question",
                    label: "题目",
                    render: (q) => (
                      <button
                        className="ac-question-link"
                        onClick={() => setQuestion(q)}
                      >
                        <strong>{q.question}</strong>
                        <small>{q.id}</small>
                      </button>
                    ),
                  },
                  {
                    key: "chapter",
                    label: "章节 / 知识点",
                    render: (q) => (
                      <div className="ac-cell-stack">
                        <span>{q.chapter}</span>
                        <small>{q.knowledgePoint}</small>
                      </div>
                    ),
                  },
                  {
                    key: "type",
                    label: "题型",
                    render: (q) => (
                      <Status value="draft">
                        {
                          {
                            single_choice: "单选",
                            multiple_choice: "多选",
                            true_false: "判断",
                            short_answer: "简答",
                          }[q.type]
                        }
                      </Status>
                    ),
                  },
                  {
                    key: "source",
                    label: "来源",
                    render: (q) => <small>{q.sourceLabel || q.source}</small>,
                  },
                  {
                    key: "hidden",
                    label: "状态",
                    render: (q) => (
                      <Status value={q.hidden ? "interrupted" : "completed"}>
                        {q.hidden ? "已下架" : "使用中"}
                      </Status>
                    ),
                  },
                  {
                    key: "actions",
                    label: "操作",
                    render: (q) => (
                      <button
                        className="ac-link"
                        onClick={() => setQuestion(q)}
                      >
                        <Eye size={15} />
                        查看
                      </button>
                    ),
                  },
                ]}
              />
              <Pagination
                total={data.total}
                limit={data.limit}
                offset={data.offset}
                onChange={(offset) => setParams({ offset })}
              />
            </>
          )}
        </Resource>
      </Panel>
      <div className="ac-bulkbar">
        <strong>已选 {selected.length} 题</strong>
        <button
          disabled={!selected.length || !!busy}
          onClick={() =>
            void run("导出所选题目", async () =>
              download(
                "考匠题目核对.json",
                await call("/questions/export", {
                  ids: selected.map((q) => q.id),
                }),
              ),
            )
          }
        >
          <Download size={15} />
          导出核对
        </button>
        <button
          disabled={!selected.length}
          onClick={() => startVisibility(true)}
        >
          下架所选
        </button>
        <button
          disabled={!selected.length}
          onClick={() => startVisibility(false)}
        >
          恢复所选
        </button>
        <button className="ac-link" onClick={() => setSelected([])}>
          清空选择
        </button>
        <small>下架保留原题和答题历史</small>
      </div>
      {question && (
        <Modal title="题目详情" wide onClose={() => setQuestion(null)}>
          <QuestionPreview question={question} />
          <div className="ac-dialog-actions">
            <button onClick={() => setQuestion(null)}>关闭</button>
            <button
              className="ac-primary"
              onClick={() =>
                void run("创建修订草稿", async () => {
                  const certId = certificateId || question.certificates?.[0];
                  const r = await call(
                    `/questions/${encodeURIComponent(question.id)}/draft`,
                    { certificateId: certId, revision: question.revision },
                  );
                  setQuestion(null);
                  notify("已创建独立修订草稿，原题保持当前发布版本");
                  go("documents", { document: r.document.id });
                })
              }
            >
              <Files size={16} />
              创建修订草稿
            </button>
          </div>
        </Modal>
      )}
      {visibility && (
        <Modal
          title={visibility.hidden ? "下架所选题目" : "恢复所选题目"}
          onClose={() => setVisibility(null)}
        >
          <p>
            本次操作 {visibility.items.length}{" "}
            道题。下架后不再进入新练习与新试卷，已存在的记录和考试可以继续查看。
          </p>
          <label>
            操作原因
            <input
              minLength={2}
              required
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          {preview && (
            <div className="ac-note">
              <strong>影响预览：{preview.count} 道题</strong>
              <ul>
                {preview.items.slice(0, 8).map((q) => (
                  <li key={q.id}>{q.question.slice(0, 60)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="ac-dialog-actions">
            <button onClick={() => setVisibility(null)}>取消</button>
            {preview ? (
              <button
                className="ac-primary"
                disabled={!!busy}
                onClick={() =>
                  void run("保存题目状态", async () => {
                    await call("/visibility", {
                      ...visibility,
                      reason,
                      preview: preview.preview,
                      requestId: preview.requestId,
                    });
                    notify("题目状态已更新，历史记录已保留");
                    setVisibility(null);
                    setSelected([]);
                    resource.reload();
                  })
                }
              >
                确认{visibility.hidden ? "下架" : "恢复"} {preview.count} 题
              </button>
            ) : (
              <button
                className="ac-primary"
                disabled={reason.trim().length < 2 || !!busy}
                onClick={() =>
                  void run("读取影响预览", async () =>
                    setPreview({
                      ...(await call("/visibility/preview", {
                        ...visibility,
                        reason,
                      })),
                      requestId: requestId(),
                    }),
                  )
                }
              >
                预览影响
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
export function Quality() {
  const { certificateId, run, busy, params, setParams, go } = useAdmin(),
    [threshold, setThreshold] = useState(0.78);
  const jobId = params.get("job"),
    resource = useResource(
      jobId ? "/jobs/" + encodeURIComponent(jobId) : "/jobs",
      { poll: !!jobId },
    ),
    [pair, setPair] = useState(null);
  return (
    <>
      <Panel
        title="公共题库重合检测"
        description="扫描在独立工作线程运行，结果只用于发现候选。"
      >
        <div className="ac-filters">
          <label>
            候选相似度
            <input
              type="number"
              min="0.5"
              max="0.99"
              step="0.01"
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
            />
          </label>
          <button
            className="ac-primary"
            disabled={!!busy}
            onClick={() =>
              void run("创建扫描任务", async () => {
                const r = await call("/quality/scan", {
                  certificateId,
                  threshold,
                  requestId: requestId(),
                });
                setParams({ job: r.job.id });
              })
            }
          >
            <ScanSearch size={16} />
            开始扫描
          </button>
          <span className="ac-muted">
            按顶部证书范围扫描，最多展示 200 对。
          </span>
        </div>
      </Panel>
      {jobId && (
        <Resource resource={resource}>
          {({ job }) => (
            <Panel title="扫描结果" actions={<Status value={job.status} />}>
              {job.error && <p className="ac-error">{job.error}</p>}
              {["queued", "running"].includes(job.status) && (
                <p className="ac-note">
                  扫描正在进行，可切换页面，任务结果会保留。
                </p>
              )}
              {job.result?.pairs && (
                <Table
                  rows={job.result.pairs}
                  rowKey={(p) => p.left.id + ":" + p.right.id}
                  columns={[
                    {
                      key: "score",
                      label: "相似度",
                      render: (p) => (
                        <strong>{Math.round(p.score * 100)}%</strong>
                      ),
                    },
                    {
                      key: "left",
                      label: "题目一",
                      render: (p) => <span>{p.left.question}</span>,
                    },
                    {
                      key: "right",
                      label: "题目二",
                      render: (p) => <span>{p.right.question}</span>,
                    },
                    {
                      key: "action",
                      label: "操作",
                      render: (p) => (
                        <button onClick={() => setPair(p)}>并排核对</button>
                      ),
                    },
                  ]}
                />
              )}
              <p className="ac-muted">
                相似不等于重复；请核对条件、设问、选项和推理后，通过修订或下架处理。
              </p>
              <button onClick={() => go("jobs")}>打开任务中心</button>
            </Panel>
          )}
        </Resource>
      )}
      {pair && (
        <Modal title="相似题并排核对" wide onClose={() => setPair(null)}>
          <div className="ac-compare">
            <QuestionPreview question={pair.left} />
            <QuestionPreview question={pair.right} />
          </div>
        </Modal>
      )}
    </>
  );
}
