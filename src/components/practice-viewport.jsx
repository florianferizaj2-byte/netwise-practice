import { useLayoutEffect, useRef } from "react";

// Keep the reading area stable across questions, including late answers/images.
// Once the learner scrolls, leave the viewport alone until the next question.
export function usePracticeViewport({ questionId, mode, answerKey, done }) {
  const panelRef = useRef(null);
  const scheduleRef = useRef(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const page = panel?.closest(".practice-page");
    if (done || !page) return;
    let frame = 0;
    let stopped = false;
    let initial = true;

    const align = () => {
      frame = 0;
      if (
        stopped ||
        !panel.isConnected ||
        document.querySelector('[aria-modal="true"], dialog[open]')
      )
        return;
      // Shared case material and question images are part of the question.
      const start = panel.querySelector(
        ".vet-shared-card, .question-meta, .question-text",
      );
      if (!start) return;
      const options = [...panel.querySelectorAll(".options .option")];
      const correct = options.filter((option) =>
        option.classList.contains("correct"),
      );
      const end =
        options.at(-1) ||
        panel.querySelector(
          ".expected-answer, .short-answer-editor, .question-text",
        );
      const priority =
        mode === "memorize" && correct.length ? correct.at(-1) : end;
      const startBox = start.getBoundingClientRect();
      const endBox = end.getBoundingClientRect();
      const priorityBox = priority.getBoundingClientRect();
      const barHeight =
        panel.querySelector(".practice-mode-bar")?.getBoundingClientRect()
          .height || 0;
      const actions = panel.querySelector(".question-actions");
      const actionStyle = actions && getComputedStyle(actions);
      const actionInset =
        actionStyle && ["sticky", "fixed"].includes(actionStyle.position)
          ? actions.getBoundingClientRect().height +
            (parseFloat(actionStyle.bottom) || 0) +
            16
          : 16;
      const header = document.querySelector(".topbar");
      const headerStyle = header && getComputedStyle(header);
      const headerInset =
        headerStyle && ["sticky", "fixed"].includes(headerStyle.position)
          ? Math.max(0, header.getBoundingClientRect().bottom)
          : 0;
      const top = headerInset + barHeight + 12;
      const bottom = window.innerHeight - actionInset;
      const allFit = endBox.bottom - startBox.top <= bottom - top;
      const readingEnd = allFit ? endBox.bottom : priorityBox.bottom;
      const fits = readingEnd - startBox.top <= bottom - top;
      // Do not pull the view towards a long explanation below the choices.
      if (
        !initial &&
        startBox.top >= top - 2 &&
        (fits ? readingEnd <= bottom + 2 : startBox.top <= top + 2)
      )
        return;

      const target = Math.max(0, window.scrollY + startBox.top - top);
      const previousSpace =
        parseFloat(page.style.getPropertyValue("--practice-scroll-space")) || 0;
      const naturalHeight =
        document.documentElement.scrollHeight - previousSpace;
      // Short questions still need enough room to move the chapter banner away.
      const space = Math.max(
        0,
        Math.ceil(target + window.innerHeight - naturalHeight),
      );
      page.style.setProperty("--practice-scroll-space", `${space}px`);
      page.style.setProperty("--practice-viewport-top", `${headerInset}px`);
      if (Math.abs(window.scrollY - target) > 1)
        window.scrollTo({ top: target, behavior: "instant" });
      initial = false;
    };
    const schedule = () => {
      if (!stopped && !frame) frame = requestAnimationFrame(align);
    };
    const stop = () => {
      stopped = true;
    };
    const keydown = (event) => {
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "PageUp",
          "PageDown",
          "Home",
          "End",
          " ",
          "Tab",
        ].includes(event.key)
      )
        stop();
    };
    const pointerdown = (event) => {
      if (
        event.button === 1 ||
        !event.target.closest(
          ".option, .practice-primary, .practice-mode-switch",
        )
      )
        stop();
    };
    scheduleRef.current = schedule;
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    panel.addEventListener("load", schedule, true);
    window.addEventListener("resize", schedule);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", pointerdown);
    document.fonts?.ready.then(schedule);
    schedule();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      panel.removeEventListener("load", schedule, true);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      document.removeEventListener("keydown", keydown);
      document.removeEventListener("pointerdown", pointerdown);
      scheduleRef.current = null;
    };
  }, [questionId, mode, done]);

  useLayoutEffect(() => {
    scheduleRef.current?.();
  }, [answerKey]);
  return panelRef;
}
