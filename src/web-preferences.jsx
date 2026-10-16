import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import {
  webPreferenceDefaults,
  validWebPreferences,
} from "../server/web-preference-values.js";
import "./web-preferences.css";

export function useWebPreferences(user, enabled) {
  const scope = enabled && user ? `${user.id}:${user.certificateId}` : "";
  const [record, setRecord] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const generation = useRef(0),
    scopeRef = useRef(scope);
  scopeRef.current = scope;
  const reload = useCallback(async () => {
    if (!scope) return;
    const epoch = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const data = await api("/web-preferences", undefined, undefined, {
        cache: false,
      });
      if (
        data.certificateId !== user.certificateId ||
        !Number.isInteger(data.version) ||
        data.version < 0 ||
        !validWebPreferences(data.values)
      )
        throw new Error("设置范围已改变，请刷新页面重试。");
      if (epoch === generation.current)
        setRecord({ ...data, owner: user.id, scope });
      return data;
    } catch (e) {
      if (epoch === generation.current) setError(e.message);
      throw e;
    } finally {
      if (epoch === generation.current) setLoading(false);
    }
  }, [scope]);
  useEffect(() => {
    if (!scope) {
      generation.current++;
      setRecord(null);
      setError("");
      setLoading(false);
      return;
    }
    void reload().catch(() => {});
    return () => {
      generation.current++;
    };
  }, [scope, reload]);
  const active = record?.scope === scope && !!scope;
  const values = active
    ? { ...webPreferenceDefaults, ...record.values }
    : record?.owner === user?.id && !!scope
      ? { ...record.values, defaultCount: 10 }
      : { ...webPreferenceDefaults };
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)"),
      listen = (event) => setSystemDark(event.matches);
    query.addEventListener("change", listen);
    return () => query.removeEventListener("change", listen);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (!scope) {
      delete root.dataset.webTheme;
      delete root.dataset.webTextSize;
      delete root.dataset.webReducedMotion;
      delete root.dataset.theme;
      return;
    }
    root.dataset.webTheme =
      values.theme === "system"
        ? systemDark
          ? "dark"
          : "light"
        : values.theme;
    root.dataset.theme = root.dataset.webTheme;
    root.dataset.webTextSize = values.textSize;
    root.dataset.webReducedMotion = String(values.reducedMotion);
    return () => {
      delete root.dataset.webTheme;
      delete root.dataset.webTextSize;
      delete root.dataset.webReducedMotion;
      delete root.dataset.theme;
    };
  }, [scope, values.theme, values.textSize, values.reducedMotion, systemDark]);
  function accept(data) {
    if (
      !Number.isInteger(data.version) ||
      data.version < 0 ||
      !validWebPreferences(data.values) ||
      scopeRef.current !== scope ||
      data.certificateId !== user.certificateId
    )
      throw new Error("设置范围已改变，请刷新页面重试。");
    setRecord({ ...data, owner: user.id, scope });
    setError("");
  }
  return {
    record: active ? record : null,
    values,
    loading: loading || (!active && !error && !!scope),
    error,
    reload,
    accept,
  };
}
export function reduceWebMotion() {
  return (
    document.documentElement.dataset.webReducedMotion === "true" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
