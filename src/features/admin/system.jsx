import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Download,
  Eye,
  PlugZap,
  RefreshCw,
  Save,
  Square,
  X,
} from "lucide-react";
import { api } from "../../api.js";
import {
  call,
  date,
  download,
  Modal,
  number,
  Pagination,
  Panel,
  requestId,
  Resource,
  SearchField,
  Status,
  Table,
  useAdmin,
  useResource,
} from "./shared.jsx";

export function Jobs() {
  const { go, run, notify, busy } = useAdmin(),
    resource = useResource("/jobs", { poll: true }),
    [selected, setSelected] = useState(null);
  return (
    <Resource resource={resource}>
      {(data) => (
        <>
          <Panel
            title="内容任务"
            description="任务与结果保存在服务端；重启中断后需手动重试。"
            actions={
              <button onClick={resource.reload}>
                <RefreshCw size={15} />
                刷新
              </button>
            }
          >
            <Table
              rows={data.rows}
              columns={[
                {
                  key: "kind",
                  label: "任务",
                  render: (j) => (
                    <div className="ac-cell-stack">
                      <Status value={j.kind} />
                      <code>{j.id.slice(0, 8)}</code>
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "状态",
                  render: (j) => <Status value={j.status} />,
                },
                {
                  key: "created_at",
                  label: "创建时间",
                  render: (j) => date(j.createdAt),
                },
                {
                  key: "result",
                  label: "结果",
                  render: (j) => (
                    <span>
                      {j.error ||
                        j.result?.message ||
                        (j.result?.ok === false
                          ? `${j.result.errors?.length || 0} 个检查阻断项`
                          : j.result?.ok === true
                            ? "质量检查通过"
                            : j.result?.pairs
                              ? `${j.result.pairs.length} 对相似候选`
                              : "—")}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  label: "操作",
                  render: (j) => (
                    <div className="ac-inline">
                      <button onClick={() => setSelected(j)}>
                        <Eye size={14} />
                        详情
                      </button>
                      {j.documentId && (
                        <button
                          className="ac-link"
                          onClick={() =>
                            go("documents", { document: j.documentId })
                          }
                        >
                          打开草稿
                        </button>
                      )}
                      {j.canCancel && (
                        <button
                          disabled={!!busy}
                          onClick={() =>
                            void run("取消任务", async () => {
                              await call("/jobs/" + j.id + "/cancel", {});
                              resource.reload();
                            })
                          }
                        >
                          取消
                        </button>
                      )}
                      {j.canRetry && (
                        <button
                          disabled={!!busy}
                          onClick={() => {
                            if (
                              j.kind === "generate" &&
                              !window.confirm(
                                "重试会再次调用收费 AI 服务，确认继续吗？",
                              )
                            )
                              return;
                            void run("重试任务", async () => {
                              await call("/jobs/" + j.id + "/retry", {
                                requestId: requestId(),
                              });
                              resource.reload();
                              notify("重试任务已创建");
                            });
                          }}
                        >
                          重试
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          </Panel>
          <Panel
            title="课程生成任务"
            description="沿用现有课程队列与发布规则。"
          >
            <Table
              rows={data.studyJobs}
              columns={[
                { key: "node_id", label: "知识点" },
                {
                  key: "status",
                  label: "状态",
                  render: (j) => <Status value={j.status} />,
                },
                { key: "stage", label: "阶段" },
                {
                  key: "created_at",
                  label: "创建时间",
                  render: (j) => date(j.created_at),
                },
                { key: "error", label: "处理信息" },
              ]}
            />
            <div className="ac-panel-foot">
              <button onClick={() => go("teaching")}>
                进入教学管理
                <ArrowRight size={15} />
              </button>
            </div>
          </Panel>
          {selected && (
            <Modal title="任务详情" wide onClose={() => setSelected(null)}>
              <Status value={selected.status} />
              <p>{selected.error || "结果按任务实际状态展示。"}</p>
              <pre className="ac-json-result">
                {JSON.stringify(selected.result, null, 2)}
              </pre>
              {selected.result && (
                <button
                  onClick={() =>
                    download(
                      "任务结果-" + selected.id + ".json",
                      selected.result,
                    )
                  }
                >
                  <Download size={15} />
                  下载结果
                </button>
              )}
            </Modal>
          )}
        </>
      )}
    </Resource>
  );
}
export function Usage() {
  const { params, setParams } = useAdmin(),
    query = new URLSearchParams({
      days: params.get("days") || "30",
      search: params.get("search") || "",
      offset: params.get("offset") || "0",
      limit: "30",
    }),
    resource = useResource("/usage?" + query);
  return (
    <Resource resource={resource}>
      {(data) => (
        <>
          <div className="ac-metrics">
            {[
              ["调用次数", number(data.summary.calls)],
              ["Token 用量", number(data.summary.tokens)],
              ["已知成本", `¥ ${data.summary.knownCostCny.toFixed(4)}`],
              ["成本未知", `${number(data.summary.unknownCost)} 次`],
            ].map(([label, value]) => (
              <section key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>
                  {label === "成本未知"
                    ? "缺少对应价格或上游用量记录"
                    : "按服务端实际记录汇总"}
                </small>
              </section>
            ))}
          </div>
          <Panel>
            <div className="ac-filters">
              <SearchField
                value={params.get("search")}
                onSearch={(search) => setParams({ search })}
                placeholder="搜索账号、模型或任务"
              />
              <select
                aria-label="用量时间范围"
                value={params.get("days") || "30"}
                onChange={(e) => setParams({ days: e.target.value })}
              >
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
                <option value="90">近 90 天</option>
              </select>
              <button onClick={() => download("AI用量-当前页.json", data)}>
                <Download size={15} />
                导出当前页
              </button>
            </div>
            <Table
              rows={data.rows}
              columns={[
                {
                  key: "createdAt",
                  label: "调用时间",
                  render: (r) => date(r.createdAt),
                },
                { key: "username", label: "账号" },
                { key: "model", label: "模型" },
                { key: "taskType", label: "任务" },
                {
                  key: "success",
                  label: "结果",
                  render: (r) => (
                    <Status value={r.success ? "completed" : "failed"}>
                      {r.success ? "成功" : "失败"}
                    </Status>
                  ),
                },
                {
                  key: "total_tokens",
                  label: "Token",
                  render: (r) =>
                    r.hasUsage ? number(r.total_tokens) : "未返回",
                },
                {
                  key: "estimatedCostCny",
                  label: "成本",
                  render: (r) =>
                    r.estimatedCostCny === null
                      ? "未知"
                      : "¥ " + r.estimatedCostCny.toFixed(6),
                },
              ]}
            />
            <Pagination
              total={data.total}
              offset={data.offset}
              limit={data.limit}
              onChange={(offset) => setParams({ offset })}
            />
          </Panel>
          <Panel title="按模型汇总">
            <Table
              rows={data.models}
              rowKey="model"
              columns={[
                { key: "model", label: "模型" },
                { key: "calls", label: "调用" },
                {
                  key: "tokens",
                  label: "Token",
                  render: (r) => number(r.tokens),
                },
                { key: "unknownCost", label: "成本未知次数" },
                {
                  key: "knownCostCny",
                  label: "已知成本",
                  render: (r) => "¥ " + r.knownCostCny.toFixed(4),
                },
              ]}
            />
          </Panel>
        </>
      )}
    </Resource>
  );
}
export function Audit() {
  const { params, setParams } = useAdmin(),
    query = new URLSearchParams({
      search: params.get("search") || "",
      action: params.get("action") || "",
      offset: params.get("offset") || "0",
      limit: "30",
    }),
    resource = useResource("/audit?" + query),
    [selected, setSelected] = useState(null);
  return (
    <>
      <Panel>
        <div className="ac-filters">
          <SearchField
            value={params.get("search")}
            onSearch={(search) => setParams({ search })}
            placeholder="搜索操作人、动作或目标 ID"
          />
          <button onClick={resource.reload}>
            <RefreshCw size={15} />
            刷新
          </button>
        </div>
        <Resource resource={resource}>
          {(data) => (
            <>
              <Table
                rows={data.rows}
                columns={[
                  {
                    key: "created_at",
                    label: "时间",
                    render: (r) => date(r.created_at),
                  },
                  { key: "username", label: "操作人" },
                  { key: "action", label: "动作" },
                  { key: "target_type", label: "对象类型" },
                  {
                    key: "target_id",
                    label: "目标",
                    render: (r) => (
                      <code className="ac-break">{r.target_id || "—"}</code>
                    ),
                  },
                  {
                    key: "details",
                    label: "详情",
                    render: (r) => (
                      <button onClick={() => setSelected(r)}>查看详情</button>
                    ),
                  },
                ]}
              />
              <Pagination
                total={data.total}
                offset={data.offset}
                limit={data.limit}
                onChange={(offset) => setParams({ offset })}
              />
              <div className="ac-panel-foot">
                <button onClick={() => download("管理审计-当前页.json", data)}>
                  <Download size={15} />
                  导出当前页
                </button>
              </div>
            </>
          )}
        </Resource>
      </Panel>
      {selected && (
        <Modal title="审计详情" onClose={() => setSelected(null)}>
          <h3>{selected.action}</h3>
          <p>
            {date(selected.created_at)} · {selected.username}
          </p>
          <pre className="ac-json-result">
            {JSON.stringify(selected.data, null, 2)}
          </pre>
        </Modal>
      )}
    </>
  );
}
export function Config({onSaved} = {}) {
  const { run, notify, busy } = useAdmin(),
    effective = useResource("/config"),
    [draft, setDraft] = useState(null),
    [key, setKey] = useState("");
  useEffect(() => {
    if (effective.data) setDraft(effective.data.saved);
  }, [effective.data]);
  return (
    <Resource resource={effective}>
      {(data) => (
        <div className="ac-announcement-grid">
          <Panel title="当前实际生效的服务">
            <dl className="ac-definition">
              <div>
                <dt>服务状态</dt>
                <dd>
                  <Status value={data.configured ? "completed" : "failed"}>
                    {data.configured ? "已配置" : "未配置"}
                  </Status>
                </dd>
              </div>
              <div>
                <dt>配置来源</dt>
                <dd>{data.source}</dd>
              </div>
              <div>
                <dt>模型</dt>
                <dd>{data.model || "—"}</dd>
              </div>
              <div>
                <dt>服务地址</dt>
                <dd>{data.baseUrl || "—"}</dd>
              </div>
            </dl>
            <p className="ac-note">
              单接口模式下环境配置优先；多接口模式以优先级列表为准。本表保留原配置，测试会调用当前实际生效的服务并记录用量。
            </p>
            <button
              className="ac-primary"
              disabled={!!busy || !data.configured}
              onClick={() => {
                if (window.confirm("连接测试会发出真实付费请求，消耗当前管理员积分并记录成本。继续吗？")) void run("测试当前 AI 服务", async () => {
                  const result = await call("/config/test", {});
                  notify(result.message);
                });
              }}
            >
              <PlugZap size={16} />
              调用并测试连接
            </button>
          </Panel>
          <Panel
            title="管理员加密配置"
            description={
              data.readOnly
                ? "当前环境配置优先，本表保存备用连接。"
                : "密钥仅在服务端加密保存，读取接口不返回密钥。"
            }
          >
            {draft?.error ? (
              <p className="ac-error" role="alert">
                {draft.error}
              </p>
            ) : draft ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("保存 AI 配置", async () => {
                    const result = await call(
                      "/config",
                      {
                        revision: draft.revision,
                        baseUrl: draft.baseUrl,
                        model: draft.model,
                        temperature: Number(draft.temperature),
                        ...(key ? { apiKey: key } : {}),
                      },
                      "PUT",
                    );
                    setKey("");
                    setDraft(result.saved);
                    effective.reload();
                    onSaved?.();
                    notify("管理员 AI 配置已加密保存");
                  });
                }}
              >
                <label>
                  服务地址
                  <input
                    type="url"
                    required
                    value={draft.baseUrl}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, baseUrl: e.target.value }))
                    }
                  />
                </label>
                <label>
                  模型
                  <input
                    required
                    value={draft.model}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, model: e.target.value }))
                    }
                  />
                </label>
                <label>
                  温度
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={draft.temperature}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, temperature: e.target.value }))
                    }
                  />
                </label>
                <label>
                  新密钥（留空保留已保存密钥）
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                  />
                </label>
                <p className="ac-muted">
                  {draft.hasKey ? "已有加密密钥" : "尚未保存密钥"} ·{" "}
                  {draft.encryptionReady
                    ? "加密服务可用"
                    : "服务器尚未配置加密主密钥"}
                </p>
                <div className="ac-dialog-actions">
                  <button
                    type="button"
                    disabled={!draft.hasKey || !!busy}
                    onClick={() => {
                      if (window.confirm("确定移除当前管理员保存的密钥？"))
                        void run("移除管理员密钥", async () => {
                          const result = await call(
                            "/config/key",
                            { revision: draft.revision },
                            "DELETE",
                          );
                          setDraft(result.saved);
                          effective.reload();
                          onSaved?.();
                          notify("管理员密钥已移除");
                        });
                    }}
                  >
                    移除已存密钥
                  </button>
                  <button
                    className="ac-primary"
                    disabled={!!busy || !draft.encryptionReady}
                  >
                    <Save size={16} />
                    保存配置
                  </button>
                </div>
              </form>
            ) : (
              <p role="status">正在读取配置…</p>
            )}
          </Panel>
        </div>
      )}
    </Resource>
  );
}
export function System() {
  const resource = useResource("/system");
  return (
    <Resource resource={resource}>
      {(data) => (
        <>
          <div className="ac-metrics">
            {[
              ["服务运行", Math.floor(data.uptimeSeconds / 60) + " 分钟"],
              ["证书数量", data.certificates],
              ["公共题库", number(data.database.questions)],
              ["已下架题目", number(data.database.hidden)],
            ].map(([label, value]) => (
              <section key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>读取于 {date(data.updatedAt)}</small>
              </section>
            ))}
          </div>
          <Panel title="运行信息">
            <dl className="ac-definition">
              <div>
                <dt>Node 版本</dt>
                <dd>{data.node}</dd>
              </div>
              <div>
                <dt>数据库状态</dt>
                <dd>可读取 · {data.database.documents} 个内容草稿</dd>
              </div>
              <div>
                <dt>内容摘要</dt>
                <dd>
                  <code className="ac-break">{data.contentRevision}</code>
                </dd>
              </div>
              <div>
                <dt>内置题发布方式</dt>
                <dd>审核 → 导出发布包 → 代码部署 → 运行库核对</dd>
              </div>
              <div>
                <dt>AI 服务来源</dt>
                <dd>{data.config.source}</dd>
              </div>
            </dl>
            <div className="ac-panel-foot">
              <button onClick={resource.reload}>
                <RefreshCw size={15} />
                重新核对
              </button>
              <button onClick={() => download("考匠运行状态.json", data)}>
                <Download size={15} />
                导出状态
              </button>
            </div>
          </Panel>
        </>
      )}
    </Resource>
  );
}
