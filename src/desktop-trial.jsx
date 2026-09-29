import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  GraduationCap,
  LoaderCircle,
  Sparkles,
  Target,
  X,
} from "lucide-react";

export function DesktopTrial({ api, Dialog, onJoin, authenticated }) {
  const [trial, setTrial] = useState(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState("");
  const [summary, setSummary] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reader, setReader] = useState(null);
  const submitting = useRef(false);

  const load = async () => {
    setBusy("load");
    setError("");
    try {
      const result = await api("/guest-trial");
      setTrial(result);
      const next = result.questions.findIndex((question) => !question.attempt);
      setIndex(next < 0 ? 0 : next);
      setSelected("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    let active = true;
    setBusy("load");
    api("/guest-trial")
      .then((result) => {
        if (!active) return;
        setTrial(result);
        const next = result.questions.findIndex(
          (question) => !question.attempt,
        );
        setIndex(next < 0 ? 0 : next);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [api]);

  const questions = trial?.questions || [];
  const question = questions[index];
  const completed = questions.filter((item) => item.attempt).length;
  const correct = questions.filter((item) => item.attempt?.correct).length;
  const wrong = questions.filter(
    (item) => item.attempt && !item.attempt.correct,
  );
  const chooseQuestion = (next) => {
    setIndex(next);
    setSelected("");
    setSummary(false);
    setError("");
  };
  const submit = async () => {
    if (!selected || !question || question.attempt || submitting.current)
      return;
    submitting.current = true;
    setBusy("answer");
    setError("");
    try {
      setTrial(
        await api(
          `/guest-trial/questions/${encodeURIComponent(question.id)}/answer`,
          { selected },
        ),
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
      submitting.current = false;
    }
  };
  const readAI = async (item, action) => {
    if (submitting.current) return;
    const cached = item.ai?.[action];
    setReader({
      question: item,
      action,
      text: cached?.text || "",
      loading: !cached,
      error: "",
    });
    if (cached) return;
    submitting.current = true;
    setBusy("ai");
    try {
      const result = await api(
        `/guest-trial/questions/${encodeURIComponent(item.id)}/ai`,
        { action },
      );
      setTrial((previous) => ({
        ...previous,
        questions: previous.questions.map((candidate) =>
          candidate.id === item.id
            ? { ...candidate, ai: { ...candidate.ai, [action]: result } }
            : candidate,
        ),
      }));
      setReader((previous) =>
        previous ? { ...previous, text: result.text, loading: false } : null,
      );
    } catch (failure) {
      setReader((previous) =>
        previous
          ? { ...previous, loading: false, error: failure.message }
          : null,
      );
    } finally {
      setBusy("");
      submitting.current = false;
    }
  };
  const joinLabel = authenticated ? "返回学习空间" : "创建账号，继续学习";
  const join = () => {
    setReader(null);
    onJoin();
  };

  return (
    <section
      className="desk-demo desk-trial"
      id="desk-guest-trial"
      aria-label="免登录免费体验五道题"
    >
      <div className="desk-demo-bar">
        <span>
          <span className="desk-status-dot" />
          免登录体验
        </span>
        <span>{trial?.certificate || "软考网络工程师"} · 5 道题</span>
      </div>
      {!trial ? (
        <div className="desk-trial-loading" role="status">
          {error ? (
            <>
              <p>{error}</p>
              <button className="desk-button desk-secondary" onClick={load}>
                重新加载体验题
              </button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" size={24} />
              <p>正在准备你的 5 道体验题…</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="desk-trial-progress">
            <div aria-label="体验题导航">
              {questions.map((item, position) => (
                <button
                  key={item.id}
                  className={`${position === index && !summary ? "is-current" : ""} ${item.attempt ? (item.attempt.correct ? "is-right" : "is-missed") : ""}`}
                  aria-label={`第 ${position + 1} 题${item.attempt ? (item.attempt.correct ? "，已答对" : "，需巩固") : "，未作答"}`}
                  aria-current={
                    position === index && !summary ? "step" : undefined
                  }
                  disabled={!!busy}
                  onClick={() => chooseQuestion(position)}
                >
                  {item.attempt ? (
                    item.attempt.correct ? (
                      <Check size={13} />
                    ) : (
                      <X size={13} />
                    )
                  ) : (
                    position + 1
                  )}
                </button>
              ))}
            </div>
            <span>
              已完成 {completed} / {trial.total}
            </span>
          </div>
          {summary ? (
            <div className="desk-trial-summary">
              <div className="desk-trial-finish">
                <GraduationCap size={30} />
                <span>第一次练习，完成。</span>
                <h2>
                  {correct === trial.total
                    ? "五题全对，开了个好头。"
                    : "找到薄弱点，就是进步的开始。"}
                </h2>
                <p>
                  答对 <strong>{correct}</strong> 道 · 待巩固{" "}
                  <strong>{wrong.length}</strong> 道
                </p>
              </div>
              {wrong.length > 0 && (
                <div className="desk-trial-wrong-list">
                  <h3>
                    <Target size={16} />让 AI 帮你看清错因
                  </h3>
                  {wrong.map((item) => (
                    <div key={item.id}>
                      <span>{item.knowledgePoint}</span>
                      <button
                        disabled={!!busy}
                        onClick={() => readAI(item, "mistake")}
                      >
                        AI 分析错题
                        <ArrowUpRight size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button className="desk-button desk-primary" onClick={join}>
                {joinLabel}
                <ArrowRight size={16} />
              </button>
              <button
                className="desk-text-link"
                onClick={() => chooseQuestion(0)}
              >
                <ChevronLeft size={14} />
                回看这 5 道题
              </button>
            </div>
          ) : (
            <div className="desk-demo-body">
              <div className="desk-demo-context">
                <span>{question.knowledgePoint}</span>
                <span>单选题</span>
              </div>
              <h2>{question.question}</h2>
              <fieldset
                className="desk-demo-options"
                disabled={!!question.attempt || !!busy}
              >
                <legend className="desk-sr-only">
                  第 {index + 1} 题，选择一个答案
                </legend>
                {Object.entries(question.options).map(([key, text]) => (
                  <label
                    key={`${question.id}-${key}`}
                    className={`${(question.attempt?.selected || selected) === key ? "is-selected" : ""} ${question.attempt?.correctAnswer === key ? "is-correct" : ""} ${question.attempt && !question.attempt.correct && question.attempt.selected === key ? "is-wrong" : ""}`}
                  >
                    <input
                      type="radio"
                      name={`guest-trial-${question.id}`}
                      checked={(question.attempt?.selected || selected) === key}
                      onChange={() => setSelected(key)}
                    />
                    <span className="desk-option-letter">{key}</span>
                    <span>{text}</span>
                    {question.attempt?.correctAnswer === key && (
                      <Check size={16} />
                    )}
                  </label>
                ))}
              </fieldset>
              {question.attempt ? (
                <div
                  className={`desk-trial-feedback ${question.attempt.correct ? "is-right" : "is-missed"}`}
                  role="status"
                >
                  <strong>
                    {question.attempt.correct ? (
                      <Check size={16} />
                    ) : (
                      <Target size={16} />
                    )}
                    {question.attempt.correct
                      ? "答对了！再看看背后的原理。"
                      : `正确答案 ${question.attempt.correctAnswer}，这一点值得再巩固。`}
                  </strong>
                  <p>{question.attempt.analysis}</p>
                </div>
              ) : (
                <div className="desk-trial-intro">
                  <Sparkles size={16} />
                  <span>提交答案后，可免费使用 AI 解析与错题分析。</span>
                </div>
              )}
              {question.attempt && (
                <div className="desk-trial-ai-actions">
                  <button
                    disabled={!!busy}
                    onClick={() => readAI(question, "explanation")}
                  >
                    <Sparkles size={15} />
                    AI 详细解析
                  </button>
                  {!question.attempt.correct && (
                    <button
                      disabled={!!busy}
                      onClick={() => readAI(question, "mistake")}
                    >
                      <Target size={15} />
                      AI 分析错题
                    </button>
                  )}
                  <span>免费体验</span>
                </div>
              )}
              {error && (
                <div className="desk-form-error" role="alert">
                  {error}
                </div>
              )}
              <div className="desk-demo-footer">
                <span>
                  {question.attempt
                    ? `${index + 1} / ${trial.total} 道体验题`
                    : "先选出你的答案"}
                </span>
                {question.attempt ? (
                  <button
                    className="desk-button desk-primary"
                    disabled={!!busy}
                    onClick={() =>
                      completed === trial.total
                        ? setSummary(true)
                        : chooseQuestion(
                            questions.findIndex(
                              (item, position) =>
                                !item.attempt && position > index,
                            ) < 0
                              ? questions.findIndex((item) => !item.attempt)
                              : questions.findIndex(
                                  (item, position) =>
                                    !item.attempt && position > index,
                                ),
                          )
                    }
                  >
                    {completed === trial.total ? "查看体验结果" : "继续下一题"}
                    <ArrowRight size={15} />
                  </button>
                ) : (
                  <button
                    className="desk-button desk-primary"
                    disabled={!selected || !!busy}
                    onClick={submit}
                  >
                    {busy === "answer" ? "正在提交…" : "确认答案"}
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {reader && (
        <Dialog
          label={reader.action === "mistake" ? "AI 分析错题" : "AI 详细解析"}
          className="desk-trial-reader"
          onClose={() => setReader(null)}
        >
          <span className="desk-trial-reader-label">
            <Sparkles size={16} />
            考匠 AI · 免费体验
          </span>
          <h2>
            {reader.action === "mistake"
              ? "看清错因，才能真正掌握。"
              : "把这一题，彻底弄明白。"}
          </h2>
          <div className="desk-trial-reader-question">
            <span>{reader.question.knowledgePoint}</span>
            <h3>{reader.question.question}</h3>
            <p>
              你的答案 {reader.question.attempt.selected} · 正确答案{" "}
              {reader.question.attempt.correctAnswer}
            </p>
          </div>
          {reader.loading ? (
            <div className="desk-trial-reading" role="status">
              <LoaderCircle className="spin" size={21} />
              <p>正在准备 AI 讲解，请稍候…</p>
            </div>
          ) : reader.error ? (
            <div className="desk-form-error" role="alert">
              {reader.error}
              <button
                className="desk-text-link"
                onClick={() => readAI(reader.question, reader.action)}
              >
                重新读取
                <ArrowRight size={14} />
              </button>
            </div>
          ) : (
            <div className="desk-trial-ai-text">{reader.text}</div>
          )}
          <div className="desk-trial-reader-bottom">
            <button
              className="desk-button desk-secondary"
              onClick={() => setReader(null)}
            >
              继续体验
              <ArrowRight size={15} />
            </button>
            <button className="desk-text-link" onClick={join}>
              {joinLabel}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
