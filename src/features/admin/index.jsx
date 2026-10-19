import { Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  Command,
  Menu,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { modules, aliases } from "./registry.jsx";
import { AdminContext, Resource, useResource } from "./shared.jsx";
import { FeatureBoundary } from "../../components/feature-boundary.jsx";
import "./admin.css";

function route() {
  const hash = location.hash.slice(1),
    [path, query = ""] = hash.split("?");
  const id =
    path === "study-admin" ? "teaching" : path.split("/")[1] || "overview";
  return { section: aliases[id] || id, params: new URLSearchParams(query) };
}
export function AdminView({ user, certificates = [], navigate }) {
  const [locationState, setLocationState] = useState(route),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const main = useRef(),
    searchRef = useRef(),
    navigationGuard = useRef(null),
    currentHash = useRef(location.hash);
  const active = modules.find((m) => m.id === locationState.section),
    section = active?.id || locationState.section;
  useEffect(() => {
    const change = () => {
      if (
        location.hash !== currentHash.current &&
        navigationGuard.current &&
        !navigationGuard.current()
      ) {
        history.replaceState(null, "", currentHash.current);
        return;
      }
      currentHash.current = location.hash;
      setLocationState(route());
      setMenu(false);
      setError("");
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    main.current?.focus();
  }, [section]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setMenu(true);
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const go = (id, params = {}) => {
    const query = new URLSearchParams(params);
    location.hash = "admin/" + id + (query.size ? "?" + query : "");
  };
  const setParams = (updates) => {
    const params = new URLSearchParams(locationState.params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined || value === null || value === "")
        params.delete(key);
      else params.set(key, String(value));
    }
    if (!Object.hasOwn(updates, "offset")) params.delete("offset");
    go(section, Object.fromEntries(params));
  };
  const run = async (label, work) => {
    setBusy(label);
    setError("");
    try {
      return await work();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy("");
    }
  };
  const apiContext = {
    user,
    certificates,
    section,
    params: locationState.params,
    setParams,
    go,
    run,
    busy,
    notify: setNotice,
    registerNavigationGuard: (guard) => {
      navigationGuard.current = guard;
    },
    certificateId: locationState.params.get("certificateId") || "",
  };
  const groups = [...new Set(modules.map((m) => m.group))];
  return (
    <AdminContext.Provider value={apiContext}>
      <div className="admin-console blue-workspace" data-testid="admin-console">
        {menu && (
          <button
            className="ac-mobile-shade"
            aria-label="关闭菜单"
            onClick={() => setMenu(false)}
          />
        )}
        <aside className={"ac-sidebar " + (menu ? "is-open" : "")}>
          <a href="#admin/overview" className="ac-brand">
            <span className="ac-brand-seal">考</span>
            <span>
              <strong>考匠</strong>
              <small>管理工作台</small>
            </span>
            <span className="ac-admin-tag">ADMIN</span>
          </a>
          <label className="ac-nav-search">
            <Search size={16} />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="查找管理功能"
              aria-label="查找管理功能"
            />
            <kbd>⌘ K</kbd>
          </label>
          <nav aria-label="管理导航">
            {groups.map((group) => {
              const entries = modules.filter(
                (m) =>
                  m.group === group &&
                  m.label.toLowerCase().includes(search.toLowerCase()),
              );
              return entries.length ? (
                <section key={group}>
                  <h2>{group}</h2>
                  {entries.map(({ id, label, icon: Icon }) => (
                    <a
                      key={id}
                      href={"#admin/" + id}
                      className={section === id ? "active" : ""}
                      aria-current={section === id ? "page" : undefined}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {section === id && <ChevronRight size={15} />}
                    </a>
                  ))}
                </section>
              ) : null;
            })}
            {search && !modules.some((m) => m.label.includes(search)) && (
              <p className="ac-muted">没有找到对应功能</p>
            )}
          </nav>
          <div className="ac-sidebar-bottom">
            <div>
              <ShieldCheck size={17} />
              <span>
                {user?.communityName || user?.username || "管理员"}
                <small>管理员权限已验证</small>
              </span>
            </div>
            <button
              onClick={() => {
                if (!navigationGuard.current || navigationGuard.current())
                  navigate("home");
              }}
            >
              <ArrowLeft size={16} />
              返回学习空间
            </button>
          </div>
        </aside>
        <div className="ac-workspace">
          <header className="ac-topbar">
            <div>
              <button
                className="ac-menu"
                aria-label="展开管理导航"
                onClick={() => setMenu(!menu)}
              >
                <Menu size={19} />
              </button>
              <span>管理中心</span>
              <ChevronRight size={14} />
              <strong>{active?.label || "未找到页面"}</strong>
            </div>
            <div className="ac-topbar-right">
              {active?.scoped && (
                <select
                  aria-label="管理证书范围"
                  value={apiContext.certificateId}
                  onChange={(e) =>
                    setParams({
                      certificateId: e.target.value,
                      chapter: "",
                      knowledgeSection: "",
                      knowledgePoint: "",
                    })
                  }
                >
                  <option value="">全部证书</option>
                  {certificates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.shortName || c.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="ac-access">
                <ShieldCheck size={15} />
                管理模式
              </span>
            </div>
          </header>
          <main
            ref={main}
            tabIndex={-1}
            className="ac-main"
            data-page="admin"
            data-admin-section={section}
          >
            <div className="ac-page-heading">
              <div>
                <div className="ac-eyebrow">ACEEXAM / OPERATIONS</div>
                <h1>{active?.label || "页面不存在"}</h1>
                <p>{active?.description || "请从管理导航选择功能。"}</p>
              </div>
              <span className="ac-workspace-pill">
                <span />
                管理工作台
              </span>
            </div>
            {error && (
              <div className="ac-error-banner" role="alert">
                <strong>{error}</strong>
                <button onClick={() => setError("")} aria-label="关闭错误">
                  <X size={16} />
                </button>
              </div>
            )}
            {active ? (
              <FeatureBoundary key={section}>
                <Suspense
                  fallback={
                    <div className="ac-state" role="status">
                      正在打开管理模块…
                    </div>
                  }
                >
                  <active.component />
                </Suspense>
              </FeatureBoundary>
            ) : (
              <button onClick={() => go("overview")}>返回工作台</button>
            )}
          </main>
          <footer className="ac-footer">
            <span>考匠 AceExam · 内容与运营管理</span>
            <span>操作留痕 · 数据按实际状态展示</span>
          </footer>
        </div>
        {notice && (
          <div className="ac-toast" role="status">
            <ShieldCheck size={17} />
            {notice}
          </div>
        )}
        {busy && (
          <div className="ac-working" role="status">
            {busy}…
          </div>
        )}
      </div>
    </AdminContext.Provider>
  );
}
