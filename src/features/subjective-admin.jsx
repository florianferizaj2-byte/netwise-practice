import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Eye, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { api } from "../api.js";
import { LessonContent, Stem } from "./subjective-study.jsx";

const stateNames = { awaiting_review: "AI 审核通过，等待发布", published: "已发布", rejected: "AI 审核未通过", suspended: "已下架" };
const date = (value) => new Date(value).toLocaleString("zh-CN");
const reviewLabel = (value) => value === true ? "通过" : value === false ? "未通过" : "未检查";
const questionAccepted = (review) => review?.valid === true && review.nodeAligned === true &&
  review.answerCorrect === true && review.explanationCorrect === true && review.hintSafe === true;

function GradeReview({ feedback, packages, reload }) {
  const [grades, setGrades] = useState(() => Object.fromEntries(feedback.attempt_data.result.results.map((row) => [row.blankId, row.verdict === "correct"])));
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const item = packages.find((row) => row.id === feedback.package_id);
  const question = item?.data.bundle.questions.find((row) => row.id === feedback.question_id);
  return <article className="ss-grade-review">
    {question && <Stem question={question} />}<p>学生说明：{feedback.note}</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); setBusy(true); setError("");
      try { await api(`/admin/study/feedback/${feedback.id}/resolve`, { note, blanks: Object.entries(grades).map(([blankId, correct]) => ({ blankId, correct })) }); await reload(); }
      catch (failure) { setError(failure.message); } finally { setBusy(false); }
    }}>
      {feedback.attempt_data.result.results.map((row, i) => <label className="ss-review-blank" key={row.blankId}>
        <span>第 {i + 1} 空：学生填「{row.response || "未填写"}」，参考「{row.expectedAnswer}」</span>
        <select aria-label={`复核第 ${i + 1} 空`} value={grades[row.blankId] ? "correct" : "incorrect"} onChange={(event) => setGrades((old) => ({ ...old, [row.blankId]: event.target.value === "correct" }))}><option value="correct">答对</option><option value="incorrect">答错</option></select>
      </label>)}
      <label htmlFor={`ss-review-note-${feedback.id}`}>复核依据</label><textarea id={`ss-review-note-${feedback.id}`} rows={2} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} />
      {error && <p className="ss-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || note.trim().length < 2}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}保存复核结果</button>
    </form>
  </article>;
}

export function SubjectiveAdmin({ navigate }) {
  const [data, setData] = useState(null), [nodeId, setNodeId] = useState(""), [packageId, setPackageId] = useState("");
  const [reference, setReference] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false), [bulkResult, setBulkResult] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false), [runQueueBusy, setRunQueueBusy] = useState(false);
  const [jobId, setJobId] = useState(""), [job, setJob] = useState(null), [referenceLoading, setReferenceLoading] = useState(false);
  const live = useRef(true), referenceTouched = useRef(false);
  const reload = useCallback(async () => {
    const result = await api("/admin/study/overview");
    if (!live.current) return;
    setData(result); setNodeId((old) => old || result.nodes[0]?.id || "");
  }, []);
  useEffect(() => { live.current = true; void reload().catch((failure) => { if (live.current) setError(failure.message); }); return () => { live.current = false; }; }, [reload]);
  useEffect(() => {
    if (!nodeId) return;
    let active = true;
    referenceTouched.current = false; setReference(""); setPackageId(""); setNotice(""); setJobId(""); setJob(null); setError(""); setReferenceLoading(true);
    api(`/admin/study/reference/${encodeURIComponent(nodeId)}`).then((result) => {
      if (active && !referenceTouched.current) setReference(result.reference);
    }).catch((failure) => { if (active) setError(failure.message); }).finally(() => { if (active) setReferenceLoading(false); });
    return () => { active = false; };
  }, [nodeId]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const result = await api(`/admin/study/generations/${jobId}`);
        if (!active) return;
        setJob(result);
        if (!["queued", "running"].includes(result.status)) {
          setJobId(""); setBusy(false); await reload();
          if (result.package_id) setPackageId(result.package_id);
          if (result.error) setError(result.error);
        }
      } catch (failure) { if (active) { setError(failure.message); setBusy(false); setJobId(""); } }
    };
    void poll(); const timer = setInterval(() => void poll(), 1800);
    return () => { active = false; clearInterval(timer); };
  }, [jobId, reload]);
  const packages = data?.packages.filter((item) => item.node_id === nodeId) || [];
  const selected = packages.find((item) => item.id === packageId) || packages.find((item) => item.status === "awaiting_review") || packages[0];
  const lessonReview = selected?.data.review.lesson;
  const reviewAccepted = lessonReview?.valid === true && lessonReview.knowledgeCorrect === true &&
    lessonReview.nodeAligned === true && selected.data.bundle.questions.every((question) =>
      questionAccepted(selected.data.review.questions.find((item) => item.id === question.id)));
  const node = data?.nodes.find((item) => item.id === nodeId);
  const course = data?.courses.find((item) => item.id === node?.certificateId);
  const courseNodes = data?.nodes.filter((item) => item.certificateId === node?.certificateId) || [];
  const authoredReview = selected?.data.reviewMethod === "authored-curriculum";
  const currentJob = data?.jobs.find((item) => item.node_id === nodeId && ["queued", "running"].includes(item.status));
  const pendingCount = data?.jobs.filter((item) => ["queued", "running"].includes(item.status)).length || 0;
  const queuedCount = data?.jobs.filter((item) => item.status === "queued").length || 0;
  const reviewCount = data?.packages.filter((item) => item.status === "awaiting_review").length || 0;
  const publishCount = data?.packages.filter((item) => item.status === "published" && item.current).length || 0;
  const bulk = async () => {
    setBulkBusy(true); setError(""); setNotice(""); setBulkResult(null);
    try {
      const result = await api("/admin/study/generations/bulk", { certificateId: node.certificateId }, "POST");
      if (!live.current) return;
      setBulkResult(result);
      setNotice(`${course.name}排队完成：新增 ${result.queued} 节，复用处理中任务 ${result.reused} 节，跳过已发布 ${result.published} 节和待审核 ${result.awaitingReview} 节。`);
      await reload();
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { if (live.current) setBulkBusy(false); }
  };
  const publishAccepted = async () => {
    setPublishBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/admin/study/packages/publish-accepted", {}, "POST");
      if (!live.current) return;
      setNotice(`已逐节上架 ${result.published} 节通过 AI 复核的课程${result.skipped ? `，跳过 ${result.skipped} 节不符合当前目录或复核条件的内容` : ""}。`);
      await reload();
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { if (live.current) setPublishBusy(false); }
  };
  const runQueued = async () => {
    setRunQueueBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/admin/study/generations/run-queued", {}, "POST");
      if (!live.current) return;
      setNotice(`已开始逐节处理队列：排入 ${result.released} 节${result.retried ? `，重试 ${result.retried} 节结构校验失败内容` : ""}。每次只生成一节；AI 复核通过自动上架，未通过的留在待修队列。`);
      await reload();
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { if (live.current) setRunQueueBusy(false); }
  };
  useEffect(() => { if (currentJob && !jobId) { setJobId(currentJob.id); setBusy(true); } }, [currentJob?.id]);
  const generate = async (event) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await api("/admin/study/generations", { nodeId, reference, regenerate: packages.length > 0 });
      if (!live.current) return;
      if (result.jobId) setJobId(result.jobId);
      else { setPackageId(result.packageId); setBusy(false); setNotice("本课已有发布版本，可以直接预览。"); }
    } catch (failure) { if (live.current) { setError(failure.message); setBusy(false); } }
  };
  const manage = async (action) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/admin/study/packages/${selected.id}/${action}`, {}); await reload();
      if (live.current) { setJob(null); setNotice(action === "publish" ? "本课讲解、填空题和解析已一起发布，会员可以学习了。" : "内容已下架，学习接口会停止提供这份内容。"); }
    } catch (failure) { if (live.current) setError(failure.message); }
    finally { if (live.current) setBusy(false); }
  };
  return <div className="subjective-study ss-admin">
    <header className="ss-heading"><div><h2>精讲与练习内容</h2><p>逐节生成讲解和题目；AI 复核通过后自动上架，未通过的留在待修队列。</p></div><div className="ss-actions">{navigate && <button onClick={() => navigate("study")}><ArrowLeft size={17} />查看会员学习页</button>}<button disabled={busy || publishBusy} onClick={() => void reload().catch((failure) => setError(failure.message))}><RefreshCw size={17} />刷新</button></div></header>
    {error && <div className="ss-notice ss-error" role="alert"><TriangleAlert size={17} /><span>{error}</span></div>}
    {notice && <div className="ss-notice" role="status"><CircleCheckIcon /><span>{notice}</span></div>}
    {!data ? <ContentPlaceholder variant="list" rows={5} /> : <>
      <section className="ss-bulk-panel" aria-label="全科课程生成">
        <div><h3>{course?.name || "当前课程"}全科目录</h3><p>{course?.chapterCount || 0} 章 · {course?.topicCount || 0} 个知识点 · {courseNodes.length} 节课。每个小节独立学习和练习。</p>
          <p>每次只生成一节；AI 确认讲解正确、符合知识点且题目通过审核后自动上架。新任务每日上限 {data.configuredDailyGenerationLimit ?? data.dailyGenerationLimit} 节。全部课程当前 {queuedCount} 节排队、{pendingCount - queuedCount} 节正在生成、{reviewCount} 节待上架、{publishCount} 节已发布。</p>
          {bulkResult && <p className="ss-bulk-source-note">本批 {bulkResult.questionBacked} 节有已复核题目、{bulkResult.curriculumBacked || 0} 节有已核对课程稿可参考；{bulkResult.outlineOnly} 节仅有考纲范围，审核时请重点核对。预计分 {bulkResult.batchesApproxDays} 天执行。</p>}
        </div>
        <div className="ss-actions">
          {queuedCount > 0 && <button disabled={runQueueBusy || bulkBusy} onClick={() => void runQueued()}>{runQueueBusy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{runQueueBusy ? "正在启动" : `逐节处理剩余 ${queuedCount} 节`}</button>}
          {reviewCount > 0 && <button disabled={publishBusy || bulkBusy || runQueueBusy} onClick={() => void publishAccepted()}>{publishBusy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{publishBusy ? "逐节上架中" : `上架已通过审核的 ${reviewCount} 节`}</button>}
          <button className="primary" disabled={bulkBusy || !courseNodes.length} onClick={() => void bulk()}>{bulkBusy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{bulkBusy ? "正在排入队列" : "排队生成当前科目课程"}</button>
        </div>
      </section>
      <div className="ss-admin-layout">
        <form className="ss-production" onSubmit={generate}><h3><Sparkles size={19} />生成讲解与题目</h3>
          <label htmlFor="ss-admin-course">课程科目</label><select id="ss-admin-course" disabled={busy || bulkBusy} value={node?.certificateId || ""} onChange={(event) => { setNodeId(data.nodes.find((item) => item.certificateId === event.target.value)?.id || ""); setBulkResult(null); }}>{data.courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label htmlFor="ss-admin-node">章节、知识点与小节</label><select id="ss-admin-node" disabled={busy || bulkBusy} value={nodeId} onChange={(event) => setNodeId(event.target.value)}>{courseNodes.map((item) => <option key={item.id} value={item.id}>{item.chapter} / {item.parentName ? `${item.parentName} · 第${item.sublesson.order}节 ${item.sublesson.title}` : item.name}</option>)}</select>
          {node && <p className="ss-muted">本课范围：{node.scope}{node.sublesson && " 本节独立生成、审核和发布。"}</p>}
          <label htmlFor="ss-reference">已确认的参考资料</label><textarea id="ss-reference" rows={10} maxLength={6000} disabled={busy || referenceLoading} value={reference} onChange={(event) => { referenceTouched.current = true; setReference(event.target.value); }} placeholder="粘贴已确认的知识说明、教材要点或参考题解析。请注明来源和版本。" />
          <p className="ss-muted">{referenceLoading ? "正在读取本课参考资料…" : "系统会附上考纲范围与已核对课程稿或匹配的复核题；你也可以补充教材要点。AI 会重点审核知识讲解是否正确、是否符合当前小节，再检查题目和解析。"}</p>
          <button className="primary" disabled={busy || referenceLoading || reference.trim().length < 30}>{busy ? <LoaderCircle className="spin" size={17} /> : <Sparkles size={17} />}{busy ? "正在准备" : packages.length > 0 ? "生成新版本" : "生成讲解与填空题"}</button>
          {job && <div className="ss-job-state" role="status"><strong>{job.stage}</strong><p>离开页面后任务仍会继续。{job.status === "rejected" && "请查看审核意见，补充资料后重新生成。"}</p></div>}
        </form>
        <section className="ss-production-preview" aria-label="课程预览"><h3><Eye size={19} />预览与发布</h3>
          {packages.length > 0 && <label htmlFor="ss-package-version">内容版本<select id="ss-package-version" value={selected?.id || ""} disabled={busy} onChange={(event) => setPackageId(event.target.value)}>{packages.map((item) => <option key={item.id} value={item.id}>{date(item.created_at)} · {stateNames[item.status]}</option>)}</select></label>}
          {selected ? <><div className="ss-publication-status"><ShieldCheck size={17} /><span>{stateNames[selected.status]}</span></div><LessonContent lesson={selected.data.bundle.lesson} />
            <section className="ss-review-summary" aria-label={authoredReview ? "知识讲解课程稿核对" : "知识讲解 AI 审核"}>
              <h3>{authoredReview ? "知识讲解课程稿核对" : "知识讲解 AI 审核"}</h3>
              <dl><div><dt>知识正确性</dt><dd className={lessonReview.knowledgeCorrect === false ? "ss-error" : ""}>{reviewLabel(lessonReview.knowledgeCorrect)}</dd></div><div><dt>知识点匹配</dt><dd className={lessonReview.nodeAligned === false ? "ss-error" : ""}>{reviewLabel(lessonReview.nodeAligned)}</dd></div></dl>
              <p>{lessonReview.reason}</p>
              {authoredReview && <p className="ss-muted">本站原创课程稿经 Codex 按考纲核对；此记录来自课程编写，不是平台上游 AI 的独立审核。</p>}
              {!reviewAccepted && <p className="ss-error">本版审核未通过或结果不完整。请按审核意见补充参考资料，生成新版本后再发布。</p>}
            </section>
            <details className="ss-review-detail"><summary>查看审核参考资料</summary><pre>{selected.data.reference}</pre></details>
            <h3>配套填空题 · {selected.data.bundle.questions.length} 道</h3>
            {selected.data.bundle.questions.map((question, i) => {
              const verdict = selected.data.review.questions.find((row) => row.id === question.id);
              return <details key={question.id} className="ss-question-preview"><summary>第 {i + 1} 题 · {question.stage} · {questionAccepted(verdict) ? "审核通过" : "需要修正"}</summary><Stem question={question} /><ul>{question.blanks.map((blank, j) => <li key={blank.id}>第 {j + 1} 空：{blank.answer}{blank.unit}{blank.aliases.length > 0 && `；等价答案：${blank.aliases.join("、")}`}</li>)}</ul><p>解析：{question.explanation}</p><p>提示：{question.hint}</p><p>知识点匹配：{reviewLabel(verdict?.nodeAligned)}</p><p className="ss-muted">审核：{verdict?.reason || "审核结果不完整"}</p></details>;
            })}
            <div className="ss-actions ss-publish-actions">{(selected.status === "awaiting_review" || (selected.status === "published" && !selected.current)) && <button className="primary" disabled={busy || !reviewAccepted} onClick={() => void manage("publish")}><Check size={17} />{selected.status === "published" ? "切换为当前版本" : "发布这份内容"}</button>}{selected.status === "published" && <button disabled={busy} onClick={() => void manage("suspend")}><TriangleAlert size={17} />下架这份内容</button>}{selected.current && <span className="ss-muted">当前提供给会员的版本</span>}</div>
          </> : <div className="ss-state"><BookPlaceholder /><h3>本课还没有内容</h3><p>确认左侧资料后，生成讲解和练习。通过 AI 审核的版本会在这里等待发布。</p></div>}
        </section>
      </div>
      <section className="ss-feedback-queue"><h2>待处理的判分复核</h2>{data.feedback.filter((item) => item.status === "open").length ? data.feedback.filter((item) => item.status === "open").map((item) => <GradeReview key={item.id} feedback={item} packages={data.packages} reload={reload} />) : <p className="ss-muted">目前没有待处理的复核申请。</p>}</section>
    </>}
  </div>;
}

function CircleCheckIcon() { return <Check size={17} />; }
function BookPlaceholder() { return <Eye size={26} />; }
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
