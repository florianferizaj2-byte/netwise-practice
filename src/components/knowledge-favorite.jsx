import { useEffect, useRef, useState } from "react";
import { Bookmark, RefreshCw } from "lucide-react";
import { api } from "../api.js";
import "./knowledge-favorite.css";

export function KnowledgeFavoriteButton({ id, disabled = false }) {
  const [saved, setSaved] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(null),
    epoch = useRef(0);
  useEffect(() => {
    const generation = ++epoch.current;
    pending.current = null;
    setSaved(false);
    setError("");
    setLoading(true);
    setSaving(false);
    if (!id) {
      setLoading(false);
      return;
    }
    api(
      "/knowledge-favorites/" + encodeURIComponent(id),
      undefined,
      undefined,
      { cache: false },
    )
      .then((result) => {
        if (epoch.current === generation) setSaved(result.favorite);
      })
      .catch((e) => {
        if (epoch.current === generation) setError(e.message);
      })
      .finally(() => {
        if (epoch.current === generation) setLoading(false);
      });
    return () => {
      epoch.current++;
    };
  }, [id]);
  async function toggle() {
    if (loading || saving || disabled || !id) return;
    const generation = epoch.current;
    const readingAgain = !!error && pending.current === null;
    setSaving(true);
    setError("");
    try {
      if (readingAgain) {
        const result = await api(
          "/knowledge-favorites/" + encodeURIComponent(id),
          undefined,
          undefined,
          { cache: false },
        );
        if (epoch.current === generation) setSaved(result.favorite);
        return;
      }
      if (pending.current === null) pending.current = !saved;
      const result = await api(
        "/knowledge-favorites/" + encodeURIComponent(id),
        { favorite: pending.current },
        "PUT",
      );
      if (epoch.current !== generation) return;
      setSaved(result.favorite);
      pending.current = null;
    } catch (e) {
      if (epoch.current === generation) setError(e.message);
    } finally {
      if (epoch.current === generation) setSaving(false);
    }
  }
  return (
    <div className="knowledge-favorite-control">
      <button
        type="button"
        className="knowledge-favorite-button"
        aria-label={saved ? "取消收藏知识点" : "收藏知识点"}
        aria-pressed={saved}
        disabled={disabled || loading || saving || !id}
        onClick={toggle}
      >
        {saving ? (
          <RefreshCw size={17} className="spin" />
        ) : (
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
        )}
        {loading
          ? "读取收藏…"
          : saving
            ? "保存中…"
            : error
              ? pending.current !== null
                ? "重试保存"
                : "重试读取"
              : saved
                ? "已收藏"
                : "收藏"}
      </button>
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
