const normalizedName = (value) =>
  String(value).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const classificationKey = (question) =>
  JSON.stringify([
    question.chapter,
    question.knowledgeSection,
    question.knowledgePoint,
  ]);

// A certificate owns its taxonomy. Labels and aliases may not create another
// leaf elsewhere in that certificate; identical subjects in other exams are
// independent and are validated with a separate index.
export function createTaxonomyIndex(taxonomy, context = "") {
  const fail = (message) => {
    throw new Error(`知识分类配置不合法：${message}${context ? ` / ${context}` : ""}`);
  };
  const name = (value) => {
    if (typeof value !== "string" || !value.trim() || value !== value.trim())
      fail("节点名称必须是非空且无首尾空格的字符串");
    return normalizedName(value);
  };
  const order = (value, seen) => {
    if (!Number.isInteger(value) || value < 1 || seen.has(value))
      fail(`同级排序编号无效或重复：${value}`);
    seen.add(value);
  };
  const unique = (value, seen, label) => {
    const key = name(value);
    if (seen.has(key)) fail(`${label}重复：${value}`);
    seen.add(key);
  };
  if (
    taxonomy?.schemaVersion !== 1 ||
    !Array.isArray(taxonomy.modules) ||
    !taxonomy.modules.length
  ) fail("缺少有效的模块列表");

  const paths = new Set();
  const codes = new Set();
  const pointLabels = new Map();
  const moduleNames = new Set();
  const moduleOrders = new Set();
  for (const module of taxonomy.modules) {
    unique(module?.name, moduleNames, "一级模块");
    order(module.order, moduleOrders);
    if (!Array.isArray(module.sections) || !module.sections.length)
      fail(`模块缺少二级分类：${module.name}`);
    const sectionNames = new Set();
    const sectionOrders = new Set();
    for (const section of module.sections) {
      unique(section?.name, sectionNames, "二级分类");
      order(section.order, sectionOrders);
      if (!Array.isArray(section.knowledgePoints) || !section.knowledgePoints.length)
        fail(`二级分类缺少知识点：${section.name}`);
      const pointOrders = new Set();
      for (const point of section.knowledgePoints) {
        name(point?.name);
        order(point.order, pointOrders);
        unique(point.code, codes, "知识点编码");
        if (typeof point.scope !== "string" || !point.scope.trim())
          fail(`知识点缺少分类边界：${point.name}`);
        if (point.aliases !== undefined && !Array.isArray(point.aliases))
          fail(`知识点别名必须是数组：${point.name}`);
        const location = `${module.name} / ${section.name} / ${point.name}`;
        for (const label of [point.name, ...(point.aliases || [])]) {
          const key = name(label);
          if (pointLabels.has(key))
            fail(`知识点名称或别名重复：${label}（${pointLabels.get(key)}；${location}）`);
          pointLabels.set(key, location);
        }
        paths.add(classificationKey({
          chapter: module.name,
          knowledgeSection: section.name,
          knowledgePoint: point.name,
        }));
      }
    }
  }
  return { paths };
}

export function assertQuestionTaxonomy(question, index, context = "") {
  if (index && !index.paths.has(classificationKey(question)))
    throw new Error(
      `题目知识分类不在标准目录中：${question.id || "未命名题目"} / ` +
      `${question.chapter} / ${question.knowledgeSection || "缺少二级分类"} / ` +
      `${question.knowledgePoint}${context ? ` / ${context}` : ""}`,
    );
}
