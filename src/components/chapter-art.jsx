import { useId } from "react";
import { BookOpen } from "lucide-react";
import chapterArt from "../generated/chapter-art.json";
import "./chapter-art.css";

export const chapterVisualFor = (certificateId, title) =>
  chapterArt.certificates
    .find((c) => c.id === certificateId)
    ?.chapters.find((c) => c.title === title || c.id === title);

export function ChapterArt({ certificateId, title, size = "small" }) {
  const id = "ace-art-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const definition = chapterVisualFor(certificateId, title);
  const template = definition && chapterArt.illustrations[definition.kind];
  return (
    <span
      className={`ace-chapter-art is-${size}`}
      data-chapter-visual={definition?.kind || "book"}
      aria-hidden="true"
    >
      {template ? (
        <span
          // This comes from fixed, build-checked local illustrations, with no question, user or AI HTML.
          dangerouslySetInnerHTML={{
            __html: template.replaceAll("__ACE_ICON__", id),
          }}
        />
      ) : (
        <BookOpen className="ace-art-fallback" />
      )}
    </span>
  );
}
