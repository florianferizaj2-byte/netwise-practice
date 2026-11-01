import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import "./practice-review.css";

// A countdown exists only for a newly acknowledged answer. Restored results,
// manual answer reveals and revisiting a question never arm it.
export function usePracticeReview({
  questionId,
  result,
  enabled,
  autoNext,
  showAnalysis,
  busy,
  done,
  last,
  next,
  teacherOpen,
}) {
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [armed, setArmed] = useState(null),
    [seconds, setSeconds] = useState(null);
  const pendingQuestion = useRef(null);
  const current = useRef(null),
    nextAction = useRef(next);
  nextAction.current = next;
  current.current = {
    questionId,
    result,
    enabled,
    autoNext,
    busy,
    done,
    last,
    teacherOpen,
  };
  const cancel = () => {
    pendingQuestion.current = null;
    setArmed(null);
    setSeconds(null);
  };
  useEffect(() => {
    if (
      !armed ||
      armed !== questionId ||
      !enabled ||
      !autoNext ||
      !result ||
      done ||
      last ||
      teacherOpen
    ) {
      if (armed) cancel();
      return;
    }
    // Only acknowledged answers arm this countdown; aggregate refresh is separate.
    if (busy) return;
    let remaining = 3;
    const invalid = () => {
      const state = current.current;
      return (
        pendingQuestion.current !== armed ||
        !state.enabled ||
        !state.autoNext ||
        !state.result ||
        state.done ||
        state.last ||
        state.teacherOpen ||
        state.busy ||
        state.questionId !== armed ||
        document.hidden ||
        !!document.querySelector('dialog[open],[role="dialog"]')
      );
    };
    if (invalid()) {
      cancel();
      return;
    }
    setSeconds(remaining);
    const timer = setInterval(() => {
      if (invalid()) {
        cancel();
        return;
      }
      remaining--;
      if (remaining <= 0) {
        clearInterval(timer);
        cancel();
        nextAction.current();
      } else setSeconds(remaining);
    }, 1000);
    const pauseOnInteraction = (event) => {
      if (event.type === "visibilitychange" && !document.hidden) return;
      if (
        event.type === "keydown" &&
        ["Shift", "Control", "Alt", "Meta"].includes(event.key)
      )
        return;
      cancel();
    };
    document.addEventListener("pointerdown", pauseOnInteraction, true);
    document.addEventListener("keydown", pauseOnInteraction, true);
    document.addEventListener("visibilitychange", pauseOnInteraction);
    return () => {
      clearInterval(timer);
      document.removeEventListener("pointerdown", pauseOnInteraction, true);
      document.removeEventListener("keydown", pauseOnInteraction, true);
      document.removeEventListener("visibilitychange", pauseOnInteraction);
    };
  }, [
    armed,
    questionId,
    enabled,
    autoNext,
    !!result,
    busy,
    done,
    last,
    teacherOpen,
  ]);
  return {
    expanded:
      !enabled || showAnalysis !== false || expandedQuestion === questionId,
    reveal: () => {
      cancel();
      setExpandedQuestion(questionId);
    },
    acknowledge: () => {
      if (enabled && autoNext && !last) {
        pendingQuestion.current = questionId;
        setArmed(questionId);
      }
    },
    cancel,
    seconds: armed === questionId ? seconds : null,
  };
}

export function PracticeAutoNext({ review }) {
  if (review.seconds === null) return null;
  return (
    <div className="practice-auto-next" role="status">
      <span>
        <Clock size={16} />
        {review.seconds} 秒后进入下一题
      </span>
      <button type="button" onClick={review.cancel}>
        留在本题
      </button>
    </div>
  );
}
