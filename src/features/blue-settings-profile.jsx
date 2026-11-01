import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Camera,
  LoaderCircle,
  Pencil,
  Save,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { MembershipBadge } from "../components/membership-badge.jsx";
import { UserAvatar } from "../components/user-avatar.jsx";
import "./blue-settings-profile.css";

const maxImageBytes = 2 * 1024 * 1024;
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function ProfileEditor({ user, onSaved, onClose }) {
  const dialog = useRef(null),
    input = useRef(null),
    saving = useRef(false);
  const alive = useRef(true),
    imageRevision = useRef(0);
  const [name, setName] = useState(user.communityName || "");
  const [image, setImage] = useState(null),
    [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [imageError, setImageError] = useState("");
  useEffect(() => {
    alive.current = true;
    const modal = dialog.current,
      previouslyFocused = document.activeElement;
    const overflow = document.body.style.overflow;
    modal.showModal();
    modal.querySelector('input[name="displayName"]')?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      alive.current = false;
      imageRevision.current++;
      modal.close();
      document.body.style.overflow = overflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);
  function close() {
    if (!saving.current) onClose();
  }
  async function chooseImage(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const revision = ++imageRevision.current;
    setImage(null);
    setImageError("");
    setReading(false);
    if (!imageTypes.has(file.type) || file.size > maxImageBytes || !file.size) {
      setImageError("请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片。");
      return;
    }
    setReading(true);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("图片读取失败，请重新选择。"));
        reader.readAsDataURL(file);
      });
      // Decode locally before previewing; the server still validates MIME and bytes.
      await new Promise((resolve, reject) => {
        const preview = new Image();
        preview.onload = resolve;
        preview.onerror = () =>
          reject(new Error("无法打开这张图片，请更换图片。"));
        preview.src = dataUrl;
      });
      if (alive.current && revision === imageRevision.current)
        setImage({ mimeType: file.type, data: dataUrl.split(",")[1], dataUrl });
    } catch (cause) {
      if (alive.current && revision === imageRevision.current)
        setImageError(cause.message);
    } finally {
      if (alive.current && revision === imageRevision.current)
        setReading(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    if (saving.current || reading || imageError) return;
    const trimmed = name.trim();
    if (
      !trimmed ||
      trimmed.length > 24 ||
      /[\u0000-\u001f\u007f]/.test(trimmed)
    ) {
      setError("请输入 1–24 个字的显示名称，不能包含控制字符。");
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      // Preserve the existing name-only flow for accounts without a custom avatar.
      const result = image
        ? await api(
            "/auth/profile",
            {
              name: trimmed,
              image: { mimeType: image.mimeType, data: image.data },
            },
            "PUT",
          )
        : await api("/community/profile", { name: trimmed }, "PUT");
      if (alive.current) onSaved(result.user);
    } catch (cause) {
      if (alive.current)
        setError(cause.message + "；修改内容已保留，可重试保存。");
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const changed = image || name.trim() !== (user.communityName || "");
  return (
    <dialog
      ref={dialog}
      className="blue-profile-dialog"
      aria-labelledby="blue-profile-title"
      aria-describedby="blue-profile-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          close();
      }}
    >
      <header>
        <div>
          <span className="blue-profile-eyebrow">你的学习空间</span>
          <h2 id="blue-profile-title">编辑个人资料</h2>
        </div>
        <button
          type="button"
          className="blue-profile-close"
          aria-label="关闭资料编辑"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      <p id="blue-profile-description">
        头像和昵称会在社区中展示，并同步到 App。
      </p>
      <form onSubmit={save}>
        <fieldset disabled={busy}>
          <div className="blue-profile-upload">
            <UserAvatar
              url={image?.dataUrl || user.avatarUrl}
              className="blue-profile-preview"
            />
            <div>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="上传头像图片"
                hidden
                onChange={chooseImage}
              />
              <button type="button" onClick={() => input.current.click()}>
                <Camera size={17} />
                {reading ? "正在读取…" : "选择头像"}
              </button>
              <small>JPG、PNG 或 WebP，最大 2 MB</small>
              {image && (
                <button
                  type="button"
                  className="blue-profile-reset"
                  onClick={() => {
                    imageRevision.current++;
                    setImage(null);
                    setImageError("");
                  }}
                >
                  撤销本次图片
                </button>
              )}
              {imageError && (
                <p className="blue-profile-error" role="alert">
                  {imageError}
                  <button type="button" onClick={() => setImageError("")}>
                    保留原头像
                  </button>
                </p>
              )}
            </div>
          </div>
          <label>
            显示名称
            <input
              name="displayName"
              autoComplete="nickname"
              value={name}
              maxLength={24}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p className="blue-profile-account">
            登录账号：<span>{user.username}</span>
            <small>修改显示名称不会改变登录账号。</small>
          </p>
        </fieldset>
        {error && (
          <p className="blue-profile-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            取消
          </button>
          <button
            className="primary"
            type="submit"
            disabled={
              !changed || !name.trim() || busy || reading || !!imageError
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Save size={17} />
            )}
            {busy ? "正在保存…" : "保存资料"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

export function BlueSettingsProfile({
  user,
  membership,
  busy,
  onOpenVip,
  onUserUpdated,
  notify,
}) {
  const [editing, setEditing] = useState(false);
  const { account, loading, error, reload } = membership;
  const expiry = account?.expiresAt ? new Date(account.expiresAt) : null;
  const memberText = !account
    ? loading
      ? "正在同步会员权益…"
      : "会员权益暂未同步"
    : account.plan === "free"
      ? "学习进度随账号保存，网页与 App 同步"
      : expiry && Number.isFinite(expiry.getTime())
        ? `会员有效期至 ${expiry.toLocaleDateString("zh-CN")} · 网页与 App 同步`
        : "会员权益已生效 · 网页与 App 同步";
  return (
    <section className="blue-settings-profile" aria-label="个人资料">
      <UserAvatar url={user.avatarUrl} className="blue-profile-avatar" />
      <div className="blue-profile-identity">
        <div>
          <h2>{user.communityName || user.username || "学习者"}</h2>
          {account && <MembershipBadge plan={account.plan} />}
        </div>
        <p>{memberText}</p>
        {error && (
          <p role="alert">
            {error}
            <button
              type="button"
              disabled={loading}
              onClick={() => void reload()}
            >
              重新读取权益
            </button>
          </p>
        )}
      </div>
      <div className="blue-profile-actions">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => setEditing(true)}
        >
          <Pencil size={17} />
          编辑资料
        </button>
        <button type="button" onClick={onOpenVip}>
          会员与额度
          <ArrowRight size={17} />
        </button>
      </div>
      {editing && (
        <ProfileEditor
          user={user}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            onUserUpdated(updated);
            setEditing(false);
            notify("个人资料已保存，网页与 App 已同步");
          }}
        />
      )}
    </section>
  );
}
