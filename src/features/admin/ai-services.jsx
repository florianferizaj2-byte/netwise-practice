import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  KeyRound,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { api } from "../../api.js";
import { Modal, Panel, date, useAdmin } from "./shared.jsx";
import { Config as LegacyConfig } from "./system.jsx";
import "./ai-services.css";

const endpoint = "/admin/ai-services";
const money = (value) =>
  value === null || value === undefined
    ? "待核价"
    : "¥ " +
      Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 6 });
const localDate = (value) => {
  const time = new Date(value);
  return new Date(time - time.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const fresh = (preset) => ({
  name: preset.name,
  vendor: preset.id,
  baseUrl: preset.baseUrl,
  model: preset.models[0] || "",
  temperature: 0.3,
  priority: 100,
  enabled: false,
  streamUsage: preset.streamUsage,
  requestMode: preset.requestMode,
});
function Links({ preset }) {
  return (
    <span className="ac-ai-links">
      {[
        ["接入文档", preset?.docs],
        ["官方价格", preset?.pricingUrl],
      ]
        .filter(([, url]) => url)
        .map(([label, url]) => (
          <a key={label} href={url} target="_blank" rel="noopener noreferrer">
            {label}
            <ExternalLink size={13} />
          </a>
        ))}
    </span>
  );
}

export function AiServices() {
  const { run, notify, busy } = useAdmin();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0),
    [editing, setEditing] = useState(null),
    [legacyOpen, setLegacyOpen] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    api(endpoint, undefined, "GET", { cache: false, signal: controller.signal })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [tick]);
  const reload = () => setTick((value) => value + 1);
  const openEditor = (row) => {
    setError("");
    setEditing({ row, revision: data.revision });
  };
  async function perform(label, url, body, method = "POST") {
    if (busy) return null;
    setError("");
    return run(label, async () => {
      try {
        const next = await api(endpoint + url, body, method, { cache: false });
        setData(next);
        notify(label + "成功");
        return next;
      } catch (cause) {
        if (url.endsWith("/test"))
          try {
            setData(await api(endpoint, undefined, "GET", { cache: false }));
          } catch {}
        setError(cause.message);
        throw cause;
      }
    });
  }
  async function move(index, step) {
    const ids = data.channels.map((row) => row.id);
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    await perform("调整优先级", "/order", { revision: data.revision, ids });
  }
  if (!data)
    return (
      <div className="ac-state" role={error ? "alert" : "status"}>
        {error || "正在读取模型接口…"}
        {error && <button onClick={reload}>重新读取</button>}
      </div>
    );
  const ready = data.channels.filter((row) => row.enabled && row.ready).length;
  return (
    <div className="ac-ai-services">
      {error && (
        <p className="ac-error ac-ai-alert" role="alert">
          {error}
          <button onClick={reload} disabled={!!busy}>
            刷新接口列表
          </button>
        </p>
      )}
      <Panel
        title="当前调用方式"
        description="配置一次，网页、App 和小程序的 AI 功能共同使用。"
        actions={
          <button disabled={!!busy} onClick={reload}>
            <RefreshCw size={15} />
            刷新
          </button>
        }
      >
        <div className="ac-ai-active">
          <div className="ac-ai-active-copy">
            <span className="ac-ai-eyebrow">
              {data.managed
                ? "多接口 · 按优先级选择"
                : "原单接口 · 保留现有配置"}
            </span>
            <h3>{data.selected?.name || "暂无可调用的接口"}</h3>
            <p>{data.selected?.model || "请先完成密钥和价格配置"}</p>
            <small>
              {data.selected?.baseUrl ||
                "没有就绪接口时停止调用，不会转用其他密钥。"}
            </small>
          </div>
          <div className="ac-ai-mode">
            <strong>
              {ready}
              <small> 个已启用且价格有效</small>
            </strong>
            <button
              className={data.managed ? "" : "ac-primary"}
              disabled={!!busy || (!data.managed && !ready)}
              onClick={() => {
                if (
                  window.confirm(
                    data.managed
                      ? "切回原单接口配置？列表中的连接会保留，但不再参与正常调用。"
                      : "启用优先级模式？所有正常 AI 调用将优先使用列表中已启用、密钥与价格就绪的连接，覆盖原环境配置。",
                  )
                )
                  void perform("切换调用方式", "/policy", {
                    revision: data.revision,
                    managed: !data.managed,
                  });
              }}
            >
              {data.managed ? "切回原单接口" : "启用优先级模式"}
            </button>
          </div>
        </div>
        <p className="ac-ai-rule">
          数字越小越优先；停用、缺少密钥、价格过期或成本待核对的接口会在调用前跳过。已发出的请求若失败，会退还本次预扣积分，不自动尝试其他付费接口。
        </p>
      </Panel>
      {!data.encryptionReady && (
        <p role="alert" className="ac-error ac-ai-alert">
          服务器加密主密钥尚未就绪，暂不能保存新 API Key；原有配置不会被清除。
        </p>
      )}
      <Panel
        title="添加国内模型服务"
        description="预填接入参数，模型名称和地区地址仍可修改。价格未确认时先存为停用草稿。"
      >
        <div className="ac-ai-presets">
          {data.catalog.map((preset) => (
            <button
              key={preset.id}
              disabled={!!busy}
              onClick={() => openEditor(fresh(preset))}
            >
              <Plus size={16} />
              {preset.name}
            </button>
          ))}
        </div>
      </Panel>
      <Panel
        title={`接口与优先级 · ${data.channels.length}`}
        description="支持多个服务商、同一服务商多个模型或密钥。上下移动可立即调整调用顺序。"
        actions={
          <button
            disabled={
              !!busy ||
              !data.legacy?.hasKey ||
              data.channels.some((row) => row.importedLegacy)
            }
            onClick={() =>
              void perform("复制现有连接", "/import-legacy", {
                revision: data.revision,
              })
            }
          >
            复制原连接到列表
          </button>
        }
      >
        <div className="ac-ai-list">
          {data.channels.length ? (
            data.channels.map((row, index) => {
              const preset = data.catalog.find(
                  (item) => item.id === row.vendor,
                ),
                selected = data.managed && data.selected?.id === row.id;
              return (
                <article
                  className={"ac-ai-channel" + (selected ? " is-selected" : "")}
                  key={row.id}
                  aria-label={row.name + " 接口"}
                >
                  <div className="ac-ai-channel-head">
                    <div className="ac-ai-priority" title="数字越小越优先">
                      {row.priority}
                    </div>
                    <div className="ac-ai-identity">
                      <h3>
                        {row.name}
                        {selected && (
                          <span className="ac-ai-badge">
                            <CheckCircle2 size={13} />
                            当前首选
                          </span>
                        )}
                      </h3>
                      <p>
                        {row.model} <span>· {preset?.name || row.vendor}</span>
                      </p>
                      <small>{row.baseUrl}</small>
                    </div>
                    <span
                      className={
                        "ac-ai-state " +
                        (row.enabled && row.ready ? "is-ready" : "")
                      }
                    >
                      {row.enabled
                        ? row.ready
                          ? "已启用"
                          : "已暂停 · 待核对"
                        : "已停用"}
                    </span>
                  </div>
                  <dl className="ac-ai-prices">
                    {[
                      ["输入", row.price?.input],
                      ["输出", row.price?.output],
                      ["缓存输入", row.price?.cached],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>
                          {label}
                          <small> / 百万 Token</small>
                        </dt>
                        <dd>{money(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  {row.price ? (
                    <div className="ac-ai-cost-note">
                      <p>
                        示例：1,000 输入 + 1,000 输出约{" "}
                        <strong>{money(row.sampleCostCny)}</strong>，约{" "}
                        <strong>{row.samplePoints} 积分</strong>
                        （不含缓存折扣）。
                      </p>
                      <p>
                        成本价有效至 {date(row.price.expiresAt)} ·{" "}
                        <span title={row.price.source}>{row.price.source}</span>
                      </p>
                    </div>
                  ) : (
                    <p className="ac-ai-warning">
                      {row.pricingError || "价格尚未确认"}
                      ；未核价不代表免费，也不会按 DeepSeek 的单价扣费。
                    </p>
                  )}
                  <div className="ac-ai-channel-foot">
                    <div className="ac-ai-key-state">
                      <KeyRound size={14} />
                      {row.hasKey ? "密钥已加密保存" : "尚未保存密钥"}
                      <span>
                        ·{" "}
                        {row.lastTest
                          ? `${row.lastTest.success ? "最近测试成功" : "最近测试失败"} ${date(row.lastTest.at)}`
                          : "未进行连接测试"}
                      </span>
                    </div>
                    <Links preset={preset} />
                  </div>
                  {row.lastTest && !row.lastTest.success && (
                    <p className="ac-ai-warning">{row.lastTest.message}</p>
                  )}
                  <div className="ac-ai-actions">
                    <div>
                      <button
                        aria-label={"提高 " + row.name + " 优先级"}
                        disabled={!!busy || index === 0}
                        onClick={() => void move(index, -1)}
                      >
                        <ArrowUp size={15} />
                        上移
                      </button>
                      <button
                        aria-label={"降低 " + row.name + " 优先级"}
                        disabled={!!busy || index === data.channels.length - 1}
                        onClick={() => void move(index, 1)}
                      >
                        <ArrowDown size={15} />
                        下移
                      </button>
                    </div>
                    <div>
                      <button disabled={!!busy} onClick={() => openEditor(row)}>
                        编辑连接
                      </button>
                      <button
                        disabled={!!busy || !row.ready}
                        onClick={() => {
                          if (
                            window.confirm(
                              `测试“${row.name}”会发出真实付费请求，消耗当前管理员积分并记录成本；不改变当前首选接口。继续吗？`,
                            )
                          )
                            void perform(
                              "测试连接",
                              "/channels/" + row.id + "/test",
                              { confirmed: true },
                            );
                        }}
                      >
                        <PlugZap size={15} />
                        测试连接
                      </button>
                      <button
                        disabled={!!busy || (!row.enabled && !row.ready)}
                        onClick={() =>
                          void perform(
                            row.enabled ? "停用连接" : "启用连接",
                            "/channels/" + row.id + "/state",
                            { revision: data.revision, enabled: !row.enabled },
                          )
                        }
                      >
                        {row.enabled ? "停用" : "启用"}
                      </button>
                      <button
                        className="ac-ai-danger"
                        disabled={!!busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `移除“${row.name}”？不会删除历史用量、价格和原单接口配置。`,
                            )
                          )
                            void perform(
                              "移除连接",
                              "/channels/" + row.id,
                              { revision: data.revision },
                              "DELETE",
                            );
                        }}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="ac-empty">
              <ShieldCheck size={28} />
              <strong>现有 DeepSeek 连接继续使用</strong>
              <p>先添加、核价并测试新连接，再启用优先级模式。</p>
            </div>
          )}
        </div>
      </Panel>
      <details
        className="ac-ai-legacy"
        onToggle={(event) => setLegacyOpen(event.currentTarget.open)}
      >
        <summary>原单接口配置（保留，可随时切回）</summary>
        {legacyOpen && <LegacyConfig onSaved={reload} />}
      </details>
      {editing && (
        <ChannelEditor
          key={editing.row.id || editing.row.vendor}
          {...editing}
          catalog={data.catalog}
          encryptionReady={data.encryptionReady}
          busy={!!busy}
          saveError={error}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const next = await perform(
              "保存模型连接",
              "/channels" + (editing.row.id ? "/" + editing.row.id : ""),
              body,
              editing.row.id ? "PUT" : "POST",
            );
            if (next) setEditing(null);
            return !!next;
          }}
        />
      )}
    </div>
  );
}

function ChannelEditor({
  row,
  revision,
  catalog,
  encryptionReady,
  busy,
  saveError,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({ ...row, apiKey: "", clearKey: false }),
    [dirty, setDirty] = useState(false),
    [updatePrice, setUpdatePrice] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [simple, setSimple] = useState(false),
    [error, setError] = useState("");
  const [cost, setCost] = useState({
    input: row.price?.input || "",
    output: row.price?.output || "",
    cached: row.price?.cached || "",
    source: row.price?.source || "",
    expiresAt: localDate(Date.now() + 7 * 86400000),
  });
  const preset = catalog.find((item) => item.id === form.vendor),
    reference = preset.references?.find((item) => item.model === form.model),
    exactPreset = form.baseUrl.replace(/\/$/, "") === preset.baseUrl;
  const field = (key, value) => {
    setDirty(true);
    if (["baseUrl", "model", "requestMode"].includes(key)) {
      setConfirmed(false);
      setSimple(false);
    }
    setForm((current) => ({ ...current, [key]: value }));
  };
  const priceField = (key, value) => {
    setDirty(true);
    setConfirmed(false);
    setSimple(false);
    setCost((current) => ({ ...current, [key]: value }));
  };
  return (
    <Modal
      title={row.id ? "编辑模型连接" : "添加模型连接"}
      wide
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={dirty}
    >
      <form
        className="ac-ai-editor"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const body = {
            revision,
            name: form.name,
            vendor: form.vendor,
            baseUrl: form.baseUrl,
            model: form.model,
            temperature: Number(form.temperature),
            priority: Number(form.priority),
            enabled: form.enabled,
            streamUsage: form.streamUsage,
            requestMode: form.requestMode,
            clearKey: form.clearKey,
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          };
          if (updatePrice)
            body.price = {
              ...cost,
              expiresAt: new Date(cost.expiresAt).toISOString(),
              confirmed,
              simpleTokenBilling: simple,
            };
          if (!(await onSave(body)))
            setError(
              "保存未完成。请查看上方错误；如列表已被修改，请关闭后刷新再编辑。",
            );
        }}
      >
        <div className="ac-ai-form-grid">
          <label>
            连接名称
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => field("name", event.target.value)}
            />
          </label>
          <label>
            服务商
            <select
              value={form.vendor}
              onChange={(event) => {
                const selected = catalog.find(
                  (item) => item.id === event.target.value,
                );
                setDirty(true);
                setForm((current) => ({
                  ...current,
                  ...fresh(selected),
                  name: current.name,
                  apiKey: "",
                  clearKey: false,
                }));
                setUpdatePrice(false);
                setConfirmed(false);
                setSimple(false);
              }}
            >
              {catalog.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="ac-ai-span">
            服务地址（Base URL）
            <input
              required
              type="url"
              maxLength={1000}
              value={form.baseUrl}
              onChange={(event) => field("baseUrl", event.target.value)}
            />
            <small>
              使用该地区的 Chat Completions 根地址，不附加
              /chat/completions；修改地址后需重新输入对应密钥。
            </small>
          </label>
          <label>
            模型名称 / 接入点 ID
            <input
              required
              maxLength={200}
              list="ac-ai-model-options"
              value={form.model}
              onChange={(event) => field("model", event.target.value)}
            />
            <datalist id="ac-ai-model-options">
              {preset.models.map((model) => (
                <option value={model} key={model} />
              ))}
            </datalist>
          </label>
          <label>
            优先级（越小越优先）
            <input
              required
              type="number"
              min="1"
              max="9999"
              step="1"
              value={form.priority}
              onChange={(event) => field("priority", event.target.value)}
            />
          </label>
          <label className="ac-ai-span">
            {row.hasKey ? "新 API Key（留空保留原密钥）" : "API Key"}
            <input
              type="password"
              autoComplete="new-password"
              maxLength={4096}
              value={form.apiKey}
              disabled={form.clearKey}
              onChange={(event) => field("apiKey", event.target.value)}
            />
            <small>仅在服务端加密保存；读取配置不回传密钥。</small>
          </label>
        </div>
        {row.hasKey && (
          <label className="ac-ai-check">
            <input
              type="checkbox"
              checked={form.clearKey}
              onChange={(event) => {
                field("clearKey", event.target.checked);
                if (event.target.checked) {
                  field("apiKey", "");
                  field("enabled", false);
                }
              }}
            />
            清除已存密钥并停用此连接
          </label>
        )}
        <div className="ac-ai-preset-note">
          <p>{preset.note}</p>
          <Links preset={preset} />
          <small>
            接入提示核对于 {preset.checkedOn}；模型以控制台实际可用列表为准。
          </small>
        </div>
        <fieldset className="ac-ai-price-box">
          <legend>价格与成本提示 · 人民币 / 百万 Token</legend>
          {row.price && (
            <p>
              此地址和模型当前已确认：输入 {money(row.price.input)} / 输出{" "}
              {money(row.price.output)} / 缓存 {money(row.price.cached)}，有效至{" "}
              {date(row.price.expiresAt)}。修改地址或模型后需重新核价。
            </p>
          )}
          {reference && (
            <div className="ac-ai-reference">
              <p>
                <strong>官方参考价（非自动生效）</strong>：输入{" "}
                {money(reference.input)} / 输出 {money(reference.output)} / 缓存{" "}
                {money(reference.cached)}
              </p>
              <button
                type="button"
                disabled={!exactPreset || busy}
                onClick={() => {
                  setDirty(true);
                  setUpdatePrice(true);
                  setCost((current) => ({
                    ...current,
                    input: reference.input,
                    output: reference.output,
                    cached: reference.cached,
                    source: preset.pricingUrl + " 核对于 " + preset.checkedOn,
                  }));
                  setConfirmed(false);
                  setSimple(false);
                }}
              >
                填入参考价，待我确认
              </button>
            </div>
          )}
          <label className="ac-ai-check">
            <input
              type="checkbox"
              checked={updatePrice}
              onChange={(event) => {
                setDirty(true);
                setUpdatePrice(event.target.checked);
                setConfirmed(false);
                setSimple(false);
              }}
            />
            确认或更新此地址与模型的成本价格
          </label>
          <p className="ac-ai-price-help">
            同地址、同模型共用价目。这里只支持文本 Token
            计价；不同地域、上下文或模式按实际适用的最高费率确认。未知价不按零元，也不套用其他服务商价格。
          </p>
          {updatePrice && (
            <>
              <div className="ac-ai-form-grid ac-ai-price-fields">
                {[
                  ["input", "输入价格"],
                  ["output", "输出价格"],
                  ["cached", "缓存输入价格"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required
                      inputMode="decimal"
                      pattern="[0-9]+([.][0-9]{1,6})?"
                      value={cost[key]}
                      onChange={(event) => priceField(key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <div className="ac-ai-form-grid">
                <label>
                  价格依据或账单说明
                  <input
                    required
                    minLength={8}
                    maxLength={1000}
                    value={cost.source}
                    onChange={(event) =>
                      priceField("source", event.target.value)
                    }
                  />
                </label>
                <label>
                  下次核价截止（最多 31 天）
                  <input
                    required
                    type="datetime-local"
                    min={localDate(Date.now() + 60000)}
                    max={localDate(Date.now() + 30 * 86400000)}
                    value={cost.expiresAt}
                    onChange={(event) =>
                      priceField("expiresAt", event.target.value)
                    }
                  />
                </label>
              </div>
              <label className="ac-ai-check">
                <input
                  required
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                我已核对该地址、模型、区域与适用最高档价格
              </label>
              <label className="ac-ai-check">
                <input
                  required
                  type="checkbox"
                  checked={simple}
                  onChange={(event) => setSimple(event.target.checked)}
                />
                此连接仅按输入 / 输出 /
                缓存输入计费，无额外工具、缓存写入或存储费用
              </label>
            </>
          )}
        </fieldset>
        <details className="ac-ai-advanced">
          <summary>高级兼容设置</summary>
          <div className="ac-ai-form-grid">
            <label>
              温度
              <input
                required
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={form.temperature}
                onChange={(event) => field("temperature", event.target.value)}
              />
            </label>
            <label>
              用量返回方式
              <select
                value={form.streamUsage}
                onChange={(event) => field("streamUsage", event.target.value)}
              >
                <option value="include">流式 + include_usage</option>
                <option value="native">
                  原生流式用量（不发 stream_options）
                </option>
                <option value="non-stream">非流式 JSON（兼容优先）</option>
              </select>
            </label>
            <label>
              思考模式参数
              <select
                value={form.requestMode}
                onChange={(event) => field("requestMode", event.target.value)}
              >
                <option value="standard">标准兼容参数</option>
                <option value="qwen-no-thinking">
                  千问：enable_thinking=false
                </option>
                <option value="thinking-disabled">
                  thinking.type=disabled
                </option>
              </select>
            </label>
          </div>
          <p>
            仅在服务商支持时使用对应参数；上游未返回可靠用量时会退款并暂停该地址与模型，等待核对。
          </p>
        </details>
        <label className="ac-ai-check">
          <input
            type="checkbox"
            checked={form.enabled}
            disabled={form.clearKey}
            onChange={(event) => field("enabled", event.target.checked)}
          />
          保存后启用此连接（密钥和有效价格必须就绪）
        </label>
        {(error || saveError) && (
          <p role="alert" className="ac-error">
            {saveError || error}
          </p>
        )}
        <div className="ac-dialog-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!dirty || window.confirm("放弃尚未保存的修改？")) onClose();
            }}
          >
            取消
          </button>
          <button
            className="ac-primary"
            disabled={busy || (!!form.apiKey && !encryptionReady)}
          >
            <Save size={16} />
            {busy ? "正在保存…" : "保存模型连接"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
