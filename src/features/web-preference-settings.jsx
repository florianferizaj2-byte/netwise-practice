import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Monitor,
  Moon,
  RefreshCw,
  Save,
  Sun,
} from "lucide-react";
import { api } from "../api.js";
import { webPreferenceDefaults } from "../../server/web-preference-values.js";
import "./web-preference-settings.css";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function WebPreferenceSettings({ state, notify, busy }) {
  const [draft, setDraft] = useState({ ...webPreferenceDefaults }),
    [saving, setSaving] = useState(false),
    [issue, setIssue] = useState("");
  const pending = useRef(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (state.record) {
      setDraft({ ...webPreferenceDefaults, ...state.record.values });
      pending.current = null;
    }
  }, [state.record]);
  const blocked =
    !state.record ||
    state.loading ||
    saving ||
    !!busy ||
    pending.current !== null;
  const dirty = state.record && !same(draft, state.record.values);
  async function save() {
    if (saving || !state.record || state.loading || busy) return;
    setSaving(true);
    setIssue("");
    try {
      if (!pending.current)
        pending.current = {
          requestId: crypto.randomUUID(),
          version: state.record.version,
          certificateId: state.record.certificateId,
          values: draft,
        };
      const data = await api("/web-preferences", pending.current, "PUT");
      if (!alive.current) return;
      state.accept(data);
      pending.current = null;
      notify("设置已保存");
    } catch (e) {
      if (!alive.current) return;
      setIssue(e.message);
      if (e.status >= 400 && e.status < 500) {
        pending.current = null;
        if (e.status === 409) {
          await state.reload().catch(() => {});
          if (alive.current) setIssue(e.message);
        }
      }
    } finally {
      if (alive.current) setSaving(false);
    }
  }
  return (
    <section className="web-preference-settings" aria-label="网页学习设置">
      <header>
        <div>
          <h2>学习与显示设置</h2>
          <p>按自己的习惯，调整学习体验。</p>
        </div>
        <button
          className="web-pref-save"
          disabled={
            saving ||
            !state.record ||
            state.loading ||
            !!busy ||
            (!dirty && !pending.current)
          }
          onClick={save}
        >
          <Save size={17} />
          {saving ? "正在保存…" : pending.current ? "重试保存设置" : "保存设置"}
        </button>
      </header>
      {(state.error || issue) && (
        <div className="web-pref-error" role="alert">
          <p>{state.error || issue}</p>
          <button
            disabled={saving || state.loading}
            onClick={() => {
              setIssue("");
              void state.reload().catch(() => {});
            }}
          >
            <RefreshCw size={16} />
            重新读取设置
          </button>
        </div>
      )}
      {state.loading && !state.record ? (
        <p role="status">正在读取账号设置…</p>
      ) : (
        <div className="web-pref-grid">
          <section>
            <h3>
              <BookOpen size={21} />
              学习偏好
            </h3>
            <fieldset disabled={blocked}>
              <legend>每次练习默认题量</legend>
              <div className="web-pref-count">
                {[10, 20, 30].map((n) => (
                  <button
                    key={n}
                    aria-pressed={draft.defaultCount === n}
                    onClick={() => setDraft((d) => ({ ...d, defaultCount: n }))}
                  >
                    {n} 题
                  </button>
                ))}
              </div>
              <p>
                保存到当前备考方向。章节练习会优先使用上次选项，收藏练习默认采用这里的题量。
              </p>
            </fieldset>
            {[
              [
                "showAnalysis",
                "作答后展开解析",
                "保存作答后自动展开讲解；关闭时仍可手动查看。",
              ],
              [
                "autoNext",
                "自动切换下一题",
                "本次作答保存成功后停留 3 秒，可随时留在本题；最后一题手动结束。",
              ],
            ].map(([key, label, description]) => (
              <label className="web-pref-motion" key={key}>
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={label}
                  checked={draft[key]}
                  disabled={blocked}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, [key]: event.target.checked }))
                  }
                />
              </label>
            ))}
            <p className="web-pref-practice-scope">
              适用于本网页的章节、错题、收藏和计划刷题，含兽医专项；模拟考试与分步精讲保持各自节奏。
            </p>
            <div className="web-pref-reading-preview">
              <strong>阅读预览</strong>
              <p
                style={{
                  fontSize: { standard: 16, large: 18, largest: 20 }[
                    draft.textSize
                  ],
                }}
              >
                把知识点拆成小步，每次练一点，进步看得见。
              </p>
            </div>
          </section>
          <section>
            <h3>
              <Sun size={22} />
              显示设置
            </h3>
            <fieldset disabled={blocked}>
              <legend>主题外观</legend>
              <div className="web-pref-themes">
                {[
                  ["light", "浅色", Sun],
                  ["dark", "深色", Moon],
                  ["system", "跟随系统", Monitor],
                ].map(([id, label, Icon]) => (
                  <button
                    key={id}
                    aria-pressed={draft.theme === id}
                    onClick={() => setDraft((d) => ({ ...d, theme: id }))}
                  >
                    <span className={"theme-sample theme-" + id}>
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      <Icon size={15} />
                      {label}
                      {draft.theme === id && <Check size={14} />}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset disabled={blocked}>
              <legend>阅读文字大小</legend>
              <div className="web-pref-count">
                {[
                  ["standard", "标准"],
                  ["large", "较大"],
                  ["largest", "大号"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={draft.textSize === id}
                    onClick={() => setDraft((d) => ({ ...d, textSize: id }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p>调整题干、选项与精讲正文；图解保留适合版面的字号。</p>
            </fieldset>
            <label className="web-pref-motion">
              <span>
                <strong>减少动画</strong>
                <small>关闭插画和界面过渡，也遵从系统的减少动画设置。</small>
              </span>
              <input
                type="checkbox"
                role="switch"
                aria-label="减少网页动画"
                checked={draft.reducedMotion}
                disabled={blocked}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, reducedMotion: e.target.checked }))
                }
              />
            </label>
          </section>
        </div>
      )}
      <p className="web-pref-note">
        {dirty
          ? "修改后点击保存，才会应用到学习页面。"
          : "设置随账号保存，刷新或换浏览器也能恢复。"}
      </p>
    </section>
  );
}
