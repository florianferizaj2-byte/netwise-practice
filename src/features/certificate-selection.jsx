import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  GraduationCap,
  Search,
  ShieldCheck,
  Stethoscope,
  X,
} from "lucide-react";
import { ChapterArt } from "../components/chapter-art.jsx";
import {
  certificateCategories,
  certificateChoices,
  filterCertificateChoices,
} from "../certificate-choices.js";
import "./certificate-selection.css";

function CertificateArt({ choice, large = false }) {
  return (
    <span
      className={`blue-cert-art ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      {choice.artChapter ? (
        <ChapterArt
          certificateId={choice.artCertificate}
          title={choice.artChapter}
          size={large ? "large" : "small"}
        />
      ) : choice.id === "veterinary-practitioner" ? (
        <Stethoscope />
      ) : (
        <GraduationCap />
      )}
    </span>
  );
}
export function CertificateSelection({
  certificates,
  currentId,
  onSelect,
  navigate,
  onSignOut,
  onboarding = false,
  busy = false,
}) {
  const choices = useMemo(
    () => certificateChoices(certificates),
    [certificates],
  );
  const [candidate, setCandidate] = useState(currentId || choices[0]?.id),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState("all"),
    [region, setRegion] = useState("all"),
    [pending, setPending] = useState(false),
    [issue, setIssue] = useState("");
  const inFlight = useRef(false);
  const selected = choices.find((c) => c.id === candidate);
  const shown = filterCertificateChoices(choices, { query, category, region });
  const blocked = pending || busy;
  const choose = async (destination = "home") => {
    if (!selected?.available || blocked || inFlight.current) return;
    if (selected.id === currentId && !onboarding) {
      navigate(destination);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setIssue("");
    try {
      const result = await onSelect(selected.id, destination);
      if (result === null) setIssue("本次切换未完成，请查看页面提示后重试。");
    } catch (e) {
      setIssue(e.message || "切换失败，请重试。");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const reset = () => {
    setQuery("");
    setRegion("all");
    setCategory("all");
  };
  return (
    <div className={`blue-certificates ${onboarding ? "is-onboarding" : ""}`}>
      {onboarding && (
        <header className="blue-cert-welcome">
          <span>
            <img src="/kaojiang-logo-192.png" alt="" />
            <strong>
              考匠 <small>AceExam</small>
            </strong>
          </span>
          <button type="button" disabled={blocked} onClick={onSignOut}>
            退出登录
          </button>
        </header>
      )}
      <header className="blue-cert-heading">
        <div>
          <p>
            <BookOpen size={15} />
            学习空间 / 证书选择
          </p>
          <h1>选择备考目标</h1>
          <span>找到你的考试与证书，进入对应学习空间。</span>
        </div>
        {!onboarding && (
          <button
            type="button"
            disabled={blocked}
            onClick={() => navigate("home")}
          >
            <ArrowLeft size={16} />
            返回学习空间
          </button>
        )}
      </header>
      {issue && (
        <div className="blue-cert-error" role="alert">
          {issue}
        </div>
      )}
      <div className="blue-cert-layout">
        <section className="blue-cert-catalog" aria-label="考试与证书目录">
          <div className="blue-cert-searchbar">
            <label>
              <Search size={18} />
              <input
                type="search"
                aria-label="搜索考试、证书或科目"
                placeholder="搜索考试、证书或科目"
                value={query}
                disabled={blocked}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="清空证书搜索"
                  onClick={() => setQuery("")}
                >
                  <X size={16} />
                </button>
              )}
            </label>
            <select
              aria-label="按备考地区筛选"
              disabled={blocked}
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              <option value="all">全部地区</option>
              <option value="sichuan">四川省</option>
              <option value="general">不限地区</option>
            </select>
          </div>
          <div className="blue-cert-filter" role="group" aria-label="证书类别">
            {Object.entries(certificateCategories)
              .filter(
                ([id]) =>
                  id === "all" || choices.some((c) => c.category === id),
              )
              .map(([id, label]) => (
                <button
                  type="button"
                  key={id}
                  disabled={blocked}
                  aria-pressed={category === id}
                  onClick={() => setCategory(id)}
                >
                  {label}
                  <span>
                    {id === "all"
                      ? choices.length
                      : choices.filter((c) => c.category === id).length}
                  </span>
                </button>
              ))}
          </div>
          <p className="blue-cert-count" role="status">
            找到 {shown.length} 个方向 ·{" "}
            {choices.filter((c) => c.available).length} 个已开放
          </p>
          <fieldset className="blue-cert-grid" disabled={blocked}>
            <legend className="sr-only">选择一个备考目标</legend>
            {shown.map((choice) => (
              <label
                key={choice.id}
                className={`blue-cert-card blue-art-trigger ${candidate === choice.id ? "is-selected" : ""} ${choice.available ? "" : "is-planned"}`}
              >
                <input
                  type="radio"
                  name="certificate-preview"
                  value={choice.id}
                  checked={candidate === choice.id}
                  onChange={() => {
                    setCandidate(choice.id);
                    setIssue("");
                  }}
                />
                <CertificateArt choice={choice} />
                <span className="blue-cert-card-copy">
                  <strong>{choice.title}</strong>
                  <span className="blue-cert-tags">
                    <span>{certificateCategories[choice.category]}</span>
                    {choice.id === currentId && <b>当前备考</b>}
                    {!choice.available && <b>准备中</b>}
                  </span>
                  <small>{choice.description || choice.name}</small>
                </span>
                <span className="blue-cert-radio" aria-hidden="true">
                  {candidate === choice.id && <Check size={13} />}
                </span>
              </label>
            ))}
          </fieldset>
          {!shown.length && (
            <div className="blue-cert-empty">
              <Search size={26} />
              <h2>没有找到对应方向</h2>
              <p>试试证书名称、考试简称，或查看全部备考目标。</p>
              <button type="button" onClick={reset}>
                清除筛选
              </button>
            </div>
          )}
          <p className="blue-cert-footnote">
            <ShieldCheck size={17} />
            学习记录按账号和证书分别保存，切换回来后可以继续。
          </p>
        </section>
        <aside className="blue-cert-preview" aria-label="当前选择的备考目标">
          <h2>
            <Compass size={22} />
            当前选择
          </h2>
          {selected ? (
            <>
              <div
                className="blue-cert-preview-art blue-art-trigger"
                tabIndex={0}
                aria-label={selected.title + "插画预览"}
              >
                <CertificateArt choice={selected} large />
                <div>
                  <span>
                    {selected.available
                      ? selected.id === currentId
                        ? "当前备考"
                        : "可以学习"
                      : "内容准备中"}
                  </span>
                  <h3>{selected.title}</h3>
                </div>
              </div>
              <dl>
                <div>
                  <dt>考试类别</dt>
                  <dd>{certificateCategories[selected.category]}</dd>
                </div>
                <div>
                  <dt>备考地区</dt>
                  <dd>
                    {selected.region === "sichuan" ? "四川省" : "不限地区"}
                  </dd>
                </div>
                <div>
                  <dt>开放状态</dt>
                  <dd>{selected.available ? "已开放学习空间" : "尚未开放"}</dd>
                </div>
              </dl>
              <p className="blue-cert-preview-note">
                {selected.available
                  ? "先选好目标，再从章节练习或模拟考试开始。"
                  : "先预留这个方向，题库和学习内容准备好后再开放。"}
              </p>
              {!onboarding && (
                <div
                  className="blue-cert-entrylinks"
                  aria-label="所选证书学习入口"
                >
                  {[
                    ["chapters", "章节练习"],
                    ["exam", "模拟考试"],
                    ["favorites", "题目收藏"],
                  ].map(([page, label]) => (
                    <button
                      type="button"
                      key={page}
                      disabled={blocked || !selected.available}
                      onClick={() => choose(page)}
                    >
                      <BookOpen size={16} />
                      {label}
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                className="blue-cert-enter primary"
                disabled={blocked || !selected.available}
                onClick={() => choose()}
              >
                {pending
                  ? "正在准备学习空间…"
                  : !selected.available
                    ? "内容准备中"
                    : "进入学习"}
                <ArrowRight size={18} />
              </button>
            </>
          ) : (
            <p>暂时没有可选的证书，请重新加载页面。</p>
          )}
        </aside>
      </div>
    </div>
  );
}
