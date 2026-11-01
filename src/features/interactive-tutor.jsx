import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  MessageCircle,
  RefreshCw,
  Search,
} from "lucide-react";
import { api, invalidateApiCache } from "../api.js";
import { render, validate } from "../generated/tutor-renderer.js";
import { ChapterArt } from "../components/chapter-art.jsx";
import { KnowledgeFavoriteButton } from "../components/knowledge-favorite.jsx";
import { StudyTeacher } from "../components/study-lesson.jsx";
import "./interactive-tutor-base.css";
import "./interactive-tutor.css";

const phases = {
  explanation: "学习一个概念",
  awaiting_answer: "检验理解",
  feedback: "看看这次判断",
  remediation: "针对错因补课",
  variant: "换个场景验证",
  complete: "本课学习总结",
};
const prefix = "/tutor/v1";
export function InteractiveTutor({ user, navigate, initialNodeId, readNode }) {
  const [catalog, setCatalog] = useState(null),
    [selected, setSelected] = useState(initialNodeId || ""),
    [chapter, setChapter] = useState(""),
    [search, setSearch] = useState("");
  const [session, setSession] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [foundation, setFoundation] = useState("beginner");
  const [diagramSources, setDiagramSources] = useState({}),
    [played, setPlayed] = useState({}),
    [review, setReview] = useState(false),
    [confirmRestart, setConfirmRestart] = useState(false);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const generation = useRef(0),
    pending = useRef(null),
    choice = useRef(""),
    alive = useRef(true);
  const node = catalog?.nodes.find((n) => n.id === selected);
  const chapters = [...new Set((catalog?.nodes || []).map((n) => n.chapter))];
  const activeChapter = chapters.includes(chapter)
    ? chapter
    : node?.chapter || chapters[0] || "";
  const list = (catalog?.nodes || []).filter(
    (n) =>
      n.chapter === activeChapter &&
      (n.name + " " + n.section)
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  async function refreshCatalog() {
    const data = await api(prefix + "/catalog", undefined, undefined, {
      cache: false,
    });
    if (!alive.current) return data;
    setCatalog(data);
    setSelected(
      (old) =>
        data.nodes.find((n) => n.id === old)?.id ||
        data.nodes.find((n) => n.progress && !n.progress.completed)?.id ||
        data.nodes.find((n) => n.status === "ready")?.id ||
        data.nodes[0]?.id ||
        "",
    );
    return data;
  }
  useEffect(() => {
    alive.current = true;
    refreshCatalog()
      .catch((e) => {
        if (alive.current) setFailure(e.message);
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => {
      alive.current = false;
      generation.current++;
    };
  }, []);
  function take(s) {
    validate(s.lesson);
    if (s.review) validate(s.review);
    if (!phases[s.phase] || s.pacing !== "guided")
      throw new Error("课程状态无法识别，请重新连接。");
    setSession(s);
    setTeacherOpen(false);
    choice.current = "";
    setReview(false);
    setPlayed({});
  }
  useEffect(() => {
    const epoch = ++generation.current;
    pending.current = null;
    setSession(null);
    setTeacherOpen(false);
    setBusy(false);
    setFailure("");
    setConfirmRestart(false);
    choice.current = "";
    if (!node?.courseId) return;
    setLoading(true);
    api(
      prefix +
        "/sessions/current?courseId=" +
        encodeURIComponent(node.courseId),
      undefined,
      undefined,
      { cache: false },
    )
      .then((data) => {
        if (epoch === generation.current) {
          if (data.session) take(data.session);
        }
      })
      .catch((e) => {
        if (epoch === generation.current) setFailure(e.message);
      })
      .finally(() => {
        if (epoch === generation.current) setLoading(false);
      });
  }, [node?.courseId]);
  async function reconnect() {
    setLoading(true);
    setFailure("");
    const epoch = generation.current;
    try {
      const data = await refreshCatalog();
      if (epoch !== generation.current) return false;
      if (!data.access) {
        setSession(null);
        return true;
      }
      if (node?.courseId) {
        const current = await api(
          prefix +
            "/sessions/current?courseId=" +
            encodeURIComponent(node.courseId),
          undefined,
          undefined,
          { cache: false },
        );
        if (epoch === generation.current && current.session)
          take(current.session);
      }
      if (epoch === generation.current) pending.current = null;
      return epoch === generation.current;
    } catch (e) {
      if (epoch === generation.current) setFailure(e.message);
      return false;
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }
  async function operation(action, optionId, restart = false) {
    if (busy || !node?.courseId) return;
    const epoch = generation.current;
    setBusy(true);
    setFailure("");
    try {
      if (pending.current) {
        const old = pending.current.body;
        const different = old.courseId
          ? old.foundation !== foundation || old.restart !== restart
          : old.action !== action || old.optionId !== optionId;
        if (different) {
          if (await reconnect()) {
            pending.current = null;
            setFailure("已恢复当前步骤，请确认当前选择后再提交。");
          }
          return;
        }
      }
      if (!pending.current)
        pending.current =
          session && !restart
            ? {
                url: `${prefix}/sessions/${session.id}/actions`,
                body: {
                  requestId: crypto.randomUUID(),
                  revision: session.revision,
                  action,
                  ...(optionId ? { optionId } : {}),
                },
              }
            : {
                url: prefix + "/sessions",
                body: {
                  requestId: crypto.randomUUID(),
                  courseId: node.courseId,
                  foundation,
                  pacing: "guided",
                  restart,
                },
              };
      const request = pending.current,
        data = await api(request.url, request.body);
      if (epoch !== generation.current) return;
      take(data.session);
      pending.current = null;
      setConfirmRestart(false);
      if (data.session.phase === "complete") {
        invalidateApiCache("/study/catalog");
        await refreshCatalog();
      }
    } catch (e) {
      if (epoch !== generation.current) return;
      setFailure(e.message);
      if (e.status >= 400 && e.status < 500) {
        pending.current = null;
        if (
          [
            "TUTOR_CONFLICT",
            "TUTOR_VERSION_CHANGED",
            "STUDY_CONTENT_SUSPENDED",
          ].includes(e.code)
        ) {
          setSession(null);
          await reconnect();
        }
      }
      if (e.code === "STUDY_MEMBERSHIP_REQUIRED") {
        setSession(null);
        await reconnect();
      }
    } finally {
      if (epoch === generation.current) setBusy(false);
    }
  }
  const lesson = review && session?.review ? session.review : session?.lesson;
  useEffect(() => {
    if (!catalog?.access || !catalog.expiresAt) return;
    const expiry = Date.parse(catalog.expiresAt);
    if (!Number.isFinite(expiry)) return;
    let timer;
    const checkExpiry = () => {
      const remaining = expiry - Date.now();
      if (remaining > 0) {
        timer = setTimeout(checkExpiry, Math.min(remaining, 2147483647));
        return;
      }
      setSession(null);
      setCatalog((old) => ({ ...old, access: false, nodes: [] }));
      void refreshCatalog().catch(() => {});
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [catalog?.access, catalog?.expiresAt]);
  const html = useMemo(
    () =>
      lesson
        ? render(lesson, {
            selection: choice.current,
            busy,
            interactive:
              session.phase === "explanation" ||
              session.phase === "remediation",
            diagramSources,
            played,
          })
        : "",
    [lesson, busy, diagramSources, played],
  );
  function diagram(event) {
    const target = event.target.closest('[data-tutor-action="broadcast"]');
    if (
      !target ||
      busy ||
      !["explanation", "remediation"].includes(session?.phase)
    )
      return;
    const id = target.dataset.diagram,
      source = target.dataset.source;
    const card = lesson.components.find(
      (c) => c.id === id && c.type === "NetworkDiagram",
    );
    if (!card || !card.hosts.some((h) => h.id === source)) return;
    setDiagramSources((old) => ({ ...old, [id]: source }));
    setPlayed((old) => ({ ...old, [id]: true }));
  }
  function submit(event) {
    event.preventDefault();
    const id = new FormData(event.target).get("tutor-answer");
    const quiz = session?.lesson.components.find((c) => c.type === "MiniQuiz");
    if (!quiz?.options.some((o) => o.id === id)) {
      setFailure("先选择一个答案，再提交。");
      return;
    }
    choice.current = id;
    operation("answer", id);
  }
  return (
    <section className="formal-tutor">
      <header className="formal-tutor-heading">
        <div>
          <h1>AI 互动精讲</h1>
          <p>学一个概念，练一道小题，再确认自己掌握了。</p>
        </div>
        <button onClick={() => readNode(node?.id)} disabled={busy}>
          <BookOpen size={17} />
          文字精讲与填空练习
        </button>
      </header>
      {failure && (
        <div className="formal-tutor-error" role="alert">
          <span>{failure}</span>
          <button disabled={busy} onClick={reconnect}>
            <RefreshCw size={16} />
            重新连接
          </button>
        </div>
      )}
      {!catalog ? (
        <p role="status">
          {loading ? "正在读取课程…" : "课程暂时不可用，请重新连接。"}
        </p>
      ) : !catalog.access ? (
        <section className="formal-tutor-gate">
          <h2>选择适合自己的学习额度</h2>
          <p>互动精讲与现有知识点课程使用同一会员权限，学习记录随账号保存。</p>
          <button onClick={() => navigate("vip")}>
            查看 VIP 会员
            <ArrowRight size={17} />
          </button>
        </section>
      ) : !catalog.supported ? (
        <section className="formal-tutor-gate">
          <h2>当前证书的互动课正在准备</h2>
          <p>{catalog.nodes.length ? "已有精讲、填空练习和答疑仍可继续使用。" : "当前可以使用章节练习与模拟考试；这类证书的精讲课程尚未开放。"}</p>
          <button onClick={() => catalog.nodes.length ? readNode() : navigate("chapters")}>
            {catalog.nodes.length ? "进入已有精讲" : "进入章节练习"}
            <ArrowRight size={17} />
          </button>
        </section>
      ) : (
        <div className="formal-tutor-layout">
          <nav className="formal-tutor-directory" aria-label="互动精讲目录">
            <h2>章节目录</h2>
            <select
              aria-label="互动精讲章节"
              value={activeChapter}
              disabled={busy}
              onChange={(e) => {
                setChapter(e.target.value);
                setSearch("");
                const first =
                  catalog.nodes.find(
                    (n) => n.chapter === e.target.value && n.courseId,
                  ) || catalog.nodes.find((n) => n.chapter === e.target.value);
                if (first) setSelected(first.id);
              }}
            >
              {chapters.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <label>
              <Search size={17} />
              <input
                type="search"
                aria-label="搜索互动知识点"
                placeholder="搜索知识点"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {list.map((n) => (
              <button
                key={n.id}
                disabled={busy}
                className={n.id === node?.id ? "selected" : ""}
                aria-current={n.id === node?.id ? "page" : undefined}
                onClick={() => setSelected(n.id)}
              >
                <strong>{n.name}</strong>
                <small>
                  {n.progress?.mastered
                    ? "本课已掌握"
                    : n.progress?.completed
                      ? "已学习，待巩固"
                      : n.progress
                        ? "继续学习"
                        : n.status === "ready"
                          ? "完整互动课"
                          : n.status === "partial"
                            ? "互动示范 · 部分考点"
                            : "文字精讲 · 互动课准备中"}
                </small>
              </button>
            ))}
            <p>
              当前有 {catalog.nodes.filter((n) => n.status === "ready").length}{" "}
              节完整互动课；其余知识点保留文字精讲。
            </p>
          </nav>
          <section className="formal-tutor-workspace">
            <header className="formal-tutor-lesson-heading blue-art-trigger">
              <ChapterArt
                certificateId={user.certificateId}
                title={node?.chapter}
              />
              <div>
                <small>
                  {node?.chapter} / {node?.section}
                </small>
                <h2>{node?.courseTitle || node?.name}</h2>
                {node?.status === "partial" && (
                  <small>
                    关联知识点：{node.name} · 本课覆盖广播域与 Access 端口
                  </small>
                )}
              </div>
              <KnowledgeFavoriteButton id={node?.id} disabled={busy} />
              <button
                disabled={!session || busy}
                aria-expanded={teacherOpen}
                aria-controls="formal-tutor-teacher"
                onClick={() => setTeacherOpen((open) => !open)}
              >
                <MessageCircle size={17} />
                {teacherOpen ? "收起 AI 老师" : "问 AI 老师"}
              </button>
            </header>
            {teacherOpen && session && (
              <div className="formal-tutor-teacher" id="formal-tutor-teacher">
                <StudyTeacher
                  key={`${session.id}:${session.revision}`}
                  node={node}
                  packageId={session.id}
                  onAccessDenied={reconnect}
                  transport={{
                    historyPath: `${prefix}/sessions/${session.id}/teacher`,
                    askPath: `${prefix}/sessions/${session.id}/teacher`,
                    revision: session.revision,
                    quizPending: ["awaiting_answer", "variant"].includes(
                      session.phase,
                    ),
                    blocked: ["awaiting_answer", "variant"].includes(
                      session.phase,
                    )
                      ? "先完成当前小测，再让老师针对你的作答讲解。现在仍可回看提示。"
                      : !session.teacherConfigured
                        ? "AI 服务暂未配置，仍可回看本步讲解与例子。"
                        : "",
                  }}
                />
              </div>
            )}
            {!node?.courseId ? (
              <div className="formal-tutor-gate">
                <h3>这一节的互动内容正在制作</h3>
                <p>你可以继续学习已有的分段精讲与填空练习。</p>
                <button onClick={() => readNode(node?.id)}>
                  阅读这个知识点
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : loading ? (
              <p role="status">正在恢复学习位置…</p>
            ) : !session ? (
              <div className="formal-tutor-start">
                <h3>先选择自己的基础</h3>
                <div role="group" aria-label="学习基础">
                  <button
                    aria-pressed={foundation === "beginner"}
                    onClick={() => setFoundation("beginner")}
                  >
                    从术语和基础开始
                  </button>
                  <button
                    aria-pressed={foundation === "review"}
                    onClick={() => setFoundation("review")}
                  >
                    已有基础，直接复习
                  </button>
                </div>
                <p>
                  每次只展开当前一步。小测由服务端按标准答案判分，错项会进入对应补课。
                </p>
                <button disabled={busy} onClick={() => operation("start")}>
                  {busy ? "正在准备…" : "开始互动学习"}
                  <ArrowRight size={17} />
                </button>
              </div>
            ) : (
              <div
                className="tutor-shell"
                data-phase={session.phase}
                data-session-id={session.id}
                data-revision={session.revision}
              >
                <div className="formal-tutor-phase">
                  <span>{phases[session.phase]}</span>
                  {session.reading && (
                    <small>
                      讲解 {session.reading.index + 1} / {session.reading.total}{" "}
                      · {session.reading.title}
                    </small>
                  )}
                </div>
                <div
                  className="formal-tutor-cards"
                  onClick={diagram}
                  onSubmit={submit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && e.target.name === "tutor-answer") {
                      e.preventDefault();
                      e.target.form.requestSubmit();
                    }
                  }}
                  onInput={(e) => {
                    if (e.target.name === "tutor-answer")
                      choice.current = e.target.value;
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                <div className="formal-tutor-actions">
                  {review ? (
                    <button onClick={() => setReview(false)}>
                      回到当前练习
                    </button>
                  ) : (
                    <>
                      {session.pacing === "guided" &&
                        session.phase === "explanation" &&
                        session.reading?.index > 0 && (
                          <button
                            disabled={busy}
                            onClick={() => operation("back")}
                          >
                            <ArrowLeft size={16} />
                            上一步讲解
                          </button>
                        )}
                      {session.review && (
                        <button disabled={busy} onClick={() => setReview(true)}>
                          <BookOpen size={16} />
                          回看当前概念
                        </button>
                      )}
                      {session.phase !== "complete" &&
                        !["awaiting_answer", "variant"].includes(
                          session.phase,
                        ) && (
                          <button
                            className="formal-tutor-primary"
                            disabled={busy}
                            onClick={() => operation("next")}
                          >
                            {busy ? "正在保存…" : session.nextLabel}
                            <ArrowRight size={17} />
                          </button>
                        )}
                    </>
                  )}
                  {session.phase === "complete" && !confirmRestart && (
                    <button
                      disabled={busy}
                      onClick={() => setConfirmRestart(true)}
                    >
                      重新学习这节课
                    </button>
                  )}
                  {confirmRestart && (
                    <>
                      <span>重新开始会保留上一轮记录。</span>
                      <button
                        disabled={busy}
                        onClick={() => operation("start", undefined, true)}
                      >
                        确认重新开始
                      </button>
                      <button onClick={() => setConfirmRestart(false)}>
                        继续回顾
                      </button>
                    </>
                  )}
                </div>
                <p className="formal-tutor-save-note">
                  作答与步骤自动保存。
                  {node.status === "partial"
                    ? "这节示范仅覆盖部分考点，完成后不会标记整个知识点已掌握。"
                    : "通过所有概念的变式检验后，记录本课掌握进度。"}
                </p>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
