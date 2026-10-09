import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  GraduationCap,
  RotateCcw,
} from "lucide-react";
import { api } from "../api.js";
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
import { useExamSession } from "../use-exam-session.js";
import {
  buildVeterinaryGroups,
  isSingleSelect,
  questionTextForGroup,
  questionTypeName,
} from "../question-utils.js";
import {
  QuestionFavorite,
  QuestionImages,
  QuestionOrigin,
  QuestionReport,
} from "../components/question-tools.jsx";
import { Heading, IconButton } from "../components/study-ui.jsx";

export function ExamView({ run, refresh, dashboard }) {
  const [customScope, setCustomScope] = useState(true),
    [selectedChapters, setSelectedChapters] = useState([]);
  const [examCatalog, setExamCatalog] = useState(null),
    [catalogError, setCatalogError] = useState("");
  const [catalogRevision, setCatalogRevision] = useState(0);
  const [count, setCount] = useState(20);
  const {
    exam,
    answers,
    index,
    setIndex,
    result,
    remaining,
    submitting,
    start,
    submit,
    reset,
    recent,
    resume,
    loading,
    loadError,
    retryLoad,
    choose,
    save,
    saveState,
    resolveConflict,
  } = useExamSession({
    userId: dashboard.user?.id || "local",
    certificateId: dashboard.certificate?.id,
    run,
    refresh,
  });
  const examBlueprint = (exam ? !exam.custom : !customScope)
    ? dashboard.syllabus?.examBlueprint
    : null;
  const examModules = dashboard.syllabus?.modules || [];
  const selectedAvailable = (examCatalog?.chapters || [])
    .filter((chapter) => selectedChapters.includes(chapter.name))
    .reduce((sum, chapter) => sum + chapter.questionCount, 0);
  useEffect(() => {
    let live = true;
    setCatalogError("");
    setExamCatalog(null);
    api("/exams/catalog")
      .then((data) => {
        if (!live) return;
        setExamCatalog(data);
        setSelectedChapters((current) =>
          current.filter((name) =>
            data.chapters.some((chapter) => chapter.name === name),
          ),
        );
      })
      .catch((error) => {
        if (live) setCatalogError(error.message);
      });
    return () => {
      live = false;
    };
  }, [dashboard.certificate?.id, catalogRevision]);
  const begin = () =>
    run("正在创建模拟考试", async () => {
      start(
        await api("/exams", {
          count: examBlueprint?.questionCount || count,
          ...(customScope ? { chapters: selectedChapters } : {}),
        }),
      );
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
            <div
              className={
                "exam-result-status " + (result.passed ? "passed" : "failed")
              }
            >
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
          <button className="primary" onClick={reset}>
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
              四科合计达到 {examBlueprint.passingScore}{" "}
              分即可通过，单科不设最低分。
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
            customScope && !exam
              ? "多选大知识点组合试卷 · 限时作答 · 交卷后查看成绩与解析"
              : examBlueprint
                ? `${dashboard.syllabus.version} · 四大科目各抽 ${examBlueprint.questionsPerModule} 题 · 总分 ${examBlueprint.passingScore} 分及格`
                : dashboard.syllabus
                  ? `${dashboard.syllabus.version} 考点 · 按本站练习配比分层抽题 · 交卷后统一评分`
                  : "当前证书题库 · 限时作答 · 交卷后统一评分"
          }
        />
        {loading && !recent.length && <ContentPlaceholder variant="list" rows={2} />}
        {loadError && (
          <div className="exam-sync-message error" role="alert">
            <span>{loadError}</span>
            <button onClick={retryLoad}>重试读取考试</button>
          </div>
        )}
        {!!recent.length && (
          <section className="exam-resume-list" aria-label="未完成的考试">
            <h2>继续上次考试</h2>
            {recent.map((item) => (
              <button key={item.id} onClick={() => resume(item)}>
                <span>
                  {item.count} 题 · 已答 {item.answeredCount} 题
                </span>
                <span>
                  {Date.parse(item.expiresAt) > Date.now()
                    ? "继续作答"
                    : "查看考试结果"}
                </span>
              </button>
            ))}
          </section>
        )}
        <div className="study-exam-setup">
          <section className="exam-scope-panel">
            <div className="exam-scope-heading">
              <h2>考试范围</h2>
              <div className="exam-scope-modes">
                <button
                  className={customScope ? "active" : ""}
                  onClick={() => setCustomScope(true)}
                >
                  自选知识点
                </button>
                <button
                  className={!customScope ? "active" : ""}
                  onClick={() => setCustomScope(false)}
                >
                  全范围模拟
                </button>
              </div>
            </div>
            {customScope && (
              <>
                <div className="exam-scope-caption">
                  <span>
                    已选 {selectedChapters.length} 个大知识点 ·{" "}
                    {selectedAvailable} 道可考题目
                  </span>
                  <button
                    onClick={() =>
                      setSelectedChapters(
                        selectedChapters.length === examCatalog?.chapters.length
                          ? []
                          : (examCatalog?.chapters || []).map(
                              (chapter) => chapter.name,
                            ),
                      )
                    }
                  >
                    {selectedChapters.length === examCatalog?.chapters.length
                      ? "取消全选"
                      : "全选"}
                  </button>
                </div>
                {catalogError ? (
                  <p className="alert error">
                    {catalogError}{" "}
                    <button
                      onClick={() => setCatalogRevision((value) => value + 1)}
                    >
                      重新加载
                    </button>
                  </p>
                ) : !examCatalog ? (
                  <ContentPlaceholder variant="list" rows={3} />
                ) : !examCatalog.chapters.length ? (
                  <p>当前题库暂无可用于考试的客观题。</p>
                ) : (
                  <div className="exam-scope-grid">
                    {examCatalog.chapters.map((chapter) => (
                      <label
                        key={chapter.name}
                        className={
                          selectedChapters.includes(chapter.name)
                            ? "selected"
                            : ""
                        }
                      >
                        <input
                          type="checkbox"
                          checked={selectedChapters.includes(chapter.name)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelectedChapters((current) =>
                              checked
                                ? [...new Set([...current, chapter.name])]
                                : current.filter(
                                    (name) => name !== chapter.name,
                                  ),
                            );
                          }}
                        />
                        <span>
                          <strong>{chapter.name}</strong>
                          <small>{chapter.questionCount} 道可考题目</small>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
          <section className="exam-intro exam-composition">
            <GraduationCap size={52} />
            <h2>本次模拟考试</h2>
            <p className="study-exam-summary">
              {customScope
                ? `已选 ${selectedChapters.length} 个知识分类`
                : `${dashboard.certificate.shortName} · 全范围模拟`}
            </p>
            {dashboard.syllabus && !customScope && (
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
                  <strong>
                    {Math.round(examBlueprint.durationMinutes / 60)} 小时
                  </strong>
                </div>
              </div>
            ) : (
              <div className="exam-settings">
                <label>
                  试题数量
                  <select
                    value={count}
                    onChange={(e) => setCount(+e.target.value)}
                  >
                    {[10, 20, 30, 50].map((n) => (
                      <option key={n} value={n}>
                        {n} 题
                      </option>
                    ))}
                  </select>
                </label>
                <div>
                  <span>考试时间</span>
                  <strong>
                    {(customScope
                      ? Math.min(count, selectedAvailable)
                      : count) * 2}{" "}
                    分钟
                  </strong>
                </div>
              </div>
            )}
            {customScope && (
              <p className="exam-blueprint-note">
                仅从所选知识点抽题，题量不足时使用现有题目。共用材料题保留完整题组，实际题量以试卷为准。
              </p>
            )}
            {customScope && count < selectedChapters.length && (
              <p className="alert">请增加题量，覆盖所有已选知识点。</p>
            )}
            <button
              className="primary"
              disabled={
                loading ||
                (customScope &&
                  (!selectedAvailable || count < selectedChapters.length))
              }
              onClick={begin}
            >
              开始考试
              <ArrowRight size={18} />
            </button>
          </section>
        </div>
      </>
    );
  const q = exam.questions[index],
    selected = answers[q.id] || [];
  const examGroups =
    dashboard.certificate?.id === "veterinary-practitioner"
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
      <div
        className={`exam-sync-message ${["error", "conflict", "expired"].includes(saveState) ? "error" : ""}`}
        role={saveState === "conflict" ? "alert" : "status"}
      >
        <span>
          {
            {
              saved: "答案已保存",
              pending: "正在准备保存答案…",
              saving: "正在保存答案…",
              error: "答案暂未同步，请检查网络后重试；离开前请确认保存成功。",
              conflict:
                "其他页面已更新这场考试。请选择使用已同步答案，或合并本机未同步的作答。",
              expired: "考试时间已到，成绩以截止前保存的答案为准。",
            }[saveState]
          }
        </span>
        {saveState === "error" && (
          <button onClick={() => void save()}>重试保存</button>
        )}
        {saveState === "conflict" && (
          <>
            <button onClick={() => resolveConflict("server")}>
              使用已同步答案
            </button>
            <button onClick={() => resolveConflict("local")}>
              合并本机作答
            </button>
          </>
        )}
      </div>
      <div className="practice-layout">
        <section className="question-panel">
          <span className="badge">
            第 {index + 1} 题 · {questionTypeName(q, true)}
          </span>
          {examGroup?.shared && (
            <section className={`vet-shared-card ${examGroup.kind || "stem"}`}>
              <div className="vet-shared-card-head">
                <span>
                  {examGroup.kind === "options"
                    ? "共用备选答案"
                    : "共用题干 / 病例材料"}
                </span>
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
                    <span>
                      {answers[exam.questions[questionIndex].id]?.length
                        ? "已作答"
                        : "待作答"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          <QuestionImages question={q} />
          <h2 className="question-text">
            {questionTextForGroup(q, examGroup) || q.question}
          </h2>
          <QuestionOrigin question={q} />
          <div className="options">
            {Object.entries(q.options).map(([k, v]) => (
              <button
                disabled={remaining === 0 || submitting}
                className={"option " + (selected.includes(k) ? "chosen" : "")}
                key={k}
                onClick={() =>
                  choose(
                    q.id,
                    isSingleSelect(q)
                      ? [k]
                      : selected.includes(k)
                        ? selected.filter((x) => x !== k)
                        : [...selected, k],
                  )
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
