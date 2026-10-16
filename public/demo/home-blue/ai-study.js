"use strict";
(() => {
  const flow = window.AceStudyFlow;
  const root = $("#ai-page");
  if (!flow || !root) return;
  const safe = flow.safe;
  const courses = [
    { id: "network-engineer", title: "软考 · 网络工程师" },
    { id: "sichuan-upgrading-computer", title: "四川专升本 · 计算机" },
  ];
  const courseControl = $("#course");
  const originalOptions = courseControl.innerHTML;
  let previousCourse = courseControl.value;
  let onPage = false,
    catalog = null,
    request = 0,
    chapter = "",
    query = "",
    favoritesOnly = false;
  let saving = true;
  const cache = new Map();
  let firstCourseLoad = true;
  let deepLinkOpened = false;
  let pendingNode = null,
    pendingQuestion = null,
    pendingChapter = null;
  const defaultNode = "network-engineer:04.01.02";
  const button = (action, label, className = "ai-button", extra = "") =>
    '<button type="button" class="' +
    className +
    '" data-ai-action="' +
    action +
    '" ' +
    extra +
    ">" +
    label +
    "</button>";

  function data() {
    const state = flow.state();
    if (!state.aiStudyDemo || state.aiStudyDemo.version !== 1)
      state.aiStudyDemo = {
        version: 1,
        course: courses[0].id,
        last: {},
        progress: {},
        favorites: [],
      };
    return state.aiStudyDemo;
  }
  function save() {
    flow.save();
    // The shared saver also reports storage failures; never imply a failed write was saved.
    saving = !$("#study-save-note").classList.contains("save-error");
    const status = $("#ai-save-status");
    if (status)
      status.textContent = saving
        ? "学习进度保存在当前浏览器"
        : "未能保存，请检查浏览器存储权限";
  }
  const selected = () =>
    catalog?.lessons.find((n) => n.id === data().last[catalog.course.id]);
  const interactiveMeta = (node) =>
    window.AceTutorCatalog?.knowledgePoints.find(
      (item) => item.nodeId === node.id,
    );
  function renderTutorEntry(node, tab) {
    const banner = root.querySelector(".ai-tutor-banner");
    const meta = interactiveMeta(node);
    const available = meta && ["ready", "partial"].includes(meta.status);
    banner.hidden = tab !== "lesson";
    if (banner.hidden) return;
    const view = available
      ? flow.state().tutorDemo?.snapshots?.[meta.courseId]
      : null;
    const current =
      view?.course?.version ===
      window.AceTutorCatalog?.courses.find(
        (course) => course.id === meta?.courseId,
      )?.version
        ? view
        : null;
    const label =
      current?.phase === "complete"
        ? "回顾互动精讲"
        : current
          ? "继续互动精讲"
          : "开始互动精讲";
    banner.innerHTML =
      icon("sparkles") +
      "<div><strong>" +
      safe(
        available
          ? meta.status === "partial"
            ? "VLAN 广播域 · 互动示范课"
            : node.name + " · 互动精讲"
          : "网络工程师 · VLAN 互动示范课",
      ) +
      "</strong><p>" +
      (available
        ? "讲一个概念，做一道小测；答错后针对补课，再用变式验证。"
        : "本节提供分段精讲与巩固练习，互动教学可先体验 VLAN 广播域。") +
      '</p></div><button type="button" class="ai-button" ' +
      (available ? 'data-ai-tab="tutor"' : 'data-tutor-action="pilot"') +
      ">" +
      (available ? label : "体验互动精讲") +
      " " +
      icon("arrow") +
      "</button>";
  }
  function progress(node = selected()) {
    if (!node) return null;
    const store = data().progress;
    if (!store[node.id] || store[node.id].version !== node.version)
      store[node.id] = {
        version: node.version,
        learnedAt: null,
        index: 0,
        tab: "lesson",
        drafts: {},
        results: {},
        skipped: {},
      };
    const p = store[node.id];
    p.readStep = Math.max(
      0,
      Math.min(node.lesson.points.length, Number(p.readStep) || 0),
    );
    p.index = Math.max(
      0,
      Math.min(node.questions.length - 1, Number(p.index) || 0),
    );
    return p;
  }
  function membership() {
    const a = flow.state().memberDemo?.active;
    return a && a.expiresAt > Date.now() ? a : null;
  }
  function renderMember() {
    const mount = $("#ai-membership");
    if (!mount) return;
    const a = membership();
    const tier = { basic: "基础 VIP", plus: "进阶 VIP", pro: "尊享 VIP" };
    mount.innerHTML = a
      ? button(
          "quota",
          icon("crown") + safe(tier[a.planId] || "VIP 会员"),
          "ai-member-tag " + safe(a.planId),
        ) +
        button(
          "quota",
          "本周期剩余 <strong>" +
            Math.max(0, a.quota - a.used) +
            "</strong> / " +
            a.quota +
            " 次 <span>额度详情 " +
            icon("chevron") +
            "</span>",
          "ai-quota",
        )
      : '<span class="ai-preview-tag">' +
        icon("book") +
        "精讲内容预览</span>" +
        button("membership", icon("crown") + "了解 VIP", "ai-button");
  }
  function skeleton() {
    root.innerHTML = `<div class="page-heading ai-heading"><div><h1>AI 精讲</h1><p>拆开讲清楚，练到真正理解。</p></div><div id="ai-membership" class="ai-membership"></div></div>
      <aside class="ai-tutor-banner">${icon("sparkles")}<div><strong>VLAN 广播域 · 互动示范课</strong><p>分步讲解、广播图解、理解小测与错因补课</p></div><button type="button" class="ai-button" data-tutor-action="pilot">体验互动精讲 ${icon("arrow")}</button></aside>
      <div class="ai-workspace">
        <aside class="ai-directory ai-panel" aria-label="章节与知识点目录">
          <div class="ai-directory-title"><h2>${icon("chapter")}章节目录</h2><button type="button" class="ai-chapter-gallery-link" id="ai-directory-gallery" data-chapter-gallery>全部图标 ${icon("chevron")}</button></div>
          <div class="ai-chapter-picker"><button type="button" id="ai-chapter-toggle" class="cv-trigger" aria-expanded="false" aria-controls="ai-chapter-options"><span id="ai-chapter-current-art"></span><span class="ai-chapter-choice-copy"><strong id="ai-chapter-current-name"></strong><small id="ai-chapter-current-count"></small></span>${icon("down")}</button><div id="ai-chapter-options" role="group" aria-label="选择章节" hidden></div></div>
          <div class="ai-directory-progress"><div class="ai-progress-track"><span id="ai-progress-bar"></span></div><strong id="ai-progress-percent">0%</strong></div>
          <p id="ai-progress-caption" class="ai-muted"></p>
          <label class="ai-search" for="ai-node-search">${icon("search")}<input id="ai-node-search" type="search" placeholder="搜索本章知识点" autocomplete="off"></label>
          <div class="ai-directory-tools"><span id="ai-node-count"></span><button type="button" id="ai-favorite-filter" aria-pressed="false">${icon("star")}只看收藏</button></div>
          <nav id="ai-node-list" aria-label="知识点列表"></nav>
          <footer>${icon("save")}<span id="ai-save-status">学习进度保存在当前浏览器</span></footer>
        </aside>
        <article class="ai-content ai-panel" aria-labelledby="ai-lesson-title">
          <header class="ai-content-header"><div class="ai-title-with-art"><button type="button" class="ai-header-art cv-trigger" id="ai-header-art" data-chapter-gallery aria-label="查看章节图标" hidden></button><div><p id="ai-breadcrumb" class="ai-muted"></p><h2 id="ai-lesson-title"></h2><p id="ai-unit-caption" class="ai-muted" hidden></p></div></div>
            <div class="ai-header-actions"><button type="button" id="ai-favorite" class="ai-button" data-ai-action="favorite" aria-pressed="false">${icon("star")}收藏</button>${button("teacher", icon("sparkles") + "问 AI 老师", "ai-button ai-accent")}</div></header>
          <div class="ai-tabs" role="tablist" aria-label="学习与练习">
            <button type="button" id="ai-tab-tutor" role="tab" aria-controls="ai-study-body" data-ai-tab="tutor" hidden>${icon("sparkles")}互动精讲</button>
            <button type="button" id="ai-tab-lesson" role="tab" aria-controls="ai-study-body" data-ai-tab="lesson">${icon("book")}精讲学习</button>
            <button type="button" id="ai-tab-practice" role="tab" aria-controls="ai-study-body" data-ai-tab="practice">${icon("pie")}巩固练习<span id="ai-question-total"></span></button>
          </div>
          <div id="ai-study-body" class="ai-study-body" role="tabpanel" tabindex="-1"></div>
        </article>
      </div><p class="ai-demo-note">Web 交互预览 · 内容来自已审核课程；互动精讲使用独立的本地演示记录，正式 AI 暂未连接。</p>`;
    renderMember();
  }
  function loading() {
    root.innerHTML =
      '<div class="page-heading"><div><h1>AI 精讲</h1><p>一次学透一个知识点，再用练习检验掌握。</p></div></div><div class="ai-loading ai-panel" role="status">' +
      icon("book") +
      "<strong>正在整理章节与知识点…</strong><p>把重点拆开，一节一节学明白。</p></div>";
  }
  async function loadCourse(id) {
    window.AceTutorDemo?.pause();
    const token = ++request;
    const course = courses.find((c) => c.id === id) || courses[0];
    if (pendingChapter && pendingChapter.courseId !== course.id)
      pendingChapter = null;
    data().course = course.id;
    courseControl.value = course.title;
    loading();
    try {
      if (!cache.has(course.id)) {
        cache.set(
          course.id,
          fetch("./ai-content-" + course.id + ".json?v=settings-19", {
            cache: "no-cache",
          })
            .then((r) => {
              if (!r.ok) throw new Error("课程读取失败");
              return r.json();
            })
            .then((c) => {
              if (
                c.schemaVersion !== 1 ||
                !c.lessons?.length ||
                c.course?.id !== course.id
              )
                throw new Error("课程目录无效");
              return c;
            })
            .catch((e) => {
              cache.delete(course.id);
              throw e;
            }),
        );
      }
      const next = await cache.get(course.id);
      if (token !== request || !onPage) return;
      catalog = next;
      if (
        firstCourseLoad &&
        window.AceDemoSettings?.rememberPosition() === false
      )
        data().last[course.id] = catalog.lessons[0].id;
      firstCourseLoad = false;
      if (!catalog.lessons.some((n) => n.id === data().last[course.id]))
        data().last[course.id] =
          catalog.lessons.find((n) => n.id === defaultNode)?.id ||
          catalog.lessons[0].id;
      if (pendingNode?.courseId === course.id) {
        const target = catalog.lessons.find((n) => n.id === pendingNode.nodeId);
        if (target) {
          data().last[course.id] = target.id;
          progress(target).tab = pendingNode.tab;
        }
        pendingNode = null;
      }
      if (pendingQuestion) {
        const target = relatedLesson(pendingQuestion);
        if (target) {
          data().last[course.id] = target.id;
          progress(target).tab = window.AceTutorDemo?.isPilot(target)
            ? "tutor"
            : "lesson";
        }
        pendingQuestion = null;
      }
      if (pendingChapter?.courseId === course.id) {
        const target = catalog.lessons.find(
          (n) => n.chapter === pendingChapter.title,
        );
        if (target) {
          data().last[course.id] = target.id;
          progress(target).tab = "lesson";
        }
        pendingChapter = null;
      }
      chapter = selected().chapter;
      query = "";
      favoritesOnly = false;
      skeleton();
      renderDirectory();
      renderContent();
      save();
    } catch (error) {
      if (token !== request || !onPage) return;
      catalog = null;
      root.innerHTML =
        '<div class="ai-loading ai-panel" role="alert"><h1>精讲内容暂时没有加载成功</h1><p>检查本地预览连接后，可以再试一次。</p>' +
        button("reload", "重新加载", "ai-button ai-primary") +
        "</div>";
    }
  }
  function filteredNodes() {
    return catalog.lessons.filter(
      (n) =>
        (chapter === "all" || n.chapter === chapter) &&
        (!favoritesOnly || data().favorites.includes(n.id)) &&
        (!query ||
          [n.name, n.parent, n.section, n.chapter, n.lesson.title]
            .join(" ")
            .toLowerCase()
            .includes(query.toLowerCase())),
    );
  }
  function renderDirectory() {
    if (!catalog) return;
    renderChapterPicker();
    const artTitle = chapter === "all" ? selected()?.chapter : chapter;
    const directoryArt = $("#ai-directory-gallery");
    directoryArt.dataset.chapterGallery = catalog.course.id;
    directoryArt.dataset.chapterTitle = artTitle || "";
    directoryArt.setAttribute(
      "aria-label",
      "查看" + (artTitle || "当前证书") + "章节图标与动效",
    );
    const scope = catalog.lessons.filter(
      (n) => chapter === "all" || n.chapter === chapter,
    );
    const learned = scope.filter(
      (n) =>
        data().progress[n.id]?.version === n.version &&
        data().progress[n.id]?.learnedAt,
    ).length;
    const percent = Math.round((learned / scope.length) * 100);
    $("#ai-progress-bar").style.width = percent + "%";
    $("#ai-progress-percent").textContent = percent + "%";
    $("#ai-progress-caption").textContent =
      "已学 " +
      learned +
      " / " +
      scope.length +
      " 节 · 全课程 " +
      catalog.lessons.length +
      " 节";
    $("#ai-favorite-filter").setAttribute(
      "aria-pressed",
      String(favoritesOnly),
    );
    const nodes = filteredNodes();
    $("#ai-node-count").textContent =
      query || favoritesOnly
        ? "找到 " + nodes.length + " 个小节"
        : scope.length + " 个独立小节";
    let group = "",
      parent = "";
    $("#ai-node-list").innerHTML = nodes.length
      ? nodes
          .map((n) => {
            let heading = "";
            const groupName = n.chapter + "/" + n.section;
            if (group !== groupName) {
              heading +=
                '<h3 class="ai-group-title">' +
                (chapter === "all" ? safe(n.chapter) + " / " : "") +
                safe(n.section) +
                "</h3>";
              group = groupName;
              parent = "";
            }
            if (n.unit && n.parent !== parent) {
              heading +=
                '<p class="ai-parent-title">' +
                safe(n.parent) +
                " <span>" +
                n.unit.total +
                " 小节</span></p>";
              parent = n.parent;
            } else if (!n.unit) parent = "";
            const savedProgress = data().progress[n.id];
            const p =
              savedProgress?.version === n.version ? savedProgress : null;
            const answered = Object.keys(p?.results || {}).length;
            const current = n.id === selected().id;
            const learnedNode = p?.version === n.version && p.learnedAt;
            let status = learnedNode ? "已学习" : current ? "正在学习" : "";
            if (answered)
              status = "已练 " + answered + " / " + n.questions.length + " 题";
            const num =
              catalog.lessons
                .filter((item) => item.chapter === n.chapter)
                .findIndex((item) => item.id === n.id) + 1;
            return (
              heading +
              '<button type="button" class="ai-node' +
              (current ? " is-current" : "") +
              '" data-ai-node="' +
              safe(n.id) +
              '"' +
              (current ? ' aria-current="true"' : "") +
              '><span class="ai-node-number' +
              (learnedNode ? " is-learned" : "") +
              '">' +
              (learnedNode ? icon("check") : num) +
              '</span><span class="ai-node-copy"><strong>' +
              safe(n.name) +
              '</strong><span class="ai-course-format" data-course-format="' +
              safe(interactiveMeta(n)?.status || "pending") +
              '">' +
              (interactiveMeta(n)?.status === "ready"
                ? "互动精讲"
                : interactiveMeta(n)?.status === "partial"
                  ? "互动示范课"
                  : "分段精讲") +
              "</span>" +
              (status
                ? '<small class="' +
                  (learnedNode ? "ai-green" : "") +
                  '">' +
                  status +
                  "</small>"
                : "") +
              "</span>" +
              (data().favorites.includes(n.id)
                ? '<span class="ai-node-star" aria-label="已收藏">' +
                  icon("star") +
                  "</span>"
                : "") +
              "</button>"
            );
          })
          .join("")
      : '<div class="ai-empty"><p>没有匹配的知识点</p>' +
        button("clear-filter", "查看全部小节", "ai-text-button") +
        "</div>";
  }
  function renderChapterPicker() {
    const all = chapter === "all";
    const name = all ? "全部章节" : chapter;
    const count = catalog.lessons.filter(
      (n) => all || n.chapter === chapter,
    ).length;
    $("#ai-chapter-current-art").innerHTML = all
      ? icon("book")
      : window.AceChapterVisuals?.render(catalog.course.id, chapter) ||
        icon("book");
    $("#ai-chapter-current-name").textContent = name;
    $("#ai-chapter-current-count").textContent =
      `${count} 个知识小节 · 切换章节`;
    $("#ai-chapter-toggle").setAttribute("aria-label", `选择章节，当前${name}`);
    $("#ai-chapter-options").innerHTML = [
      { name: "全部章节", value: "all", count: catalog.lessons.length },
      ...catalog.chapters.map((c) => ({
        name: c.name,
        value: c.name,
        count: catalog.lessons.filter((n) => n.chapter === c.name).length,
      })),
    ]
      .map(
        (c) =>
          `<button type="button" class="ai-chapter-choice cv-trigger" data-ai-chapter="${safe(c.value)}" aria-pressed="${chapter === c.value}"><span class="ai-chapter-choice-art">${c.value === "all" ? icon("book") : window.AceChapterVisuals?.render(catalog.course.id, c.name) || icon("book")}</span><span class="ai-chapter-choice-copy"><strong>${safe(c.name)}</strong><small>${c.count} 个知识小节</small></span><span class="ai-chapter-choice-check">${chapter === c.value ? icon("check") : ""}</span></button>`,
      )
      .join("");
  }
  function chapterPicker(open, focus = false) {
    const toggle = $("#ai-chapter-toggle");
    const options = $("#ai-chapter-options");
    if (!toggle || !options) return;
    toggle.setAttribute("aria-expanded", String(open));
    options.hidden = !open;
    if (open) {
      const rect = toggle.getBoundingClientRect();
      const top = Math.max(
        0,
        $(".topbar")?.getBoundingClientRect().bottom || 0,
      );
      const nav = $(".mobile-nav")?.getBoundingClientRect();
      const bottom = nav?.height ? Math.min(innerHeight, nav.top) : innerHeight;
      const below = Math.max(0, bottom - rect.bottom - 14);
      const above = Math.max(0, rect.top - top - 14);
      const upwards = below < 200 && above > below;
      options.dataset.placement = upwards ? "above" : "below";
      options.style.maxHeight = `${Math.max(44, Math.min(410, upwards ? above : below))}px`;
    }
    if (focus) {
      (open ? options.querySelector('[aria-pressed="true"]') : toggle)?.focus({
        preventScroll: true,
      });
    }
  }
  function selectChapter(value) {
    if (
      !catalog ||
      (value !== "all" && !catalog.chapters.some((c) => c.name === value))
    )
      return;
    chapter = value;
    query = "";
    $("#ai-node-search").value = "";
    chapterPicker(false);
    if (chapter !== "all" && selected().chapter !== chapter) {
      const first = catalog.lessons.find((n) => n.chapter === chapter);
      data().last[catalog.course.id] = first.id;
      progress(first);
      renderContent();
      save();
    }
    renderDirectory();
  }
  function renderContent() {
    const n = selected();
    if (!n) return;
    const p = progress(n);
    const headerArt = $("#ai-header-art");
    headerArt.innerHTML =
      window.AceChapterVisuals?.render(catalog.course.id, n.chapter) || "";
    headerArt.hidden = !headerArt.innerHTML;
    headerArt.dataset.chapterGallery = catalog.course.id;
    headerArt.dataset.chapterTitle = n.chapter;
    headerArt.setAttribute("aria-label", "查看" + n.chapter + "章节图标与动效");
    const pilot = window.AceTutorDemo?.isPilot(n);
    if (p.tab === "tutor" && !pilot) p.tab = "lesson";
    document.body.dataset.aiMode = p.tab;
    renderTutorEntry(n, p.tab);
    $("#ai-tab-tutor").hidden = !pilot;
    $("#ai-breadcrumb").textContent = n.chapter + " / " + n.section;
    $("#ai-lesson-title").textContent =
      p.tab === "tutor" && n.id === window.AceTutorDemo?.pilotNode
        ? "VLAN 广播域"
        : n.name;
    $("#ai-unit-caption").hidden = !n.unit;
    $("#ai-unit-caption").textContent = n.unit
      ? n.parent + " · 第 " + n.unit.order + " / " + n.unit.total + " 小节"
      : "";
    $("#ai-question-total").textContent = n.questions.length + " 题";
    const favorited = data().favorites.includes(n.id);
    $("#ai-favorite").setAttribute("aria-pressed", String(favorited));
    $("#ai-favorite").innerHTML =
      icon("star") + (favorited ? "已收藏" : "收藏");
    ["tutor", "lesson", "practice"].forEach((tab) => {
      const active =
        p.tab === tab || (p.tab === "report" && tab === "practice");
      const el = $("#ai-tab-" + tab);
      el.setAttribute("aria-selected", String(active));
      el.tabIndex = active ? 0 : -1;
    });
    const body = $("#ai-study-body");
    body.setAttribute(
      "aria-labelledby",
      "ai-tab-" +
        (p.tab === "tutor"
          ? "tutor"
          : p.tab === "lesson"
            ? "lesson"
            : "practice"),
    );
    body.className = "ai-study-body ai-view-" + p.tab;
    if (p.tab === "tutor") {
      window.AceTutorDemo.mount(n, body);
      return;
    }
    window.AceTutorDemo?.pause();
    if (p.tab === "practice") renderPractice();
    else if (p.tab === "report") renderReport();
    else renderLesson();
  }
  const sentences = (text) =>
    text
      .split(/(?<=[。；！？])\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  function highlight(text) {
    return safe(text).replace(
      /(管理距离|度量值|浮动静态路由|二进制|十六进制|补码|IP 地址|子网掩码|主键|外键)/g,
      "<strong>$1</strong>",
    );
  }
  function pointBlock(text, i, n) {
    let title = "关键点 " + (i + 1),
      body = text,
      detail = "";
    if (n.id === defaultNode) {
      title = ["跨来源选路", "同一协议内", "浮动静态路由"][i] || title;
      body =
        [
          "先比较管理距离，数值越小越优先。",
          "再比较度量值，通常越小越优先。",
          "备用静态路由使用更大的管理距离。",
        ][i] || text;
      detail =
        '<details class="ai-point-detail"><summary>展开说明</summary>' +
        sentences(text)
          .map((s) => "<p>" + highlight(s) + "</p>")
          .join("") +
        "</details>";
    } else {
      const colon = text.search(/[：:]/);
      if (colon > 0 && colon <= 22) {
        title = text.slice(0, colon);
        body = text.slice(colon + 1);
      }
    }
    return (
      '<section class="ai-key-point"><span class="ai-key-number">' +
      (i + 1) +
      "</span><div><h4>" +
      safe(title) +
      "</h4>" +
      sentences(body)
        .map((s) => "<p>" + highlight(s) + "</p>")
        .join("") +
      detail +
      "</div></section>"
    );
  }
  function renderLesson() {
    const n = selected(),
      p = progress(),
      l = n.lesson;
    const step = p.readStep,
      total = l.points.length + 1,
      final = step === l.points.length;
    const lead = n.id === defaultNode ? "先看管理距离，再比度量值" : l.title;
    const summary =
      n.id === defaultNode
        ? "不同来源先比较管理距离，同一协议的多条路径再比较度量值。"
        : l.summary;
    const example =
      n.id === defaultNode
        ? "主路由有效时：备用静态路由的管理距离更大，路由器优先选择主路由。主路由失效后：备用路由才可能被选为活动路由。"
        : l.example;
    const pitfall =
      n.id === defaultNode
        ? "跨来源先看管理距离，不能把不同协议的度量值直接比较。VRRP 的主备优先级属于另一个知识点。"
        : l.pitfall;
    $("#ai-study-body").innerHTML =
      '<div class="ai-reading-progress"><span>第 ' +
      (step + 1) +
      " / " +
      total +
      ' 段</span><div aria-hidden="true">' +
      Array.from(
        { length: total },
        (_, i) => '<i class="' + (i <= step ? "is-read" : "") + '"></i>',
      ).join("") +
      '</div></div><section class="ai-lesson-intro"><span class="ai-section-label">' +
      (final ? "用例子巩固" : "这一段，只抓住一个要点") +
      '</span><h3 id="ai-reading-title" tabindex="-1">' +
      safe(lead) +
      '</h3><div class="ai-lesson-summary">' +
      sentences(summary)
        .map((s) => "<p>" + highlight(s) + "</p>")
        .join("") +
      "</div></section>" +
      (!final
        ? '<section class="ai-reading-step"><div class="ai-key-grid">' +
          pointBlock(l.points[step], step, n) +
          '</div><p class="ai-reading-note">看明白这一段，再继续。下一段会在你点击后展开。</p></section>'
        : "") +
      (final
        ? '<section class="ai-example" aria-labelledby="ai-example-heading"><h3 id="ai-example-heading">' +
          icon("book") +
          "用一个例子串起来</h3><ol>" +
          sentences(example)
            .map(
              (s, i) =>
                "<li><span>" +
                String(i + 1).padStart(2, "0") +
                "</span><p>" +
                highlight(s) +
                "</p></li>",
            )
            .join("") +
          "</ol></section>" +
          '<aside class="ai-pitfall"><span class="ai-warning-icon">' +
          icon("info") +
          "</span><div><h3>容易混淆的地方</h3>" +
          sentences(pitfall)
            .map((s) => "<p>" + highlight(s) + "</p>")
            .join("") +
          "</div></aside>"
        : "") +
      '<footer class="ai-learning-footer"><div class="ai-footer-buttons">' +
      (step > 0 ? button("read-previous", "上一段") : "") +
      button(
        final ? "learn-practice" : "read-next",
        (final
          ? p.learnedAt
            ? "再练一次，检查掌握"
            : "我学完了，开始练习"
          : "看下一段") + icon("arrow"),
        "ai-button ai-primary",
      ) +
      button(
        final ? "next-node" : "learn-practice",
        (final ? "下一个知识点" : "先做巩固练习") + icon("chevron"),
      ) +
      '</div><span class="ai-muted">' +
      icon("time") +
      "约 4 分钟 · " +
      n.questions.length +
      " 道分层练习</span></footer>" +
      (flow.state().tutorDemo?.origin
        ? '<div class="ai-origin-return"><button class="ai-text-button" data-tutor-action="return-question">' +
          icon("arrow") +
          "返回刚才的题目</button></div>"
        : "");
  }
  function resultStats(n = selected()) {
    const p = progress(n),
      results = Object.values(p.results);
    return {
      answered: results.length,
      confirmed: results
        .flatMap((r) => r.verdicts)
        .filter((v) => v === "correct").length,
      pending: results.flatMap((r) => r.verdicts).filter((v) => v === "pending")
        .length,
      total: n.questions.reduce((sum, q) => sum + q.blanks.length, 0),
      skipped: Object.keys(p.skipped).filter((id) => !p.results[id]).length,
    };
  }
  function stem(q) {
    return safe(q.stem).replace(/\{\{(b[1-3])\}\}/g, (token, id) => {
      const i = q.blanks.findIndex((b) => b.id === id);
      return button(
        "focus-blank",
        "第 " + (i + 1) + " 空",
        "ai-inline-blank",
        'data-blank="' + id + '"',
      );
    });
  }
  function renderPractice() {
    const n = selected(),
      p = progress(),
      q = n.questions[p.index],
      result = p.results[q.id];
    const stats = resultStats();
    const draft = p.drafts[q.id] || {};
    $("#ai-study-body").innerHTML =
      '<div class="ai-practice-meta"><span class="ai-stage">' +
      safe(q.stage) +
      "练习</span><span>填空题 · " +
      q.blanks.length +
      " 空</span><span>已提交 <strong>" +
      stats.answered +
      " / " +
      n.questions.length +
      '</strong></span></div><div class="ai-question-position"><h3>第 ' +
      (p.index + 1) +
      " / " +
      n.questions.length +
      " 题</h3>" +
      button("report", icon("pie") + "练习概览", "ai-text-button") +
      '</div><nav class="ai-question-nav" aria-label="本节题目">' +
      n.questions
        .map((item, i) => {
          const r = p.results[item.id];
          const state = r
            ? r.verdicts.every((v) => v === "correct")
              ? "correct"
              : "pending"
            : p.skipped[item.id]
              ? "skipped"
              : "unanswered";
          return (
            '<button type="button" class="ai-question-number is-' +
            state +
            (i === p.index ? " is-active" : "") +
            '" data-ai-index="' +
            i +
            '" aria-label="第 ' +
            (i + 1) +
            " 题，" +
            {
              correct: "已确认正确",
              pending: "待复核",
              skipped: "已跳过",
              unanswered: "未答",
            }[state] +
            '"' +
            (i === p.index ? ' aria-current="step"' : "") +
            ">" +
            (i + 1) +
            "</button>"
          );
        })
        .join("") +
      '</nav><form id="ai-practice-form" novalidate><h3 class="ai-question-stem">' +
      stem(q) +
      '</h3><div class="ai-blank-fields">' +
      q.blanks
        .map(
          (blank, i) =>
            '<div class="ai-blank-field"><label for="ai-blank-' +
            blank.id +
            '"><span class="ai-field-number">' +
            (i + 1) +
            "</span>第 " +
            (i + 1) +
            " 空 · " +
            safe(blank.label) +
            '</label><input id="ai-blank-' +
            blank.id +
            '" name="' +
            blank.id +
            '" data-ai-blank="' +
            blank.id +
            '" value="' +
            safe(result?.answers[blank.id] ?? draft[blank.id] ?? "") +
            '" placeholder="请输入第 ' +
            (i + 1) +
            ' 空的答案" maxlength="160" autocomplete="off" aria-describedby="ai-error-' +
            blank.id +
            '"' +
            (result ? " readonly" : "") +
            '><p id="ai-error-' +
            blank.id +
            '" class="ai-field-error" hidden></p></div>',
        )
        .join("") +
      '</div><div id="ai-blank-results" tabindex="-1" ' +
      (result ? "" : "hidden") +
      ">" +
      (result ? resultHTML(q, result) : "") +
      '</div><div class="ai-recall">' +
      icon("book") +
      "<span>不确定？先回看这一节的精讲。</span>" +
      button("recall", "回看精讲" + icon("arrow"), "ai-text-button") +
      '</div><footer class="ai-practice-footer">' +
      button(
        "previous",
        "← 上一题",
        "ai-button",
        p.index === 0 ? "disabled" : "",
      ) +
      '<div class="ai-footer-buttons">' +
      (result
        ? button("retry", "重新作答", "ai-text-button") +
          button(
            "next-question",
            (p.index === n.questions.length - 1 ? "查看本节报告" : "下一题") +
              icon("arrow"),
            "ai-button ai-primary",
          )
        : button("skip", "跳过此题", "ai-text-button") +
          '<button type="submit" class="ai-button ai-primary">提交答案' +
          icon("check") +
          "</button>") +
      '</div></footer><div class="ai-practice-hint">' +
      icon("keyboard") +
      "Enter 提交答案<span>" +
      icon("save") +
      "作答草稿自动保存</span></div></form>" +
      '<p class="ai-grading-note">完全一致的答案直接得分；不同写法显示待复核，本地预览暂不调用 AI 判分。</p>';
  }
  function resultHTML(q, result) {
    if (
      window.AceDemoSettings?.prefs().showAnalysis === false &&
      !progress().openedAnswers?.[q.id]
    )
      return (
        '<section class="study-analysis-collapsed"><span>已提交 · ' +
        result.verdicts.filter((v) => v === "correct").length +
        " / " +
        q.blanks.length +
        " 空已确认正确</span>" +
        button("reveal", "查看逐空答案与解析", "ai-text-button") +
        "</section>"
      );

    return (
      '<div class="ai-result-heading"><h4>逐空结果与解析</h4><span>' +
      result.verdicts.filter((v) => v === "correct").length +
      " / " +
      q.blanks.length +
      ' 空已确认正确</span></div><div class="ai-result-grid">' +
      q.blanks
        .map((b, i) => {
          const correct = result.verdicts[i] === "correct";
          return (
            '<section class="ai-blank-result ' +
            (correct ? "correct" : "pending") +
            '"><h5>第 ' +
            (i + 1) +
            " 空 " +
            icon(correct ? "check" : "time") +
            "<span>" +
            (correct ? "完全一致 · 1 分" : "待语义复核") +
            "</span></h5><dl><div><dt>你的答案</dt><dd>" +
            safe(result.answers[b.id]) +
            "</dd></div><div><dt>参考答案</dt><dd>" +
            safe(b.answer) +
            "</dd></div></dl><p>" +
            (correct
              ? "与预留答案完全一致，已直接得分。"
              : "这份演示暂不进行语义复核；不同写法不会直接判错。") +
            "</p></section>"
          );
        })
        .join("") +
      '</div><section class="ai-answer-explanation"><h4>为什么这样填</h4>' +
      sentences(q.explanation)
        .map((s) => "<p>" + highlight(s) + "</p>")
        .join("") +
      "</section>"
    );
  }
  function submit() {
    const n = selected(),
      p = progress(),
      q = n.questions[p.index];
    if (p.results[q.id]) return;
    const answers = {},
      missing = [];
    q.blanks.forEach((b) => {
      const el = $("#ai-blank-" + b.id),
        error = $("#ai-error-" + b.id);
      answers[b.id] = el.value;
      error.hidden = !!el.value.trim();
      error.textContent = "请填写这一空，再提交答案";
      el.setAttribute("aria-invalid", String(!el.value.trim()));
      if (!el.value.trim()) missing.push(el);
    });
    p.drafts[q.id] = answers;
    if (missing.length) {
      save();
      missing[0].focus();
      return;
    }
    p.results[q.id] = {
      answers,
      verdicts: q.blanks.map((b) =>
        answers[b.id] === b.answer ? "correct" : "pending",
      ),
      submittedAt: Date.now(),
    };
    delete p.skipped[q.id];
    save();
    renderDirectory();
    renderContent();
    $("#ai-blank-results").focus({ preventScroll: true });
    const answeredIndex = p.index,
      nodeId = n.id;
    window.AceDemoSettings?.queueNext(
      $("#ai-study-body"),
      () => {
        if (answeredIndex === n.questions.length - 1) setTab("report");
        else questionAt(answeredIndex + 1);
      },
      () =>
        document.body.dataset.page === "ai" &&
        !dialog.open &&
        selected()?.id === nodeId &&
        progress().index === answeredIndex &&
        progress().tab === "practice",
    );
  }
  function renderReport() {
    const n = selected(),
      p = progress(),
      stats = resultStats();
    $("#ai-study-body").innerHTML =
      '<section class="ai-report"><span class="ai-report-icon">' +
      icon("check") +
      "</span><h3>把学到的，再确认一遍</h3><p>" +
      safe(n.name) +
      '</p><div class="ai-report-stats"><div><strong>' +
      stats.answered +
      " / " +
      n.questions.length +
      '</strong><span>题已提交</span></div><div><strong class="ai-green">' +
      stats.confirmed +
      '</strong><span>空已确认正确</span></div><div><strong class="ai-amber">' +
      stats.pending +
      '</strong><span>空待复核</span></div></div><p class="ai-muted">跳过 ' +
      stats.skipped +
      " 题 · 尚未提交 " +
      (n.questions.length - stats.answered) +
      ' 题。待复核内容不计为答错。</p></section><div class="ai-report-list">' +
      n.questions
        .map((q, i) => {
          const r = p.results[q.id],
            exact = r && r.verdicts.every((v) => v === "correct");
          return (
            '<button type="button" data-ai-index="' +
            i +
            '"><span>第 ' +
            (i + 1) +
            ' 题</span><span class="' +
            (exact ? "ai-green" : r ? "ai-amber" : "ai-muted") +
            '">' +
            (r
              ? exact
                ? "各空完全一致"
                : "有不同写法，待复核"
              : p.skipped[q.id]
                ? "已跳过，可补答"
                : "尚未作答") +
            "</span>" +
            icon("chevron") +
            "</button>"
          );
        })
        .join("") +
      '</div><footer class="ai-learning-footer"><div class="ai-footer-buttons">' +
      button("practice-tab", "继续本节练习", "ai-button ai-primary") +
      button("next-node", "下一个知识点" + icon("arrow")) +
      "</div>" +
      button("recall", "回看精讲", "ai-text-button") +
      "</footer>";
  }
  function selectNode(id) {
    const n = catalog?.lessons.find((node) => node.id === id);
    if (!n) return;
    data().last[catalog.course.id] = n.id;
    progress(n);
    renderDirectory();
    renderContent();
    save();
    $("#ai-study-body").focus({ preventScroll: true });
  }
  function nextNode() {
    const i = catalog.lessons.findIndex((n) => n.id === selected().id);
    const next = catalog.lessons[i + 1];
    if (!next) {
      toast("已经是本课程最后一个知识点，可以从目录回顾。");
      return;
    }
    chapter = next.chapter;
    query = "";
    favoritesOnly = false;
    $("#ai-node-search").value = "";
    selectNode(next.id);
    $("#ai-node-list")
      .querySelector('[aria-current="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }
  function setTab(tab, focus = false) {
    if (tab === "tutor" && !window.AceTutorDemo?.isPilot(selected())) return;
    progress().tab = tab;
    save();
    renderDirectory();
    renderContent();
    if (focus) $("#ai-tab-" + tab)?.focus({ preventScroll: true });
  }
  function questionAt(index) {
    const p = progress();
    p.index = Math.max(0, Math.min(selected().questions.length - 1, index));
    p.tab = "practice";
    save();
    renderContent();
    $("#ai-study-body").focus({ preventScroll: true });
  }
  function quotaDialog() {
    renderMember();
    const a = membership();
    if (!a) {
      actions.vip();
      return;
    }
    showDialog(
      "本周期学习额度",
      '<div class="ai-quota-detail"><strong>' +
        Math.max(0, a.quota - a.used) +
        " <small>/ " +
        a.quota +
        " 次</small></strong><p>已使用 " +
        a.used +
        " 次 · 有效期至 " +
        new Date(a.expiresAt).toLocaleDateString("zh-CN") +
        '</p></div><p class="dialog-lead">已有精讲的浏览、目录切换和逐空练习不扣额度。主动获取一条老师示例回答，使用 1 次演示额度。</p><p class="ai-demo-note">这是当前浏览器内的会员体验，不关联正式账号。</p>' +
        button("membership", "查看 VIP 会员", "ai-button ai-primary"),
      "本地会员体验",
    );
  }
  let teacher = null;
  function openTeacher() {
    renderMember();
    const a = membership();
    if (!a || a.used >= a.quota) {
      showDialog(
        a ? "本周期演示额度已用完" : "开通 VIP，体验 AI 老师",
        '<p class="dialog-lead">' +
          (a
            ? "可以前往会员页面查看或更新演示额度。"
            : "精讲内容与巩固练习可以继续浏览，老师问答需有效演示会员。") +
          "</p>" +
          button("membership", "查看 VIP 会员", "ai-button ai-primary"),
        "AI 老师",
      );
      return;
    }
    const n = selected();
    teacher = { node: n, answered: new Map(), messages: [] };
    showDialog(
      "把这个知识点问明白",
      '<p class="ai-teacher-context">' +
        safe(n.name) +
        '</p><p class="ai-muted">选择一个问题，看拆开的讲解。每条新示例回答使用 1 次演示额度。</p><div class="ai-teacher-prompts">' +
        ["重点怎么记？", "举个文字例子", "哪里容易混淆？"]
          .map((label, i) =>
            button(
              "teacher-preset",
              label,
              "ai-button",
              'data-preset="' + i + '"',
            ),
          )
          .join("") +
        '</div><div id="ai-teacher-messages" class="ai-teacher-messages" aria-live="polite"><p class="ai-teacher-welcome">' +
        icon("sparkles") +
        '先理解规则，再用例子检查自己。</p></div><form id="ai-teacher-form"><label for="ai-teacher-question" class="sr-only">你的问题</label><input id="ai-teacher-question" placeholder="也可以写下你想问的问题" maxlength="200" autocomplete="off"><button type="submit" class="ai-button ai-primary">提问</button></form><p id="ai-teacher-quota" class="ai-muted"></p><p class="ai-demo-note">本地示例不调用模型；自由提问暂不生成回答、不扣额度。聊天记录不保存。</p>',
      "问 AI 老师 · 示例",
    );
    teacherQuota();
  }
  function teacherQuota() {
    const a = membership();
    if ($("#ai-teacher-quota"))
      $("#ai-teacher-quota").textContent =
        "本周期剩余 " + (a ? Math.max(0, a.quota - a.used) : 0) + " 次演示额度";
    renderMember();
  }
  function teacherAnswer(index) {
    if (!teacher || !dialog.open || !$("#ai-teacher-messages")) return;
    if (![0, 1, 2].includes(index)) return;
    const a = membership();
    if (!teacher.answered.has(index)) {
      if (!a || a.used >= a.quota) {
        toast(
          a
            ? "演示额度已用完，请前往会员页查看。"
            : "演示会员已过期，请重新开通。",
        );
        teacherQuota();
        return;
      }
      a.used++;
      flow.save();
      const l = teacher.node.lesson;
      const title = ["重点怎么记？", "举个文字例子", "哪里容易混淆？"][index];
      const answer =
        index === 0
          ? "<h4>先记结论</h4><p>" +
            highlight(l.summary) +
            "</p><h4>分开看要点</h4><ol>" +
            l.points.map((s) => "<li>" + highlight(s) + "</li>").join("") +
            "</ol>"
          : "<h4>" +
            (index === 1 ? "用文字看一个例子" : "先避开这个误区") +
            "</h4>" +
            sentences(index === 1 ? l.example : l.pitfall)
              .map((s) => "<p>" + highlight(s) + "</p>")
              .join("");
      const html =
        '<div class="ai-teacher-user">' +
        safe(title) +
        '</div><section class="ai-teacher-answer"><span class="ai-section-label">老师示例 · ' +
        safe(teacher.node.name) +
        "</span>" +
        answer +
        "</section>";
      teacher.answered.set(index, html);
      teacher.messages.push(html);
    }
    const mount = $("#ai-teacher-messages");
    mount.innerHTML = teacher.messages.join("");
    mount.scrollTop = mount.scrollHeight;
    $(
      '[data-ai-action="teacher-preset"][data-preset="' + index + '"]',
    ).disabled = true;
    teacherQuota();
  }

  root.addEventListener("input", (event) => {
    if (event.target.id === "ai-node-search") {
      query = event.target.value.trim();
      renderDirectory();
    }
    if (event.target.matches("[data-ai-blank]")) {
      const p = progress(),
        q = selected().questions[p.index];
      if (p.results[q.id]) return;
      p.drafts[q.id] ||= {};
      p.drafts[q.id][event.target.dataset.aiBlank] = event.target.value;
      event.target.setAttribute("aria-invalid", "false");
      $("#ai-error-" + event.target.dataset.aiBlank).hidden = true;
      save();
    }
  });
  document.addEventListener("submit", (event) => {
    if (event.target.id === "ai-practice-form") {
      event.preventDefault();
      submit();
    }
    if (event.target.id === "ai-teacher-form") {
      event.preventDefault();
      const input = $("#ai-teacher-question");
      const question = input.value.trim();
      if (!question || !teacher) return;
      teacher.messages.push(
        '<div class="ai-teacher-user">' +
          safe(question) +
          '</div><section class="ai-teacher-answer"><p>自由提问将在接入正式 AI 后提供。现在可以选择上方三个问题，体验按要点拆开的回答；这次提问没有扣除额度。</p></section>',
      );
      $("#ai-teacher-messages").innerHTML = teacher.messages.join("");
      $("#ai-teacher-messages").scrollTop = $(
        "#ai-teacher-messages",
      ).scrollHeight;
      input.value = "";
    }
  });
  root.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (event.target.closest(".ai-chapter-picker")) {
      const options = $("#ai-chapter-options");
      if (event.key === "Escape" && !options.hidden) {
        event.preventDefault();
        event.stopPropagation();
        chapterPicker(false, true);
        return;
      }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const choices = [...options.querySelectorAll("[data-ai-chapter]")];
        const wasClosed = options.hidden;
        chapterPicker(true);
        const current = choices.indexOf(event.target);
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? choices.length - 1
              : wasClosed
                ? choices.findIndex(
                    (el) => el.getAttribute("aria-pressed") === "true",
                  )
                : (current +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    choices.length) %
                  choices.length;
        choices[next]?.focus();
        return;
      }
    }
    if (
      event.target.closest(".ai-tabs") &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const tabs = [...root.querySelectorAll('.ai-tabs [role="tab"]')].filter(
        (el) => !el.hidden,
      );
      const index = tabs.indexOf(event.target);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
              tabs.length;
      setTab(tabs[next].dataset.aiTab, true);
    }
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".ai-chapter-picker")) chapterPicker(false);
    if (event.target.closest("#ai-chapter-toggle")) {
      chapterPicker($("#ai-chapter-options").hidden, true);
      return;
    }
    const chapterChoice = event.target.closest("[data-ai-chapter]");
    if (chapterChoice && catalog) {
      selectChapter(chapterChoice.dataset.aiChapter);
      $("#ai-chapter-toggle").focus({ preventScroll: true });
      return;
    }
    const questionEntry = event.target.closest("[data-study-tutor]");
    if (questionEntry && !questionEntry.disabled) {
      openQuestion(questionEntry.dataset.studyTutor);
      return;
    }
    const node = event.target.closest("[data-ai-node]");
    if (node && catalog) {
      selectNode(node.dataset.aiNode);
      return;
    }
    const index = event.target.closest("[data-ai-index]");
    if (index && catalog) {
      questionAt(Number(index.dataset.aiIndex));
      return;
    }
    const tab = event.target.closest("[data-ai-tab]");
    if (tab && catalog) {
      setTab(tab.dataset.aiTab);
      return;
    }
    if (event.target.closest("#ai-favorite-filter")) {
      favoritesOnly = !favoritesOnly;
      renderDirectory();
      return;
    }
    const action = event.target.closest("[data-ai-action]");
    if (!action || action.disabled) return;
    const name = action.dataset.aiAction;
    if (name === "reload") {
      loadCourse(window.AceCertificates?.active().id || data().course);
      return;
    }
    if (name === "membership") {
      actions.vip();
      return;
    }
    if (name === "quota") {
      quotaDialog();
      return;
    }
    if (name === "teacher-preset") {
      teacherAnswer(Number(action.dataset.preset));
      return;
    }
    if (!catalog) return;
    switch (name) {
      case "read-next":
      case "read-previous": {
        const p = progress();
        p.readStep = Math.max(
          0,
          Math.min(
            selected().lesson.points.length,
            p.readStep + (name === "read-next" ? 1 : -1),
          ),
        );
        save();
        renderContent();
        $("#ai-reading-title")?.focus({ preventScroll: true });
        break;
      }
      case "favorite": {
        const id = selected().id,
          has = data().favorites.includes(id);
        data().favorites = has
          ? data().favorites.filter((item) => item !== id)
          : [...data().favorites, id];
        save();
        renderDirectory();
        renderContent();
        $("#ai-favorite").focus({ preventScroll: true });
        toast(has ? "已取消收藏这个知识点" : "已收藏，可在目录中只看收藏");
        break;
      }
      case "reveal":
        progress().openedAnswers ||= {};
        progress().openedAnswers[selected().questions[progress().index].id] =
          true;
        save();
        renderContent();
        break;
      case "teacher":
        openTeacher();
        break;
      case "learn-practice":
        progress().learnedAt ||= Date.now();
        setTab("practice");
        break;
      case "practice-tab":
        setTab("practice");
        break;
      case "recall":
        setTab("lesson");
        break;
      case "next-node":
        nextNode();
        break;
      case "previous":
        questionAt(progress().index - 1);
        break;
      case "next-question":
        if (progress().index === selected().questions.length - 1)
          setTab("report");
        else questionAt(progress().index + 1);
        break;
      case "report":
        setTab("report");
        break;
      case "retry": {
        const p = progress(),
          q = selected().questions[p.index];
        delete p.results[q.id];
        delete p.skipped[q.id];
        save();
        renderDirectory();
        renderContent();
        $("#ai-blank-" + q.blanks[0].id).focus({ preventScroll: true });
        break;
      }
      case "skip": {
        const p = progress(),
          q = selected().questions[p.index];
        if (p.results[q.id]) return;
        p.skipped[q.id] = true;
        save();
        if (p.index === selected().questions.length - 1) setTab("report");
        else questionAt(p.index + 1);
        break;
      }
      case "focus-blank":
        $("#ai-blank-" + action.dataset.blank)?.focus();
        break;
      case "clear-filter":
        chapter = "all";
        query = "";
        favoritesOnly = false;
        $("#ai-node-search").value = "";
        renderDirectory();
        break;
    }
  });
  root.addEventListener("focusout", (event) => {
    if (
      event.target.closest(".ai-chapter-picker") &&
      event.relatedTarget &&
      !event.relatedTarget.closest(".ai-chapter-picker")
    )
      chapterPicker(false);
  });

  courseControl.addEventListener("change", () => {
    if (!onPage) return;
    const course = courses.find((c) => c.title === courseControl.value);
    if (course) loadCourse(course.id);
  });
  window.addEventListener("resize", () => {
    const options = $("#ai-chapter-options");
    if (options && !options.hidden) chapterPicker(true);
  });
  function enter() {
    if (!onPage) previousCourse = courseControl.value;
    onPage = true;
    courseControl.innerHTML = courses
      .map((c) => "<option>" + safe(c.title) + "</option>")
      .join("");
    if (
      !deepLinkOpened &&
      new URL(location.href).searchParams.get("lesson") === "vlan"
    ) {
      deepLinkOpened = true;
      const consumedLink = new URL(location.href);
      consumedLink.searchParams.delete("lesson");
      history.replaceState(history.state, "", consumedLink.href);
      pendingNode = {
        courseId: "network-engineer",
        nodeId: "network-engineer:03.02.01",
        tab: "tutor",
      };
      if (flow.state().tutorDemo) flow.state().tutorDemo.origin = null;
      if (window.AceCertificates?.active().id !== "network-engineer") {
        window.AceCertificates?.enterCourse("network-engineer", "ai");
        return;
      }
    }
    loadCourse(window.AceCertificates?.active().id || data().course);
  }
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name === "ai") enter();
    else if (onPage) {
      onPage = false;
      request++;
      teacher = null;
      if (window.AceCertificates) window.AceCertificates.syncCourse();
      else {
        courseControl.innerHTML = originalOptions;
        courseControl.value = previousCourse;
        $(".course-caption").textContent = previousCourse;
      }
    }
  });
  // Sidebar, homepage, global search and landing feature all share this independent page.
  actions.ai = () => showPage("ai");
  const reset = actions.reset;
  actions.reset = () => {
    teacher = null;
    reset();
  };
  function relatedLesson(question) {
    const normalize = (value) =>
      String(value || "")
        .toLowerCase()
        .replace(/[\s·、，。:：]/g, "");
    const point = normalize(question.point || question.section);
    const tokens = Array.from(
      { length: Math.max(0, point.length - 1) },
      (_, i) => point.slice(i, i + 2),
    );
    return catalog.lessons
      .map((n) => {
        const name = normalize(n.name),
          area = normalize(
            [n.name, n.section, n.parent].filter(Boolean).join(" "),
          );
        const hits = tokens.filter((t) => area.includes(t)).length;
        return {
          n,
          score:
            (n.chapter === question.chapter ? 30 : 0) +
            (name === point
              ? 90
              : name.includes(point) || point.includes(name)
                ? 55
                : 0) +
            hits * 4,
        };
      })
      .sort((a, b) => b.score - a.score || a.n.order - b.n.order)[0]?.n;
  }
  function openQuestion(id) {
    pendingChapter = null;
    const session = flow.activeSession(),
      question = flow.questionMap.get(id);
    if (!session || !question || (session.mode === "exam" && !session.finished))
      return;
    flow.state().tutorDemo ||= {
      version: 1,
      snapshots: {},
      choices: {},
      origin: null,
    };
    flow.state().tutorDemo.origin = {
      sessionId: session.id,
      questionId: id,
      courseId:
        window.AceCertificates?.active().id || "sichuan-upgrading-computer",
    };
    flow.save();
    pendingQuestion = question;
    pendingNode = null;
    showPage("ai");
  }
  function openLesson(courseId, nodeId, tab = "lesson") {
    pendingChapter = null;
    pendingQuestion = null;
    pendingNode = { courseId, nodeId, tab };
    if (
      onPage &&
      catalog?.course.id === courseId &&
      window.AceCertificates?.active().id === courseId
    ) {
      const n = catalog.lessons.find((n) => n.id === nodeId);
      if (!n) return;
      pendingNode = null;
      chapter = n.chapter;
      query = "";
      favoritesOnly = false;
      $("#ai-node-search").value = "";
      progress(n).tab = tab;
      selectNode(n.id);
    } else if (!window.AceCertificates?.enterCourse(courseId, "ai"))
      showPage("ai");
  }
  function openChapter(courseId, title) {
    if (!courses.some((c) => c.id === courseId)) return false;
    pendingQuestion = null;
    pendingNode = null;
    if (
      onPage &&
      catalog?.course.id === courseId &&
      window.AceCertificates?.active().id === courseId
    ) {
      selectChapter(title);
      setTab("lesson");
      $("#ai-lesson-title")?.scrollIntoView({ block: "nearest" });
    } else {
      pendingChapter = { courseId, title };
      if (!window.AceCertificates?.enterCourse(courseId, "ai")) showPage("ai");
    }
    return true;
  }
  function returnQuestion() {
    const origin = flow.state().tutorDemo?.origin;
    if (
      !origin ||
      !flow.state().sessions.some((s) => s.id === origin.sessionId)
    ) {
      toast("刚才的练习记录已清理，可以重新进入章节练习。");
      return;
    }
    flow.state().tutorDemo.origin = null;
    flow.save();
    window.AceCertificates?.enterCourse(origin.courseId, "practice");
    flow.activate(origin.sessionId, "practice");
  }
  if (document.body.dataset.page === "ai") enter();
  window.AceAiStudyDemo = {
    catalog: () => catalog,
    snapshot: () => structuredClone(data()),
    current: () => selected(),
    openLesson,
    openChapter,
    openQuestion,
    returnQuestion,
    setTab,
    nextNode,
    markTutorLearned: (id) => {
      const n = catalog?.lessons.find((n) => n.id === id);
      if (!n) return;
      progress(n).learnedAt ||= Date.now();
      save();
      renderDirectory();
    },
  };
})();
