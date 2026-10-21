"use strict";
(() => {
  const STORAGE_KEY = "aceexam.home-blue.study.v1";
  const QUESTION_REVISION = "sichuan-206-20261010";
  const safe = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[char],
    );
  const localDate = (date = new Date()) =>
    [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  const fromDate = (value) => {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const plusDays = (value, count) => {
    const date = fromDate(value);
    date.setDate(date.getDate() + count);
    return localDate(date);
  };
  const mondayOf = (value) =>
    plusDays(value, -((fromDate(value).getDay() + 6) % 7));
  const dateCaption = (value) => {
    const date = fromDate(value);
    return date.getMonth() + 1 + " 月 " + date.getDate() + " 日";
  };
  const weekdays = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  const today = localDate();
  let selectedPlanDate = today;
  let planWeekStart = mondayOf(today);
  let storageAvailable = true;
  let lastTimerMark = performance.now();
  let trackedSessionId = null;
  let timerWasActive = false;
  let saveTicks = 0;

  const questionMap = new Map(
    studyQuestionData.map((question) => [
      question.id,
      {
        ...question,
        q: question.q
          .replace(/\s*原卷为填空题，已改写为单选[。.]?/g, "")
          .trim(),
        chapterIndex: chapters.findIndex(
          (chapter) => chapter.title === question.chapter,
        ),
      },
    ]),
  );
  const pools = chapters.map((chapter) =>
    [...questionMap.values()].filter(
      (question) => question.chapter === chapter.title,
    ),
  );
  // Office sessions cover all three applications instead of starting with only Word.
  const officeGroups = ["Word", "Excel", "PowerPoint"].map((name) =>
    pools[2].filter((question) => question.section?.includes(name)),
  );
  const groupedIds = new Set(
    officeGroups.flat().map((question) => question.id),
  );
  const officeMixed = [];
  while (officeGroups.some((group) => group.length))
    officeGroups.forEach((group) => {
      if (group.length) officeMixed.push(group.shift());
    });
  pools[2] = officeMixed.concat(
    pools[2].filter((question) => !groupedIds.has(question.id)),
  );
  pools.forEach((pool, index) => {
    chapterQuestions[index] = pool;
    chapters[index].total = pool.length;
  });

  function taskItem(
    id,
    date,
    kind,
    chapter,
    count,
    minutes,
    completed = 0,
    title = null,
  ) {
    return {
      id,
      date,
      kind,
      chapter,
      count,
      minutes,
      completed,
      title,
      auto: true,
      sessionId: null,
    };
  }
  function seedPlan() {
    const startDate = plusDays(mondayOf(today), -7);
    const tasks = [];
    const currentMonday = mondayOf(today);
    for (let day = 0; day < 28; day++) {
      const date = plusDays(startDate, day);
      if (date >= currentMonday && date < plusDays(currentMonday, 7)) continue;
      const week = Math.floor(day / 7);
      const chapter = [
        [0, 1],
        [2, 2],
        [3, 4],
        [5, 6],
      ][week][day % 2];
      const finished = date < today;
      tasks.push(
        taskItem(
          "auto-" + date + "-chapter",
          date,
          "chapter",
          chapter,
          Math.min(10, pools[chapter].length),
          12,
          finished ? Math.min(10, pools[chapter].length) : 0,
        ),
      );
      tasks.push(
        taskItem(
          "auto-" + date + "-notes",
          date,
          "custom",
          chapter,
          1,
          8,
          finished ? 1 : 0,
          "整理" + chapters[chapter].title + "笔记",
        ),
      );
    }
    const dayCounts = [1, 2, 2, 1, 1, 3, 4];
    for (let day = 0; day < 7; day++) {
      const date = plusDays(currentMonday, day);
      if (date === today) {
        tasks.push(taskItem("today-hardware", date, "chapter", 1, 10, 10, 10));
        tasks.push(taskItem("today-office", date, "chapter", 2, 10, 12, 3));
        tasks.push(taskItem("today-review", date, "wrong", 2, 2, 5));
      } else {
        for (let index = 0; index < dayCounts[day]; index++) {
          const chapter = day < 3 ? index % 2 : 2;
          const completed = date < today;
          tasks.push(
            taskItem(
              "week-" + date + "-" + index,
              date,
              completed ? "custom" : "chapter",
              chapter,
              completed ? 1 : Math.min(10, pools[chapter].length),
              12,
              completed ? 1 : 0,
              completed
                ? ["复习基础知识笔记", "梳理常用操作与快捷键"][index % 2]
                : null,
            ),
          );
        }
      }
    }
    return {
      name: "4 周章节复习计划",
      weeks: 4,
      dailyMinutes: 30,
      startDate,
      reminder: true,
      reminderTime: "20:00",
      remindedDate: null,
      tasks,
    };
  }
  function initialState() {
    const records = {};
    [1, 3, 9, 1, 0, 0, 0].forEach((count, chapter) =>
      pools[chapter].slice(0, count).forEach((question) => {
        records[question.id] = { correct: true };
      }),
    );
    [pools[2][1], pools[2][5]].forEach((question) => {
      records[question.id] = { correct: false };
    });
    return {
      version: 1,
      revision: QUESTION_REVISION,
      activeChapter: 2,
      config: { mode: "sequential", range: "all", count: "10" },
      records,
      favorites: [],
      favoriteSeedPending: true,
      feedback: [],
      sessions: [],
      activeSessionId: null,
      stats: {
        date: today,
        todayCount: 12,
        answeredTotal: 21,
        correctTotal: 17,
        studiedMs: 160 * 60000,
      },
      plan: seedPlan(),
    };
  }
  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (
        !saved ||
        saved.version !== 1 ||
        saved.revision !== QUESTION_REVISION ||
        !Array.isArray(saved.sessions) ||
        !Array.isArray(saved.plan?.tasks) ||
        !saved.stats ||
        !saved.records ||
        !saved.config ||
        !Array.isArray(saved.favorites)
      )
        return initialState();
      saved.sessions = saved.sessions.filter(
        (session) =>
          Array.isArray(session.qids) &&
          session.qids.length &&
          session.qids.every((id) => questionMap.has(id)) &&
          session.responses &&
          session.selections &&
          Number.isFinite(session.elapsedMs),
      );
      saved.plan.tasks = saved.plan.tasks.filter(
        (task) =>
          typeof task.id === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(task.date) &&
          ["chapter", "wrong", "custom"].includes(task.kind) &&
          Number.isInteger(task.chapter) &&
          !!pools[task.chapter] &&
          task.count > 0,
      );
      saved.favorites = saved.favorites.filter((id) => questionMap.has(id));
      saved.feedback = Array.isArray(saved.feedback) ? saved.feedback : [];
      if (saved.stats.date !== today) {
        saved.stats.date = today;
        saved.stats.todayCount = 0;
      }
      if (
        !saved.sessions.some((session) => session.id === saved.activeSessionId)
      )
        saved.activeSessionId = null;
      return saved;
    } catch {
      return initialState();
    }
  }
  let state = readState();
  Object.assign(practiceConfig, state.config);
  function activeSession() {
    return (
      state.sessions.find((session) => session.id === state.activeSessionId) ||
      null
    );
  }
  function saveState() {
    state.config = { ...practiceConfig };
    state.activeChapter = activeChapter;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    $("#study-save-note").classList.toggle("save-error", !storageAvailable);
    $("#study-save-text").textContent = storageAvailable
      ? "答题进度自动保存在当前浏览器"
      : "浏览器存储不可用，本次进度暂未保存";
  }
  function studyOrigin(session) {
    if (!session) return "chapters";
    if (session.mode === "exam" || session.origin === "exam") return "exam";
    if (session.origin === "favorites") return "favorites";
    if (session.origin === "wrong" || session.mode === "wrong") return "wrong";
    return "chapters";
  }
  function trackWrongAnswer(id, correct) {
    state.wrongBook ||= {
      entries: {},
      config: { order: "sequential", count: "10" },
    };
    state.wrongBook.entries ||= {};
    const previous = state.wrongBook.entries[id];
    const now = Date.now();
    if (!correct) {
      state.wrongBook.entries[id] = {
        ...previous,
        firstWrongAt: previous?.firstWrongAt || now,
        lastWrongAt: now,
        wrongCount: (previous?.wrongCount || 0) + 1,
        status: "pending",
        lastReviewedAt: now,
      };
    } else if (previous) {
      if (previous.status !== "removed") {
        previous.status = "mastered";
        previous.masteredAt = now;
      }
      previous.lastReviewedAt = now;
    }
  }
  function wrongQuestions(chapter = null) {
    return [...questionMap.values()].filter(
      (question) =>
        (chapter === null || question.chapterIndex === chapter) &&
        (state.wrongBook?.entries?.[question.id]?.status === "pending" ||
          (!state.wrongBook?.entries?.[question.id] &&
            state.records[question.id]?.correct === false)),
    );
  }
  function syncSharedUI() {
    practiceRecords.clear();
    Object.entries(state.records).forEach(([id, record]) => {
      if (questionMap.has(id)) practiceRecords.set(id, record);
    });
    chapters.forEach((chapter, index) => {
      chapter.attempted = pools[index].filter(
        (question) => state.records[question.id],
      ).length;
    });
    todayCount = state.stats.todayCount;
    answeredTotal = state.stats.answeredTotal;
    correctTotal = state.stats.correctTotal;
    updateStats();
    const count = wrongQuestions().length;
    $("#wrong-count").textContent = count;
    $(".nav-badge").textContent = count;
    renderChapters();
    renderCatalogue();
    renderSelectedChapter();
    updateHeroProgress();
  }
  function shuffled(list) {
    const result = [...list];
    for (let index = result.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
  }
  function sessionQuestions(session) {
    return session.qids.map((id) => questionMap.get(id));
  }
  function sessionResponses(session) {
    return session.qids.map((id) => session.responses[id]).filter(Boolean);
  }
  function sessionSummary(session) {
    const responses = sessionResponses(session);
    const graded = responses.filter((response) => response.kind === "answer");
    const correct = graded.filter((response) => response.correct).length;
    return {
      done: responses.length,
      graded: graded.length,
      correct,
      wrong: graded.length - correct,
      reviewed: responses.filter((response) => response.kind === "review")
        .length,
      rate: graded.length ? Math.round((correct / graded.length) * 100) : null,
    };
  }
  function settleTimer() {
    const now = performance.now();
    const tracked = state.sessions.find(
      (session) => session.id === trackedSessionId,
    );
    if (timerWasActive && tracked && !tracked.finished) {
      const elapsed = Math.max(0, now - lastTimerMark);
      if (tracked.mode !== "exam") tracked.elapsedMs += elapsed;
      state.stats.studiedMs += elapsed;
    }
    const session = activeSession();
    trackedSessionId = session?.id || null;
    timerWasActive =
      document.body.dataset.page === "practice" &&
      document.body.dataset.courseLimited !== "true" &&
      state.certificateDemo?.active !== "network-engineer" &&
      !document.hidden &&
      !!session &&
      !session.finished;
    lastTimerMark = now;
  }

  function updateTaskProgress(session) {
    const task = state.plan.tasks.find((item) => item.id === session.taskId);
    if (task) {
      task.count = session.qids.length;
      task.completed = sessionSummary(session).done;
      task.sessionId = session.id;
    }
  }
  function createSession(mode, chapter, list, options = {}) {
    if (state.certificateDemo?.active === "network-engineer") {
      toast("这个方向的章节题库正在准备，可先体验 AI 精讲。");
      showPage("ai");
      return null;
    }
    settleTimer();
    const qids = list
      .map((question) => question.id)
      .filter((id) => questionMap.has(id));
    if (!qids.length) {
      toast(
        mode === "wrong"
          ? "暂无需要巩固的错题，可以开始章节练习。"
          : "当前范围没有题目，请调整练习设置。",
      );
      return null;
    }
    let session = options.taskId
      ? state.sessions.find(
          (item) => item.taskId === options.taskId && !item.finished,
        )
      : null;
    if (!session && !options.forceNew && !options.taskId)
      session = state.sessions.findLast(
        (item) =>
          !item.finished &&
          item.mode === mode &&
          item.chapter === chapter &&
          !item.taskId &&
          item.qids.join() === qids.join(),
      );
    if (!session) {
      const id =
        globalThis.crypto?.randomUUID?.() ||
        "session-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      session = {
        id,
        mode,
        chapter,
        qids,
        index: 0,
        selections: {},
        responses: {},
        elapsedMs: 0,
        viewMode: "practice",
        finished: false,
        order: practiceConfig.mode,
        taskId: options.taskId || null,
        createdAt: Date.now(),
      };
      Object.assign(session, options.sessionData || {});
      session.origin = options.origin || null;
      if (mode === "exam") {
        session.examMinutes = session.examMinutes || 45;
        session.examStartedAt = Date.now();
        session.examDeadlineAt =
          session.examStartedAt + session.examMinutes * 60000;
      }
      if (options.seedCount) {
        qids.slice(0, options.seedCount).forEach((questionId) => {
          const question = questionMap.get(questionId);
          const known = state.records[questionId];
          const answer =
            known?.correct === false
              ? [
                  question.options.findIndex(
                    (_, index) => !question.answers.includes(index),
                  ),
                ]
              : [...question.answers];
          session.selections[questionId] = answer;
          session.responses[questionId] = {
            kind: "answer",
            selected: answer,
            correct:
              answer.slice().sort().join() ===
              question.answers.slice().sort().join(),
          };
        });
        session.index = Math.min(options.seedCount, qids.length - 1);
        session.elapsedMs = 4 * 60000 + 32000;
      }
      state.sessions.push(session);
      if (state.sessions.length > 40) {
        const removable = state.sessions.findIndex(
          (item) => item.finished && item.id !== state.activeSessionId,
        );
        if (removable >= 0) state.sessions.splice(removable, 1);
      }
    }
    state.activeSessionId = session.id;
    quiz = null;
    selectChapter(chapter);
    settleTimer();
    updateTaskProgress(session);
    saveState();
    showPage("practice");
    return session;
  }
  function startStudyQuiz(mode = "practice", chapter = 2, selection = null) {
    const list =
      selection ||
      (mode === "wrong"
        ? wrongQuestions()
        : mode === "exam"
          ? shuffled([...questionMap.values()]).slice(0, 10)
          : pools[chapter].slice(0, 10));
    return createSession(mode, chapter, list);
  }
  startQuiz = startStudyQuiz;
  function announce(message) {
    $("#study-announcement").textContent = message;
  }
  const announcer = document.createElement("div");
  announcer.id = "study-announcement";
  announcer.className = "sr-only";
  announcer.setAttribute("role", "status");
  announcer.setAttribute("aria-live", "polite");
  announcer.setAttribute("aria-atomic", "true");
  document.body.append(announcer);

  function examRemaining(session) {
    if (!session.examDeadlineAt) {
      session.examMinutes ||= 45;
      session.examStartedAt ||= session.createdAt || Date.now();
      session.examDeadlineAt =
        session.examStartedAt + session.examMinutes * 60000;
      session.legacyGradedIds = Object.keys(session.responses).filter(
        (id) => session.responses[id].kind === "answer",
      );
    }
    return Math.max(0, Math.ceil((session.examDeadlineAt - Date.now()) / 1000));
  }
  function renderPractice() {
    if (state.certificateDemo?.active === "network-engineer") return;
    const session = activeSession();
    if (!session) {
      createSession(
        "practice",
        activeChapter,
        pools[activeChapter].slice(
          0,
          Number(state.settingsDemo?.prefs?.questionCount || 10),
        ),
      );
      return;
    }
    const pendingExam = session.mode === "exam" && !session.finished;
    const summary = sessionSummary(session);
    const title =
      session.title ||
      (session.mode === "wrong"
        ? "错题巩固"
        : session.mode === "exam"
          ? "我的知识点模拟考试"
          : chapters[session.chapter].title);
    const origin = studyOrigin(session);
    $("#practice-title").textContent = title;
    $("#practice-breadcrumb-title").textContent = title;
    const crumb = $(".study-breadcrumb button");
    crumb.dataset.action = origin;
    crumb.textContent =
      origin === "exam"
        ? "模拟考试"
        : origin === "favorites"
          ? "我的收藏"
          : origin === "wrong"
            ? "错题本"
            : "章节练习";
    const back = $(".study-practice-heading > .study-outline");
    back.dataset.action = origin;
    back.innerHTML =
      icon("arrow") +
      (origin === "exam"
        ? "返回组卷"
        : origin === "favorites"
          ? "返回收藏"
          : origin === "wrong"
            ? "返回错题本"
            : "返回章节");
    $("#practice-subtitle").textContent =
      (session.finished
        ? "本轮回顾"
        : session.mode === "exam"
          ? "模拟考试"
          : session.mode === "wrong"
            ? "巩固练习"
            : session.order === "random"
              ? "随机练习"
              : "顺序练习") +
      " · 本轮 " +
      session.qids.length +
      " 题" +
      (session.mode === "exam"
        ? " · 限时 " + (session.examMinutes || 45) + " 分钟"
        : "");
    const kind =
      session.mode === "wrong"
        ? "review"
        : session.mode === "exam"
          ? art.examPaper
            ? "examPaper"
            : "exam"
          : chapters[session.chapter].kind;
    const mount = $("#practice-chapter-art");
    if (mount.dataset.kind !== kind) {
      stopOffice($(".study-practice-heading"), true);
      mount.innerHTML = art[kind]();
      mount.dataset.kind = kind;
    }
    $("#practice-page").dataset.examActive = String(pendingExam);
    $("#practice-answered").textContent = summary.done;
    $("#practice-total").textContent = session.qids.length;
    const countLabel =
      session.viewMode === "memorize"
        ? "已学"
        : summary.reviewed
          ? "已完成"
          : "已答";
    $("#practice-progress-label").textContent = countLabel;
    $("#sheet-count-label").textContent = countLabel;
    $("#sheet-correct-label").textContent = pendingExam
      ? "已答"
      : summary.reviewed
        ? "正确 / 已背"
        : "正确";
    $(".answer-legend > span:nth-child(2)").hidden = pendingExam;
    $(".practice-view-modes").hidden = session.mode === "exam";
    $(".answer-sheet h2").innerHTML =
      icon("grid") + (session.mode === "exam" ? "考试答题卡" : "答题卡");
    $(".answer-sheet-stats > div:last-child > span").textContent =
      session.mode === "exam" ? "成绩" : "正确率";
    $(".practice-clock > span").textContent = pendingExam
      ? "剩余时间"
      : "已用时";
    const percent = Math.round((summary.done / session.qids.length) * 100);
    $("#practice-progress-fill").style.width = percent + "%";
    $("#practice-progress-bar").setAttribute("aria-valuenow", percent);
    $("#practice-elapsed").textContent = formatTime(
      pendingExam
        ? examRemaining(session)
        : Math.floor(session.elapsedMs / 1000),
    );
    $("#sheet-answered").textContent = summary.done;
    $("#sheet-total").textContent = session.qids.length;
    $("#sheet-accuracy").textContent = pendingExam
      ? "交卷后显示"
      : session.mode === "exam" && session.finished
        ? (session.examScore ?? 0) + " 分"
        : summary.rate === null
          ? "—"
          : summary.rate + "%";
    $("#sheet-accuracy").classList.toggle("exam-score-hidden", pendingExam);
    $("#answer-sheet-grid").innerHTML = session.qids
      .map((id, index) => {
        const response = session.responses[id];
        const status = !response
          ? ""
          : pendingExam
            ? "answered"
            : response.kind === "review"
              ? "reviewed"
              : response.correct
                ? "correct"
                : "wrong";
        const label = !response
          ? "未答"
          : pendingExam
            ? "已答"
            : response.kind === "review"
              ? "已背"
              : response.correct
                ? "正确"
                : "错误";
        return (
          '<button class="answer-jump ' +
          status +
          (index === session.index ? " current" : "") +
          '" data-question-jump="' +
          index +
          '" aria-label="第 ' +
          (index + 1) +
          " 题，" +
          label +
          '"' +
          (index === session.index ? ' aria-current="step"' : "") +
          ">" +
          (index + 1) +
          (response
            ? '<span class="answer-stamp ' +
              (status === "wrong" ? "wrong" : "") +
              '" aria-hidden="true">' +
              icon(status === "wrong" ? "close" : "check") +
              "</span>"
            : "") +
          "</button>"
        );
      })
      .join("");
    document.querySelectorAll("[data-study-mode]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.studyMode === session.viewMode),
      );
      button.disabled = session.finished || session.mode === "exam";
    });
    $("#practice-mode-description").innerHTML =
      session.viewMode === "memorize"
        ? "直接查看答案与解析<br/>标记已学后，更新本轮学习进度"
        : "作答后查看答案与解析<br/>错题自动收录，方便回顾";
    $('[data-study-action="finish"]').textContent = session.finished
      ? "返回本轮报告"
      : session.mode === "exam"
        ? "交卷"
        : "结束练习";
    $(".answer-sheet-bottom").textContent = pendingExam
      ? "作答可回改，交卷后查看成绩与解析"
      : "结束后可查看本轮报告";
    renderStudyQuestion();
  }

  function renderStudyQuestion() {
    const session = activeSession();
    if (!session) return;
    const question = questionMap.get(session.qids[session.index]);
    const response = session.responses[question.id];
    const selected = session.selections[question.id] || [];
    const pendingExam = session.mode === "exam" && !session.finished;
    const revealing =
      !pendingExam &&
      (session.viewMode === "memorize" ||
        session.finished ||
        (!!response &&
          (window.AceDemoSettings?.prefs().showAnalysis !== false ||
            session.analysisOpen?.[question.id])));
    const type =
      question.type === "multiple_choice"
        ? "多选题"
        : question.type === "true_false"
          ? "判断题"
          : "单选题";
    const hint =
      question.type === "multiple_choice"
        ? "请选择所有正确答案"
        : question.type === "true_false"
          ? "请判断下列说法是否正确"
          : "请选择一个正确答案";
    const locked =
      !pendingExam &&
      (!!response || session.finished || session.viewMode === "memorize");
    const isFavorite = state.favorites.includes(question.id);
    const answerLabels = question.answers
      .map((index) => String.fromCharCode(65 + index))
      .join("、");
    let feedback = "";
    if (revealing) {
      const wrong = response?.kind === "answer" && !response.correct;
      const lead =
        session.viewMode === "memorize" && !response
          ? "参考答案"
          : response?.kind === "review"
            ? "已标记学习"
            : response
              ? response.correct
                ? "回答正确"
                : "这道题已收录到错题本"
              : "本轮未作答";
      feedback =
        '<section class="study-analysis ' +
        (wrong ? "is-wrong" : "") +
        '" aria-label="答案与解析"><h3>' +
        icon(wrong ? "close" : "check") +
        "<span>" +
        lead +
        " · 正确答案 " +
        answerLabels +
        "</span></h3><p>" +
        safe(question.explain) +
        "</p><small>题目来源：" +
        safe(question.source || "四川计算机章节练习") +
        "</small></section>";
    }
    if (!pendingExam && response && !revealing) {
      feedback =
        '<section class="study-analysis-collapsed" aria-label="作答结果"><span>已提交 · ' +
        (response.correct ? "回答正确" : "需要再巩固") +
        '</span><button class="study-link" data-study-action="analysis">查看答案与解析</button></section>';
    }
    const nextLabel = pendingExam
      ? session.index === session.qids.length - 1
        ? "交卷"
        : "保存并下一题"
      : response || session.finished
        ? session.index === session.qids.length - 1
          ? "查看报告"
          : "下一题"
        : session.viewMode === "memorize"
          ? "标记已学"
          : "确认答案";
    $("#study-question-card").innerHTML =
      '<div class="study-question-top"><span class="question-type">' +
      type +
      "</span><span>第 " +
      (session.index + 1) +
      " 题 / 共 " +
      session.qids.length +
      ' 题</span><div class="study-question-tools">' +
      (!pendingExam
        ? '<button class="study-tool" data-study-tutor="' +
          safe(question.id) +
          '">' +
          icon("sparkles") +
          "<span>AI 精讲</span></button>"
        : "") +
      '<button class="study-tool" data-study-action="favorite" aria-pressed="' +
      isFavorite +
      '">' +
      icon("star") +
      "<span>" +
      (isFavorite ? "已收藏" : "收藏") +
      '</span></button><button class="study-tool" data-study-action="feedback">' +
      icon("pen") +
      "<span>反馈</span></button></div></div>" +
      '<span class="question-point">' +
      safe(question.point || question.section || question.chapter) +
      '</span><h2 id="study-question-text" tabindex="-1">' +
      safe(question.q) +
      '</h2><p class="study-answer-hint">' +
      (session.viewMode === "memorize"
        ? "先理解解析，再标记这道题已经学过"
        : hint) +
      "</p>" +
      '<fieldset class="study-options"><legend class="sr-only">' +
      hint +
      "</legend>" +
      question.options
        .map((option, index) => {
          const choosing = selected.includes(index);
          const correct = revealing && question.answers.includes(index);
          const wrong =
            revealing && choosing && !question.answers.includes(index);
          const mark = correct
            ? "check"
            : wrong
              ? "close"
              : choosing
                ? "check"
                : null;
          return (
            '<button class="study-option ' +
            (choosing ? "selected " : "") +
            (correct ? "correct " : wrong ? "wrong " : "") +
            (/^=|SUM\(|AVERAGE\(|Ctrl\s*\+/i.test(option) ? "is-formula" : "") +
            '" data-study-option="' +
            index +
            '" aria-pressed="' +
            choosing +
            '"' +
            (locked ? " disabled" : "") +
            '><span class="study-option-letter">' +
            String.fromCharCode(65 + index) +
            '</span><span class="study-option-text">' +
            safe(option) +
            "</span>" +
            (mark
              ? '<span class="study-option-mark" aria-hidden="true">' +
                icon(mark) +
                "</span>"
              : "") +
            "</button>"
          );
        })
        .join("") +
      "</fieldset>" +
      feedback +
      '<div class="study-question-footer"><button class="study-outline blue-outline study-back" data-study-action="previous"' +
      (session.index === 0 ? " disabled" : "") +
      ">" +
      icon("arrow") +
      '上一题</button><button class="study-skip" data-study-action="skip"' +
      (session.finished ? " disabled" : "") +
      '>跳过此题</button><button class="primary-button study-primary" data-study-action="primary"' +
      (!pendingExam &&
      !response &&
      !session.finished &&
      session.viewMode === "practice" &&
      !selected.length
        ? " disabled"
        : "") +
      ">" +
      nextLabel +
      icon("arrow") +
      '</button></div><p class="study-keyboard">' +
      icon("keyboard") +
      "<span>Enter " +
      (pendingExam ? "保存并下一题" : "确认答案") +
      " · ← → 切换题目 · 数字键选择选项</span></p>";
  }
  function moveQuestion(index) {
    const session = activeSession();
    if (!session) return;
    session.index = Math.max(0, Math.min(session.qids.length - 1, index));
    saveState();
    renderPractice();
    $("#study-question-text").focus({ preventScroll: true });
    $("#study-question-text").scrollIntoView({
      block: "nearest",
      behavior: "auto",
    });
  }
  function selectStudyOption(index) {
    const session = activeSession();
    if (!session || session.finished || session.viewMode === "memorize") return;
    const question = questionMap.get(session.qids[session.index]);
    if (
      (session.responses[question.id] && session.mode !== "exam") ||
      index >= question.options.length
    )
      return;
    if (session.mode === "exam" && examRemaining(session) <= 0) {
      finalizeExamSession(session, "timeout", true);
      return;
    }
    const current = session.selections[question.id] || [];
    session.selections[question.id] =
      question.type === "multiple_choice"
        ? current.includes(index)
          ? current.filter((value) => value !== index)
          : [...current, index].sort()
        : [index];
    if (session.mode === "exam") {
      const selected = session.selections[question.id];
      if (selected.length)
        session.responses[question.id] = {
          kind: "exam",
          selected: [...selected],
        };
      else delete session.responses[question.id];
    }
    saveState();
    if (session.mode === "exam") renderPractice();
    else renderStudyQuestion();
    $('[data-study-option="' + index + '"]').focus({ preventScroll: true });
  }
  function confirmStudyAnswer() {
    const session = activeSession();
    if (!session || session.finished) return;
    const question = questionMap.get(session.qids[session.index]);
    if (session.responses[question.id]) return;
    const selected = session.selections[question.id] || [];
    if (session.viewMode === "memorize") {
      session.responses[question.id] = {
        kind: "review",
        selected: [],
        correct: null,
      };
      announce("第 " + (session.index + 1) + " 题已标记学习。");
    } else {
      if (!selected.length) return;
      const correct =
        selected.slice().sort().join() ===
        question.answers.slice().sort().join();
      session.responses[question.id] = {
        kind: "answer",
        selected: [...selected],
        correct,
      };
      trackWrongAnswer(question.id, correct);
      state.records[question.id] = {
        correct,
        attempts:
          (state.records[question.id]?.attempts ||
            (state.records[question.id] ? 1 : 0)) + 1,
        lastAnsweredAt: Date.now(),
      };
      if (state.stats.date !== today) {
        state.stats.date = today;
        state.stats.todayCount = 0;
      }
      state.stats.todayCount++;
      state.stats.answeredTotal++;
      if (correct) state.stats.correctTotal++;
      announce(
        "第 " +
          (session.index + 1) +
          " 题" +
          (correct
            ? "回答正确。"
            : "回答错误，正确答案是 " +
              question.answers
                .map((index) => String.fromCharCode(65 + index))
                .join("、") +
              "。"),
      );
    }
    updateTaskProgress(session);
    syncSharedUI();
    saveState();
    renderPractice();
    $(".study-primary").focus({ preventScroll: true });
    const answeredIndex = session.index;
    window.AceDemoSettings?.queueNext(
      $("#study-question-card"),
      () => studyPrimary(),
      () =>
        document.body.dataset.page === "practice" &&
        !dialog.open &&
        activeSession() === session &&
        !session.finished &&
        session.index === answeredIndex,
    );
    if (state.stats.answeredTotal % 10 === 0)
      window.AceDemoSettings?.notify(
        "又完成一个小目标",
        "累计完成 " +
          state.stats.answeredTotal +
          " 次作答，继续保持自己的学习节奏。",
        "answered-" + state.stats.answeredTotal,
      );
  }
  function studyPrimary() {
    const session = activeSession();
    if (!session) return;
    const response = session.responses[session.qids[session.index]];
    if (session.mode === "exam" && !session.finished) {
      if (session.index === session.qids.length - 1) requestStudyFinish();
      else moveQuestion(session.index + 1);
      return;
    }
    if (!response && !session.finished) {
      confirmStudyAnswer();
      return;
    }
    if (session.index === session.qids.length - 1) requestStudyFinish();
    else moveQuestion(session.index + 1);
  }
  function finalizeExamSession(session, reason = "manual", navigate = true) {
    if (!session || session.finished) return;
    settleTimer();
    examRemaining(session);
    session.elapsedMs = Math.max(
      0,
      Math.min(session.examMinutes * 60000, Date.now() - session.examStartedAt),
    );
    let correctCount = 0;
    session.qids.forEach((id) => {
      const selected = session.selections[id] || [];
      if (!selected.length) {
        delete session.responses[id];
        return;
      }
      const question = questionMap.get(id);
      const correct =
        selected.slice().sort().join() ===
        question.answers.slice().sort().join();
      session.responses[id] = {
        kind: "answer",
        selected: [...selected],
        correct,
      };
      if (correct) correctCount++;
      if (!session.legacyGradedIds?.includes(id)) {
        trackWrongAnswer(id, correct);
        state.records[id] = {
          correct,
          attempts:
            (state.records[id]?.attempts || (state.records[id] ? 1 : 0)) + 1,
          lastAnsweredAt: Date.now(),
        };
        const day = localDate();
        if (state.stats.date !== day) {
          state.stats.date = day;
          state.stats.todayCount = 0;
        }
        state.stats.todayCount++;
        state.stats.answeredTotal++;
        if (correct) state.stats.correctTotal++;
      }
    });
    session.finished = true;
    session.finishedAt = Date.now();
    session.finishReason = reason;
    session.examScore =
      Math.round((correctCount / session.qids.length) * 1000) / 10;
    syncSharedUI();
    saveState();
    document.dispatchEvent(
      new CustomEvent("demo:exam-finished", {
        detail: { id: session.id, reason },
      }),
    );
    if (navigate) {
      state.activeSessionId = session.id;
      saveState();
      showPage("report");
    }
  }

  function finishStudySession() {
    const session = activeSession();
    if (!session) return;
    if (session.mode === "exam") {
      finalizeExamSession(session, "manual", true);
      return;
    }
    settleTimer();
    session.finished = true;
    session.finishedAt = Date.now();
    updateTaskProgress(session);
    saveState();
    showPage("report");
  }
  function requestStudyFinish() {
    const session = activeSession();
    if (!session) return;
    if (session.finished) {
      showPage("report");
      return;
    }
    const unanswered = session.qids.length - sessionSummary(session).done;
    if (session.mode === "exam") {
      showDialog(
        "确认交卷？",
        '<p class="dialog-lead">已作答 <strong>' +
          (session.qids.length - unanswered) +
          " / " +
          session.qids.length +
          "</strong> 题。" +
          (unanswered
            ? "还有 <strong>" +
              unanswered +
              "</strong> 题未答，未答题计为零分。"
            : "交卷后可以查看成绩与解析。") +
          '</p><div class="study-form-actions"><button class="study-outline" data-action="close">继续考试</button><button class="primary-button" data-study-action="finish-confirm">确认交卷' +
          icon("arrow") +
          "</button></div>",
        session.title || "模拟考试",
      );
      return;
    }
    if (!unanswered) {
      finishStudySession();
      return;
    }
    showDialog(
      "结束本轮练习？",
      '<p class="dialog-lead">本轮还有 <strong>' +
        unanswered +
        '</strong> 题未完成。你可以继续作答，也可以现在查看报告。</p><div class="study-form-actions"><button class="study-outline" data-action="close">继续练习</button><button class="primary-button" data-study-action="finish-confirm">结束并查看报告' +
        icon("arrow") +
        "</button></div>",
      "本轮进度已保存",
    );
  }
  function renderReport() {
    const session = activeSession();
    if (!session) {
      showPage("chapters");
      return;
    }
    if (!session.finished) {
      showPage("practice");
      return;
    }
    const summary = sessionSummary(session);
    $("#report-subtitle").textContent =
      (session.mode === "wrong"
        ? "错题巩固"
        : session.mode === "exam"
          ? session.title || "模拟考试"
          : session.title || chapters[session.chapter].title) +
      " · 共 " +
      session.qids.length +
      " 题";
    const allDone = summary.done === session.qids.length;
    $("#study-report-body").innerHTML =
      '<div class="study-report-heading"><span class="report-medal">' +
      icon("check") +
      "</span><h2>" +
      (allDone ? "这一轮，练完了" : "本轮练习已结束") +
      "</h2><p>" +
      (summary.wrong
        ? "回顾错题的解析，再巩固一次薄弱知识。"
        : summary.done
          ? "每一次练习，都在离目标更近一点。"
          : "下一次，试着先完成几道题。") +
      "</p></div>" +
      '<div class="study-report-values"><div><strong>' +
      summary.done +
      " / " +
      session.qids.length +
      "</strong><span>完成题数</span></div><div><strong>" +
      (summary.rate === null ? "—" : summary.rate + "%") +
      "</strong><span>" +
      (summary.reviewed ? "作答正确率" : "本轮正确率") +
      "</span></div><div><strong>" +
      summary.wrong +
      "</strong><span>需要巩固</span></div><div><strong>" +
      formatTime(Math.floor(session.elapsedMs / 1000)) +
      "</strong><span>学习用时</span></div></div>" +
      '<div class="study-report-actions">' +
      (summary.wrong
        ? '<button class="primary-button" data-study-action="retry-wrong">巩固本轮错题' +
          icon("arrow") +
          "</button>"
        : '<button class="primary-button" data-study-action="retry-all">再练一轮' +
          icon("arrow") +
          "</button>") +
      '<button class="study-outline" data-action="plan">查看学习计划</button><button class="study-outline" data-action="chapters">返回章节</button></div>' +
      (session.taskId
        ? '<p class="study-demo-note">' +
          (allDone
            ? "对应的学习任务已完成。"
            : "对应任务已保存当前进度，可以从计划页继续。") +
          "</p>"
        : "") +
      '<div class="study-report-list"><h3>本轮回顾</h3>' +
      session.qids
        .map((id, index) => {
          const question = questionMap.get(id);
          const response = session.responses[id];
          const status = !response
            ? ""
            : response.kind === "review"
              ? "correct"
              : response.correct
                ? "correct"
                : "wrong";
          const label = !response
            ? "未答"
            : response.kind === "review"
              ? "已背"
              : response.correct
                ? "正确"
                : "错误";
          return (
            '<button class="report-question" data-study-review="' +
            index +
            '"><span class="report-question-number">' +
            (index + 1) +
            '</span><span class="report-question-copy"><strong>' +
            safe(question.q) +
            "</strong><small>" +
            safe(question.point || question.chapter) +
            '</small></span><span class="report-question-state ' +
            status +
            '">' +
            label +
            "</span>" +
            icon("chevron") +
            "</button>"
          );
        })
        .join("") +
      '</div><p class="study-demo-note">正确率只统计已提交的答案；背题记录计入学习进度。</p>';
  }
  function toggleStudyFavorite() {
    const session = activeSession();
    if (!session) return;
    const id = session.qids[session.index];
    const exists = state.favorites.includes(id);
    state.favorites = exists
      ? state.favorites.filter((value) => value !== id)
      : [...state.favorites, id];
    saveState();
    renderStudyQuestion();
    $('[data-study-action="favorite"]').focus({ preventScroll: true });
    document.dispatchEvent(
      new CustomEvent("demo:favorite-changed", {
        detail: { id, added: !exists },
      }),
    );
    toast(exists ? "已取消收藏" : "已添加到我的收藏");
  }
  function showStudyFavorites() {
    const list = state.favorites.map((id) => questionMap.get(id));
    showDialog(
      "我的收藏",
      list.length
        ? '<div class="study-task-dialog-list">' +
            list
              .map(
                (question) =>
                  '<button class="study-task-dialog-row" data-study-favorite-id="' +
                  safe(question.id) +
                  '">' +
                  icon("star") +
                  "<span><strong>" +
                  safe(question.q) +
                  "</strong><small>" +
                  safe(
                    question.chapter +
                      " · " +
                      (question.point || question.section),
                  ) +
                  "</small></span>" +
                  icon("chevron") +
                  "</button>",
              )
              .join("") +
            "</div>"
        : '<div class="plan-empty">' +
            icon("star") +
            '<h3>还没有收藏的题目</h3><p>练习时点击“收藏”，就能在这里找到它。</p><button class="study-outline blue-outline" data-action="practice">开始练习</button></div>',
      "题目收藏 · 当前浏览器",
    );
  }
  function showStudyFeedback() {
    const session = activeSession();
    if (!session) return;
    const question = questionMap.get(session.qids[session.index]);
    showDialog(
      "反馈这道题",
      '<form class="study-form" id="study-feedback-form"><div class="study-feedback-question">' +
        safe(question.q) +
        '</div><label>反馈类型<select name="category"><option>题目内容</option><option>答案与解析</option><option>页面显示</option><option>其他建议</option></select></label><label>具体说明<textarea name="message" required minlength="3" maxlength="500" placeholder="说明你发现的问题，或写下修改建议"></textarea></label><p class="study-form-help">Demo 反馈保存在当前浏览器，便于回看。</p><div class="study-form-actions"><button type="button" class="study-outline" data-action="close">取消</button><button class="primary-button" type="submit">保存反馈' +
        icon("arrow") +
        "</button></div></form>",
      "第 " + (session.index + 1) + " 题",
    );
    $("#study-feedback-form textarea").focus();
  }
  const practiceHead = $(".study-practice-heading");
  practiceHead.addEventListener("pointerenter", () => {
    if (practiceHead.querySelector(".office-art")) startOffice(practiceHead);
  });
  practiceHead.addEventListener("pointerleave", () => stopOffice(practiceHead));
  document.addEventListener("click", (event) => {
    const option = event.target.closest("[data-study-option]");
    if (option) {
      selectStudyOption(Number(option.dataset.studyOption));
      return;
    }
    const jump = event.target.closest("[data-question-jump]");
    if (jump) {
      moveQuestion(Number(jump.dataset.questionJump));
      return;
    }
    const mode = event.target.closest("[data-study-mode]");
    if (mode) {
      const session = activeSession();
      if (session && !session.finished && session.mode !== "exam") {
        session.viewMode = mode.dataset.studyMode;
        saveState();
        renderPractice();
        announce(
          "已切换为" +
            (session.viewMode === "memorize" ? "背题模式" : "练习模式"),
        );
      }
      return;
    }
    const review = event.target.closest("[data-study-review]");
    if (review) {
      activeSession().index = Number(review.dataset.studyReview);
      showPage("practice");
      saveState();
      return;
    }
    const favorite = event.target.closest("[data-study-favorite-id]");
    if (favorite) {
      const question = questionMap.get(favorite.dataset.studyFavoriteId);
      createSession("practice", question.chapterIndex, [question], {
        forceNew: true,
      });
      return;
    }
    const action = event.target.closest("[data-study-action]");
    if (!action || action.disabled) return;
    const session = activeSession();
    if (!session) return;
    switch (action.dataset.studyAction) {
      case "analysis":
        session.analysisOpen ||= {};
        session.analysisOpen[session.qids[session.index]] = true;
        saveState();
        renderPractice();
        break;
      case "favorite":
        toggleStudyFavorite();
        break;
      case "feedback":
        showStudyFeedback();
        break;
      case "previous":
        moveQuestion(session.index - 1);
        break;
      case "skip":
        if (session.index === session.qids.length - 1) requestStudyFinish();
        else moveQuestion(session.index + 1);
        break;
      case "primary":
        studyPrimary();
        break;
      case "finish":
        requestStudyFinish();
        break;
      case "finish-confirm":
        finishStudySession();
        break;
      case "retry-all":
        createSession(
          session.mode,
          session.chapter,
          sessionQuestions(session),
          {
            forceNew: true,
            origin: session.origin,
            sessionData: { title: session.title, order: session.order },
          },
        );
        break;
      case "retry-wrong":
        createSession(
          "wrong",
          session.chapter,
          sessionQuestions(session).filter(
            (question) =>
              session.responses[question.id]?.kind === "answer" &&
              session.responses[question.id].correct === false,
          ),
          {
            forceNew: true,
            origin: session.origin,
            sessionData: { title: session.title, order: session.order },
          },
        );
        break;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (
      document.body.dataset.page !== "practice" ||
      dialog.open ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat ||
      event.target.closest("input,textarea,select,[contenteditable=true]")
    )
      return;
    const session = activeSession();
    if (!session) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveQuestion(session.index + (event.key === "ArrowRight" ? 1 : -1));
    }
    if (/^[1-4]$/.test(event.key)) {
      event.preventDefault();
      selectStudyOption(Number(event.key) - 1);
    }
    if (event.key === "Enter") {
      const option = event.target.closest("[data-study-option]");
      const selected = session.selections[session.qids[session.index]] || [];
      if (
        !event.target.closest("button") ||
        (option && selected.includes(Number(option.dataset.studyOption)))
      ) {
        event.preventDefault();
        studyPrimary();
      }
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id !== "study-feedback-form") return;
    event.preventDefault();
    const form = new FormData(event.target);
    const session = activeSession();
    state.feedback.push({
      questionId: session.qids[session.index],
      category: form.get("category"),
      message: String(form.get("message")).trim(),
      at: Date.now(),
    });
    state.feedback = state.feedback.slice(-30);
    saveState();
    closeDialog();
    toast(
      storageAvailable
        ? "反馈已保存在当前浏览器"
        : "浏览器存储不可用，反馈暂未保存",
    );
  });

  art.schedule = () =>
    '<div class="art calendar-art">' +
    svg(
      '<defs><linearGradient id="calendar-blue" x1="40" y1="40" x2="180" y2="180" gradientUnits="userSpaceOnUse"><stop stop-color="#b8d6ff"/><stop offset="1" stop-color="#6399ed"/></linearGradient><linearGradient id="calendar-check" x1="22" y1="126" x2="80" y2="185" gradientUnits="userSpaceOnUse"><stop stop-color="#88e3c1"/><stop offset="1" stop-color="#00a280"/></linearGradient></defs><ellipse cx="127" cy="151" rx="111" ry="49" fill="#cfe3ff" opacity=".6"/><path d="m143 151 63-16 27 12-63 17Z" fill="#72a4ee"/><path d="m170 164 63-17v14l-63 18Z" fill="#4b82d8"/><path d="m176 167 55-15v7l-55 15Z" fill="#f1f7ff"/><path d="m143 129 66-17 28 13-66 17Z" fill="#93c3ff"/><path d="m171 142 66-17v13l-66 18Z" fill="#538eec"/><path d="m177 145 57-15v6l-57 15Z" fill="#fff"/><path d="m67 42 91-20 24 129-102 23-29-22Z" fill="#5c94e8"/><path d="m65 45 93-20a9 9 0 0 1 10 7l22 117a9 9 0 0 1-7 10l-95 21a9 9 0 0 1-10-7L57 56a9 9 0 0 1 8-11Z" fill="#fff" stroke="#bed5fa" stroke-width="2"/><path d="m65 45 93-20a9 9 0 0 1 10 7l4 21-112 25-3-22a9 9 0 0 1 8-11Z" fill="url(#calendar-blue)"/><path d="m71 37 3 21m22-27 4 21m22-27 4 21m22-26 4 20" stroke="#4278e8" stroke-width="7" stroke-linecap="round"/><path d="m70 37 1 11m24-17 2 11m24-17 2 11m24-16 2 10" stroke="#c0d9ff" stroke-width="2.5" stroke-linecap="round"/><g fill="#f1f7ff" stroke="#d5e5ff" stroke-width="1.4"><path d="m75 87 20-4 3 20-20 4Z"/><path d="m101 82 20-4 4 20-20 4Z"/><path d="m128 76 20-4 3 20-20 4Z"/><path d="m154 71 19-4 4 20-20 4Z"/><path d="m80 114 20-4 4 20-20 4Z"/><path d="m107 109 20-4 4 20-20 4Z"/><path d="m133 103 20-4 4 20-20 4Z"/><path d="m159 98 19-4 4 20-19 4Z"/><path d="m86 141 20-4 4 20-20 4Z"/><path d="m112 136 20-4 4 20-20 4Z"/><path d="m139 130 20-4 3 20-20 4Z"/></g><path d="m107 109 20-4 4 20-20 4Z" fill="#467cff"/><path d="m113 115 6 5 6-11" fill="none" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/><path d="m165 125 18-4 4 20-18 4Z" fill="#467cff"/><circle cx="49" cy="155" r="28" fill="#75d0b3"/><circle cx="45" cy="151" r="27" fill="url(#calendar-check)"/><path d="m32 150 10 10 17-22" stroke="#fff" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
    ) +
    "</div>";
  $("#plan-hero-art").innerHTML = art.schedule();
  const phases = [
    { title: "打好基础", note: "基础知识 · 软硬件", chapters: [0, 1] },
    { title: "常用办公", note: "Word · Excel · PowerPoint", chapters: [2, 2] },
    { title: "程序与数据", note: "算法与程序 · 数据库", chapters: [3, 4] },
    { title: "综合巩固", note: "网络安全 · 新技术", chapters: [5, 6] },
  ];
  function dayTasks(date) {
    return state.plan.tasks.filter((task) => task.date === date);
  }
  function taskDone(task) {
    return task.completed >= task.count;
  }
  function renderPlan() {
    const plan = state.plan;
    $("#plan-name").textContent = plan.name;
    $("#plan-description").textContent =
      "每天约 " + plan.dailyMinutes + " 分钟，循序完成一轮复习";
    const end = plusDays(plan.startDate, plan.weeks * 7 - 1);
    $("#plan-state").textContent =
      today < plan.startDate
        ? "即将开始"
        : today > end
          ? "本期已结束"
          : "正在进行";
    const weekTasks = plan.tasks.filter(
      (task) =>
        task.date >= planWeekStart && task.date < plusDays(planWeekStart, 7),
    );
    const done = weekTasks.filter(taskDone).length;
    const percent = weekTasks.length
      ? Math.round((done / weekTasks.length) * 100)
      : 0;
    $("#plan-week-done").textContent = done;
    $("#plan-week-total").textContent = weekTasks.length;
    $("#plan-week-percent").textContent = percent + "%";
    $("#plan-week-fill").style.width = percent + "%";
    const minutes = Math.floor(state.stats.studiedMs / 60000);
    $("#plan-hours").textContent = Math.floor(minutes / 60);
    $("#plan-minutes").textContent = minutes % 60;
    $("#plan-week-range").textContent =
      dateCaption(planWeekStart) +
      " — " +
      dateCaption(plusDays(planWeekStart, 6));
    const dayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
    $("#plan-days").innerHTML = dayNames
      .map((name, index) => {
        const date = plusDays(planWeekStart, index);
        const tasks = dayTasks(date);
        const complete = tasks.length && tasks.every(taskDone);
        return (
          '<button class="plan-day" data-plan-date="' +
          date +
          '" aria-pressed="' +
          (date === selectedPlanDate) +
          '" aria-label="' +
          dateCaption(date) +
          "，" +
          name +
          (date === today ? "，今天" : "") +
          "，" +
          tasks.filter(taskDone).length +
          " / " +
          tasks.length +
          ' 项已完成"><span>' +
          name +
          "</span><strong>" +
          String(fromDate(date).getDate()).padStart(2, "0") +
          "</strong>" +
          (date === today
            ? '<span class="today-label">今天</span>'
            : '<i class="day-dot ' +
              (complete ? "completed" : tasks.length ? "pending" : "") +
              '" aria-hidden="true"></i>') +
          "</button>"
        );
      })
      .join("");
    const tasks = dayTasks(selectedPlanDate);
    const dayDone = tasks.filter(taskDone).length;
    const dayPercent = tasks.length
      ? Math.round((dayDone / tasks.length) * 100)
      : 0;
    $("#plan-tasks-title").textContent =
      selectedPlanDate === today ? "今日任务" : "当日任务";
    $("#plan-task-date").textContent =
      dateCaption(selectedPlanDate) +
      " · " +
      weekdays[fromDate(selectedPlanDate).getDay()];
    $("#plan-day-done").textContent = dayDone;
    $("#plan-day-total").textContent = tasks.length;
    $("#plan-day-percent").textContent = dayPercent + "%";
    $("#plan-day-fill").style.width = dayPercent + "%";
    motionStates.forEach((_, root) => {
      if (root.matches(".plan-task")) {
        stopOffice(root, true);
        motionStates.delete(root);
      }
    });
    $("#plan-tasks").innerHTML = tasks.length
      ? tasks
          .map((task) => {
            const chapter = chapters[task.chapter];
            const kind =
              task.kind === "wrong"
                ? "review"
                : task.kind === "custom"
                  ? "book"
                  : chapter.kind;
            const progress = task.completed > 0 && !taskDone(task);
            const title =
              task.title ||
              (task.kind === "wrong" ? "错题巩固" : chapter.title);
            const description =
              task.kind === "chapter"
                ? "章节练习 · " + task.count + " 题"
                : task.kind === "wrong"
                  ? "复习错题 · " + task.count + " 题"
                  : "自主学习";
            const button = taskDone(task)
              ? '<span class="plan-task-done">' +
                icon("check") +
                "已完成</span>"
              : '<button class="' +
                (progress ? "primary-button" : "study-outline blue-outline") +
                '" data-plan-task-start="' +
                task.id +
                '">' +
                (task.kind === "custom"
                  ? "标记完成"
                  : progress
                    ? "继续练习"
                    : task.kind === "wrong"
                      ? "开始复习"
                      : "开始练习") +
                (progress ? icon("arrow") : "") +
                "</button>";
            return (
              '<div class="plan-task ' +
              (progress ? "in-progress" : "") +
              '"><span class="plan-task-art chapter-art ' +
              (task.kind === "wrong"
                ? "peach"
                : chapter.kind === "office"
                  ? "blue"
                  : chapter.tone) +
              '" aria-hidden="true">' +
              art[kind]() +
              '</span><div class="plan-task-copy"><h3>' +
              safe(title) +
              "</h3><p>" +
              description +
              " · 约 " +
              task.minutes +
              " 分钟</p>" +
              (progress
                ? '<div class="plan-task-inline-progress"><span>已练 <strong>' +
                  task.completed +
                  "</strong> / " +
                  task.count +
                  ' 题</span><div class="practice-bar"><i style="width:' +
                  (task.completed / task.count) * 100 +
                  '%"></i></div></div>'
                : "") +
              '</div><div class="plan-task-actions">' +
              button +
              (!task.auto
                ? '<button class="plan-task-remove" data-plan-remove="' +
                  task.id +
                  '" aria-label="删除任务：' +
                  safe(title) +
                  '">' +
                  icon("close") +
                  "</button>"
                : "") +
              "</div></div>"
            );
          })
          .join("")
      : '<div class="plan-empty">' +
        icon("calendar") +
        '<h3>这一天还没有安排</h3><p>留一点时间休息，或加一个小目标。</p><button class="study-outline blue-outline" data-action="add-plan-task">添加任务</button></div>';
    const remaining = tasks.reduce(
      (sum, task) =>
        sum +
        (taskDone(task)
          ? 0
          : Math.ceil(task.minutes * (1 - task.completed / task.count))),
      0,
    );
    $("#plan-remaining").innerHTML =
      tasks.length && remaining
        ? "剩余约 <strong>" + remaining + "</strong> 分钟，按自己的节奏完成"
        : tasks.length
          ? "这一天的任务已完成，继续保持"
          : "按自己的节奏安排学习";
    $("#plan-route-list").innerHTML = Array.from(
      { length: plan.weeks },
      (_, index) => {
        const start = plusDays(plan.startDate, index * 7);
        const phaseTasks = plan.tasks.filter(
          (task) => task.date >= start && task.date < plusDays(start, 7),
        );
        const completed = phaseTasks.length && phaseTasks.every(taskDone);
        const current = today >= start && today < plusDays(start, 7);
        const phase = phases[Math.min(index, 3)];
        const title = index >= 4 ? "综合复习" : phase.title;
        const status = completed
          ? "已完成"
          : current
            ? "本周进行中"
            : start < today
              ? "待巩固"
              : "待开始";
        return (
          '<button class="plan-phase ' +
          (completed ? "complete" : current ? "current" : "") +
          '" data-plan-phase="' +
          index +
          '" aria-label="查看第 ' +
          (index + 1) +
          " 周，" +
          title +
          "，" +
          status +
          '"><span class="plan-phase-step" aria-hidden="true">' +
          (completed ? icon("check") : "") +
          '</span><span class="plan-phase-copy"><strong>第 ' +
          (index + 1) +
          " 周 · " +
          title +
          "</strong><small>" +
          phase.note +
          '</small></span><span class="plan-phase-state">' +
          status +
          "</span></button>"
        );
      },
    ).join("");
    $("#plan-reminder-switch").checked = plan.reminder;
    $("#plan-reminder-time").value = plan.reminderTime;
    document.querySelectorAll(".plan-task").forEach((task) => {
      if (!task.querySelector(".office-art")) return;
      task.addEventListener("pointerenter", () => startOffice(task));
      task.addEventListener("pointerleave", () => stopOffice(task));
    });
  }
  function startPlanTask(id) {
    const task = state.plan.tasks.find((item) => item.id === id);
    if (!task) return;
    if (taskDone(task)) {
      toast("这项任务已经完成了");
      return;
    }
    if (task.kind === "custom") {
      task.completed = task.count;
      saveState();
      if (dialog.open) closeDialog();
      renderPlan();
      toast("已完成这项学习任务");
      return;
    }
    const previous = state.sessions.find(
      (session) => session.id === task.sessionId,
    );
    if (previous) {
      settleTimer();
      previous.finished = false;
      previous.finishedAt = null;
      previous.index = Math.max(
        0,
        previous.qids.findIndex(
          (questionId) => !previous.responses[questionId],
        ),
      );
      state.activeSessionId = previous.id;
      selectChapter(task.chapter);
      settleTimer();
      saveState();
      showPage("practice");
      return;
    }
    const list =
      task.kind === "wrong"
        ? wrongQuestions().slice(0, task.count)
        : pools[task.chapter].slice(0, task.count);
    if (!list.length) {
      task.completed = task.count;
      saveState();
      renderPlan();
      toast("错题已全部巩固，这项任务已完成");
      return;
    }
    createSession(
      task.kind === "wrong" ? "wrong" : "practice",
      task.chapter,
      list,
      { taskId: task.id, seedCount: task.completed },
    );
  }
  function showPlanEditor() {
    const plan = state.plan;
    showDialog(
      "调整学习计划",
      '<form class="study-form" id="study-plan-form"><label>计划名称<input name="name" value="' +
        safe(plan.name) +
        '" required minlength="2" maxlength="40"/></label><div class="study-form-row"><label>开始日期<input type="date" name="startDate" value="' +
        plan.startDate +
        '" required/></label><label>计划周期<select name="weeks">' +
        [2, 3, 4, 6, 8, 12]
          .map(
            (weeks) =>
              '<option value="' +
              weeks +
              '"' +
              (plan.weeks === weeks ? " selected" : "") +
              ">" +
              weeks +
              " 周</option>",
          )
          .join("") +
        '</select></label></div><label>每天学习时间<select name="dailyMinutes">' +
        [15, 20, 30, 45, 60]
          .map(
            (minutes) =>
              '<option value="' +
              minutes +
              '"' +
              (plan.dailyMinutes === minutes ? " selected" : "") +
              ">" +
              minutes +
              " 分钟</option>",
          )
          .join("") +
        '</select></label><p class="study-form-help">保存后会重新安排尚未开始的自动任务；已完成、进行中和手动添加的任务会保留。</p><div class="study-form-actions"><button type="button" class="study-outline" data-action="close">取消</button><button class="primary-button" type="submit">保存计划' +
        icon("arrow") +
        "</button></div></form>",
      "按自己的节奏安排复习",
    );
    $('#study-plan-form input[name="name"]').focus();
  }
  function regeneratePlan() {
    const plan = state.plan;
    plan.tasks = plan.tasks.filter(
      (task) => !task.auto || task.completed > 0 || task.date < today,
    );
    for (let day = 0; day < plan.weeks * 7; day++) {
      const date = plusDays(plan.startDate, day);
      if (date < today) continue;
      const phase = phases[Math.min(Math.floor(day / 7), 3)];
      const chapter = phase.chapters[day % 2];
      const count = Math.min(
        pools[chapter].length,
        Math.max(5, Math.round(plan.dailyMinutes / 3)),
      );
      if (
        !plan.tasks.some(
          (task) => task.auto && task.kind === "chapter" && task.date === date,
        )
      )
        plan.tasks.push(
          taskItem(
            "auto-" + date + "-chapter",
            date,
            "chapter",
            chapter,
            count,
            Math.round(plan.dailyMinutes * 0.7),
          ),
        );
      if (
        !plan.tasks.some(
          (task) => task.auto && task.kind === "wrong" && task.date === date,
        )
      )
        plan.tasks.push(
          taskItem(
            "auto-" + date + "-wrong",
            date,
            "wrong",
            chapter,
            2,
            Math.max(4, Math.round(plan.dailyMinutes * 0.3)),
          ),
        );
    }
  }
  function showTaskEditor() {
    const chapter = activeChapter;
    showDialog(
      "添加学习任务",
      '<form class="study-form" id="study-task-form"><div class="study-form-row"><label>任务日期<input type="date" name="date" required value="' +
        selectedPlanDate +
        '"/></label><label>任务类型<select name="kind"><option value="chapter">章节练习</option><option value="wrong">错题巩固</option><option value="custom">自主学习</option></select></label></div><label>选择章节<select name="chapter">' +
        chapters
          .map(
            (item, index) =>
              '<option value="' +
              index +
              '"' +
              (chapter === index ? " selected" : "") +
              ">" +
              item.title +
              "</option>",
          )
          .join("") +
        '</select></label><label>任务名称<input name="title" required minlength="2" maxlength="60" value="' +
        safe(chapters[chapter].title) +
        '"/></label><div class="study-form-row"><label id="task-count-field">练习题量<input type="number" name="count" min="1" max="' +
        pools[chapter].length +
        '" value="' +
        Math.min(10, pools[chapter].length) +
        '" required/></label><label>预计用时（分钟）<input type="number" name="minutes" min="1" max="180" value="12" required/></label></div><p class="study-form-help">章节练习会自动更新进度；自主学习任务可以手动标记完成。</p><div class="study-form-actions"><button type="button" class="study-outline" data-action="close">取消</button><button class="primary-button" type="submit">添加到计划' +
        icon("plus") +
        "</button></div></form>",
      dateCaption(selectedPlanDate) + " · 一个小目标",
    );
    $('#study-task-form input[name="title"]').focus();
  }
  function showAllPlanTasks() {
    const sorted = state.plan.tasks
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    let lastDate = null;
    let html = '<div class="study-task-dialog-list">';
    sorted.forEach((task) => {
      if (task.date !== lastDate) {
        html +=
          '<h3 class="study-task-dialog-day" data-task-date="' +
          task.date +
          '">' +
          dateCaption(task.date) +
          " · " +
          weekdays[fromDate(task.date).getDay()] +
          "</h3>";
        lastDate = task.date;
      }
      const title =
        task.title ||
        (task.kind === "wrong" ? "错题巩固" : chapters[task.chapter].title);
      html +=
        '<button class="study-task-dialog-row" data-plan-task-start="' +
        task.id +
        '">' +
        icon(
          taskDone(task)
            ? "check"
            : task.kind === "wrong"
              ? "wrong"
              : "calendar",
        ) +
        "<span><strong>" +
        safe(title) +
        "</strong><small>" +
        (task.kind === "custom" ? "自主学习" : task.count + " 题") +
        " · 约 " +
        task.minutes +
        ' 分钟</small></span><span class="study-task-dialog-state">' +
        (taskDone(task) ? "已完成" : task.completed ? "进行中" : "待完成") +
        "</span></button>";
    });
    showDialog("全部学习任务", html + "</div>", state.plan.name);
    $('[data-task-date="' + selectedPlanDate + '"]')?.scrollIntoView({
      block: "nearest",
    });
  }
  let removedTask = null;
  document.addEventListener("click", (event) => {
    const day = event.target.closest("[data-plan-date]");
    if (day) {
      selectedPlanDate = day.dataset.planDate;
      renderPlan();
      $('[data-plan-date="' + selectedPlanDate + '"]').focus({
        preventScroll: true,
      });
      return;
    }
    const week = event.target.closest("[data-plan-week]");
    if (week) {
      planWeekStart = plusDays(
        planWeekStart,
        Number(week.dataset.planWeek) * 7,
      );
      selectedPlanDate = planWeekStart;
      renderPlan();
      return;
    }
    const phase = event.target.closest("[data-plan-phase]");
    if (phase) {
      planWeekStart = plusDays(
        state.plan.startDate,
        Number(phase.dataset.planPhase) * 7,
      );
      selectedPlanDate = planWeekStart;
      renderPlan();
      return;
    }
    const task = event.target.closest("[data-plan-task-start]");
    if (task) {
      startPlanTask(task.dataset.planTaskStart);
      return;
    }
    const remove = event.target.closest("[data-plan-remove]");
    if (remove) {
      const index = state.plan.tasks.findIndex(
        (item) => item.id === remove.dataset.planRemove,
      );
      if (index < 0) return;
      removedTask = { item: state.plan.tasks[index], index };
      state.plan.tasks.splice(index, 1);
      saveState();
      renderPlan();
      toast("任务已删除");
      const undo = document.createElement("button");
      undo.dataset.planUndo = "true";
      undo.textContent = "撤销";
      undo.style.cssText = "margin-left:16px;color:#b9cdff;font-weight:600";
      $("#toast").append(undo);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 5000);
      return;
    }
    if (event.target.closest("[data-plan-undo]") && removedTask) {
      state.plan.tasks.splice(removedTask.index, 0, removedTask.item);
      removedTask = null;
      saveState();
      renderPlan();
      toast("已恢复这项任务");
    }
    if (event.target.closest("[data-setting],[data-chapter]")) saveState();
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "plan-reminder-switch") {
      state.plan.reminder = event.target.checked;
      saveState();
      toast(event.target.checked ? "学习提醒已开启" : "学习提醒已关闭");
    }
    if (event.target.id === "plan-reminder-time") {
      if (event.target.value) {
        state.plan.reminderTime = event.target.value;
        saveState();
        toast("提醒时间已更新");
      }
    }
    const form = event.target.closest("#study-task-form");
    if (!form) return;
    const kind = form.elements.kind.value;
    const chapter = Number(form.elements.chapter.value);
    form.elements.chapter.disabled = kind !== "chapter";
    $("#task-count-field").hidden = kind === "custom";
    form.elements.count.disabled = kind === "custom";
    form.elements.count.max = kind === "wrong" ? 100 : pools[chapter].length;
    if (Number(form.elements.count.value) > Number(form.elements.count.max))
      form.elements.count.value = form.elements.count.max;
    if (event.target.name === "kind")
      form.elements.title.value =
        kind === "wrong"
          ? "错题巩固"
          : kind === "custom"
            ? "整理今天的学习笔记"
            : chapters[chapter].title;
    if (event.target.name === "chapter")
      form.elements.title.value = chapters[chapter].title;
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "study-plan-form") {
      event.preventDefault();
      const fields = new FormData(event.target);
      const weeks = Number(fields.get("weeks"));
      const name = String(fields.get("name")).trim();
      if (name.length < 2) {
        event.target.elements.name.setCustomValidity(
          "请输入至少两个字的计划名称",
        );
        event.target.elements.name.reportValidity();
        return;
      }
      state.plan.name = /^\d+\s*周章节复习计划$/.test(name)
        ? weeks + " 周章节复习计划"
        : name;
      state.plan.startDate = String(fields.get("startDate"));
      state.plan.weeks = weeks;
      state.plan.dailyMinutes = Number(fields.get("dailyMinutes"));
      regeneratePlan();
      selectedPlanDate = today;
      planWeekStart = mondayOf(today);
      saveState();
      closeDialog();
      renderPlan();
      toast("学习计划已更新");
    }
    if (event.target.id === "study-task-form") {
      event.preventDefault();
      const fields = new FormData(event.target);
      const kind = String(fields.get("kind"));
      const title = String(fields.get("title")).trim();
      if (title.length < 2) {
        event.target.elements.title.setCustomValidity(
          "请输入至少两个字的任务名称",
        );
        event.target.elements.title.reportValidity();
        return;
      }
      const chapter = Number(fields.get("chapter") ?? activeChapter);
      const task = taskItem(
        "manual-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
        String(fields.get("date")),
        kind,
        chapter,
        kind === "custom" ? 1 : Number(fields.get("count")),
        Number(fields.get("minutes")),
        0,
        String(fields.get("title")).trim(),
      );
      task.auto = false;
      state.plan.tasks.push(task);
      selectedPlanDate = task.date;
      planWeekStart = mondayOf(task.date);
      saveState();
      closeDialog();
      renderPlan();
      toast("任务已添加到计划");
    }
  });
  document.addEventListener("input", (event) => {
    if (
      event.target.closest(".study-form") &&
      typeof event.target.setCustomValidity === "function"
    )
      event.target.setCustomValidity("");
  });
  actions.plan = () => showPage("plan");
  actions["adjust-plan"] = showPlanEditor;
  actions["add-plan-task"] = showTaskEditor;
  actions["all-plan-tasks"] = showAllPlanTasks;
  actions["plan-today"] = () => {
    selectedPlanDate = today;
    planWeekStart = mondayOf(today);
    renderPlan();
  };
  actions.favorites = showStudyFavorites;
  actions.wrong = () => showPage("wrong");
  actions.reset = () => {
    settleTimer();
    state = initialState();
    activeChapter = 2;
    selectedPlanDate = today;
    planWeekStart = mondayOf(today);
    Object.assign(practiceConfig, state.config);
    syncSharedUI();
    selectChapter(2);
    saveState();
    if (dialog.open) closeDialog();
    showPage("home");
    toast("学习进度与计划已恢复为初始示例");
  };
  actions.profile = () =>
    showDialog(
      "你的学习空间",
      '<p class="dialog-lead">练习进度、学习计划与收藏会保存在当前浏览器。</p><div class="lesson-note"><h3>学习者</h3><p>当前科目：四川专升本 · 计算机</p><p>今日已答：' +
        state.stats.todayCount +
        " 题</p><p>收藏题目：" +
        state.favorites.length +
        ' 道</p></div><button class="primary-button" data-action="plan">查看学习计划' +
        icon("arrow") +
        "</button>",
      "Web Demo · 示例学习空间",
    );
  searchItems.push(
    { title: "学习计划", action: "plan" },
    { title: "我的收藏", action: "favorites" },
  );
  document.addEventListener("demo:route", (event) => {
    settleTimer();
    saveState();
    if (event.detail.name === "practice") renderPractice();
    if (event.detail.name === "plan") renderPlan();
    if (event.detail.name === "report") renderReport();
  });
  setInterval(() => {
    settleTimer();
    state.sessions
      .filter((item) => item.mode === "exam" && !item.finished)
      .forEach((item) => {
        if (examRemaining(item) <= 0)
          finalizeExamSession(
            item,
            "timeout",
            document.body.dataset.page === "practice" &&
              activeSession()?.id === item.id,
          );
      });
    const session = activeSession();
    if (
      document.body.dataset.page === "practice" &&
      session &&
      !session.finished
    ) {
      $("#practice-elapsed").textContent = formatTime(
        session.mode === "exam"
          ? examRemaining(session)
          : Math.floor(session.elapsedMs / 1000),
      );
      $("#practice-elapsed").classList.toggle(
        "exam-time-low",
        session.mode === "exam" && examRemaining(session) <= 300,
      );
      if (++saveTicks % 10 === 0) saveState();
    }
    const time = new Date();
    const timeText =
      String(time.getHours()).padStart(2, "0") +
      ":" +
      String(time.getMinutes()).padStart(2, "0");
    if (
      !document.hidden &&
      state.plan.reminder &&
      state.plan.reminderTime === timeText &&
      state.plan.remindedDate !== localDate(time)
    ) {
      state.plan.remindedDate = localDate(time);
      const pending = dayTasks(localDate(time)).filter(
        (task) => !taskDone(task),
      ).length;
      saveState();
      if (window.AceCertificates?.supports("plan") === false)
        toast("到学习时间了，去学一个知识点吧。");
      else if (pending)
        toast("到学习时间了，今天还有 " + pending + " 项小目标。");
    }
  }, 1000);
  document.addEventListener("visibilitychange", () => {
    settleTimer();
    saveState();
  });
  window.addEventListener("beforeunload", () => {
    settleTimer();
    saveState();
  });
  window.AceStudyFlow = {
    state: () => state,
    questionMap,
    pools,
    safe,
    shuffled,
    save: saveState,
    sync: syncSharedUI,
    activeSession,
    createSession,
    renderPractice,
    renderReport,
    origin: studyOrigin,
    remaining: examRemaining,
    finishExam: (id, reason = "manual", navigate = true) =>
      finalizeExamSession(
        state.sessions.find((item) => item.id === id),
        reason,
        navigate,
      ),
    activate: (id, page = "practice") => {
      const session = state.sessions.find((item) => item.id === id);
      if (!session) return;
      settleTimer();
      state.activeSessionId = id;
      selectChapter(session.chapter);
      settleTimer();
      saveState();
      showPage(page);
    },
  };
  if (Number.isInteger(state.activeChapter) && pools[state.activeChapter])
    activeChapter = state.activeChapter;
  syncSharedUI();
  selectChapter(activeChapter);
  saveState();
  showPage(location.hash.slice(1) || "home", false);
})();
