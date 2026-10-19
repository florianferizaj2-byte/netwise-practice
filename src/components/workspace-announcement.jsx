import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { api } from "../api.js";
import "./workspace-announcement.css";

export function WorkspaceAnnouncement({ enabled }) {
  const [announcement, setAnnouncement] = useState(null),
    [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let live = true,
      pending = false;
    const read = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const value = await api("/mobile/announcement", undefined, "GET", {
          cache: false,
        });
        if (live) {
          setAnnouncement(value);
          if (!value.enabled) setOpen(false);
        }
      } catch {
        /* Retain the last successful announcement during temporary outages. */
      } finally {
        pending = false;
      }
    };
    void read();
    const timer = setInterval(read, 60000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [enabled]);
  if (!enabled || !announcement?.enabled) return null;
  return (
    <>
      <button
        className="workspace-managed-announcement"
        onClick={() => setOpen(true)}
      >
        <Megaphone size={17} />
        <strong>{announcement.title}</strong>
        <span>查看公告 →</span>
      </button>
      {open && (
        <div className="workspace-announcement-backdrop">
          <section
            className="workspace-announcement-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="managed-announcement-title"
          >
            <header>
              <h2 id="managed-announcement-title">{announcement.title}</h2>
              <button
                aria-label="关闭公告"
                onClick={() => setOpen(false)}
                autoFocus
              >
                <X size={18} />
              </button>
            </header>
            <p>{announcement.body}</p>
            <button className="primary" onClick={() => setOpen(false)}>
              我知道了
            </button>
          </section>
        </div>
      )}
    </>
  );
}
