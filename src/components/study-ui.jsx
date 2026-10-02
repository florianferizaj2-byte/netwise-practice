import { BookOpen } from "lucide-react";

export function IconButton({ icon: Icon, label, ...props }) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      <Icon size={18} />
    </button>
  );
}

export function Empty({ icon: Icon = BookOpen, title, children }) {
  return (
    <div className="empty">
      <Icon size={34} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export function Heading({ title, subtitle, children }) {
  return (
    <div className="page-heading compact">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
