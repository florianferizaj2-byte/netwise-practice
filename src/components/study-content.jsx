import { BookOpen, TriangleAlert } from "lucide-react";

export function StudyNotice({ error, children, id }) {
  return (
    <div
      id={id}
      className={`ss-notice ${error ? "ss-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <TriangleAlert size={17} aria-hidden="true" />
      ) : (
        <BookOpen size={17} aria-hidden="true" />
      )}
      <span>{children}</span>
    </div>
  );
}

export function handleStudyAccessFailure(failure, onAccessDenied) {
  if (failure.code !== "STUDY_MEMBERSHIP_REQUIRED" && failure.status !== 401)
    return false;
  onAccessDenied();
  return true;
}

export function Stem({ question }) {
  return (
    <p className="ss-stem">
      {question.stem.split(/(\{\{b[1-3]\}\})/g).map((part, index) => {
        const match = part.match(/^\{\{(b[1-3])\}\}$/);
        return match ? (
          <span key={index} className="ss-blank-marker">
            第 {question.blanks.findIndex((blank) => blank.id === match[1]) + 1}{" "}
            空
          </span>
        ) : (
          part
        );
      })}
    </p>
  );
}
