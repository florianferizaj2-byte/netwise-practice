import { useEffect, useState } from "react";
import {
  Ban,
  Check,
  Eye,
  Pencil,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { api } from "../../api.js";
import { AdminMembershipCodes } from "../../admin-memberships.jsx";
import { UserAvatar } from "../../components/user-avatar.jsx";
import {
  call,
  date,
  Modal,
  Pagination,
  Panel,
  QuestionPreview,
  Resource,
  SearchField,
  Status,
  Table,
  useAdmin,
  useResource,
} from "./shared.jsx";

export function Users() {
  const { params, setParams } = useAdmin(),
    search = params.get("search") || "",
    status = params.get("status") || "all",
    offset = Number(params.get("offset") || 0);
  const resource = useResource(
      "/users?" + new URLSearchParams({ search, status, offset, limit: 30 }),
    ),
    [selected, setSelected] = useState(null);
  return (
    <>
      <Panel>
        <div className="ac-filters">
          <SearchField
            label="搜索用户"
            value={search}
            onSearch={(search) => setParams({ search })}
            placeholder="搜索账号或昵称"
          />
          <select
            aria-label="账号状态筛选"
            value={status}
            onChange={(e) => setParams({ status: e.target.value })}
          >
            <option value="all">全部账号状态</option>
            <option value="active">正常账号</option>
            <option value="banned">已封禁账号</option>
          </select>
        </div>
        <Resource resource={resource}>
          {(data) => (
            <>
              <Table
                rows={data.users}
                columns={[
                  {
                    key: "username",
                    label: "用户",
                    render: (u) => (
                      <button
                        className="ac-user-cell"
                        onClick={() => setSelected(u.id)}
                      >
                        <UserAvatar url={u.avatarUrl} className="ac-avatar" />
                        <span>
                          <strong>{u.communityName || u.username}</strong>
                          <small>{u.username}</small>
                        </span>
                      </button>
                    ),
                  },
                  { key: "certificateId", label: "当前备考" },
                  {
                    key: "membershipPlan",
                    label: "会员等级",
                    render: (u) => (
                      <Status value="draft">
                        {u.membershipPlan === "free"
                          ? "普通账号"
                          : u.membershipPlan.toUpperCase()}
                      </Status>
                    ),
                  },
                  {
                    key: "membershipExpiresAt",
                    label: "会员到期",
                    render: (u) =>
                      u.membershipPlan === "free"
                        ? "—"
                        : u.membershipExpiresAt
                          ? date(u.membershipExpiresAt)
                          : "长期有效",
                  },
                  {
                    key: "createdAt",
                    label: "注册时间",
                    render: (u) => date(u.createdAt),
                  },
                  {
                    key: "bannedAt",
                    label: "账号状态",
                    render: (u) => (
                      <Status value={u.bannedAt ? "failed" : "completed"}>
                        {u.bannedAt ? "已封禁" : u.isAdmin ? "管理员" : "正常"}
                      </Status>
                    ),
                  },
                  {
                    key: "action",
                    label: "操作",
                    render: (u) => (
                      <button
                        className="ac-link"
                        onClick={() => setSelected(u.id)}
                      >
                        <Pencil size={15} />
                        管理
                      </button>
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
            </>
          )}
        </Resource>
      </Panel>
      {selected && (
        <UserEditor
          id={selected}
          onClose={() => setSelected(null)}
          onSaved={resource.reload}
        />
      )}
    </>
  );
}
function UserEditor({ id, onClose, onSaved }) {
  const { certificates, run, notify, busy } = useAdmin(),
    resource = useResource("/users/" + id),
    [draft, setDraft] = useState(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    if (resource.data) setDraft(resource.data.user);
  }, [resource.data]);
  const patch = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  return (
    <Modal title="账号详情与权益" wide onClose={onClose}>
      <Resource resource={resource}>
        {() =>
          draft && (
            <>
              <div className="ac-profile-head">
                <UserAvatar url={draft.avatarUrl} className="ac-avatar" />
                <div>
                  <h3>{draft.communityName || draft.username}</h3>
                  <p>
                    {draft.username} · {draft.id}
                  </p>
                </div>
                <Status value={draft.bannedAt ? "failed" : "completed"}>
                  {draft.bannedAt
                    ? "已封禁"
                    : draft.isAdmin
                      ? "管理员"
                      : "正常"}
                </Status>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("保存账号设置", async () => {
                    const body = {
                      revision: draft.revision,
                      communityName: draft.communityName?.trim() || null,
                      certificateId: draft.certificateId || null,
                      membershipPlan: draft.membershipPlan,
                      membershipExpiresAt:
                        draft.membershipPlan === "free"
                          ? null
                          : draft.membershipExpiresAt,
                    };
                    const result = await call("/users/" + id, body, "PUT");
                    setDraft(result.user);
                    onSaved();
                    notify("账号资料与会员权益已保存");
                  });
                }}
              >
                <div className="ac-two-fields">
                  <label>
                    昵称
                    <input
                      maxLength={24}
                      value={draft.communityName || ""}
                      onChange={(e) => patch("communityName", e.target.value)}
                    />
                  </label>
                  <label>
                    备考方向
                    <select
                      value={draft.certificateId || ""}
                      onChange={(e) => patch("certificateId", e.target.value)}
                    >
                      <option value="">尚未选择</option>
                      {certificates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    会员等级
                    <select
                      aria-label="会员等级"
                      value={draft.membershipPlan}
                      onChange={(e) => patch("membershipPlan", e.target.value)}
                    >
                      <option value="free">普通账号</option>
                      <option value="vip">基础 VIP</option>
                      <option value="svip">进阶 VIP</option>
                      <option value="ssvip">尊享 VIP</option>
                    </select>
                  </label>
                  <label>
                    会员到期日期（留空为长期）
                    <input
                      type="date"
                      disabled={draft.membershipPlan === "free"}
                      value={draft.membershipExpiresAt?.slice(0, 10) || ""}
                      onChange={(e) =>
                        patch(
                          "membershipExpiresAt",
                          e.target.value
                            ? new Date(
                                e.target.value + "T23:59:59+08:00",
                              ).toISOString()
                            : null,
                        )
                      }
                    />
                  </label>
                </div>
                <div className="ac-note">
                  <strong>注册于 {date(draft.createdAt)}</strong>
                  <span>
                    更新时会校验读取版本。取消会员会按现有服务规则收回会员权益，学习记录保留。
                  </span>
                </div>
                <div className="ac-dialog-actions">
                  <button
                    type="submit"
                    className="ac-primary"
                    disabled={!!busy}
                  >
                    <Save size={16} />
                    保存账号设置
                  </button>
                </div>
              </form>
              {!draft.isAdmin && (
                <section className="ac-danger-zone">
                  <h3>账号状态管理</h3>
                  <p>{draft.banReason || "封禁会立即撤销此账号的登录会话。"}</p>
                  <label>
                    处理原因
                    <input
                      value={reason}
                      minLength={2}
                      maxLength={200}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="填写封禁或解封原因"
                    />
                  </label>
                  <button
                    disabled={!!busy || reason.trim().length < 2}
                    onClick={() => {
                      if (
                        !window.confirm(
                          `确认${draft.bannedAt ? "解封" : "封禁"}账号「${draft.username}」？`,
                        )
                      )
                        return;
                      void run("更新账号状态", async () => {
                        await api(
                          "/admin/users/" + id + "/ban",
                          { banned: !draft.bannedAt, reason },
                          "PUT",
                        );
                        resource.reload();
                        onSaved();
                        notify("账号状态已更新");
                      });
                    }}
                  >
                    <Ban size={16} />
                    {draft.bannedAt ? "解封账号" : "封禁账号"}
                  </button>
                </section>
              )}
            </>
          )
        }
      </Resource>
    </Modal>
  );
}
export function Memberships() {
  const { notify } = useAdmin();
  return (
    <div className="ac-legacy-module">
      <AdminMembershipCodes api={api} notify={notify} />
    </div>
  );
}
export function Announcement() {
  const { run, notify, busy } = useAdmin(),
    resource = useResource("/announcement"),
    [draft, setDraft] = useState(null),
    [preview, setPreview] = useState(false);
  useEffect(() => {
    if (resource.data)
      setDraft({
        ...resource.data.announcement,
        revision: resource.data.revision,
      });
  }, [resource.data]);
  return (
    <Resource resource={resource}>
      {() =>
        draft && (
          <>
            <div className="ac-announcement-grid">
              <Panel
                title="当前公开公告"
                description="使用现有公告服务，保存后 Web 与 App 读取同一份内容。"
              >
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run("保存公开公告", async () => {
                      const r = await call(
                        "/announcement",
                        {
                          revision: draft.revision,
                          title: draft.title,
                          body: draft.body,
                          enabled: draft.enabled,
                        },
                        "PUT",
                      );
                      setDraft({ ...r.announcement, revision: r.revision });
                      notify(draft.enabled ? "公告已发布" : "公告已隐藏");
                    });
                  }}
                >
                  <label className="ac-toggle-row">
                    <span>
                      <strong>公开显示</strong>
                      <small>关闭后，各端读取到隐藏状态</small>
                    </span>
                    <input
                      role="switch"
                      aria-label="公开显示公告"
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, enabled: e.target.checked }))
                      }
                    />
                  </label>
                  <label>
                    公告标题
                    <input
                      required
                      maxLength={80}
                      value={draft.title}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, title: e.target.value }))
                      }
                    />
                  </label>
                  <label>
                    公告正文
                    <textarea
                      aria-label="公告正文"
                      required
                      rows={12}
                      maxLength={8000}
                      value={draft.body}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, body: e.target.value }))
                      }
                    />
                    <small>
                      {draft.body.length} / 8000 字符，支持纯文本换行
                    </small>
                  </label>
                  <div className="ac-dialog-actions">
                    <button type="button" onClick={() => setPreview(true)}>
                      <Eye size={16} />
                      预览公告
                    </button>
                    <button
                      type="submit"
                      className="ac-primary"
                      disabled={!!busy}
                    >
                      <Save size={16} />
                      保存并{draft.enabled ? "发布" : "隐藏"}
                    </button>
                  </div>
                </form>
              </Panel>
              <Panel title="显示预览">
                <div className="ac-announcement-preview">
                  <Status value={draft.enabled ? "completed" : "interrupted"}>
                    {draft.enabled ? "公开显示" : "当前隐藏"}
                  </Status>
                  <h2>{draft.title}</h2>
                  <p>{draft.body}</p>
                </div>
                <p className="ac-note">
                  公告为纯文本，不执行 HTML
                  或脚本。已有版本会在保存时核对，避免覆盖其他管理员刚做的修改。
                </p>
              </Panel>
            </div>
            {preview && (
              <Modal title="公告预览" onClose={() => setPreview(false)}>
                <article className="ac-announcement-preview">
                  <h2>{draft.title}</h2>
                  <p>{draft.body}</p>
                </article>
              </Modal>
            )}
          </>
        )
      }
    </Resource>
  );
}
export function Feedback() {
  const { params, setParams, certificateId, run, notify, busy, go } =
      useAdmin(),
    status = params.get("status") || "all",
    offset = Number(params.get("offset") || 0);
  const resource = useResource(
      "/feedback?" +
        new URLSearchParams({ certificateId, status, offset, limit: 30 }),
    ),
    [selected, setSelected] = useState(null),
    [note, setNote] = useState(""),
    [nextStatus, setNextStatus] = useState("processing"),
    [doc, setDoc] = useState("");
  const documents = useResource("/documents");
  return (
    <>
      <Panel>
        <div className="ac-filters">
          <select
            aria-label="反馈处理状态"
            value={status}
            onChange={(e) => setParams({ status: e.target.value })}
          >
            {["all", "open", "processing", "resolved", "ignored"].map((s) => (
              <option key={s} value={s}>
                {
                  {
                    all: "全部状态",
                    open: "待处理",
                    processing: "处理中",
                    resolved: "已解决",
                    ignored: "已忽略",
                  }[s]
                }
              </option>
            ))}
          </select>
          <span className="ac-muted">处理记录保留，可关联内容修订草稿。</span>
        </div>
        <Resource resource={resource}>
          {(data) => (
            <>
              <Table
                rows={data.rows}
                rowKey={(f) => f.userId + ":" + f.questionId}
                columns={[
                  {
                    key: "question",
                    label: "问题题目",
                    render: (f) => (
                      <button
                        className="ac-question-link"
                        onClick={() => {
                          setSelected(f);
                          setNote(f.resolution);
                          setNextStatus(
                            f.status === "open" ? "processing" : f.status,
                          );
                          setDoc(f.documentId);
                        }}
                      >
                        <strong>{f.question.question}</strong>
                        <small>{f.note || f.kind}</small>
                      </button>
                    ),
                  },
                  { key: "username", label: "提交用户" },
                  {
                    key: "createdAt",
                    label: "提交时间",
                    render: (f) => date(f.createdAt),
                  },
                  {
                    key: "status",
                    label: "处理状态",
                    render: (f) => <Status value={f.status} />,
                  },
                  {
                    key: "action",
                    label: "操作",
                    render: (f) => (
                      <button
                        onClick={() => {
                          setSelected(f);
                          setNote(f.resolution);
                          setNextStatus(
                            f.status === "open" ? "processing" : f.status,
                          );
                          setDoc(f.documentId);
                        }}
                      >
                        查看并处理
                      </button>
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
            </>
          )}
        </Resource>
      </Panel>
      {selected && (
        <Modal title="处理题目反馈" wide onClose={() => setSelected(null)}>
          <div className="ac-note">
            <strong>
              {selected.username}：{selected.note || selected.kind}
            </strong>
            <span>提交于 {date(selected.createdAt)}</span>
          </div>
          <QuestionPreview question={selected.question} />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run("保存反馈处理记录", async () => {
                await call(
                  "/feedback",
                  {
                    userId: selected.userId,
                    questionId: selected.questionId,
                    revision: selected.revision,
                    status: nextStatus,
                    note,
                    documentId: doc || null,
                  },
                  "PUT",
                );
                setSelected(null);
                resource.reload();
                notify("反馈处理记录已保存");
              });
            }}
          >
            <div className="ac-two-fields">
              <label>
                处理状态
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value)}
                >
                  {["open", "processing", "resolved", "ignored"].map((s) => (
                    <option key={s} value={s}>
                      {
                        {
                          open: "待处理",
                          processing: "处理中",
                          resolved: "已解决",
                          ignored: "已忽略",
                        }[s]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <label>
                关联修订草稿
                <select value={doc} onChange={(e) => setDoc(e.target.value)}>
                  <option value="">不关联</option>
                  {documents.data?.rows
                    .filter(
                      (d) =>
                        d.certificateId ===
                          selected.question.certificates?.[0] || d.id === doc,
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              处理说明
              <textarea
                aria-label="处理说明"
                required
                minLength={2}
                maxLength={500}
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="ac-dialog-actions">
              <button
                type="button"
                onClick={() =>
                  void run("创建题目修订", async () => {
                    const r = await call(
                      "/questions/" +
                        encodeURIComponent(selected.questionId) +
                        "/draft",
                      {
                        certificateId:
                          certificateId || selected.question.certificates[0],
                        revision: selected.question.revision,
                      },
                    );
                    setSelected(null);
                    go("documents", { document: r.document.id });
                  })
                }
              >
                创建修订草稿
              </button>
              <button className="ac-primary" disabled={!!busy}>
                <Check size={16} />
                保存处理记录
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
