"use strict";
(() => {
  const flow = window.AceStudyFlow,
    R = window.AceTutorRenderer;
  if (!flow || !R) return;
  const safe = flow.safe,
    api = "/api/demo/tutor/v1";
  let courseId = "vlan-broadcast-domain",
    courseMeta = null;
  const readyNodes = (window.AceTutorCatalog?.knowledgePoints || [])
    .filter((n) => n.status === "ready")
    .map((n) => n.nodeId);
  const pilotNode = "network-engineer:03.02.01";
  let mountPoint = null,
    snapshot = null,
    pending = null,
    busy = false,
    offline = false,
    failure = "";
  let serial = 0,
    foundation = "beginner",
    restartConfirm = false;
  const diagramSources = {},
    played = {};
  const phaseLabels = {
    explanation: "学习一个概念",
    awaiting_answer: "检验理解",
    feedback: "看看这次判断",
    remediation: "针对错因补课",
    variant: "换个场景验证",
    complete: "本课学习总结",
  };
  function data() {
    const state = flow.state();
    if (
      !state.tutorDemo ||
      state.tutorDemo.version !== 1 ||
      !state.tutorDemo.snapshots ||
      !state.tutorDemo.choices ||
      typeof state.tutorDemo.snapshots !== "object" ||
      typeof state.tutorDemo.choices !== "object"
    )
      state.tutorDemo = {
        version: 1,
        snapshots: {},
        choices: {},
        origin: null,
      };
    return state.tutorDemo;
  }
  function validateSnapshot(view) {
    if (
      !view ||
      view.schemaVersion !== 1 ||
      !/^[a-f0-9-]{36}$/.test(view.id) ||
      view.course?.id !== courseId ||
      !Array.isArray(view.course.concepts) ||
      view.course.concepts.length < 1 ||
      view.course.concepts.length > 12 ||
      new Set(view.course.concepts.map((c) => c.id)).size !==
        view.course.concepts.length ||
      !Number.isInteger(view.revision) ||
      !phaseLabels[view.phase] ||
      !Number.isInteger(view.conceptIndex) ||
      view.conceptIndex < 0 ||
      view.conceptIndex >= view.course.concepts.length ||
      (view.pacing !== undefined && !["concept", "guided"].includes(view.pacing)) ||
      (view.reading != null && (
        view.pacing !== "guided" || view.phase !== "explanation" ||
        !Number.isInteger(view.reading.index) || !Number.isInteger(view.reading.total) ||
        view.reading.total < 1 || view.reading.total > 9 ||
        view.reading.index < 0 || view.reading.index >= view.reading.total ||
        typeof view.reading.title !== "string" || view.reading.title.length > 100
      )) ||
      !["beginner", "review"].includes(view.foundation) ||
      !/^[a-zA-Z0-9:._-]{1,100}$/.test(view.stepId || "") ||
      !Array.isArray(view.mastery) ||
      view.mastery.length !== view.course.concepts.length ||
      !view.mastery.every(
        (m) =>
          view.course.concepts.some((c) => c.id === m.id) &&
          typeof m.title === "string" &&
          m.title.length <= 100 &&
          ["locked", "mastered", "review"].includes(m.status),
      ) ||
      !Array.isArray(view.answers) ||
      view.answers.length > view.course.concepts.length * 3 ||
      !view.answers.every(
        (a) =>
          typeof a.correct === "boolean" &&
          typeof a.errorTitle === "string" &&
          a.errorTitle.length <= 100 &&
          typeof a.errorType === "string" &&
          a.errorType.length <= 100 &&
          view.course.concepts.some((c) => c.id === a.conceptId),
      ) ||
      !view.usage ||
      ![
        "aiCalls",
        "totalTokens",
        "costCny",
        "ruleSubmissions",
        "contentCacheHits",
      ].every(
        (key) =>
          Number.isFinite(view.usage[key]) &&
          view.usage[key] >= 0 &&
          view.usage[key] < 1e9,
      ) ||
      !Array.isArray(view.course.sources) ||
      view.course.sources.length > 5 ||
      !view.course.sources.every(
        (s) => typeof s.title === "string" && s.title.length <= 100,
      )
    )
      throw new Error("课程状态无法识别，请重新连接。");
    R.validate(view.lesson);
    if (view.review) R.validate(view.review);
    return view;
  }
  function accept(view) {
    validateSnapshot(view);
    snapshot = view;
    foundation = view.foundation;
    const old = data().snapshots[courseId];
    if (old && old.id !== view.id)
      for (const key of Object.keys(data().choices))
        if (key.startsWith(old.id + ":")) delete data().choices[key];
    data().snapshots[courseId] = structuredClone(view);
    flow.save();
    if (
      view.phase === "complete" &&
      window.AceTutorCatalog?.knowledgePoints.some(
        (n) =>
          n.nodeId === view.course.nodeId &&
          n.status === "ready" &&
          n.courseId === view.course.id,
      )
    )
      window.AceAiStudyDemo?.markTutorLearned(view.course.nodeId);
  }
  function sourceLink(source) {
    try {
      const url = new URL(source.url);
      if (
        url.protocol === "https:" &&
        [
          "www.cisco.com",
          "docs.oracle.com",
          "www.cs.cornell.edu",
          "www.intel.com",
          "www.eecs.yorku.ca",
          "www.mit.edu",
          "www.ibm.com",
          "www.redbooks.ibm.com",
          "www.itl.nist.gov",
          "docs.riscv.org",
          "pages.cs.wisc.edu",
          "astqb.org",
          "www.rfc-editor.org",
          "ocw.mit.edu",
          "www.analog.com",
          "spcl.inf.ethz.ch",
          "developerhelp.microchip.com",
          "www.tek.com.cn",
        ].includes(url.hostname)
      )
        return `<a href="${safe(url.href)}" target="_blank" rel="noopener noreferrer">${safe(source.title)}</a>`;
    } catch {}
    return safe(source.title);
  }
  async function call(path, body, method = body ? "POST" : "GET") {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(api + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        ...(body
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }
          : {}),
      });
      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error("互动课连接暂时不可用，当前内容和选择已保留。");
      }
      if (!response.ok) {
        const error = new Error(
          result.error?.message || "课程连接暂时不可用。",
        );
        error.code = result.error?.code;
        error.session = result.session;
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError)
        throw new Error(
          "连接暂时中断，当前内容和选择已保留。请重新连接后继续。",
        );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  const currentQuiz = () =>
    snapshot?.lesson.components.find((c) => c.type === "MiniQuiz");
  const btn = (action, text, primary = false, extra = "") =>
    `<button type="button" class="ai-button${primary ? " ai-primary" : ""}" data-tutor-action="${action}"${extra}>${text}</button>`;
  function errorHTML() {
    if (!failure) return "";
    return `<aside class="tutor-connection" role="alert"><div>${icon("info")}<span>${safe(failure)}</span></div><div>${pending ? btn("retry-request", "重试这一步", false, busy ? " disabled" : "") : ""}${btn("reconnect", "重新连接", false, busy ? " disabled" : "")}${btn("read", "先分段阅读")}</div></aside>`;
  }
  function intro() {
    const pilot = courseId === "vlan-broadcast-domain";
    return `<section class="tutor-intro" aria-labelledby="tutor-intro-title"><div class="tutor-intro-head"><span class="tutor-mode-chip">${pilot ? "互动示范课" : "互动精讲"}</span><span class="tutor-duration">${icon("time")}约 ${courseMeta?.minutes || 8} 分钟</span></div><h3 id="tutor-intro-title" tabindex="-1">这次，学懂${safe(courseMeta?.title || "VLAN 广播域")}</h3><p>规则、例子和要点逐步展开，学完一个概念再做小测。答错就针对补课，最后用变式题检验理解。</p><ol class="tutor-intro-route">${(courseMeta?.concepts || []).map((c, i) => `<li><span>${i + 1}</span><div><strong>${safe(c.title)}</strong><small>讲解 → 小测 → 变式检验</small></div></li>`).join("")}</ol><fieldset class="tutor-foundation"><legend>你的基础怎么样？</legend><label><input type="radio" name="tutor-foundation" value="beginner"${foundation === "beginner" ? " checked" : ""}${busy ? " disabled" : ""}><span><strong>从基础开始</strong><small>先解释术语，再讲原理</small></span></label><label><input type="radio" name="tutor-foundation" value="review"${foundation === "review" ? " checked" : ""}${busy ? " disabled" : ""}><span><strong>学过，想巩固</strong><small>直接抓规则和易错点</small></span></label></fieldset><div class="tutor-intro-footer">${btn("start", (busy ? "正在准备课程…" : "开始互动学习") + icon("arrow"), true, busy || offline ? " disabled" : "")}<span>${icon("save")}阅读与作答位置自动保存</span></div><p class="tutor-intro-note">当前体验使用已审核课程，AI 老师暂未连接。</p>${data().origin ? `<div class="tutor-return">${btn("return-question", icon("arrow") + "返回刚才的题目")}</div>` : ""}</section>`;
  }
  function readingHTML() {
    const r = snapshot.reading;
    if (!r) return "";
    return `<div class="tutor-reading" aria-label="当前概念的教学步骤"><div><span class="tutor-reading-kicker">本概念 · 第 ${r.index + 1} / ${r.total} 步</span><strong>${safe(r.title)}</strong></div><div class="tutor-reading-track" role="progressbar" aria-label="本概念阅读进度" aria-valuemin="0" aria-valuemax="${r.total}" aria-valuenow="${r.index + 1}">${Array.from({ length: r.total }, (_, i) => `<span class="${i < r.index ? "is-read" : i === r.index ? "is-current" : ""}"></span>`).join("")}</div></div>`;
  }
  function summary() {
    const mastered = snapshot.mastery.filter(
      (m) => m.status === "mastered",
    ).length;
    const errors = snapshot.answers.filter((a) => !a.correct);
    const corrected = new Set(
      errors
        .filter((a) =>
          snapshot.mastery.some(
            (m) => m.id === a.conceptId && m.status === "mastered",
          ),
        )
        .map((a) => a.errorType),
    ).size;
    const uniqueErrors = [
      ...new Map(errors.map((a) => [a.errorType, a])).values(),
    ];
    return `<section class="tutor-summary" aria-labelledby="tutor-summary-title"><span class="tutor-summary-symbol">${icon("check")}</span><h3 id="tutor-summary-title" tabindex="-1">${mastered === snapshot.mastery.length ? "本课概念，都通过了检验" : "本课已学完，还有重点值得再看"}</h3><p>${mastered === snapshot.mastery.length ? "你已经用变式题验证了理解，可以把这些判断规则带回刷题。" : "待巩固的概念会保留在记录里，不把暂时没理解的内容算成已掌握。"}</p><div class="tutor-summary-stats"><span><strong>${mastered} / ${snapshot.mastery.length}</strong>概念已掌握</span><span><strong>${snapshot.answers.length}</strong>次有效作答</span><span><strong>${corrected}</strong>类错因已补强</span></div><div class="tutor-mastery-list">${snapshot.mastery.map((m) => `<div><span class="tutor-mastery-symbol ${m.status}">${icon(m.status === "mastered" ? "check" : "book")}</span><strong>${safe(m.title)}</strong><span class="tutor-mastery-tag ${m.status}">${m.status === "mastered" ? "已掌握" : "待巩固"}</span>${btn("review", "回看", false, ` data-concept="${safe(m.id)}"${offline ? " disabled" : ""}`)}</div>`).join("")}</div>${uniqueErrors.length ? `<div class="tutor-error-summary"><h4>这次澄清过的地方</h4><ul>${uniqueErrors.map((e) => `<li>${safe(e.errorTitle)}<span>${snapshot.mastery.some((m) => m.id === e.conceptId && m.status === "mastered") ? "已通过后续检验" : "建议再看一遍"}</span></li>`).join("")}</ul></div>` : ""}</section>`;
  }
  function render(focus = false) {
    if (!mountPoint?.isConnected || document.body.dataset.page !== "ai") return;
    if (!snapshot) {
      mountPoint.innerHTML = `<div class="tutor-shell">${errorHTML()}${intro()}</div>`;
      return;
    }
    const quiz = currentQuiz();
    const selection = data().choices[snapshot.id + ":" + quiz?.id];
    const waiting = ["awaiting_answer", "variant"].includes(snapshot.phase);
    const ctx = {
      interactive: ["explanation", "remediation"].includes(snapshot.phase),
      diagramSources,
      played,
      selection,
      offline,
      busy: busy || !!pending,
    };
    const components = snapshot.lesson.components;
    mountPoint.innerHTML = `<div class="tutor-shell" data-tutor-phase="${safe(snapshot.phase)}" data-tutor-step="${safe(snapshot.stepId)}">
      <div class="tutor-topline"><span class="tutor-mode-chip">互动精讲</span><span>${snapshot.phase === "complete" ? snapshot.mastery.length + " / " + snapshot.mastery.length + " 个概念已学完" : "第 " + (snapshot.conceptIndex + 1) + " / " + snapshot.mastery.length + " 段 · " + phaseLabels[snapshot.phase]}</span>${snapshot.phase === "explanation" && snapshot.pacing !== "guided" ? btn("guide", "切换分步讲解", false, busy || offline || pending ? " disabled" : "") : ""}${btn("read", "分段阅读")}</div>
      ${R.render({ schemaVersion: 1, components: [components[0]] }, ctx)}${errorHTML()}
      ${snapshot.phase === "complete" ? summary() : ""}${readingHTML()}<div class="tutor-stage">${R.render({ schemaVersion: 1, components: components.slice(1) }, ctx)}</div>
      ${snapshot.review ? `<details class="tutor-recall"><summary>${icon("book")}回看本段讲解</summary><div>${R.render(snapshot.review, { interactive: false })}</div></details>` : ""}
      ${waiting ? "" : `<footer class="tutor-stage-footer"><span class="tutor-save-state">${icon("save")}${offline ? "当前内容可回看，连接后继续" : busy ? "正在保存这一步…" : "已自动保存，下次从这里继续"}</span><div>${snapshot.phase === "complete" ? btn("restart", "重新学习") + btn("next-node", "下一个知识点" + icon("arrow"), true) : (snapshot.reading?.index > 0 ? btn("back", "上一段", false, busy || offline || pending ? " disabled" : "") : "") + btn("next", (busy ? "正在保存…" : safe(snapshot.nextLabel)) + icon("arrow"), true, busy || offline || pending ? " disabled" : "")}</div></footer>`}
      ${restartConfirm ? `<div class="tutor-restart-confirm" role="alert"><p>重新学习会创建一轮新记录。确认从第一段开始？</p>${btn("confirm-restart", "确认重新学习", true, busy ? " disabled" : "")}${btn("cancel-restart", "取消")}</div>` : ""}
      ${data().origin ? `<div class="tutor-return">${btn("return-question", icon("arrow") + "返回刚才的题目")}</div>` : ""}
      <details class="tutor-course-note"><summary>课程依据与本次使用情况</summary><ul>${snapshot.course.sources.map((s) => `<li>${sourceLink(s)}</li>`).join("")}</ul><p>本课使用审核内容，判分由标准答案与规则完成。AI 调用 ${snapshot.usage.aiCalls} 次，Token ${snapshot.usage.totalTokens}，教学调用成本 ¥${snapshot.usage.costCny.toFixed(2)}。正式 AI 暂未连接。</p><p>仅记录匿名课程位置、选择和掌握情况，保存在本地演示服务。</p></details>
      </div>`;
    if (focus) {
      const target = mountPoint.querySelector(
        ".tutor-feedback, #tutor-summary-title, #tutor-quiz-title, .tutor-stage h3",
      );
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: "nearest", behavior: "auto" });
      }
    }
  }
  async function load() {
    const ticket = ++serial;
    busy = true;
    failure = "";
    render();
    try {
      const result = await call(
        "/sessions/current?courseId=" + encodeURIComponent(courseId),
      );
      if (ticket !== serial) return;
      courseMeta = result.course;
      offline = false;
      pending = null;
      if (result.session) accept(result.session);
      else {
        snapshot = null;
        delete data().snapshots[courseId];
        flow.save();
      }
    } catch (error) {
      if (ticket !== serial) return;
      offline = true;
      failure = error.message;
    } finally {
      if (ticket === serial) {
        busy = false;
        render();
      }
    }
  }
  async function send(path, body, retry = false) {
    if (busy) return;
    const ticket = ++serial;
    busy = true;
    failure = "";
    offline = false;
    pending = { path, body };
    render();
    try {
      const result = await call(path, body);
      if (ticket !== serial) return;
      accept(result.session);
      pending = null;
      restartConfirm = false;
    } catch (error) {
      if (ticket !== serial) return;
      if (error.session) {
        accept(error.session);
        pending = null;
        failure = error.message;
      } else {
        failure = error.message;
        offline = !error.status || error.status >= 500;
        if (!offline) pending = null;
      }
    } finally {
      if (ticket === serial) {
        busy = false;
        render(true);
      }
    }
  }
  function next(action = "next") {
    if (!snapshot || offline || busy || pending) return;
    send(`/sessions/${snapshot.id}/actions`, {
      action,
      revision: snapshot.revision,
      requestId: crypto.randomUUID(),
    });
  }
  function start(restart = false) {
    if (offline || busy) return;
    send("/sessions", {
      courseId,
      foundation,
      pacing: "guided",
      restart,
      requestId: crypto.randomUUID(),
    });
  }
  function pause() {
    serial++;
    busy = false;
    mountPoint = null;
    snapshot = null;
    pending = null;
  }
  async function review(concept) {
    if (offline || !snapshot || busy) return;
    const ticket = ++serial;
    busy = true;
    try {
      const result = await call(
        `/sessions/${snapshot.id}/concepts/${encodeURIComponent(concept)}`,
      );
      if (
        ticket !== serial ||
        !mountPoint?.isConnected ||
        document.body.dataset.page !== "ai"
      )
        return;
      R.validate(result);
      showDialog(
        snapshot.course.title,
        `<div class="tutor-shell tutor-review-dialog">${R.render(result, { interactive: false })}</div>`,
        "学习回顾",
      );
    } catch (error) {
      if (ticket !== serial) return;
      failure = error.message;
      render();
    } finally {
      if (ticket === serial) busy = false;
    }
  }
  function openPilot() {
    window.AceAiStudyDemo?.openLesson("network-engineer", pilotNode, "tutor");
  }
  document.addEventListener("change", (event) => {
    if (event.target.name === "tutor-foundation")
      foundation = event.target.value;
    if (event.target.name === "tutor-answer" && snapshot) {
      const quiz = currentQuiz();
      data().choices[snapshot.id + ":" + quiz.id] = event.target.value;
      flow.save();
      mountPoint
        .querySelectorAll(".tutor-option")
        .forEach((label) =>
          label.classList.toggle(
            "is-selected",
            label.querySelector("input").checked,
          ),
        );
      mountPoint.querySelector("#tutor-answer-error").textContent = "";
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "tutor-quiz-form") return;
    event.preventDefault();
    if (busy || offline || pending || !snapshot) return;
    const quiz = currentQuiz(),
      optionId = data().choices[snapshot.id + ":" + quiz.id];
    if (!optionId) {
      mountPoint.querySelector("#tutor-answer-error").textContent =
        "先选一个答案，再提交。";
      mountPoint.querySelector(".tutor-option input").focus();
      return;
    }
    send(`/sessions/${snapshot.id}/actions`, {
      action: "answer",
      optionId,
      revision: snapshot.revision,
      requestId: crypto.randomUUID(),
    });
  });
  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-tutor-action]");
    if (!trigger || trigger.disabled) return;
    switch (trigger.dataset.tutorAction) {
      case "pilot":
        openPilot();
        break;
      case "start":
        start();
        break;
      case "next":
        next();
        break;
      case "back":
        next("back");
        break;
      case "guide":
        next("guide");
        break;
      case "reconnect":
        load();
        break;
      case "retry-request":
        if (pending) send(pending.path, pending.body, true);
        break;
      case "read":
        window.AceAiStudyDemo?.setTab("lesson");
        break;
      case "next-node":
        window.AceAiStudyDemo?.nextNode();
        break;
      case "return-question":
        window.AceAiStudyDemo?.returnQuestion();
        break;
      case "restart":
        restartConfirm = true;
        render();
        break;
      case "cancel-restart":
        restartConfirm = false;
        render();
        break;
      case "confirm-restart":
        start(true);
        break;
      case "review":
        review(trigger.dataset.concept);
        break;
      case "broadcast": {
        const c = snapshot?.lesson.components.find(
          (c) =>
            c.id === trigger.dataset.diagram && c.type === "NetworkDiagram",
        );
        if (!c || !["explanation", "remediation"].includes(snapshot.phase))
          return;
        diagramSources[c.id] = trigger.dataset.source;
        played[c.id] = true;
        const selection = trigger.dataset.source;
        const section = trigger.closest(".tutor-network");
        section.outerHTML = R.network(c, {
          interactive: true,
          diagramSources,
          played,
        });
        mountPoint
          .querySelector(`[data-diagram="${c.id}"][data-source="${selection}"]`)
          ?.focus({ preventScroll: true });
        break;
      }
    }
  });
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name !== "ai") pause();
  });
  const reset = actions.reset;
  actions.reset = () => {
    pause();
    reset();
    call("/sessions", null, "DELETE").catch(() =>
      toast("本地页面记录已清理；互动课服务未连接，连接后可重新开始。"),
    );
  };
  window.AceTutorDemo = Object.freeze({
    pilotNode,
    isPilot: (n) => n?.id === pilotNode || readyNodes.includes(n?.id),
    mount: (node, target) => {
      if (!node || (node.id !== pilotNode && !readyNodes.includes(node.id)))
        return;
      pause();
      courseId = node.id === pilotNode ? "vlan-broadcast-domain" : node.id;
      courseMeta = window.AceTutorCatalog?.courses.find(
        (c) => c.id === courseId,
      ) || { title: node.name };
      snapshot = null;
      mountPoint = target;
      foundation = "beginner";
      offline = false;
      failure = "";
      restartConfirm = false;
      const cached = data().snapshots[courseId];
      if (cached) {
        try {
          validateSnapshot(cached);
          snapshot = structuredClone(cached);
        } catch {
          snapshot = null;
        }
      }
      render();
      load();
    },
    pause,
    open: openPilot,
    snapshot: () => (snapshot ? structuredClone(snapshot) : null),
  });
})();
