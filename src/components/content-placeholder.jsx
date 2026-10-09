import "../loading.css";

export function ContentPlaceholder({
  variant = "article",
  rows = 4,
  className = "",
}) {
  return (
    <div
      className={`content-placeholder placeholder-${variant} ${className}`}
      role="status"
      aria-label="正在获取内容"
      aria-busy="true"
    >
      <div aria-hidden="true" className="placeholder-body">
        <span className="placeholder-line placeholder-title" />
        {Array.from({ length: rows }, (_, index) => (
          <div className="placeholder-row" key={index}>
            <span className="placeholder-line" />
            {variant !== "list" && (
              <span className="placeholder-line placeholder-short" />
            )}
          </div>
        ))}
        {variant === "practice" && <span className="placeholder-answer" />}
      </div>
    </div>
  );
}

export function AppPlaceholder({ desktop = true, children }) {
  return (
    <div className={`app-placeholder ${desktop ? "with-sidebar" : ""}`}>
      {desktop && (
        <aside aria-hidden="true">
          <div className="placeholder-brand">
            <img src="/kaojiang-logo-192.png" alt="" width="34" height="34" />
            <strong>考匠</strong>
          </div>
          <ContentPlaceholder variant="list" rows={6} />
        </aside>
      )}
      <div className="placeholder-space">
        <div className="placeholder-toolbar" aria-hidden="true">
          <span className="placeholder-line placeholder-title" />
        </div>
        <main>{children || <ContentPlaceholder rows={5} />}</main>
      </div>
    </div>
  );
}
