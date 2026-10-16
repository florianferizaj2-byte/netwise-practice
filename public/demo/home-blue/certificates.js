"use strict";
(() => {
  const flow = window.AceStudyFlow,
    root = $("#certificates-page");
  if (!flow || !root) return;
  const safe = flow.safe;
  const extraIcons = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
    "book-check":
      '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Z"/><path d="m7 11 3 3 7-7"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  for (const [name, paths] of Object.entries(extraIcons)) {
    if (!document.getElementById("i-" + name))
      $(".svg-library").insertAdjacentHTML(
        "beforeend",
        '<symbol id="i-' +
          name +
          '" viewBox="0 0 24 24">' +
          paths +
          "</symbol>",
      );
  }

  const catalog = [
    {
      id: "sichuan-upgrading-computer",
      name: "四川专升本 · 计算机",
      course: "四川专升本 · 计算机",
      category: "upgrade",
      categoryName: "专升本",
      region: "sichuan",
      regionName: "四川省",
      subject: "计算机",
      description: "四川省 · 计算机科目",
      points: "计算机基础 · 办公自动化 · 程序设计",
      kind: "computer",
      available: true,
      routes: [
        "home",
        "chapters",
        "ai",
        "exam",
        "wrong",
        "favorites",
        "plan",
        "practice",
        "report",
      ],
      aliases: "四川 专升本 计算机基础 Word Excel office sichuan",
    },
    {
      id: "network-engineer",
      name: "网络工程师",
      course: "软考 · 网络工程师",
      category: "software",
      categoryName: "软考",
      region: "general",
      regionName: "不限地区",
      subject: "计算机网络",
      description: "计算机网络 · 路由与交换",
      points: "网络基础 · 网络安全",
      kind: "router",
      available: true,
      routes: ["ai"],
      aliases: "网络 软考 网工 network 路由 交换",
    },
    {
      id: "software-designer",
      name: "软件设计师",
      category: "software",
      categoryName: "软考",
      region: "general",
      regionName: "不限地区",
      subject: "程序设计",
      description: "程序设计 · 软件工程",
      points: "数据结构 · 数据库",
      kind: "code",
      available: false,
      routes: [],
      aliases: "软设 程序 软件 编程 software",
    },
    {
      id: "database-system-engineer",
      name: "数据库系统工程师",
      category: "software",
      categoryName: "软考",
      region: "general",
      regionName: "不限地区",
      subject: "数据库",
      description: "数据库设计 · 数据管理",
      points: "数据模型 · SQL 基础",
      kind: "database",
      available: false,
      routes: [],
      aliases: "数据库 SQL database",
    },
    {
      id: "information-system-project-manager",
      name: "信息系统项目管理师",
      category: "software",
      categoryName: "软考",
      region: "general",
      regionName: "不限地区",
      subject: "项目管理",
      description: "项目管理 · 信息系统",
      points: "计划管理 · 综合管理",
      kind: "project",
      available: false,
      routes: [],
      aliases: "高项 项目 管理 project",
    },
    {
      id: "information-security-engineer",
      name: "信息安全工程师",
      category: "software",
      categoryName: "软考",
      region: "general",
      regionName: "不限地区",
      subject: "信息安全",
      description: "信息安全 · 安全技术",
      points: "网络安全 · 安全管理",
      kind: "security",
      available: false,
      routes: [],
      aliases: "信安 安全 security",
    },
    {
      id: "hcia-datacom", name: "HCIA-Datacom V2.0", category: "certification", categoryName: "认证考试",
      region: "general", regionName: "不限地区", subject: "数通网络", description: "华为数通 · 交换与路由",
      points: "22 个章节图标可预览", kind: "router", available: false, routes: [], aliases: "华为 HCIA H12-811 Datacom 数通",
    },
    {
      id: "ncre-ms-office", name: "NCRE 二级 MS Office", category: "certification", categoryName: "认证考试",
      region: "general", regionName: "不限地区", subject: "Office 高级应用", description: "Word · Excel · PowerPoint",
      points: "5 个章节图标可预览", kind: "office", available: false, routes: [], aliases: "计算机等级 二级 NCRE Office Word Excel PPT",
    },
  ];
  const get = (id) => catalog.find((c) => c.id === id);
  const controls = $(".course-select");
  const course = $("#course");
  let preview,
    query = "",
    category = "all",
    region = "all";
  function data() {
    const state = flow.state();
    if (!state.certificateDemo || state.certificateDemo.version !== 1) {
      const initial =
        document.body.dataset.page === "ai"
          ? state.aiStudyDemo?.course || "network-engineer"
          : catalog[0].id;
      state.certificateDemo = {
        version: 1,
        active: get(initial)?.available ? initial : catalog[0].id,
        recent: [],
      };
    }
    const d = state.certificateDemo;
    if (!get(d.active)?.available) d.active = catalog[0].id;
    if (!Array.isArray(d.recent)) d.recent = [];
    d.recent = d.recent
      .filter(
        (r, i, list) =>
          get(r?.id)?.available && list.findIndex((x) => x?.id === r.id) === i,
      )
      .slice(0, 4);
    return d;
  }
  const active = () => get(data().active);
  function save() {
    flow.save();
    const failed = $("#study-save-note")?.classList.contains("save-error");
    const status = $("#cert-save-status");
    if (status) {
      status.textContent = failed
        ? "本次选择未能保存，请检查浏览器存储权限。"
        : "备考目标可随时调整，选择保存在此浏览器。";
      status.classList.toggle("is-error", Boolean(failed));
    }
    return !failed;
  }
  function remember(id) {
    const d = data();
    d.recent = [
      { id, visitedAt: Date.now() },
      ...d.recent.filter((r) => r.id !== id),
    ].slice(0, 4);
  }
  function setActive(id, preferred = false) {
    const c = get(id);
    if (!c?.available) return false;
    const changed = data().active !== id;
    data().active = id;
    const state = flow.state();
    if (state.aiStudyDemo) state.aiStudyDemo.course = id;
    else
      state.aiStudyDemo = {
        version: 1,
        course: id,
        last: {},
        progress: {},
        favorites: [],
      };
    if (preferred && state.settingsDemo) {
      state.settingsDemo.prefs.defaultCourse = c.course;
      if (changed) state.settingsDemo.lastLearning = null;
    }
    preview = id;
    remember(id);
    save();
    paintHeader();
    return true;
  }
  function paintHeader() {
    const c = active(),
      picker = $("#certificate-switch");
    const options = catalog
      .filter((c) => c.available)
      .map((c) => "<option>" + safe(c.course) + "</option>")
      .join("");
    if (![...course.options].some((o) => o.value === c.course))
      course.innerHTML = options;
    course.value = c.course;
    picker.querySelector("span").textContent = c.course;
    picker.setAttribute(
      "aria-label",
      "当前备考：" + c.course + "，更换考试与证书",
    );
    picker.classList.toggle(
      "is-open",
      document.body.dataset.page === "certificates",
    );
    if (document.body.dataset.page === "certificates")
      picker.setAttribute("aria-current", "page");
    else picker.removeAttribute("aria-current");
    $(".course-caption").textContent = c.course;
  }
  function illustration(c) {
    if (c.kind === "office") return art.office();
    if (c.kind === "computer") return art.computer();
    if (c.kind === "code") return art.code();
    if (c.kind === "database") return art.database();
    const drawings = {
      router:
        '<ellipse cx="120" cy="160" rx="98" ry="30" fill="#dff6ee"/><path d="m34 139 84-46 84 43-84 46Z" fill="#a4ddd5"/><g class="cert-float"><path d="m67 101 49-26 71 36-49 29Z" fill="#8abcfb"/><path d="m67 101 71 39v30l-71-38Z" fill="#3576d8"/><path d="m138 140 49-29v30l-49 29Z" fill="#2357a6"/><path d="m80 110 34-18 59 28-34 20Z" fill="#b9d7ff"/><path d="M64 105V51m118 59V61" stroke="#134b7a" stroke-width="8" stroke-linecap="round"/><path d="M64 78V53m118 35V64" stroke="#2bb5b4" stroke-width="6" stroke-linecap="round"/><circle cx="150" cy="145" r="3" fill="#8ff4d1"/><circle cx="162" cy="138" r="3" fill="#8ff4d1"/><path d="m27 144 20-11 20 10-20 12Z" fill="#71d4be"/><path d="M27 144v19l20 12 20-12v-20l-20 12Z" fill="#29b19d"/><path d="m187 156 17-10 18 9-18 11Z" fill="#86e0c6"/><path d="M187 156v17l17 10 18-10v-18l-18 11Z" fill="#27ac99"/></g><g class="cert-signal" stroke="#75aff8" stroke-width="7" stroke-linecap="round"><path d="M94 48q27-30 54 0"/><path d="M104 60q17-19 34 0"/><path d="M116 70q5-6 10 0"/></g>',
      project:
        '<ellipse cx="122" cy="171" rx="95" ry="23" fill="#fff0e4"/><g class="cert-float"><path d="m35 54 103-23 15 126-109 27Z" fill="#f6a974"/><path d="m25 59 105-23 14 126-105 25Z" fill="#fff8ef" stroke="#ffd9ba" stroke-width="3"/><path d="m45 61 70-15 2 16-70 15Z" fill="#ffdbb8"/><path d="m68 91 48-11m-44 34 44-11m-41 34 34-8" stroke="#b6d3fa" stroke-width="5" stroke-linecap="round"/><g stroke="#3784ef" stroke-width="4"><path d="m46 88 7 6 8-15m-12 38 7 6 8-15m-12 38 7 6 8-15"/></g></g><g class="cert-small"><path d="m135 90 62-12 9 91-67 13Z" fill="#5796eb"/><path d="m128 96 62-12 9 91-62 12Z" fill="white" stroke="#c5dffd" stroke-width="2"/><path d="m128 96 62-12 2 20-62 12Z" fill="#629fed"/><path d="m141 89 2 15m27-21 2 15" stroke="#2768ca" stroke-width="6" stroke-linecap="round"/><path d="m141 126 36-7m-35 19 36-7m-34 20 36-7" stroke="#c7dcfc" stroke-width="6" stroke-linecap="round"/></g>',
      security:
        '<ellipse cx="126" cy="171" rx="95" ry="23" fill="#e1f7ef"/><g class="cert-float"><path d="m44 55 55-25 58 20-1 53c-7 34-29 61-52 75-27-9-56-35-64-69Z" fill="#51c5ab"/><path d="m49 60 48-22 49 17v47c-5 25-24 51-43 66-22-12-46-35-52-60Z" fill="#84e0c9"/><path d="m55 65 42-18v106c-20-12-35-30-39-50Z" fill="#2fac98"/><path d="m72 97 19 20 31-43" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></g><g class="cert-small"><path d="M162 132v-19a19 19 0 0 1 38 0v23" stroke="#9cc6ff" stroke-width="10"/><path d="M161 132v-19a19 19 0 0 1 38 0v23" stroke="#619cf4" stroke-width="6"/><path d="m147 129 52-9 7 50-52 11Z" fill="#3769db"/><path d="m151 130 46-8 6 43-46 10Z" fill="#558cff"/><circle cx="176" cy="144" r="5" fill="#c8e0ff"/><path d="m177 148 2 9" stroke="#c8e0ff" stroke-width="4" stroke-linecap="round"/></g>',
    };
    return (
      '<div class="art cert-illustration">' + svg(drawings[c.kind]) + "</div>"
    );
  }
  function mount() {
    root.innerHTML =
      '<div class="cert-heading"><div><p class="cert-breadcrumb">' +
      icon("home") +
      '<span>学习空间 / 证书选择</span></p><h1>选择备考目标</h1><p>找到你的考试与证书，进入对应学习空间。</p></div><button class="study-outline" data-cert-action="about">' +
      icon("compass") +
      '考试与证书</button></div><div class="cert-layout"><section class="cert-catalogue" aria-label="选择备考目标"><div class="cert-search-bar"><label class="cert-search">' +
      icon("search") +
      '<span class="sr-only">搜索考试、证书或科目</span><input id="cert-search" type="search" placeholder="搜索考试、证书或科目" autocomplete="off"></label><label class="cert-region"><span class="sr-only">备考地区</span><select id="cert-region"><option value="all">全部地区</option><option value="sichuan">四川省</option><option value="general">不限地区</option></select>' +
      icon("down") +
      '</label></div><div class="cert-filter-row"><div class="cert-filters" role="group" aria-label="考试类别"><button data-cert-category="all" aria-pressed="true">全部 <span>8</span></button><button data-cert-category="upgrade" aria-pressed="false">专升本 <span>1</span></button><button data-cert-category="software" aria-pressed="false">软考 <span>5</span></button><button data-cert-category="certification" aria-pressed="false">认证考试 <span>2</span></button></div><span id="cert-result-count" role="status" aria-live="polite"></span></div><p class="cert-list-help">选择一个备考目标，再开始学习。</p><fieldset class="cert-grid" id="cert-grid"><legend class="sr-only">备考目标</legend></fieldset><div class="cert-empty" id="cert-empty" hidden>' +
      icon("search") +
      '<h2>没有找到对应方向</h2><p>试试证书名称、科目，或查看全部备考目标。</p><button class="study-outline" data-cert-action="clear">清除筛选</button></div><p class="cert-footnote">' +
      icon("book") +
      '<span>已开放 2 个学习方向，另有 6 个方向预留。可预览现有 4 类证书的全部章节图标。</span></p><button type="button" class="study-outline cv-gallery-entry" data-chapter-gallery>浏览全部章节图标</button><span class="sr-only" id="cert-selection-status" role="status" aria-live="polite"></span></section><aside class="cert-side"><section class="cert-panel" id="cert-current" aria-labelledby="cert-current-heading"></section><section class="cert-panel cert-recents" aria-labelledby="cert-recent-heading"><h2 id="cert-recent-heading">' +
      icon("clock") +
      '最近备考</h2><div id="cert-recent-list"></div></section></aside></div>';
    $("#cert-search").value = query;
    $("#cert-region").value = region;
    renderCards();
    renderPreview();
    renderRecent();
  }
  function visibleCatalog() {
    const q = query.normalize("NFKC").trim().toLowerCase();
    return catalog.filter(
      (c) =>
        (category === "all" || c.category === category) &&
        (region === "all" || c.region === region) &&
        (!q ||
          [c.name, c.categoryName, c.description, c.points, c.aliases]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }
  function renderCards() {
    const list = visibleCatalog();
    $("#cert-grid").innerHTML =
      '<legend class="sr-only">备考目标</legend>' +
      list
        .map(
          (c) =>
            '<label class="cert-card ' +
            (!c.available ? "is-planned " : "") +
            (c.id === preview ? "is-selected" : "") +
            '" data-cert-card="' +
            c.id +
            '"><input class="cert-radio" type="radio" name="certificate" value="' +
            c.id +
            '"' +
            (c.id === preview ? " checked" : "") +
            ' aria-describedby="cert-state-' +
            c.id +
            '"><span class="cert-selection-mark" aria-hidden="true">' +
            icon("check") +
            '</span><span class="cert-art">' +
            illustration(c) +
            '</span><span class="cert-card-copy"><span class="cert-card-title">' +
            safe(c.name) +
            '</span><span class="cert-card-tags"><span class="cert-category-tag">' +
            c.categoryName +
            '</span><span id="cert-state-' +
            c.id +
            '" class="cert-state ' +
            (!c.available
              ? "planned"
              : c.id === data().active
                ? "current"
                : "available") +
            '">' +
            (!c.available
              ? "准备中"
              : c.id === data().active
                ? "当前备考"
                : c.id === "network-engineer"
                  ? "精讲已开放"
                  : "已开放") +
            '</span></span><span class="cert-card-description">' +
            safe(c.description) +
            '</span><span class="cert-card-points">' +
            safe(c.points) +
            "</span></span></label>",
        )
        .join("");
    $("#cert-empty").hidden = list.length > 0;
    $("#cert-grid").hidden = !list.length;
    $("#cert-result-count").textContent =
      (query || region !== "all" || category !== "all" ? "找到 " : "共 ") +
      list.length +
      " 个备考方向";
    root
      .querySelectorAll("[data-cert-category]")
      .forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(b.dataset.certCategory === category),
        ),
      );
  }
  function entry(c, route, title, glyph) {
    const enabled = c.routes.includes(route);
    return (
      '<button class="cert-entry" data-cert-route="' +
      route +
      '" ' +
      (enabled ? "" : "disabled") +
      ">" +
      icon(glyph) +
      "<span>" +
      title +
      "</span>" +
      (!enabled ? "<small>准备中</small>" : icon("chevron")) +
      "</button>"
    );
  }
  function renderPreview() {
    const c = get(preview) || active();
    $("#cert-current").innerHTML =
      '<h2 id="cert-current-heading">' +
      icon("book-check") +
      '当前选择</h2><div class="cert-selected-summary ' +
      (!c.available ? "is-planned" : "") +
      '"><span class="cert-selected-art">' +
      illustration(c) +
      '</span><div><span class="cert-state ' +
      (!c.available ? "planned" : "current") +
      '">' +
      (!c.available
        ? "准备中"
        : c.id === data().active
          ? "当前备考"
          : "待进入") +
      "</span><h3>" +
      safe(c.name) +
      "</h3><p>" +
      (!c.available
        ? "已预留备考方向"
        : c.id === catalog[0].id
          ? "进入对应科目与章节"
          : "从一个知识点开始学") +
      '</p></div></div><dl class="cert-details"><div><dt>' +
      icon("play") +
      "考试类别</dt><dd>" +
      c.categoryName +
      "</dd></div><div><dt>" +
      icon("pin") +
      "备考地区</dt><dd>" +
      c.regionName +
      "</dd></div><div><dt>" +
      icon("book") +
      "学习科目</dt><dd>" +
      c.subject +
      '</dd></div></dl><div class="cert-entry-group"><h3>学习入口</h3>' +
      entry(c, "chapters", "章节练习", "book") +
      entry(c, "ai", "AI 精讲与练习", "play") +
      entry(c, "exam", "模拟考试", "exam") +
      '</div><p class="cert-availability">' +
      (!c.available
        ? "题库、精讲与学习计划正在准备，暂时无法进入学习。"
        : c.id === "network-engineer"
          ? "精讲与逐空练习已开放，章节题库和模拟考试正在准备。"
          : "章节练习、精讲与模拟考试均可体验。") +
      '</p>' + (window.AceChapterVisualCatalog?.certificates.some((item) => item.id === c.id)
        ? '<button type="button" class="study-outline cv-gallery-entry" data-chapter-gallery="' + c.id + '">查看全部章节图标 ' + icon("arrow") + '</button>' : "") +
      '<button id="cert-enter" class="primary-button" data-cert-action="enter" ' +
      (c.available ? "" : "disabled") +
      ">" +
      (!c.available ? "内容准备中" : "进入学习") +
      icon("arrow") +
      '</button><p id="cert-save-status" class="cert-save-status">备考目标可随时调整，选择保存在此浏览器。</p>';
    root.querySelectorAll("[data-cert-card]").forEach((el) => {
      const selected = el.dataset.certCard === c.id;
      el.classList.toggle("is-selected", selected);
      el.querySelector("input").checked = selected;
    });
  }
  function renderRecent() {
    const list = data().recent;
    $("#cert-recent-list").innerHTML = list.length
      ? list
          .map((r) => {
            const c = get(r.id),
              current = c.id === data().active;
            const detail =
              c.id === catalog[0].id
                ? chapters[activeChapter]?.title || "章节练习"
                : "AI 精讲与练习";
            return (
              '<button class="cert-recent" data-cert-recent="' +
              c.id +
              '"><span class="cert-recent-art">' +
              illustration(c) +
              "</span><span><strong>" +
              safe(c.name) +
              "</strong><small>" +
              safe(detail) +
              "</small></span>" +
              (current
                ? '<span class="cert-state current">当前</span>'
                : icon("chevron")) +
              "</button>"
            );
          })
          .join("")
      : '<p class="cert-recent-empty">进入学习后，最近备考会显示在这里。</p>';
  }
  function enter(route) {
    const c = get(preview) || active();
    if (!c.available || (route && !c.routes.includes(route))) return;
    setActive(c.id, true);
    showPage(route || (c.id === catalog[0].id ? "home" : "ai"));
  }
  const routeNames = {
    home: "学习总览",
    chapters: "章节练习",
    practice: "章节刷题",
    report: "练习报告",
    plan: "学习计划",
    exam: "模拟考试",
    favorites: "我的收藏",
    wrong: "错题本",
  };
  function supports(route) {
    return !routeNames[route] || active().routes.includes(route);
  }
  function applyAvailability(route) {
    const limited = !supports(route);
    document.body.dataset.courseLimited = String(limited);
    const empty = $("#certificate-unavailable");
    empty.hidden = !limited;
    if (limited) {
      const c = active();
      empty.innerHTML =
        '<p class="cert-breadcrumb">' +
        icon("home") +
        "<span>" +
        safe(c.course) +
        " / " +
        routeNames[route] +
        '</span></p><div class="cert-unavailable-panel"><span class="cert-unavailable-art">' +
        illustration(c) +
        '</span><span class="cert-state planned">内容准备中</span><h1>' +
        routeNames[route] +
        "正在准备</h1><p>" +
        safe(c.name) +
        '目前已开放 AI 精讲与逐空练习。<br>这个入口的内容准备完成后，会在这里开放。</p><div><button class="primary-button" data-action="ai">体验 AI 精讲' +
        icon("arrow") +
        '</button><button class="study-outline" data-action="certificates">更换备考目标</button></div><small>其他方向的学习记录会保留，切换回来后可继续。</small></div>';
      window.AceDemoSettings?.cancelAuto();
    }
  }
  function about() {
    showDialog(
      "考试与证书",
      '<p class="dialog-lead">先选备考目标，再进入这个方向已开放的学习内容。</p><div class="cert-about-list">' +
        catalog
          .map(
            (c) =>
              "<div><strong>" +
              safe(c.name) +
              '</strong><span class="cert-state ' +
              (c.available ? "available" : "planned") +
              '">' +
              (c.available
                ? c.id === catalog[0].id
                  ? "刷题与精讲已开放"
                  : "精讲已开放"
                : "准备中") +
              "</span></div>",
          )
          .join("") +
        '</div><p class="cert-about-note">“准备中”的方向仅预留入口，开放后再接入对应题库与学习内容。</p><button class="study-outline" data-cert-action="about-close">返回选择</button>',
    );
  }
  course.hidden = true;
  course.setAttribute("aria-hidden", "true");
  course.tabIndex = -1;
  controls.querySelector(":scope > .icon")?.remove();
  controls.insertAdjacentHTML(
    "beforeend",
    '<button type="button" id="certificate-switch" data-action="certificates" aria-controls="certificates-page"><span></span>' +
      icon("down") +
      "</button>",
  );
  preview = data().active;
  if (
    !data().recent.length &&
    !["login", "certificates"].includes(document.body.dataset.page)
  )
    remember(data().active);
  mount();
  paintHeader();
  save();
  document.addEventListener("click", (event) => {
    const route = event.target.closest("[data-cert-route]");
    if (route) {
      enter(route.dataset.certRoute);
      return;
    }
    const filter = event.target.closest("[data-cert-category]");
    if (filter) {
      category = filter.dataset.certCategory;
      renderCards();
      return;
    }
    const recent = event.target.closest("[data-cert-recent]");
    if (recent) {
      preview = recent.dataset.certRecent;
      renderPreview();
      enter();
      return;
    }
    const action = event.target.closest("[data-cert-action]");
    if (!action) return;
    if (action.dataset.certAction === "enter") enter();
    if (action.dataset.certAction === "about") about();
    if (action.dataset.certAction === "about-close") closeDialog();
    if (action.dataset.certAction === "clear") {
      query = "";
      category = region = "all";
      $("#cert-search").value = "";
      $("#cert-region").value = "all";
      renderCards();
      $("#cert-search").focus();
    }
  });
  root.addEventListener("input", (event) => {
    if (event.target.id === "cert-search") {
      query = event.target.value;
      renderCards();
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.id === "cert-region") {
      region = event.target.value;
      renderCards();
    }
    if (event.target.matches(".cert-radio")) {
      preview = event.target.value;
      renderPreview();
      $("#cert-selection-status").textContent =
        "已选择" +
        get(preview).name +
        (get(preview).available
          ? "，可以进入已开放的学习内容。"
          : "，内容准备中。");
    }
  });
  course.addEventListener("change", () => {
    const c = catalog.find((c) => c.course === course.value);
    if (c?.available) {
      setActive(c.id);
      applyAvailability(document.body.dataset.page);
    }
  });
  actions.certificates = () => showPage("certificates");
  searchItems.push({
    title: "证书选择 · 更换备考目标",
    action: "certificates",
  });
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name === "certificates") {
      renderCards();
      renderPreview();
      renderRecent();
    }
    paintHeader();
    applyAvailability(event.detail.name);
  });

  document.addEventListener("demo:settings-saved", (event) => {
    const { old, current } = event.detail;
    if (old.defaultCourse === current.defaultCourse) return;
    const c = catalog.find((c) => c.course === current.defaultCourse);
    if (!c?.available) return;
    data().active = c.id;
    if (flow.state().aiStudyDemo) flow.state().aiStudyDemo.course = c.id;
    preview = c.id;
    paintHeader();
    applyAvailability(document.body.dataset.page);
    save();
  });
  const oldReset = actions.reset;
  actions.reset = () => {
    oldReset();
    flow.state().certificateDemo = {
      version: 1,
      active: catalog[0].id,
      recent: [],
    };
    preview = catalog[0].id;
    query = "";
    category = region = "all";
    remember(preview);
    mount();
    paintHeader();
    applyAvailability(document.body.dataset.page);
    save();
  };
  window.AceCertificates = {
    active: () => structuredClone(active()),
    catalog: () => structuredClone(catalog),
    supports,
    syncCourse: paintHeader,
    enterCourse: (id, route = "ai") => {
      const c = get(id);
      if (!c?.available || !c.routes.includes(route)) return false;
      preview = c.id;
      enter(route);
      return true;
    },
    enterDefault: (title) => {
      const c = catalog.find((c) => c.course === title) || catalog[0];
      preview = c.id;
      enter(c.id === catalog[0].id ? "home" : "ai");
    },
  };
  applyAvailability(document.body.dataset.page);
})();
