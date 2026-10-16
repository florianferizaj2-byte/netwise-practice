"use strict";
(() => {
  const flow = window.AceStudyFlow;
  if (!flow) return;
  const esc = flow.safe;
  const types = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    true_false: "判断题",
  };
  const shortTypes = {
    single_choice: "单选",
    multiple_choice: "多选",
    true_false: "判断",
  };
  const chapterIcons = [
    "home",
    "grid",
    "chapter",
    "keyboard",
    "save",
    "route",
    "pie",
  ];
  const groups = [];
  const knowledge = new Map();
  const displayNames = {
    软件与系统操作: "操作系统基础",
    硬件系统: "硬件组成",
    Word: "Word 文档处理",
    Excel: "Excel 常用函数",
    PowerPoint: "PowerPoint 演示",
    网络基础: "网络基础与分层",
    信息安全: "网络安全基础",
    数据库基础: "数据库基本概念",
    关系应用: "关系与约束",
  };
  flow.pools.forEach((pool, chapter) => {
    const sections = [
      ...new Set(pool.map((q) => q.section || q.point || q.chapter)),
    ];
    const items = sections.map((section, index) => {
      const item = {
        id: "k-" + chapter + "-" + index,
        chapter,
        section,
        title: displayNames[section] || section,
        qids: pool
          .filter((q) => (q.section || q.point || q.chapter) === section)
          .map((q) => q.id),
      };
      knowledge.set(item.id, item);
      return item;
    });
    groups.push({ chapter, title: chapters[chapter].title, items });
  });
  const findKnowledge = (section) =>
    [...knowledge.values()].find((k) => k.section === section);
  const defaultKnowledge = ["软件与系统操作", "Excel", "网络基础", "信息安全"]
    .map(findKnowledge)
    .filter(Boolean)
    .map((k) => k.id);
  let examChapter = "all";
  let libraryTab = "questions";
  let libraryPage = 1;
  let managing = false;
  let chosen = new Set();
  let undoRemoval = null;
  let undoTimer = null;
  const state = () => flow.state();
  const collection = () => state().collection;
  const weekStart = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.getTime();
  };
  const dateLabel = (time) => {
    const d = new Date(time || Date.now()),
      t = new Date();
    if (d.toDateString() === t.toDateString())
      return (
        "今天 " +
        d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      );
    t.setDate(t.getDate() - 1);
    if (d.toDateString() === t.toDateString())
      return (
        "昨天 " +
        d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
      );
    return d.getMonth() + 1 + " 月 " + d.getDate() + " 日";
  };
  function ensureCollection() {
    const s = state();
    if (!s.collection || typeof s.collection !== "object") s.collection = {};
    const c = s.collection;
    c.favoriteMeta ||= {};
    c.knowledgeMeta ||= {};
    if (!Array.isArray(c.knowledgeFavorites)) {
      c.knowledgeFavorites = [
        "Excel",
        "软件与系统操作",
        "网络基础",
        "数据库基础",
      ]
        .map(findKnowledge)
        .filter(Boolean)
        .map((k) => k.id);
      c.knowledgeFavorites.forEach(
        (id) => (c.knowledgeMeta[id] = { addedAt: weekStart() - 86400000 }),
      );
    }
    c.knowledgeFavorites = [...new Set(c.knowledgeFavorites)].filter((id) =>
      knowledge.has(id),
    );
    if (!c.builder || typeof c.builder !== "object")
      c.builder = {
        selected: [...defaultKnowledge],
        count: 30,
        minutes: 45,
        types: ["single_choice", "true_false"],
        name: "我的知识点模拟考试",
      };
    c.builder.selected = [...new Set(c.builder.selected || [])].filter((id) =>
      knowledge.has(id),
    );
    c.builder.types = [
      ...new Set(c.builder.types || ["single_choice", "true_false"]),
    ].filter((t) => types[t]);
    if (![20, 30, 50].includes(c.builder.count)) c.builder.count = 30;
    if (![30, 45, 60].includes(c.builder.minutes)) c.builder.minutes = 45;
    c.builder.name =
      typeof c.builder.name === "string"
        ? c.builder.name
        : "我的知识点模拟考试";
    c.practice ||= { order: "random", range: "all", count: "5" };
    if (!["random", "sequential"].includes(c.practice.order))
      c.practice.order = "random";
    if (!["all", "new"].includes(c.practice.range)) c.practice.range = "all";
    if (!["5", "10", "20", "30", "all"].includes(c.practice.count))
      c.practice.count = "5";
    if (s.favoriteSeedPending) {
      if (!s.favorites.length) seedQuestionFavorites();
      delete s.favoriteSeedPending;
    }
    s.favorites.forEach((id, i) => {
      c.favoriteMeta[id] ||= { addedAt: Date.now() - i * 1000 };
    });
    flow.save();
  }
  function seedQuestionFavorites() {
    const all = [...flow.questionMap.values()];
    const preferred = [
      all.find((q) => q.section === "Excel" && /SUM\(B1:B3/.test(q.q)),
      all.find((q) => q.id === "hcia-v2-01-osi-transport"),
      all.find((q) => q.chapterIndex === 4 && /主键/.test(q.q)) ||
        all.find((q) => q.chapterIndex === 4),
    ].filter(Boolean);
    const spread = [2, 5, 4, 1, 3, 0, 6, 2, 1, 5, 0, 2].map(
      (ch, i) => flow.pools[ch][i % flow.pools[ch].length],
    );
    const ids = [
      ...new Set([...preferred, ...spread, ...all].map((q) => q.id)),
    ].slice(0, 12);
    state().favorites = ids;
    ids.forEach(
      (id, i) =>
        (collection().favoriteMeta[id] = {
          addedAt:
            i < 3 ? Date.now() - i * 60000 : weekStart() - 86400000 - i * 60000,
        }),
    );
  }
  art.examPaper = () =>
    '<div class="art">' +
    svg(
      '<defs><linearGradient id="paperBlue" x1="70" y1="30" x2="170" y2="185"><stop stop-color="#9dc8ff"/><stop offset="1" stop-color="#4d80eb"/></linearGradient><linearGradient id="timerBlue"><stop stop-color="#72afff"/><stop offset="1" stop-color="#355af6"/></linearGradient></defs><ellipse cx="119" cy="171" rx="105" ry="20" fill="#d8e9ff"/><path d="m35 103 45-71 86 13 36 47-42 62-79 22Z" fill="#d8e9ff"/><g class="paper-float"><rect x="53" y="35" width="108" height="139" rx="11" fill="#79a5f3" transform="rotate(-14 107 104)"/><rect x="60" y="41" width="108" height="139" rx="9" fill="white" stroke="#c2d9ff" stroke-width="3" transform="rotate(-10 114 110)"/><path d="m74 48 91-15 15 30-91 15Z" fill="url(#paperBlue)"/><text x="91" y="95" fill="#74a4ff" font-size="36" font-family="Arial,sans-serif" font-weight="700" transform="rotate(-9 100 89)">A+</text><path d="m90 114 63-10m-61 24 48-8m-46 23 57-10m-54 24 37-6" stroke="#dceaff" stroke-width="6" stroke-linecap="round"/></g><g class="paper-timer"><rect x="167" y="97" width="13" height="10" rx="3" fill="#3870e9"/><rect x="162" y="90" width="24" height="9" rx="4" fill="#8cbeff"/><circle cx="173" cy="139" r="32" fill="url(#timerBlue)"/><circle cx="173" cy="139" r="24" fill="#f3f8ff" stroke="#a6caff" stroke-width="3"/><path d="M173 120v19l12 5" stroke="#4280f5" stroke-width="4" stroke-linecap="round"/><path d="M173 112v4m0 46v4m-27-27h4m46 0h4" stroke="#a8c7ff" stroke-width="3"/></g><g><rect x="202" y="123" width="33" height="35" rx="8" fill="#42c4a1"/><path d="m211 140 5 6 11-14" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g>',
    ) +
    "</div>";
  art.bookmarks = () =>
    '<div class="art">' +
    svg(
      '<defs><linearGradient id="bookmarkBlue"><stop stop-color="#7cb1ff"/><stop offset="1" stop-color="#3569e8"/></linearGradient></defs><ellipse cx="122" cy="177" rx="99" ry="18" fill="#e0edff"/><path d="m27 105 54-61 113-9 30 68-68 75-104-5Z" fill="#e1edff"/><g class="paper-float"><rect x="64" y="30" width="109" height="145" rx="11" fill="#92bbff" transform="rotate(-11 115 102)"/><rect x="58" y="47" width="110" height="141" rx="10" fill="url(#bookmarkBlue)" transform="rotate(-11 112 115)"/><rect x="67" y="47" width="102" height="133" rx="8" fill="white" stroke="#c1d8ff" stroke-width="2" transform="rotate(-11 117 113)"/><path d="m147 45 24-4 10 44-14-6-11 11Z" fill="#ffd075" stroke="#ffb34c" stroke-width="2"/><path d="m84 77 56-10m-52 25 63-12m-60 27 62-12m-59 27 62-12m-59 27 45-9m-42 24 42-9" stroke="#dce7f7" stroke-width="5" stroke-linecap="round"/></g><path class="bookmark-star" d="m186 109 9 18 20 3-14 14 3 20-18-9-18 9 3-20-14-14 20-3Z" fill="#ffd16a" stroke="#ffb751" stroke-width="3" stroke-linejoin="round"/>',
    ) +
    "</div>";
  function segments(options, key, value) {
    return options
      .map(
        ([v, label]) =>
          '<button data-library-setting="' +
          key +
          '" data-value="' +
          v +
          '" aria-pressed="' +
          (String(value) === String(v)) +
          '">' +
          label +
          "</button>",
      )
      .join("");
  }
  function availableKnowledgeItems() {
    const term = $("#exam-knowledge-search").value.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (k) =>
            (examChapter === "all" || String(k.chapter) === examChapter) &&
            (!term ||
              (k.title + " " + k.section + " " + g.title)
                .toLowerCase()
                .includes(term)),
        ),
      }))
      .filter((g) => g.items.length);
  }
  function renderKnowledgeGroups() {
    const selected = new Set(collection().builder.selected);
    const visible = availableKnowledgeItems();
    $("#exam-knowledge-groups").innerHTML = visible.length
      ? visible
          .map(
            (g) =>
              '<section class="knowledge-group"><div class="knowledge-group-heading">' +
              icon(chapterIcons[g.chapter]) +
              "<h3>" +
              esc(g.title) +
              '</h3><label><input type="checkbox" data-exam-group="' +
              g.chapter +
              '"' +
              (g.items.every((k) => selected.has(k.id)) ? " checked" : "") +
              '/>全选</label></div><div class="knowledge-tiles">' +
              g.items
                .map(
                  (k) =>
                    '<label class="knowledge-tile ' +
                    (selected.has(k.id) ? "is-selected" : "") +
                    '"><input type="checkbox" data-exam-knowledge="' +
                    k.id +
                    '"' +
                    (selected.has(k.id) ? " checked" : "") +
                    "/><span><strong>" +
                    esc(k.title) +
                    "</strong><small>" +
                    k.qids.length +
                    " 题</small></span></label>",
                )
                .join("") +
              "</div></section>",
          )
          .join("")
      : '<div class="library-empty">' +
        icon("search") +
        '<h3>没有找到这个知识点</h3><p>换一个关键词，或查看全部章节。</p><button class="study-outline" data-library-action="exam-search-reset">查看全部知识点</button></div>';
    visible.forEach((g) => {
      const count = g.items.filter((k) => selected.has(k.id)).length;
      $('[data-exam-group="' + g.chapter + '"]').indeterminate =
        count > 0 && count < g.items.length;
    });
  }
  // Allocate evenly across knowledge areas while keeping the requested type mix.
  // Each ID is consumed once. Actual counts are capped by the selected bank.
  function buildPaper(shuffle = false) {
    const b = collection().builder;
    const areas = b.selected.map((id) => knowledge.get(id)).filter(Boolean);
    const pools = areas.map((k) => ({
      k,
      ids: k.qids.filter((id) =>
        b.types.includes(flow.questionMap.get(id).type),
      ),
    }));
    const capacity = pools.reduce((n, p) => n + p.ids.length, 0);
    const target = Math.min(b.count, capacity);
    const availableByType = Object.fromEntries(
      b.types.map((t) => [
        t,
        pools.reduce(
          (n, p) =>
            n +
            p.ids.filter((id) => flow.questionMap.get(id).type === t).length,
          0,
        ),
      ]),
    );
    const quotas = Object.fromEntries(b.types.map((t) => [t, 0]));
    const weight = (t) => (t === "single_choice" ? 2 : 1);
    for (let n = 0; n < target; n++) {
      const t = b.types
        .filter((t) => quotas[t] < availableByType[t])
        .sort((a, z) => quotas[a] / weight(a) - quotas[z] / weight(z))[0];
      if (t) quotas[t]++;
    }
    const result = [];
    const allocation = Object.fromEntries(areas.map((k) => [k.id, 0]));
    for (const t of b.types) {
      const perArea = pools.map((p) => ({
        k: p.k,
        ids: (shuffle ? flow.shuffled(p.ids) : p.ids).filter(
          (id) => flow.questionMap.get(id).type === t,
        ),
      }));
      let remaining = quotas[t];
      while (remaining > 0) {
        const area = perArea
          .filter((p) => p.ids.length)
          .sort((a, z) => allocation[a.k.id] - allocation[z.k.id])[0];
        if (!area) break;
        result.push(area.ids.shift());
        allocation[area.k.id]++;
        remaining--;
      }
    }
    return {
      ids: shuffle ? flow.shuffled(result) : result,
      allocation,
      quotas,
      capacity,
    };
  }
  function renderExamPreview() {
    const b = collection().builder,
      paper = buildPaper();
    $("#exam-selected-count").textContent = b.selected.length;
    $("#exam-count-options").innerHTML = segments(
      [
        [20, "20 题"],
        [30, "30 题"],
        [50, "50 题"],
      ],
      "exam-count",
      b.count,
    );
    $("#exam-time-options").innerHTML = segments(
      [
        [30, "30 分钟"],
        [45, "45 分钟"],
        [60, "60 分钟"],
      ],
      "exam-minutes",
      b.minutes,
    );
    $("#exam-type-options").innerHTML = Object.entries(types)
      .map(
        ([t, label]) =>
          '<label><input type="checkbox" data-exam-type="' +
          t +
          '"' +
          (b.types.includes(t) ? " checked" : "") +
          "/>" +
          label +
          "</label>",
      )
      .join("");
    $("#exam-selected-chips").innerHTML =
      "<strong>已选知识点</strong>" +
      (b.selected.length
        ? b.selected
            .map(
              (id) =>
                '<button class="knowledge-chip" data-exam-remove="' +
                id +
                '" aria-label="移除' +
                esc(knowledge.get(id).title) +
                '">' +
                esc(knowledge.get(id).title) +
                icon("close") +
                "</button>",
            )
            .join("")
        : '<span class="library-caption">从上方选择你想复习的内容</span>') +
      '<span class="selected-capacity">可组合题目共 <b>' +
      paper.capacity +
      "</b> 题</span>";
    $("#exam-preview-summary").innerHTML =
      "<dt>知识点</dt><dd>" +
      b.selected.length +
      " 个</dd><dt>试题总数</dt><dd>" +
      paper.ids.length +
      " 题</dd><dt>考试时长</dt><dd>" +
      b.minutes +
      " 分钟</dd><dt>题型分布</dt><dd>" +
      b.types.map((t) => shortTypes[t] + " " + paper.quotas[t]).join(" · ") +
      "</dd>";
    $("#exam-allocation").innerHTML =
      b.selected
        .map(
          (id) =>
            '<div class="allocation-row"><span title="' +
            esc(knowledge.get(id).title) +
            '">' +
            esc(knowledge.get(id).title) +
            '</span><div class="allocation-track"><i style="width:' +
            (paper.ids.length
              ? Math.round((paper.allocation[id] / paper.ids.length) * 100)
              : 0) +
            '%"></i></div><b>' +
            paper.allocation[id] +
            " 题</b></div>",
        )
        .join("") ||
      '<p class="library-caption">选中知识点后，查看题目分配。</p>';
    const note = $("#exam-capacity-note");
    note.textContent = !b.types.length
      ? "请至少选择一种题型。"
      : !b.selected.length
        ? "请先选择知识点。"
        : paper.capacity < b.count
          ? "当前范围可用 " + paper.capacity + " 题，将按实际题量组卷。"
          : "";
    note.hidden = !note.textContent;
    note.classList.toggle("is-warning", paper.capacity < b.count);
    $('[data-library-action="exam-start"]').disabled =
      !paper.ids.length || b.name.trim().length < 2;
    flow.save();
  }
  function renderExam() {
    ensureCollection();
    $("#exam-hero-art").innerHTML = art.examPaper();
    const labels = [
      "全部章节",
      "计算机基础",
      "软硬件",
      "办公自动化",
      "程序设计",
    ];
    $("#exam-chapter-tabs").innerHTML =
      labels
        .map(
          (title, i) =>
            '<button data-exam-chapter="' +
            (i ? i - 1 : "all") +
            '" aria-pressed="' +
            (examChapter === String(i ? i - 1 : "all")) +
            '">' +
            title +
            "</button>",
        )
        .join("") +
      '<label><span class="sr-only">更多章节</span><select id="exam-more-chapters"><option value="all">更多</option>' +
      groups
        .slice(4)
        .map(
          (g) =>
            '<option value="' +
            g.chapter +
            '"' +
            (examChapter === String(g.chapter) ? " selected" : "") +
            ">" +
            esc(g.title) +
            "</option>",
        )
        .join("") +
      "</select></label>";
    $("#exam-name").value = collection().builder.name;
    renderKnowledgeGroups();
    renderExamPreview();
    renderOngoingExam();
  }
  function renderOngoingExam() {
    const ongoing = state().sessions.find(
      (s) => s.mode === "exam" && !s.finished,
    );
    const host = $("#exam-ongoing");
    host.hidden = !ongoing;
    if (ongoing)
      host.innerHTML =
        '<div class="exam-ongoing">' +
        icon("time") +
        "<div><strong>" +
        esc(ongoing.title || "模拟考试") +
        " 正在进行</strong><small>已答 " +
        Object.keys(ongoing.responses).length +
        " / " +
        ongoing.qids.length +
        ' 题 · 剩余 <span id="exam-ongoing-time">' +
        formatTime(flow.remaining(ongoing)) +
        '</span></small></div><button class="study-outline blue-outline" data-library-action="exam-resume" data-id="' +
        esc(ongoing.id) +
        '">继续考试' +
        icon("arrow") +
        "</button></div>";
  }
  function startExam() {
    const ongoing = state().sessions.find(
      (s) => s.mode === "exam" && !s.finished,
    );
    if (ongoing) {
      flow.activate(ongoing.id);
      toast("已继续上次未交卷的考试");
      return;
    }
    const b = collection().builder;
    if (b.name.trim().length < 2) {
      toast("给试卷起一个至少 2 字的名称");
      $("#exam-name").focus();
      return;
    }
    const paper = buildPaper(true);
    if (!paper.ids.length) {
      toast("请先选择知识点和题型");
      return;
    }
    flow.createSession(
      "exam",
      flow.questionMap.get(paper.ids[0]).chapterIndex,
      paper.ids.map((id) => flow.questionMap.get(id)),
      {
        forceNew: true,
        origin: "exam",
        sessionData: {
          title: b.name.trim(),
          examMinutes: b.minutes,
          knowledgeIds: [...b.selected],
          allocation: paper.allocation,
          requestedCount: b.count,
        },
      },
    );
  }
  function renderExamReport() {
    const s = flow.activeSession();
    if (!s || s.mode !== "exam" || !s.finished) return;
    const answered = s.qids.filter(
      (id) => s.responses[id]?.kind === "answer",
    ).length;
    const correct = s.qids.filter((id) => s.responses[id]?.correct).length;
    const wrong = answered - correct,
      missed = s.qids.length - answered;
    const score =
      s.examScore ?? Math.round((correct / s.qids.length) * 1000) / 10;
    $("#report-title").textContent = "模拟考试报告";
    $("#report-subtitle").textContent = s.title || "我的知识点模拟考试";
    const back = $("#report-page .study-back");
    back.dataset.action = "exam";
    back.innerHTML = icon("arrow") + "返回组卷";
    const rows = (s.knowledgeIds || [])
      .map((id) => knowledge.get(id))
      .filter(Boolean)
      .map((k) => {
        const ids = s.qids.filter((id) => k.qids.includes(id));
        const ok = ids.filter((id) => s.responses[id]?.correct).length;
        return (
          "<tr><td>" +
          esc(k.title) +
          "</td><td>" +
          ids.length +
          "</td><td>" +
          ok +
          "</td><td>" +
          (ids.length ? Math.round((ok / ids.length) * 100) + "%" : "—") +
          "</td></tr>"
        );
      })
      .join("");
    $("#study-report-body").innerHTML =
      '<div class="exam-result-hero"><div class="exam-result-score"><b>' +
      score +
      "</b>分</div><div><h2>" +
      (s.finishReason === "timeout"
        ? "时间到，已自动交卷"
        : "考试完成，看看这次的收获") +
      "</h2><p>" +
      esc(s.title || "模拟考试") +
      " · " +
      s.qids.length +
      " 题 · 用时 " +
      formatTime(Math.floor(s.elapsedMs / 1000)) +
      '</p><p>每题等分，满分 100；未答题计为零分。</p></div></div><div class="exam-result-stats"><div><strong>' +
      correct +
      "</strong><small>正确</small></div><div><strong>" +
      wrong +
      "</strong><small>错误</small></div><div><strong>" +
      missed +
      "</strong><small>未答</small></div><div><strong>" +
      s.qids.length +
      '</strong><small>试题总数</small></div></div><div class="exam-result-actions"><button class="primary-button" data-library-action="exam-review">查看答案与解析' +
      icon("arrow") +
      '</button><button class="study-outline" data-library-action="exam-wrong-practice"' +
      (!wrong ? " disabled" : "") +
      ">巩固本卷错题（" +
      wrong +
      '）</button><button class="study-outline" data-action="exam">重新组卷</button><button class="study-outline" data-library-action="exam-history">考试记录</button></div>' +
      (rows
        ? '<section class="exam-breakdown"><h3>知识点表现</h3><table><thead><tr><th scope="col">知识点</th><th scope="col">题量</th><th scope="col">正确</th><th scope="col">得分率</th></tr></thead><tbody>' +
          rows +
          "</tbody></table></section>"
        : "") +
      '<div class="study-report-list">' +
      s.qids
        .map((id, index) => {
          const q = flow.questionMap.get(id),
            r = s.responses[id];
          const status = !r ? "unanswered" : r.correct ? "correct" : "wrong";
          return (
            '<button class="report-question" data-study-review="' +
            index +
            '"><span class="report-question-number">' +
            (index + 1) +
            '</span><span class="report-question-copy"><strong>' +
            esc(q.q) +
            "</strong><small>" +
            esc(q.chapter + " · " + (q.section || q.point)) +
            '</small></span><span class="report-question-state ' +
            status +
            '">' +
            (!r ? "未答" : r.correct ? "正确" : "错误") +
            "</span>" +
            icon("chevron") +
            "</button>"
          );
        })
        .join("") +
      "</div>";
  }
  function showExamHistory() {
    const exams = state()
      .sessions.filter((s) => s.mode === "exam" && s.finished)
      .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
    showDialog(
      "考试记录",
      exams.length
        ? exams
            .map(
              (s) =>
                '<button class="library-history-row" data-library-action="exam-record" data-id="' +
                esc(s.id) +
                '"><span class="history-score">' +
                (s.examScore ??
                  Math.round(
                    (s.qids.filter((id) => s.responses[id]?.correct).length /
                      s.qids.length) *
                      1000,
                  ) / 10) +
                "</span><span><strong>" +
                esc(s.title || "模拟考试") +
                "</strong><small>" +
                dateLabel(s.finishedAt) +
                " · " +
                s.qids.length +
                " 题 · " +
                formatTime(Math.floor(s.elapsedMs / 1000)) +
                (s.finishReason === "timeout" ? " · 自动交卷" : "") +
                "</small></span>" +
                icon("chevron") +
                "</button>",
            )
            .join("")
        : '<div class="library-empty">' +
            icon("history") +
            '<h3>还没有考试记录</h3><p>完成一场模拟考试，成绩与试卷会保存在这里。</p><button class="study-outline" data-action="close">开始准备</button></div>',
      "模拟考试",
    );
  }
  function favoriteItems() {
    const c = collection();
    return libraryTab === "questions"
      ? state()
          .favorites.map((id) => flow.questionMap.get(id))
          .filter(Boolean)
          .map((q) => ({
            id: q.id,
            chapter: q.chapterIndex,
            title: q.q,
            type: q.type,
            point: q.point || q.section,
            q,
            addedAt: c.favoriteMeta[q.id]?.addedAt || 0,
          }))
      : c.knowledgeFavorites
          .map((id) => knowledge.get(id))
          .filter(Boolean)
          .map((k) => ({
            id: k.id,
            chapter: k.chapter,
            title: k.title,
            type: "knowledge",
            point: k.section,
            k,
            addedAt: c.knowledgeMeta[k.id]?.addedAt || 0,
          }));
  }
  function filteredFavorites() {
    const term = $("#favorites-search").value.trim().toLowerCase(),
      ch = $("#favorites-chapter-filter").value,
      t = $("#favorites-type-filter").value,
      sort = $("#favorites-sort").value;
    return favoriteItems()
      .filter(
        (item) =>
          (ch === "all" || String(item.chapter) === ch) &&
          (libraryTab === "knowledge" || t === "all" || item.type === t) &&
          (!term ||
            (item.title + " " + item.point + " " + chapters[item.chapter].title)
              .toLowerCase()
              .includes(term)),
      )
      .sort((a, b) =>
        sort === "chapter"
          ? a.chapter - b.chapter || b.addedAt - a.addedAt
          : sort === "oldest"
            ? a.addedAt - b.addedAt
            : b.addedAt - a.addedAt,
      );
  }
  function favoriteStatus(q) {
    const record = state().records[q.id];
    const attempts = record?.attempts || (record ? 1 : 0);
    return {
      label: !record ? "未练习" : record.correct ? "已掌握" : "练习中",
      kind: !record ? "" : record.correct ? "mastered" : "learning",
      attempts,
      icon: !record ? "time" : record.correct ? "check" : "play",
    };
  }
  function renderFavoriteList() {
    const list = filteredFavorites(),
      pages = Math.max(1, Math.ceil(list.length / 3));
    libraryPage = Math.min(Math.max(1, libraryPage), pages);
    const allIds = new Set(favoriteItems().map((item) => item.id));
    chosen = new Set([...chosen].filter((id) => allIds.has(id)));
    $("#favorites-list").setAttribute(
      "aria-labelledby",
      libraryTab === "questions"
        ? "favorite-question-tab"
        : "favorite-knowledge-tab",
    );
    $("#favorites-list").innerHTML = list.length
      ? list
          .slice((libraryPage - 1) * 3, libraryPage * 3)
          .map((item) => {
            const status = item.q ? favoriteStatus(item.q) : null;
            return (
              '<article class="favorite-card ' +
              (chosen.has(item.id) ? "is-checked" : "") +
              '"><label class="favorite-checkbox"><input type="checkbox" data-favorite-select="' +
              esc(item.id) +
              '" aria-label="选择' +
              esc(item.title) +
              '"' +
              (chosen.has(item.id) ? " checked" : "") +
              '/></label><div class="favorite-card-main"><div class="favorite-card-top"><b class="favorite-card-tag">' +
              (item.q ? types[item.type] : "知识点") +
              '</b><b class="favorite-card-tag chapter">' +
              esc(chapters[item.chapter].title) +
              "</b><span>" +
              esc(
                item.q
                  ? item.q.section || item.point
                  : item.k.qids.length + " 道相关题目",
              ) +
              "</span></div><h3>" +
              esc(item.title) +
              '</h3><div class="favorite-card-meta">' +
              (status
                ? '<span class="favorite-status ' +
                  status.kind +
                  '">' +
                  icon(status.icon) +
                  status.label +
                  "</span>"
                : '<span class="favorite-status learning">' +
                  icon("bookmark") +
                  "重点复习</span>") +
              "<small>收藏于 " +
              dateLabel(item.addedAt) +
              (status
                ? " · " +
                  (status.attempts
                    ? "已练 " + status.attempts + " 次"
                    : "尚未练习")
                : "") +
              '</small><button class="library-text-button favorite-card-view" data-library-action="' +
              (item.q ? "favorite-detail" : "knowledge-detail") +
              '" data-id="' +
              esc(item.id) +
              '">' +
              (item.q ? "查看题目" : "查看知识点") +
              icon("arrow") +
              '</button></div></div><div class="favorite-card-tools"><button class="is-starred" data-library-action="favorite-remove" data-id="' +
              esc(item.id) +
              '" data-kind="' +
              libraryTab +
              '" aria-label="取消收藏' +
              esc(item.title) +
              '">' +
              icon(item.q ? "star" : "bookmark") +
              '</button><button data-library-action="favorite-menu" data-id="' +
              esc(item.id) +
              '" data-kind="' +
              libraryTab +
              '" aria-label="' +
              esc(item.title) +
              '的更多操作">' +
              icon("more") +
              "</button></div></article>"
            );
          })
          .join("")
      : '<div class="library-empty">' +
        icon("bookmark") +
        "<h3>" +
        (favoriteItems().length ? "没有符合条件的收藏" : "把重要内容收进来") +
        "</h3><p>" +
        (favoriteItems().length
          ? "试试其他关键词或筛选条件。"
          : libraryTab === "questions"
            ? "刷题时点击星标，题目就会留在这里。"
            : "选择想长期复习的知识点。") +
        '</p><button class="study-outline" data-library-action="' +
        (favoriteItems().length
          ? "favorites-filter-reset"
          : libraryTab === "questions"
            ? "favorite-seed"
            : "knowledge-add") +
        '">' +
        (favoriteItems().length
          ? "清除筛选"
          : libraryTab === "questions"
            ? "添加示例收藏"
            : "添加知识点") +
        "</button></div>";
    $("#favorites-pagination").innerHTML =
      '<button data-favorite-page="' +
      (libraryPage - 1) +
      '" aria-label="上一页"' +
      (libraryPage === 1 ? " disabled" : "") +
      ">" +
      icon("chevron") +
      "</button>" +
      [
        ...new Set(
          (pages <= 5
            ? Array.from({ length: pages }, (_, i) => i + 1)
            : [1, libraryPage - 1, libraryPage, libraryPage + 1, pages]
          ).filter((n) => n >= 1 && n <= pages),
        ),
      ]
        .sort((a, b) => a - b)
        .map(
          (n, i, arr) =>
            (i && n > arr[i - 1] + 1
              ? '<span class="pagination-gap" aria-hidden="true">…</span>'
              : "") +
            '<button data-favorite-page="' +
            n +
            '"' +
            (libraryPage === n ? ' aria-current="page"' : "") +
            ">" +
            n +
            "</button>",
        )
        .join("") +
      '<button data-favorite-page="' +
      (libraryPage + 1) +
      '" aria-label="下一页"' +
      (libraryPage === pages ? " disabled" : "") +
      ">" +
      icon("chevron") +
      "</button>";
    $("#favorites-pagination button:first-child").style.transform = "none";
    $("#favorites-pagination button:first-child .icon").style.transform =
      "rotate(180deg)";
    const count = list.filter((item) => chosen.has(item.id)).length;
    $("#favorites-select-all").checked = !!list.length && count === list.length;
    $("#favorites-select-all").indeterminate = count > 0 && count < list.length;
    $("#favorites-select-all").disabled = !list.length;
    $("#favorites-selected-count").textContent = chosen.size;
    $("#favorite-selection-unit").textContent =
      libraryTab === "questions" ? "题" : "个";
    $('[data-library-action="favorites-practice-selected"]').disabled =
      !chosen.size;
    $('[data-library-action="favorites-remove-selected"]').disabled =
      !chosen.size;
  }
  function practiceFavoritesPool() {
    return state()
      .favorites.map((id) => flow.questionMap.get(id))
      .filter(
        (q) =>
          q &&
          (collection().practice.range !== "new" || !state().records[q.id]),
      );
  }
  function renderFavoriteAside() {
    const c = collection(),
      p = c.practice,
      pool = practiceFavoritesPool(),
      count =
        p.count === "all"
          ? pool.length
          : Math.min(Number(p.count), pool.length);
    $("#favorite-practice-total").textContent = state().favorites.length;
    $("#favorite-order-options").innerHTML = segments(
      [
        ["random", "随机练习"],
        ["sequential", "顺序练习"],
      ],
      "favorite-order",
      p.order,
    );
    $("#favorite-range-options").innerHTML = segments(
      [
        ["all", "全部收藏"],
        ["new", "未练题目"],
      ],
      "favorite-range",
      p.range,
    );
    $("#favorite-count-options").innerHTML = segments(
      [
        ["5", "5 题"],
        ["10", "10 题"],
        ["20", "20 题"],
        ["30", "30 题"],
        ["all", "全部"],
      ],
      "favorite-count",
      p.count,
    );
    const start = $('[data-library-action="favorites-practice"]');
    start.disabled = !count;
    start.innerHTML = "开始练习（" + count + " 题）" + icon("arrow");
    $("#favorite-practice-estimate").textContent = count
      ? "预计用时约 " + Math.max(1, Math.ceil(count * 1.5)) + " 分钟"
      : p.range === "new"
        ? "收藏题目都已练习，可以切换全部收藏"
        : "收藏题目后即可开始练习";
    $("#saved-knowledge-count").textContent =
      c.knowledgeFavorites.length + " 个";
    $("#saved-knowledge-list").innerHTML =
      c.knowledgeFavorites
        .slice(0, 4)
        .map((id) => {
          const k = knowledge.get(id);
          return (
            '<button class="saved-knowledge-row" data-library-action="knowledge-detail" data-id="' +
            id +
            '">' +
            icon("bookmark") +
            "<strong>" +
            esc(k.title) +
            "</strong><small>" +
            esc(chapters[k.chapter].title) +
            "</small>" +
            icon("chevron") +
            "</button>"
          );
        })
        .join("") || '<p class="library-caption">还没有收藏知识点</p>';
  }
  function renderFavoriteCounts() {
    const s = state(),
      c = collection();
    $("#favorites-question-count").textContent = s.favorites.length;
    $("#favorite-tab-question-count").textContent = s.favorites.length;
    $("#favorites-knowledge-count").textContent = c.knowledgeFavorites.length;
    $("#favorite-tab-knowledge-count").textContent =
      c.knowledgeFavorites.length;
    const added =
      s.favorites.filter((id) => c.favoriteMeta[id]?.addedAt >= weekStart())
        .length +
      c.knowledgeFavorites.filter(
        (id) => c.knowledgeMeta[id]?.addedAt >= weekStart(),
      ).length;
    $("#favorites-week-count").textContent = added;
  }
  function renderFavorites() {
    ensureCollection();
    $("#favorites-hero-art").innerHTML = art.bookmarks();
    if (!$("#favorites-chapter-filter").options.length)
      $("#favorites-chapter-filter").innerHTML =
        '<option value="all">全部章节</option>' +
        chapters
          .map(
            (c, i) => '<option value="' + i + '">' + esc(c.title) + "</option>",
          )
          .join("");
    document.querySelectorAll("[data-library-tab]").forEach((button) => {
      const active = button.dataset.libraryTab === libraryTab;
      button.setAttribute("aria-selected", active);
      button.tabIndex = active ? 0 : -1;
    });
    $("#favorites-type-label").hidden = libraryTab === "knowledge";
    $("#favorites-manage").innerHTML =
      icon("sliders") + (managing ? "完成管理" : "管理收藏");
    $("#favorites-manage").setAttribute("aria-pressed", managing);
    renderFavoriteCounts();
    renderFavoriteList();
    renderFavoriteAside();
  }
  function startLibraryPractice(ids, title = "收藏专项练习") {
    const p = collection().practice;
    let list = [...new Set(ids)]
      .map((id) => flow.questionMap.get(id))
      .filter(Boolean);
    if (p.range === "new") list = list.filter((q) => !state().records[q.id]);
    if (p.order === "random") list = flow.shuffled(list);
    if (p.count !== "all") list = list.slice(0, Number(p.count));
    if (!list.length) {
      toast("这个范围暂无可练题目，试试全部收藏");
      return;
    }
    flow.createSession("practice", list[0].chapterIndex, list, {
      forceNew: true,
      origin: "favorites",
      sessionData: { title, order: p.order },
    });
  }
  function selectedQuestionIds() {
    return libraryTab === "questions"
      ? [...chosen]
      : [...chosen].flatMap((id) => knowledge.get(id)?.qids || []);
  }
  function removeFavorites(ids, kind) {
    const c = collection(),
      key = kind === "knowledge" ? "knowledgeFavorites" : "favorites",
      owner = kind === "knowledge" ? c : state();
    const removed = owner[key].filter((id) => ids.includes(id));
    if (!removed.length) return;
    const original = [...owner[key]];
    owner[key] = owner[key].filter((id) => !removed.includes(id));
    removed.forEach((id) => chosen.delete(id));
    flow.save();
    if (document.body.dataset.page === "favorites") renderFavorites();
    undoRemoval = { kind, removed, original };
    clearTimeout(undoTimer);
    toast("已取消 " + removed.length + " 项收藏");
    clearTimeout(toastTimer);
    $("#toast").innerHTML =
      "已取消 " +
      removed.length +
      ' 项收藏 <button class="library-undo" data-library-action="favorite-undo">撤销</button>';
    undoTimer = setTimeout(() => {
      undoRemoval = null;
      $("#toast").classList.remove("show");
    }, 6500);
  }
  function undoFavoriteRemoval() {
    if (!undoRemoval) return;
    const { kind, removed, original } = undoRemoval,
      owner = kind === "knowledge" ? collection() : state(),
      key = kind === "knowledge" ? "knowledgeFavorites" : "favorites";
    const restored = new Set([...owner[key], ...removed]);
    owner[key] = [
      ...original.filter((id) => restored.has(id)),
      ...owner[key].filter((id) => !original.includes(id)),
    ];
    clearTimeout(undoTimer);
    undoRemoval = null;
    flow.save();
    renderFavorites();
    toast("已恢复收藏");
  }
  function showFavoriteDetail(id) {
    const q = flow.questionMap.get(id);
    if (!q) return;
    showDialog(
      "收藏题目",
      '<div class="library-detail-tags"><b class="favorite-card-tag">' +
        types[q.type] +
        '</b><b class="favorite-card-tag chapter">' +
        esc(q.chapter) +
        "</b><span>" +
        esc(q.point || q.section) +
        '</span></div><h3 class="library-detail-question">' +
        esc(q.q) +
        '</h3><div class="library-detail-options">' +
        q.options
          .map(
            (option, i) =>
              '<div class="library-detail-option ' +
              (q.answers.includes(i) ? "is-correct" : "") +
              '"><b>' +
              String.fromCharCode(65 + i) +
              "</b><span>" +
              esc(option) +
              "</span>" +
              (q.answers.includes(i) ? icon("check") : "") +
              "</div>",
          )
          .join("") +
        '</div><div class="library-detail-analysis"><strong>正确答案：' +
        q.answers.map((i) => String.fromCharCode(65 + i)).join("、") +
        "</strong><p>" +
        esc(q.explain) +
        "</p><small>题目来源：" +
        esc(q.source || "四川计算机章节练习") +
        '</small></div><div class="study-form-actions"><button class="study-outline" data-library-action="favorite-remove-dialog" data-id="' +
        esc(id) +
        '" data-kind="questions">取消收藏</button><button class="primary-button" data-library-action="favorite-practice-one" data-id="' +
        esc(id) +
        '">练习这道题' +
        icon("arrow") +
        "</button></div>",
      "我的收藏",
    );
  }
  function showKnowledgeDetail(id) {
    const k = knowledge.get(id);
    if (!k) return;
    const sample = k.qids.slice(0, 3).map((id) => flow.questionMap.get(id));
    showDialog(
      k.title,
      '<div class="library-detail-tags"><b class="favorite-card-tag chapter">' +
        esc(chapters[k.chapter].title) +
        "</b><span>" +
        k.qids.length +
        ' 道相关题目</span></div><div class="knowledge-detail-note"><strong>复习要点</strong>' +
        sample.map((q) => "<p>" + esc(q.explain) + "</p>").join("") +
        '</div><div class="study-form-actions"><button class="study-outline" data-library-action="knowledge-toggle" data-id="' +
        id +
        '">' +
        (collection().knowledgeFavorites.includes(id)
          ? "取消收藏"
          : "收藏知识点") +
        '</button><button class="primary-button" data-library-action="knowledge-practice" data-id="' +
        id +
        '">练习这个知识点' +
        icon("arrow") +
        "</button></div>",
      "收藏的知识点",
    );
  }
  function showKnowledgePicker() {
    showDialog(
      "添加知识点收藏",
      '<p class="dialog-lead">点击知识点即可收藏，已经收藏的内容会显示勾选。</p>' +
        groups
          .map(
            (g) =>
              '<section class="knowledge-group"><h3>' +
              esc(g.title) +
              '</h3><div class="knowledge-tiles">' +
              g.items
                .map(
                  (k) =>
                    '<button class="knowledge-tile ' +
                    (collection().knowledgeFavorites.includes(k.id)
                      ? "is-selected"
                      : "") +
                    '" data-library-action="knowledge-picker-toggle" data-id="' +
                    k.id +
                    '" aria-pressed="' +
                    collection().knowledgeFavorites.includes(k.id) +
                    '">' +
                    icon(
                      collection().knowledgeFavorites.includes(k.id)
                        ? "check"
                        : "plus",
                    ) +
                    "<span><strong>" +
                    esc(k.title) +
                    "</strong><small>" +
                    k.qids.length +
                    " 题</small></span></button>",
                )
                .join("") +
              "</div></section>",
          )
          .join(""),
      "我的收藏",
    );
  }
  function toggleKnowledge(id) {
    const c = collection();
    if (!knowledge.has(id)) return;
    const exists = c.knowledgeFavorites.includes(id);
    if (exists)
      c.knowledgeFavorites = c.knowledgeFavorites.filter((k) => k !== id);
    else {
      c.knowledgeFavorites.push(id);
      c.knowledgeMeta[id] = { addedAt: Date.now() };
    }
    flow.save();
    if (document.body.dataset.page === "favorites") renderFavorites();
  }
  function showFavoriteMenu(id, kind) {
    const item =
      kind === "questions" ? flow.questionMap.get(id) : knowledge.get(id);
    if (!item) return;
    showDialog(
      "收藏操作",
      '<p class="dialog-lead">' +
        esc(item.q || item.title) +
        '</p><div class="library-menu-actions"><button class="study-outline" data-library-action="' +
        (kind === "questions" ? "favorite-detail" : "knowledge-detail") +
        '" data-id="' +
        esc(id) +
        '">' +
        icon("book") +
        '查看内容</button><button class="study-outline" data-library-action="' +
        (kind === "questions"
          ? "favorite-practice-one"
          : "knowledge-practice") +
        '" data-id="' +
        esc(id) +
        '">' +
        icon("play") +
        '开始练习</button><button class="study-outline" data-library-action="favorite-remove-dialog" data-id="' +
        esc(id) +
        '" data-kind="' +
        kind +
        '">' +
        icon("trash") +
        "取消收藏</button></div>",
      "我的收藏",
    );
  }
  function action(name, button) {
    const id = button.dataset.id,
      kind = button.dataset.kind;
    switch (name) {
      case "exam-history":
        showExamHistory();
        break;
      case "exam-clear":
        collection().builder.selected = [];
        renderKnowledgeGroups();
        renderExamPreview();
        break;
      case "exam-search-reset":
        examChapter = "all";
        $("#exam-knowledge-search").value = "";
        renderExam();
        break;
      case "exam-start":
        startExam();
        break;
      case "exam-resume":
        flow.activate(id);
        break;
      case "exam-record":
        flow.activate(id, "report");
        break;
      case "exam-review": {
        const s = flow.activeSession();
        if (s) {
          s.index = 0;
          flow.save();
          showPage("practice");
        }
        break;
      }
      case "exam-wrong-practice": {
        const s = flow.activeSession();
        if (s) {
          const ids = s.qids.filter(
            (id) =>
              s.responses[id]?.kind === "answer" && !s.responses[id].correct,
          );
          flow.createSession(
            "wrong",
            s.chapter,
            ids.map((id) => flow.questionMap.get(id)),
            {
              forceNew: true,
              origin: "exam",
              sessionData: { title: "本卷错题巩固" },
            },
          );
        }
        break;
      }
      case "favorites-manage":
        managing = !managing;
        renderFavorites();
        if (managing) {
          $("#favorites-select-all").focus({ preventScroll: true });
          toast("勾选收藏内容，可以批量练习或取消收藏");
        }
        break;
      case "favorites-knowledge-all":
        libraryTab = "knowledge";
        libraryPage = 1;
        chosen.clear();
        renderFavorites();
        $("#favorite-knowledge-tab").focus();
        break;
      case "favorites-filter-reset":
        $("#favorites-search").value = "";
        $("#favorites-chapter-filter").value = "all";
        $("#favorites-type-filter").value = "all";
        libraryPage = 1;
        renderFavoriteList();
        break;
      case "favorites-practice":
        startLibraryPractice(state().favorites);
        break;
      case "favorites-practice-selected":
        startLibraryPractice(
          selectedQuestionIds(),
          libraryTab === "questions" ? "所选收藏练习" : "收藏知识点练习",
        );
        break;
      case "favorites-remove-selected":
        removeFavorites([...chosen], libraryTab);
        break;
      case "favorite-remove":
        removeFavorites([id], kind);
        break;
      case "favorite-remove-dialog":
        closeDialog();
        removeFavorites([id], kind);
        break;
      case "favorite-undo":
        undoFavoriteRemoval();
        break;
      case "favorite-detail":
        showFavoriteDetail(id);
        break;
      case "favorite-menu":
        showFavoriteMenu(id, kind);
        break;
      case "favorite-practice-one": {
        const q = flow.questionMap.get(id);
        if (q)
          flow.createSession("practice", q.chapterIndex, [q], {
            forceNew: true,
            origin: "favorites",
            sessionData: { title: "收藏题目练习" },
          });
        break;
      }
      case "knowledge-detail":
        showKnowledgeDetail(id);
        break;
      case "knowledge-practice": {
        const k = knowledge.get(id);
        if (k) startLibraryPractice(k.qids, k.title + " · 收藏练习");
        break;
      }
      case "knowledge-add":
        showKnowledgePicker();
        break;
      case "knowledge-toggle":
        toggleKnowledge(id);
        showKnowledgeDetail(id);
        break;
      case "knowledge-picker-toggle":
        toggleKnowledge(id);
        showKnowledgePicker();
        $(
          '[data-library-action="knowledge-picker-toggle"][data-id="' +
            id +
            '"]',
        ).focus({ preventScroll: true });
        break;
      case "favorite-seed":
        seedQuestionFavorites();
        flow.save();
        renderFavorites();
        toast("已添加 12 道示例收藏");
        break;
    }
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-library-action]");
    if (button) {
      action(button.dataset.libraryAction, button);
      return;
    }
    const tab = event.target.closest("[data-library-tab]");
    if (tab) {
      libraryTab = tab.dataset.libraryTab;
      libraryPage = 1;
      chosen.clear();
      renderFavorites();
      tab.focus();
      return;
    }
    const chapter = event.target.closest("[data-exam-chapter]");
    if (chapter) {
      examChapter = chapter.dataset.examChapter;
      renderExam();
      $('[data-exam-chapter="' + examChapter + '"]').focus({
        preventScroll: true,
      });
      return;
    }
    const chip = event.target.closest("[data-exam-remove]");
    if (chip) {
      collection().builder.selected = collection().builder.selected.filter(
        (id) => id !== chip.dataset.examRemove,
      );
      renderKnowledgeGroups();
      renderExamPreview();
      return;
    }
    const setting = event.target.closest("[data-library-setting]");
    if (setting) {
      const key = setting.dataset.librarySetting,
        value = setting.dataset.value;
      if (key === "exam-count") collection().builder.count = Number(value);
      if (key === "exam-minutes") collection().builder.minutes = Number(value);
      if (key === "favorite-order") collection().practice.order = value;
      if (key === "favorite-range") collection().practice.range = value;
      if (key === "favorite-count") collection().practice.count = value;
      if (key.startsWith("exam")) renderExamPreview();
      else {
        renderFavoriteAside();
        flow.save();
      }
      $(
        '[data-library-setting="' + key + '"][data-value="' + value + '"]',
      ).focus({ preventScroll: true });
      return;
    }
    const page = event.target.closest("[data-favorite-page]");
    if (page && !page.disabled) {
      libraryPage = Number(page.dataset.favoritePage);
      renderFavoriteList();
    }
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.matches("[data-exam-knowledge]")) {
      const id = el.dataset.examKnowledge,
        b = collection().builder;
      b.selected = el.checked
        ? [...new Set([...b.selected, id])]
        : b.selected.filter((k) => k !== id);
      renderKnowledgeGroups();
      renderExamPreview();
      $('[data-exam-knowledge="' + id + '"]').focus({ preventScroll: true });
    } else if (el.matches("[data-exam-group]")) {
      const ids =
        availableKnowledgeItems()
          .find((g) => g.chapter === Number(el.dataset.examGroup))
          ?.items.map((k) => k.id) || [];
      const b = collection().builder;
      b.selected = el.checked
        ? [...new Set([...b.selected, ...ids])]
        : b.selected.filter((id) => !ids.includes(id));
      renderKnowledgeGroups();
      renderExamPreview();
      $('[data-exam-group="' + el.dataset.examGroup + '"]').focus({
        preventScroll: true,
      });
    } else if (el.matches("[data-exam-type]")) {
      const b = collection().builder;
      b.types = el.checked
        ? [...new Set([...b.types, el.dataset.examType])]
        : b.types.filter((t) => t !== el.dataset.examType);
      renderExamPreview();
      $('[data-exam-type="' + el.dataset.examType + '"]').focus({
        preventScroll: true,
      });
    } else if (el.id === "exam-more-chapters") {
      examChapter = el.value;
      renderExam();
      $("#exam-more-chapters").focus({ preventScroll: true });
    } else if (el.matches("[data-favorite-select]")) {
      if (el.checked) chosen.add(el.dataset.favoriteSelect);
      else chosen.delete(el.dataset.favoriteSelect);
      renderFavoriteList();
      $('[data-favorite-select="' + el.dataset.favoriteSelect + '"]')?.focus({
        preventScroll: true,
      });
    } else if (el.id === "favorites-select-all") {
      const ids = filteredFavorites().map((item) => item.id);
      if (el.checked) ids.forEach((id) => chosen.add(id));
      else ids.forEach((id) => chosen.delete(id));
      renderFavoriteList();
    } else if (
      [
        "favorites-chapter-filter",
        "favorites-type-filter",
        "favorites-sort",
      ].includes(el.id)
    ) {
      libraryPage = 1;
      chosen.clear();
      renderFavoriteList();
    }
  });
  $("#exam-knowledge-search").addEventListener("input", renderKnowledgeGroups);
  $("#exam-knowledge-search").addEventListener("search", renderKnowledgeGroups);
  $("#exam-name").addEventListener("input", () => {
    collection().builder.name = $("#exam-name").value;
    flow.save();
    $('[data-library-action="exam-start"]').disabled =
      !buildPaper().ids.length || collection().builder.name.trim().length < 2;
  });
  $("#favorites-search").addEventListener("input", () => {
    libraryPage = 1;
    chosen.clear();
    renderFavoriteList();
  });
  $(".favorites-tabs").addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      libraryTab =
        event.key === "Home"
          ? "questions"
          : event.key === "End"
            ? "knowledge"
            : libraryTab === "questions"
              ? "knowledge"
              : "questions";
      libraryPage = 1;
      chosen.clear();
      renderFavorites();
      $('[data-library-tab="' + libraryTab + '"]').focus();
    }
  });
  actions.exam = () => showPage("exam");
  actions.favorites = () => showPage("favorites");
  const oldReset = actions.reset;
  actions.reset = () => {
    oldReset();
    chosen.clear();
    undoRemoval = null;
    clearTimeout(undoTimer);
    ensureCollection();
  };
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name === "exam") renderExam();
    if (event.detail.name === "favorites") renderFavorites();
    if (event.detail.name === "report") renderExamReport();
    // Restore the report's shared return button for ordinary practice.
    if (
      event.detail.name === "report" &&
      flow.activeSession()?.mode !== "exam"
    ) {
      const origin = flow.origin(flow.activeSession());
      const back = $("#report-page .study-back");
      back.dataset.action = origin;
      back.innerHTML =
        icon("arrow") +
        (origin === "favorites"
          ? "返回收藏"
          : origin === "exam"
            ? "返回组卷"
            : origin === "wrong"
              ? "返回错题本"
              : "返回章节");
    }
  });
  document.addEventListener("demo:favorite-changed", (event) => {
    if (event.detail.added)
      collection().favoriteMeta[event.detail.id] = { addedAt: Date.now() };
    flow.save();
    if (document.body.dataset.page === "favorites") renderFavorites();
  });
  document.addEventListener("demo:exam-finished", () => {
    if (document.body.dataset.page === "exam") renderOngoingExam();
  });
  setInterval(() => {
    const s = state().sessions.find((s) => s.mode === "exam" && !s.finished);
    if (s && $("#exam-ongoing-time"))
      $("#exam-ongoing-time").textContent = formatTime(flow.remaining(s));
  }, 1000);
  ensureCollection();
  const page = document.body.dataset.page;
  if (page === "exam") renderExam();
  if (page === "favorites") renderFavorites();
  if (page === "report") renderExamReport();
})();
