import { useState } from "react";
import { SubjectiveAdmin } from "../subjective-admin.jsx";
import {
  Modal,
  Panel,
  Resource,
  Status,
  Table,
  useAdmin,
  useResource,
} from "./shared.jsx";
import { render } from "../../generated/tutor-renderer.js";
import "../interactive-tutor.css";
export function Teaching() {
  const { go } = useAdmin(),
    [tab, setTab] = useState("manage"),
    [preview, setPreview] = useState(null),
    resource = useResource("/teaching");
  return (
    <>
      <div className="ac-editor-tabs">
        <button
          className={tab === "manage" ? "active" : ""}
          onClick={() => setTab("manage")}
        >
          课程、生成与评分复核
        </button>
        <button
          className={tab === "interactive" ? "active" : ""}
          onClick={() => setTab("interactive")}
        >
          静态互动课覆盖
        </button>
      </div>
      {tab === "manage" ? (
        <div className="ac-legacy-module">
          <SubjectiveAdmin
            navigate={(page) =>
              page === "study-admin" ? go("teaching") : (location.hash = page)
            }
          />
        </div>
      ) : (
        <Resource resource={resource}>
          {(data) => (
            <>
              <div className="ac-metrics">
                {[
                  ["目录知识点", data.coverage.total],
                  ["完整互动课", data.coverage.ready],
                  ["部分示范", data.coverage.partial],
                  ["待补互动课", data.coverage.pending],
                ].map(([label, value]) => (
                  <section key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <small>当前服务加载的课程目录</small>
                  </section>
                ))}
              </div>
              <Panel
                title="互动课目录"
                description="静态课程通过现有受控协议与代码发布。实际可用性还取决于课程版本、发布状态和账号权限。"
              >
                <Table
                  rows={data.knowledgePoints}
                  rowKey="nodeId"
                  columns={[
                    { key: "title", label: "知识点" },
                    { key: "chapter", label: "章节" },
                    { key: "section", label: "二级分类" },
                    {
                      key: "status",
                      label: "内容状态",
                      render: (n) => (
                        <Status
                          value={
                            n.status === "ready"
                              ? "completed"
                              : n.status === "partial"
                                ? "processing"
                                : "interrupted"
                          }
                        >
                          {
                            {
                              ready: "完整互动课",
                              partial: "部分示范",
                              pending: "保留原有精讲",
                            }[n.status]
                          }
                        </Status>
                      ),
                    },
                    { key: "sourceVersion", label: "目录版本" },
                    {
                      key: "preview",
                      label: "预览",
                      render: (n) =>
                        n.courseId ? (
                          <button onClick={() => setPreview(n.courseId)}>
                            预览课程
                          </button>
                        ) : (
                          <span className="ac-muted">待补互动课</span>
                        ),
                    },
                  ]}
                />
              </Panel>
              <Panel title="已加载课程版本">
                <Table
                  rows={data.courses}
                  columns={[
                    { key: "title", label: "课程名称" },
                    { key: "id", label: "课程 ID" },
                    { key: "version", label: "版本" },
                  ]}
                />
              </Panel>
            </>
          )}
        </Resource>
      )}
      {preview && (
        <CoursePreview id={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
function CoursePreview({ id, onClose }) {
  const resource = useResource("/teaching/" + encodeURIComponent(id)),
    [step, setStep] = useState(0);
  return (
    <Modal title="互动课内容预览" wide onClose={onClose}>
      <Resource resource={resource}>
        {(data) => (
          <>
            <h3>{data.course.title}</h3>
            <p className="ac-muted">
              版本 {data.course.version} · {data.lessons.length} 个核心概念 ·
              使用现有受控教学渲染器
            </p>
            <div className="ac-editor-tabs">
              {data.lessons.map((_, i) => (
                <button
                  key={i}
                  className={step === i ? "active" : ""}
                  onClick={() => setStep(i)}
                >
                  概念 {i + 1}
                </button>
              ))}
            </div>
            <div
              className="interactive-tutor ac-tutor-preview"
              dangerouslySetInnerHTML={{
                __html: render(data.lessons[step], { interactive: false }),
              }}
            />
            <p className="ac-note">
              此处仅预览已审核的公开讲解和图解，不创建学生会话，也不调用 AI。
            </p>
          </>
        )}
      </Resource>
    </Modal>
  );
}
