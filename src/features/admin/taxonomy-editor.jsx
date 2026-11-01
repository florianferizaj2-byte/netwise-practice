import { Plus, Trash2 } from "lucide-react";

export function TaxonomyEditor({ manifest, onChange }) {
  const modules = manifest?.taxonomy?.modules || [];
  const mutate = (work) => {
    const next = structuredClone(manifest || {});
    next.taxonomy ||= { schemaVersion: 1, modules: [] };
    work(next);
    onChange(next);
  };
  const change = (mi, si, pi, key, value) =>
    mutate((next) => {
      const m = next.taxonomy.modules[mi],
        target =
          si === null
            ? m
            : pi === null
              ? m.sections[si]
              : m.sections[si].knowledgePoints[pi],
        old = target[key];
      target[key] = value;
      if (key === "name" && si === null) {
        const syllabus = next.syllabus?.modules?.find(
          (module) => module.name === old,
        );
        if (syllabus) syllabus.name = value;
      }
      if (key === "name" && pi !== null) {
        const syllabus = next.syllabus?.modules?.find(
          (module) => module.name === m.name,
        );
        if (syllabus)
          syllabus.knowledgePoints = syllabus.knowledgePoints.map((p) =>
            typeof p === "string" && p === old ? value : p,
          );
      }
    });
  const addModule = () =>
    mutate((next) => {
      const order = next.taxonomy.modules.length + 1,
        name = "新章节 " + order;
      next.taxonomy.modules.push({ name, order, sections: [] });
      if (next.syllabus?.modules)
        next.syllabus.modules.push({
          id: "chapter-" + order,
          name,
          order,
          weight: 0,
          targetQuestionCount: 1,
          knowledgePoints: [],
        });
    });
  return (
    <section className="ac-taxonomy-editor">
      <div className="ac-toolbar">
        <div>
          <h3>三级目录编辑</h3>
          <p className="ac-muted">
            已发布知识点的编码保持稳定；目录变更会检查现有题目的兼容性。
          </p>
        </div>
        <button onClick={addModule}>
          <Plus size={15} />
          添加章节
        </button>
      </div>
      {modules.map((m, mi) => (
        <details className="ac-taxonomy-module" key={mi}>
          <summary>
            {mi + 1}. {m.name || "未命名章节"}
            <span>{m.sections?.length || 0} 个分类</span>
          </summary>
          <div className="ac-taxonomy-body">
            <div className="ac-two-fields">
              <label>
                章节名称
                <input
                  value={m.name || ""}
                  onChange={(e) =>
                    change(mi, null, null, "name", e.target.value)
                  }
                />
              </label>
              <label>
                章节顺序
                <input
                  type="number"
                  min={1}
                  value={m.order || mi + 1}
                  onChange={(e) =>
                    change(mi, null, null, "order", Number(e.target.value))
                  }
                />
              </label>
            </div>
            {(m.sections || []).map((s, si) => (
              <section className="ac-taxonomy-section" key={si}>
                <div className="ac-two-fields">
                  <label>
                    二级分类名称
                    <input
                      value={s.name || ""}
                      onChange={(e) =>
                        change(mi, si, null, "name", e.target.value)
                      }
                    />
                  </label>
                  <label>
                    分类顺序
                    <input
                      type="number"
                      min={1}
                      value={s.order || si + 1}
                      onChange={(e) =>
                        change(mi, si, null, "order", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                {(s.knowledgePoints || []).map((p, pi) => (
                  <div className="ac-taxonomy-point" key={pi}>
                    <div className="ac-three-fields">
                      <label>
                        知识点名称
                        <input
                          value={p.name || ""}
                          onChange={(e) =>
                            change(mi, si, pi, "name", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        稳定编码
                        <input
                          value={p.code || ""}
                          onChange={(e) =>
                            change(mi, si, pi, "code", e.target.value)
                          }
                        />
                      </label>
                      <label>
                        知识点顺序
                        <input
                          type="number"
                          min={1}
                          value={p.order || pi + 1}
                          onChange={(e) =>
                            change(mi, si, pi, "order", Number(e.target.value))
                          }
                        />
                      </label>
                    </div>
                    <label>
                      考查范围
                      <textarea
                        aria-label={"考查范围 " + (p.code || pi)}
                        rows={2}
                        value={p.scope || ""}
                        onChange={(e) =>
                          change(mi, si, pi, "scope", e.target.value)
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  onClick={() =>
                    mutate((next) => {
                      const section = next.taxonomy.modules[mi].sections[si],
                        n = section.knowledgePoints.length + 1;
                      section.knowledgePoints.push({
                        name: "新知识点 " + n,
                        code: [mi + 1, si + 1, n]
                          .map((v) => String(v).padStart(2, "0"))
                          .join("."),
                        order: n,
                        scope: "",
                        questionCount: 0,
                      });
                      const syllabus = next.syllabus?.modules?.find(
                        (module) => module.name === m.name,
                      );
                      if (syllabus)
                        syllabus.knowledgePoints.push("新知识点 " + n);
                    })
                  }
                >
                  <Plus size={14} />
                  添加知识点
                </button>
              </section>
            ))}
            <div className="ac-toolbar">
              <button
                onClick={() =>
                  mutate((next) => {
                    const module = next.taxonomy.modules[mi];
                    module.sections ||= [];
                    module.sections.push({
                      name: "新二级分类 " + (module.sections.length + 1),
                      order: module.sections.length + 1,
                      knowledgePoints: [],
                    });
                  })
                }
              >
                <Plus size={14} />
                添加二级分类
              </button>
              <button
                className="ac-danger-text"
                onClick={() => {
                  if (
                    window.confirm("从目录草稿移除此章节？正式目录暂不受影响。")
                  )
                    mutate((next) => {
                      next.taxonomy.modules.splice(mi, 1);
                      if (next.syllabus?.modules)
                        next.syllabus.modules = next.syllabus.modules.filter(
                          (module) => module.name !== m.name,
                        );
                    });
                }}
              >
                <Trash2 size={14} />
                移除草稿章节
              </button>
            </div>
          </div>
        </details>
      ))}
      {!modules.length && (
        <p className="ac-note">
          先添加章节，再添加二级分类和知识点。每个知识点需要独立编码和明确范围。
        </p>
      )}
      {manifest?.syllabus?.modules && (
        <details className="ac-taxonomy-module">
          <summary>
            本站练习配比
            <span>
              合计{" "}
              {manifest.syllabus.modules.reduce(
                (n, m) => n + Number(m.weight || 0),
                0,
              )}
              %
            </span>
          </summary>
          <div className="ac-taxonomy-body">
            <p className="ac-note">
              比例用于本站练习和组卷。需要明确来源与依据；没有官方分值证据时，不能标为官方考试占比。
            </p>
            {manifest.syllabus.modules.map((m, i) => (
              <div className="ac-three-fields" key={m.id}>
                <strong>{m.name}</strong>
                <label>
                  练习权重 %
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={m.weight ?? 0}
                    onChange={(e) =>
                      mutate((next) => {
                        next.syllabus.modules[i].weight = Number(
                          e.target.value,
                        );
                      })
                    }
                  />
                </label>
                <label>
                  目标题量
                  <input
                    type="number"
                    min={1}
                    value={m.targetQuestionCount || 1}
                    onChange={(e) =>
                      mutate((next) => {
                        next.syllabus.modules[i].targetQuestionCount = Number(
                          e.target.value,
                        );
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
