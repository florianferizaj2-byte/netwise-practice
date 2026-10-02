import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Network,
  Target,
} from "lucide-react";

export function ChapterGrid({ chapters, start, expand }) {
  return (
    <div className="chapter-grid">
      {chapters.map((c, i) => (
        <article className="chapter-item" key={c.name}>
          <div className={"chapter-icon tone-" + (i % 4)}>
            <Network size={22} />
          </div>
          <div className="chapter-info">
            <strong>{c.name}</strong>
            <small>
              {c.total} 题 <span>·</span> 已练 {c.attempted} 题
            </small>
            {c.targetQuestionCount && (
              <small className="module-meta">
                题库 {c.total}/{c.targetQuestionCount} · 本站配比 {c.weight}%
              </small>
            )}
            <div className="progress">
              <i
                style={{
                  width: Math.min(100, (c.attempted / c.total) * 100) + "%",
                }}
              />
            </div>
            <div className="chapter-category-actions">
              <button
                className="text-button"
                disabled={!c.questions?.length}
                onClick={() => start(c.questions || [], c.name)}
              >
                练习本级题库
                <ArrowRight size={14} />
              </button>
              {(c.sections?.length || c.knowledgePoints?.length) > 0 && (
                <button className="text-button" onClick={() => expand(c.name)}>
                  展开下一级
                  <ChevronRight size={14} />
                </button>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function KnowledgeSectionGrid({
  chapter,
  sections,
  questions,
  start,
  select,
  back,
}) {
  const groups = sections.map((section) => {
    const sectionQuestions = questions.filter(
      (question) => question.knowledgeSection === section.name,
    );
    return {
      ...section,
      questions: sectionQuestions,
      attempted: sectionQuestions.filter((question) => question.attempted)
        .length,
    };
  });
  return (
    <>
      <div className="chapter-drilldown-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          返回章节
        </button>
        <button
          className="primary"
          disabled={!questions.length}
          onClick={() => start(questions, chapter)}
        >
          练习本章全部题
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="knowledge-point-grid">
        {groups.map((group, index) => (
          <article
            className="knowledge-point-item knowledge-section-item"
            key={group.name}
          >
            <div className={"knowledge-point-icon tone-" + (index % 4)}>
              <Network size={19} />
            </div>
            <div className="knowledge-point-info">
              <strong>{group.name}</strong>
              <small>
                {group.questions.length} 题 <span>·</span> 已练{" "}
                {group.attempted} 题
              </small>
              <div className="progress">
                <i
                  style={{
                    width:
                      group.questions.length > 0
                        ? Math.min(
                            100,
                            (group.attempted / group.questions.length) * 100,
                          ) + "%"
                        : "0%",
                  }}
                />
              </div>
              <div className="chapter-category-actions">
                <button
                  className="text-button"
                  disabled={!group.questions.length}
                  onClick={() =>
                    start(group.questions, `${chapter} · ${group.name}`)
                  }
                >
                  练习本分类
                  <ArrowRight size={14} />
                </button>
                <button
                  className="text-button"
                  onClick={() => select(group.name)}
                >
                  展开考点
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export function KnowledgePointGrid({
  chapter,
  points,
  questions,
  mastery,
  start,
  back,
  backLabel = "返回章节",
  allLabel = "练习本章全部题",
}) {
  const pointNames = points
    .map((point) => (typeof point === "string" ? point : point?.name || ""))
    .filter(Boolean);
  const groups = pointNames.map((knowledgePoint) => {
    const pointQuestions = questions.filter(
      (question) =>
        (question.targetKnowledgePoint || question.knowledgePoint) ===
        knowledgePoint,
    );
    return {
      knowledgePoint,
      questions: pointQuestions,
      attempted: pointQuestions.filter((question) => question.attempted).length,
    };
  });
  return (
    <>
      <div className="chapter-drilldown-toolbar">
        <button className="text-button" onClick={back}>
          <ArrowLeft size={15} />
          {backLabel}
        </button>
        <button
          className="primary"
          disabled={!questions.length}
          onClick={() => start(questions, chapter)}
        >
          {allLabel}
          <ArrowRight size={15} />
        </button>
      </div>
      <div className="knowledge-point-grid">
        {groups.map((group, index) => (
          <button
            className="knowledge-point-item"
            key={group.knowledgePoint}
            disabled={!group.questions.length}
            onClick={() =>
              start(group.questions, chapter + " · " + group.knowledgePoint)
            }
          >
            <div className={"knowledge-point-icon tone-" + (index % 4)}>
              <Target size={19} />
            </div>
            <div className="knowledge-point-info">
              <strong>{group.knowledgePoint}</strong>
              <small>
                {group.questions.length} 题 <span>·</span> 已练{" "}
                {group.attempted} 题
              </small>
              <div className="progress">
                <i
                  style={{
                    width:
                      group.questions.length > 0
                        ? Math.min(
                            100,
                            (group.attempted / group.questions.length) * 100,
                          ) + "%"
                        : "0%",
                  }}
                />
              </div>
              <span className="knowledge-point-enter">
                进入题库
                <ArrowRight size={13} />
              </span>
            </div>
            <ChevronRight size={17} />
          </button>
        ))}
      </div>
    </>
  );
}
