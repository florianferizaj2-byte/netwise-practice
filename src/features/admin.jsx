import { lazy, useEffect, useState } from "react";
import {
  AdminMembershipCodes,
  MembershipBadge,
} from "../admin-memberships.jsx";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Check,
  Clock,
  Eye,
  EyeOff,
  Flag,
  List,
  LoaderCircle,
  Pencil,
  PlugZap,
  RefreshCw,
  Save,
  ScanSearch,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { diff, sourceName, sources } from "../question-utils.js";
import { Empty, Heading, IconButton } from "../components/study-ui.jsx";
import { reportReasons } from "../components/question-tools.jsx";
const AdminQuestionEditor = lazy(() =>
  import("./admin-question-editor.jsx").then((m) => ({
    default: m.AdminQuestionEditor,
  })),
);

export function AdminView({
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
    setUsers(
      (await api(`/admin/users?search=${encodeURIComponent(search)}`)).users,
    );
  const loadAudit = async () =>
    setAudit((await api("/admin/audit?limit=30")).entries);
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
    if (tab === "users") loadUsers().catch(() => {});
  }, [tab]);
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
    const item = taxonomy?.certificates.find(
      (entry) => entry.id === certificateId,
    );
    const nextChapter =
      item?.chapters.find((entry) => entry.name === chapter) ||
      item?.chapters[0];
    if (nextChapter && nextChapter.name !== chapter)
      setChapter(nextChapter.name);
    const sections = nextChapter?.sections || [];
    const nextSection = sections.some(
      (section) => section.name === knowledgeSection,
    )
      ? knowledgeSection
      : sections[0]?.name || "";
    if (nextSection !== knowledgeSection) setKnowledgeSection(nextSection);
    const selectedSection = sections.find(
      (section) => section.name === nextSection,
    );
    const sectionPoints =
      selectedSection?.knowledgePoints || nextChapter?.knowledgePoints || [];
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
          result.skipped?.length
            ? `，跳过 ${result.skipped.length} 道重复题`
            : ""
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
    if (!window.confirm(`确定取消这条用户反馈吗？\n\n${row.question.question}`))
      return;
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
          ["membership-codes", "兑换码"],
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
                      <small>
                        {new Date(entry.createdAt).toLocaleString("zh-CN")}
                      </small>
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
              <div className="alert error">
                请先在“管理员 API”中配置你的 API Key。
              </div>
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
                <select
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                >
                  {[1, 3, 5, 10, 20].map((value) => (
                    <option key={value} value={value}>
                      {value} 道
                    </option>
                  ))}
                </select>
              </label>
              <label>
                难度
                <select
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                >
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
              <small className="muted">
                每次最多 20 道，重复或审核不通过的题不会写入。
              </small>
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
                      {question.knowledgeSection && (
                        <span>{question.knowledgeSection}</span>
                      )}
                      <span>{question.knowledgePoint}</span>
                      <span>
                        {diff[question.difficulty] || question.difficulty}
                      </span>
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
              <p>
                按证书、章节、二级分类、知识点、来源或关键词查看题目，并可直接处理单题。
              </p>
            </div>
            <span className="badge green">
              共 {adminQuestionTotal.toLocaleString()} 道
            </span>
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
                  onChange={(event) =>
                    setQuestionSearchInput(event.target.value)
                  }
                  placeholder="题干、题号、ID；支持 * 和 ?"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="primary"
                  disabled={questionLoading}
                >
                  <Search size={16} /> 搜索
                </button>
              </div>
              <small>
                普通文字为包含搜索；例如：*本病*、vet-2009-*、*防治?
              </small>
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
                      <span className="badge green">
                        #{questionPage * 50 + rowIndex + 1}
                      </span>
                      <span>{sourceName(question)}</span>
                      <span>{question.chapter}</span>
                      {question.knowledgeSection && (
                        <span>{question.knowledgeSection}</span>
                      )}
                      <span>
                        {question.targetKnowledgePoint ||
                          question.knowledgePoint}
                      </span>
                      {question.feedback?.reportTotal ? (
                        <span className="badge red">
                          <Flag size={13} /> 异常反馈{" "}
                          {question.feedback.reportTotal}
                        </span>
                      ) : null}
                    </div>
                    <button
                      className="danger-button"
                      onClick={() =>
                        removeQuestion(question, () =>
                          loadQuestions(questionPage),
                        )
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
                        {Object.entries(question.options || {}).map(
                          ([key, value]) => (
                            <span key={key}>
                              <b>{key}</b> {value}
                            </span>
                          ),
                        )}
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
                                {reportReasons.find(
                                  (reason) => reason.value === item.kind,
                                )?.label || item.kind}
                              </span>
                              {item.note && <p>{item.note}</p>}
                              <small>
                                {new Date(item.createdAt).toLocaleString(
                                  "zh-CN",
                                )}
                              </small>
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
              第 {Math.min(questionPage + 1, questionTotalPages)} /{" "}
              {questionTotalPages} 页 · 每页 50 题
            </span>
            <button
              disabled={
                questionLoading || questionPage >= questionTotalPages - 1
              }
              onClick={() =>
                setQuestionPage((page) =>
                  Math.min(questionTotalPages - 1, page + 1),
                )
              }
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
              <p>
                集中查看用户在做题区提交的异常反馈。你可以先修改题目，或确认后取消这条反馈。
              </p>
            </div>
            <div className="admin-inline-controls">
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
              <span className="badge red">
                待处理 {feedbackTotal.toLocaleString()} 条
              </span>
            </div>
          </div>
          {feedbackError ? (
            <div className="alert error" role="alert">
              <span>反馈读取失败：{feedbackError}</span>
              <button
                disabled={feedbackLoading}
                onClick={() => loadFeedback().catch(() => {})}
              >
                重新读取
              </button>
            </div>
          ) : feedbackLoading ? (
            <div className="admin-list-loading">
              <LoaderCircle className="spin" size={22} /> 正在读取用户反馈…
            </div>
          ) : feedbackRows.length ? (
            <div className="admin-feedback-list">
              {feedbackRows.map((row) => {
                const reason = reportReasons.find(
                  (item) => item.value === row.kind,
                );
                return (
                  <article
                    className="admin-feedback-item"
                    key={`${row.userId}-${row.questionId}`}
                  >
                    <div className="admin-feedback-item-head">
                      <div className="question-meta">
                        <span className="badge red">
                          <Flag size={13} /> {reason?.label || row.kind}
                        </span>
                        <span>{row.username || "匿名用户"}</span>
                        <span>{row.question.chapter}</span>
                        {row.question.knowledgeSection && (
                          <span>{row.question.knowledgeSection}</span>
                        )}
                        <span>
                          {row.question.targetKnowledgePoint ||
                            row.question.knowledgePoint}
                        </span>
                      </div>
                      <small>
                        {new Date(row.createdAt).toLocaleString("zh-CN")}
                      </small>
                    </div>
                    <strong>{row.question.question}</strong>
                    <div className="admin-feedback-item-meta">
                      <span>{sourceName(row.question)}</span>
                      <span>正确答案：{row.question.answer?.join("、")}</span>
                      <span className="admin-question-id">
                        {row.questionId}
                      </span>
                    </div>
                    <div className="admin-feedback-note">
                      <b>用户说明</b>
                      <p>{row.note || "用户未补充说明。"}</p>
                    </div>
                    <div className="item-actions">
                      <button
                        className="primary"
                        disabled={!!busy}
                        onClick={() => setEditingQuestion(row.question)}
                      >
                        <Pencil size={15} /> 修改题目
                      </button>
                      <button
                        className="danger-button"
                        disabled={!!busy}
                        onClick={() => cancelFeedback(row)}
                      >
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
              第 {Math.min(feedbackPage + 1, feedbackTotalPages)} /{" "}
              {feedbackTotalPages} 页 · 每页 50 条
            </span>
            <button
              disabled={
                feedbackLoading || feedbackPage >= feedbackTotalPages - 1
              }
              onClick={() =>
                setFeedbackPage((page) =>
                  Math.min(feedbackTotalPages - 1, page + 1),
                )
              }
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
              <p>
                按题干和选项的字符片段计算相似度，只展示同章节、同证书的候选对。
              </p>
            </div>
            <div className="admin-inline-controls">
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
                阈值
                <input
                  aria-label="相似度阈值"
                  type="number"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={threshold}
                  onChange={(event) => setThreshold(event.target.value)}
                />
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
                  <article
                    className="similar-pair"
                    key={`${pair.left.id}-${pair.right.id}`}
                  >
                    <div className="similar-score">
                      {Math.round(pair.score * 100)}% 相似
                    </div>
                    {[pair.left, pair.right].map((question, index) => (
                      <div className="similar-question" key={question.id}>
                        <div className="question-meta">
                          <span className="badge">
                            {index ? "题目 B" : "题目 A"}
                          </span>
                          <span>{sourceName(question)}</span>
                          <span>{question.knowledgePoint}</span>
                        </div>
                        <strong>{question.question}</strong>
                        <small>{question.id}</small>
                        <button
                          className="danger-button"
                          onClick={() => removeQuestion(question)}
                        >
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
              <p>
                封禁会立即撤销该用户的登录会话；管理员账号不能被普通管理员互相封禁。
              </p>
            </div>
            <div className="admin-inline-controls">
              <input
                aria-label="搜索用户"
                placeholder="搜索账号"
                value={userSearch}
                onChange={(event) => setUserSearch(event.target.value)}
              />
              <button onClick={() => run("正在搜索用户", () => loadUsers())}>
                <RefreshCw size={16} /> 搜索
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>账号</th>
                  <th>会员等级</th>
                  <th>会员有效期</th>
                  <th>证书</th>
                  <th>注册时间</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <strong>{user.username}</strong>
                      {user.isAdmin && <small>管理员</small>}
                    </td>
                    <td>
                      <MembershipBadge plan={user.membershipPlan} />
                    </td>
                    <td>
                      {user.membershipExpiresAt ? (
                        <>
                          {new Date(user.membershipExpiresAt).toLocaleString(
                            "zh-CN",
                          )}
                          {user.membershipPlan === "free" && (
                            <small>已到期</small>
                          )}
                        </>
                      ) : user.membershipPlan &&
                        user.membershipPlan !== "free" ? (
                        "长期有效"
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {certificates.find(
                        (item) => item.id === user.certificateId,
                      )?.shortName || "未选择"}
                    </td>
                    <td>{new Date(user.createdAt).toLocaleString("zh-CN")}</td>
                    <td>
                      {user.bannedAt ? (
                        <span className="badge red">已封禁</span>
                      ) : (
                        <span className="badge green">正常</span>
                      )}
                    </td>
                    <td>
                      {!user.isAdmin && (
                        <button
                          className={user.bannedAt ? "" : "danger-button"}
                          onClick={() => toggleBan(user)}
                        >
                          {user.bannedAt ? "解封" : "封禁"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "membership-codes" && (
        <AdminMembershipCodes api={api} notify={notify} />
      )}
      {tab === "api" && settings && (
        <section className="admin-card admin-settings-card">
          <div className="section-heading">
            <div>
              <h2>
                <PlugZap size={20} /> 管理员 AI 服务
              </h2>
              <p>
                用于管理员扩充题库；主管理员的配置也可作为全站作者 AI
                服务的备用配置。
              </p>
            </div>
            <span className={settings.hasKey ? "badge green" : "badge red"}>
              {settings.hasKey ? "已配置" : "未配置"}
            </span>
          </div>
          {!settings.encryptionReady && (
            <div className="alert error">
              服务器未配置 AI_MASTER_KEY，不能保存 API Key。
            </div>
          )}
          <div className="admin-form-grid">
            <label className="wide">
              API Base URL
              <input
                aria-label="管理员 API Base URL"
                value={settings.baseUrl}
                onChange={(event) =>
                  updateSettings("baseUrl", event.target.value)
                }
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label className="wide">
              API Key
              <div className="key-input">
                <input
                  aria-label="管理员 API Key"
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(event) => setAdminKey(event.target.value)}
                  placeholder={
                    settings.hasKey
                      ? "已保存 · 输入新 Key 可修改"
                      : "输入管理员 API Key"
                  }
                  autoComplete="off"
                />
                <IconButton
                  icon={showKey ? EyeOff : Eye}
                  label={showKey ? "隐藏管理员 API Key" : "显示管理员 API Key"}
                  disabled={!adminKey}
                  onClick={() => setShowKey((old) => !old)}
                />
                <IconButton
                  icon={Trash2}
                  label="删除管理员 API Key"
                  disabled={!settings.hasKey || !!busy}
                  onClick={() =>
                    run("正在删除管理员 API Key", async () => {
                      await api("/admin/settings/key", null, "DELETE");
                      setSettings(await api("/admin/settings"));
                      notify("管理员 API Key 已删除");
                    })
                  }
                />
              </div>
              <small className="field-state">
                {settings.hasKey ? "已加密保存 · 原值不回传浏览器" : "尚未保存"}
              </small>
            </label>
            <label>
              模型名称
              <input
                aria-label="管理员模型名称"
                value={settings.model}
                onChange={(event) =>
                  updateSettings("model", event.target.value)
                }
                placeholder="deepseek-chat"
              />
            </label>
            <label>
              Temperature
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(event) =>
                  updateSettings("temperature", event.target.value)
                }
              />
            </label>
          </div>
          <div className="item-actions">
            <button
              className="primary"
              disabled={!!busy || !settings.encryptionReady}
              onClick={saveSettings}
            >
              <Save size={16} /> 保存管理员配置
            </button>
            <button
              disabled={!!busy || !settings.hasKey}
              onClick={testSettings}
            >
              <PlugZap size={16} /> 测试管理员 AI
            </button>
          </div>
          <div className="admin-usage">
            <span>
              今日调用 <strong>{settings.usage.today.calls}</strong>
            </span>
            <span>
              今日 Token{" "}
              <strong>
                {settings.usage.today.total_tokens.toLocaleString()}
              </strong>
            </span>
            <span>
              累计调用 <strong>{settings.usage.total.calls}</strong>
            </span>
            <span>
              累计 Token{" "}
              <strong>
                {settings.usage.total.total_tokens.toLocaleString()}
              </strong>
            </span>
          </div>
        </section>
      )}
      {tab === "audit" && (
        <section className="admin-card">
          <div className="section-heading">
            <div>
              <h2>
                <Clock size={20} /> 操作审计
              </h2>
              <p>管理员的配置、扩题、删题、封禁操作都会保留时间和目标记录。</p>
            </div>
            <button onClick={() => run("正在刷新审计记录", loadAudit)}>
              <RefreshCw size={16} /> 刷新
            </button>
          </div>
          <div className="admin-audit-list admin-audit-full">
            {audit.length ? (
              audit.map((entry) => (
                <div className="admin-audit-row" key={entry.id}>
                  <strong>{entry.adminUsername || "管理员"}</strong>
                  <span>
                    {entry.action} · {entry.targetType}
                    {entry.targetId ? ` · ${entry.targetId}` : ""}
                  </span>
                  <small>
                    {new Date(entry.createdAt).toLocaleString("zh-CN")}
                  </small>
                </div>
              ))
            ) : (
              <p className="muted">暂无记录。</p>
            )}
          </div>
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
