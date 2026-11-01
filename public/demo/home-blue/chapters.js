"use strict";
art.database = () =>
  '<div class="art database-art">' +
  svg(
    '<defs><linearGradient id="db-body" x1="58" y1="42" x2="181" y2="178" gradientUnits="userSpaceOnUse"><stop stop-color="#9ac4ff"/><stop offset="1" stop-color="#517fec"/></linearGradient></defs><ellipse cx="119" cy="168" rx="92" ry="25" fill="#dceaff"/><g><path d="M61 131v24c0 18 114 18 114 0v-24" fill="url(#db-body)"/><ellipse cx="118" cy="132" rx="57" ry="17" fill="#b8d5ff"/><path d="M61 153c0 18 114 18 114 0" stroke="#d7e7ff" stroke-width="3"/></g><g class="database-middle"><path d="M61 91v24c0 18 114 18 114 0V91" fill="url(#db-body)"/><ellipse cx="118" cy="92" rx="57" ry="17" fill="#bfdcff"/><path d="M61 114c0 18 114 18 114 0" stroke="#d7e7ff" stroke-width="3"/></g><g class="database-top"><path d="M61 51v24c0 18 114 18 114 0V51" fill="url(#db-body)"/><ellipse cx="118" cy="52" rx="57" ry="18" fill="#93baff"/><path class="database-shine" d="M75 49c8-9 34-12 52-9" stroke="#d4e8ff" stroke-width="5" stroke-linecap="round"/><path d="M61 74c0 18 114 18 114 0" stroke="#d7e7ff" stroke-width="3"/></g>',
  ) +
  "</div>";
art.network = () =>
  '<div class="art network-art">' +
  svg(
    '<defs><radialGradient id="network-green"><stop stop-color="#88dec4"/><stop offset="1" stop-color="#26ad90"/></radialGradient></defs><ellipse cx="120" cy="169" rx="93" ry="23" fill="#d9f2e9"/><path d="m55 122 90-71 42 91Z" stroke="#76cbb4" stroke-width="6" stroke-linejoin="round"/><path class="network-signal" d="m55 122 90-71 42 91Z" stroke="#c4f7e8" stroke-width="3" stroke-linejoin="round"/><g class="network-node-one"><circle cx="55" cy="122" r="27" fill="url(#network-green)"/><ellipse cx="48" cy="114" rx="7" ry="8" fill="#d0faeb" opacity=".8"/></g><g class="network-node-two"><circle cx="145" cy="51" r="28" fill="url(#network-green)"/><ellipse cx="136" cy="42" rx="7" ry="8" fill="#d0faeb" opacity=".8"/></g><g class="network-node-three"><circle cx="187" cy="142" r="30" fill="url(#network-green)"/><ellipse cx="178" cy="133" rx="7" ry="8" fill="#d0faeb" opacity=".8"/></g><path d="m112 113 18-7 18 7v16c0 14-18 25-18 25s-18-11-18-25Z" fill="#edfdf7" stroke="#81cdb6" stroke-width="2"/><path d="m121 128 7 6 12-14" stroke="#39ac89" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
  ) +
  "</div>";
art.technology = () =>
  '<div class="art technology-art">' +
  svg(
    '<defs><linearGradient id="cloud-blue" x1="50" y1="50" x2="190" y2="150" gradientUnits="userSpaceOnUse"><stop stop-color="#99daec"/><stop offset="1" stop-color="#48a4c8"/></linearGradient></defs><ellipse cx="117" cy="171" rx="93" ry="22" fill="#f2e8c7"/><path class="technology-rays" d="M71 109v49m42-40v48m43-62v52m-94-24h90" stroke="#cad9dc" stroke-width="3" stroke-dasharray="5 6"/><g class="cloud-core"><path d="M65 129c-33 0-39-50-6-58 5-47 78-58 95-12 38-9 55 33 33 58-7 9-20 12-32 12Z" fill="#72b9d2"/><path d="M59 123c-33 0-39-50-6-58 5-47 78-58 95-12 38-9 55 33 33 58-7 9-20 12-32 12Z" fill="url(#cloud-blue)"/><path d="M81 56c11-15 37-18 49-5" stroke="#d5f3fa" stroke-width="6" stroke-linecap="round"/><path d="m102 82-13 12 13 12m30-25 14 12-14 12m-12-29-7 34" stroke="#f3fbff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></g><g class="technology-chip"><path d="m150 135 25-14 26 14-26 16Z" fill="#e5b95d"/><path d="m150 135 25 16v15l-25-16Z" fill="#b58838"/><path d="m175 151 26-16v15l-26 16Z" fill="#cc9e46"/><path d="m158 135 17-9 18 9-18 10Z" fill="#fff0b7"/><path d="m163 148-8 5m13 0-8 5m23-7 8 5m-3-10 8 5" stroke="#f0d391" stroke-width="3" stroke-linecap="round"/></g>',
  ) +
  "</div>";
chapters.push(
  {
    title: "数据库技术",
    kind: "database",
    tone: "blue",
    attempted: 0,
    total: 5,
    note: "数据库模型 · SQL 基础 · 关系运算",
  },
  {
    title: "网络与信息安全",
    kind: "network",
    tone: "cyan",
    attempted: 0,
    total: 21,
    note: "网络基础 · 网络安全 · 社会责任",
  },
  {
    title: "计算机新技术",
    kind: "technology",
    tone: "gold",
    attempted: 0,
    total: 7,
    note: "云计算 · 大数据 · 物联网 · 人工智能",
  },
);
chapters[0].note = "计算机概述 · 信息与编码";
chapters[1].note = "操作系统 · 硬件组成";
chapters[2].note = "Word · Excel · PowerPoint";
chapters[3].note = "程序基础 · 算法与流程";
chapterQuestions[4] = [
  {
    q: "关系型数据库通常以什么结构组织数据？",
    options: ["数据表", "幻灯片", "画笔", "浏览器标签"],
    answer: 0,
    explain: "关系型数据库用数据表组织记录与字段，并通过关系连接不同的表。",
  },
  {
    q: "SQL 中，查询数据通常使用哪个关键字？",
    options: ["SELECT", "DRAW", "PAINT", "SLIDE"],
    answer: 0,
    explain: "SELECT 用于从表中查询数据，常见语句为 SELECT 列名 FROM 表名。",
  },
  {
    q: "数据库表中，主键的主要作用是什么？",
    options: ["唯一标识一条记录", "调整页面颜色", "播放视频", "压缩图片"],
    answer: 0,
    explain: "主键用于唯一标识一条记录，不能包含重复的主键值。",
  },
];
chapterQuestions[5] = [
  {
    q: "在网络中，IP 地址的主要作用是什么？",
    options: ["定位网络接口", "改变文件字体", "提高屏幕亮度", "播放音频"],
    answer: 0,
    explain: "IP 地址用于标识网络接口，支持网络中的寻址与数据传输。",
  },
  {
    q: "路由器主要负责哪项工作？",
    options: [
      "在不同网络之间转发数据包",
      "编辑电子表格",
      "制作演示文稿",
      "扫描纸张",
    ],
    answer: 0,
    explain: "路由器根据路由信息在不同网络之间转发数据包。",
  },
  {
    q: "以下哪种做法有助于保护账号安全？",
    options: [
      "为不同账号使用独立密码",
      "公开自己的验证码",
      "使用简单密码 123456",
      "随意安装不明软件",
    ],
    answer: 0,
    explain:
      "使用独立、强度足够的密码，可以减少某个账号泄露后影响其他账号的风险。",
  },
];
chapterQuestions[6] = [
  {
    q: "云计算的一项典型特点是？",
    options: [
      "按需使用计算资源",
      "只能在一台固定电脑运行",
      "必须离线使用",
      "仅能处理文字",
    ],
    answer: 0,
    explain: "云计算通常提供按需获取的计算、存储与网络资源。",
  },
  {
    q: "物联网主要强调什么？",
    options: [
      "让物理设备通过网络连接并交换信息",
      "只连接文本文件",
      "用纸张记录密码",
      "制作静态幻灯片",
    ],
    answer: 0,
    explain: "物联网通过传感器、设备和网络，实现物理对象的信息采集与交换。",
  },
  {
    q: "大数据处理通常需要考虑哪些方面？",
    options: [
      "数据规模、处理速度与数据质量",
      "只有字体大小",
      "只有文件名称",
      "只有鼠标颜色",
    ],
    answer: 0,
    explain: "大数据处理不仅关注规模，也需要考虑处理效率、数据多样性与质量。",
  },
];
Object.keys(chapterQuestions).forEach((key) => {
  chapterQuestions[key] = chapterQuestions[key].map((question, index) => ({
    ...question,
    id: key + "-" + index,
  }));
});
const practiceRecords = new Map();
chapters.forEach((chapter, index) => {
  const pool = chapterQuestions[index];
  const count = Math.min(chapter.attempted, Math.floor(pool.length / 2));
  pool
    .slice(0, count)
    .forEach((question) => practiceRecords.set(question.id, { correct: true }));
});
practiceRecords.set("2-1", { correct: false });
practiceRecords.set("2-5", { correct: false });
let chapterFilter = "all";
const practiceConfig = { mode: "sequential", range: "all", count: "10" };
function chapterStatus(chapter) {
  return chapter.attempted === 0
    ? "new"
    : chapter.attempted >= chapter.total
      ? "done"
      : "ongoing";
}
function configuredQuestions() {
  let pool = [...chapterQuestions[activeChapter]];
  if (practiceConfig.range === "new")
    pool = pool.filter((question) => !practiceRecords.has(question.id));
  if (practiceConfig.range === "wrong")
    pool = pool.filter((question) => {
      const entry =
        window.AceStudyFlow?.state().wrongBook?.entries?.[question.id];
      return entry
        ? entry.status === "pending"
        : practiceRecords.has(question.id) &&
            !practiceRecords.get(question.id).correct;
    });
  if (practiceConfig.mode === "random") {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
  }
  return practiceConfig.count === "all"
    ? pool
    : pool.slice(0, Number(practiceConfig.count));
}
function renderCatalogue() {
  const input = $("#chapter-search").value.trim().toLowerCase();
  const visible = chapters
    .map((chapter, index) => ({ chapter, index }))
    .filter(
      ({ chapter }) =>
        (chapterFilter === "all" || chapterStatus(chapter) === chapterFilter) &&
        (!input ||
          (chapter.title + " " + chapter.note).toLowerCase().includes(input)),
    );
  const focused = document.activeElement?.closest(
    "#chapter-catalogue [data-chapter]",
  );
  const focusedIndex = focused?.dataset.chapter;
  motionStates.forEach((_, root) => {
    if (root.closest("#chapter-catalogue")) {
      stopOffice(root, true);
      motionStates.delete(root);
    }
  });
  $("#chapter-catalogue").innerHTML = visible
    .map(
      ({ chapter, index }) =>
        '<button class="chapter-card ' +
        chapter.tone +
        "-card " +
        (chapter.kind === "technology" ? "technology-card " : "") +
        (index === activeChapter ? "is-selected" : "") +
        '" data-chapter="' +
        index +
        '" aria-pressed="' +
        (index === activeChapter) +
        '" aria-label="选择' +
        chapter.title +
        '"><span class="selection-check" aria-hidden="true">' +
        icon("check") +
        '</span><div class="chapter-top"><span class="chapter-art" aria-hidden="true">' +
        art[chapter.kind]() +
        '</span><span class="chapter-copy"><h3>' +
        chapter.title +
        '</h3><span class="chapter-subtitle">' +
        chapter.note +
        "</span><p>" +
        (chapter.attempted
          ? "已练 <strong>" +
            chapter.attempted +
            "</strong> / " +
            chapter.total +
            " 题"
          : "未开始 · 共 " + chapter.total + " 题") +
        '</p><div class="progress-track"><div class="progress-fill" style="width:' +
        (chapter.attempted / chapter.total) * 100 +
        "%;min-width:" +
        (chapter.attempted ? "6px" : "0") +
        '"></div></div></span></div><span class="round-arrow">' +
        icon("chevron") +
        "</span></button>",
    )
    .join("");
  $("#catalogue-empty").hidden = visible.length > 0;
  ["all", "ongoing", "new", "done"].forEach((status) => {
    $('[data-filter-count="' + status + '"]').textContent =
      status === "all"
        ? chapters.length
        : chapters.filter((chapter) => chapterStatus(chapter) === status)
            .length;
    $('[data-filter="' + status + '"]').setAttribute(
      "aria-selected",
      String(chapterFilter === status),
    );
  });
  bindOfficeMotion($("#chapter-catalogue"));
  if (focusedIndex !== undefined)
    $('#chapter-catalogue [data-chapter="' + focusedIndex + '"]')?.focus({
      preventScroll: true,
    });
}
function renderSelectedChapter() {
  const chapter = chapters[activeChapter];
  const hero = $(".catalogue-hero");
  stopOffice(hero, true);
  hero.dataset.chapterKind = chapter.kind;
  $("#catalogue-hero-title").textContent = chapter.title;
  $("#catalogue-hero-progress").textContent =
    "已练 " +
    chapter.attempted +
    " / " +
    chapter.total +
    " 题 · 从第 " +
    Math.min(chapter.attempted + 1, chapter.total) +
    " 题继续";
  const heroArt = $(".catalogue-hero-art");
  heroArt.dataset.art = chapter.kind;
  heroArt.innerHTML = art[chapter.kind]();
  $("#selected-chapter-art").innerHTML = art[chapter.kind]();
  $("#selected-chapter-title").textContent = chapter.title;
  $("#selected-chapter-progress").textContent =
    chapter.total + " 道题目 · 已练 " + chapter.attempted + " 题";
  $("#catalogue-attempted").textContent = chapters.reduce(
    (sum, item) => sum + item.attempted,
    0,
  );
  const size = configuredQuestions().length;
  const mode = practiceConfig.mode === "random" ? "随机" : "顺序";
  $("#practice-note").textContent = size
    ? "本次练习 " + size + " 道题，采用" + mode + "练习。"
    : practiceConfig.range === "wrong"
      ? "当前章节暂无错题，可选择全部题目。"
      : "当前范围暂无题目，可切换题目范围。";
  $("#practice-estimate").textContent = size
    ? "预计用时 " + Math.ceil(size * 0.8) + " 分钟"
    : "请选择其他题目范围";
  document
    .querySelectorAll('[data-action="configured-practice"]')
    .forEach((button) => {
      button.disabled = size === 0;
    });
  $(".continue-copy .primary-button span").textContent = size
    ? "开始 " + size + " 题练习"
    : "暂无可练习题目";
  $(".continue-copy .primary-button").disabled = size === 0;
  document
    .querySelectorAll("[data-setting]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(practiceConfig[button.dataset.setting] === button.dataset.value),
      ),
    );
  bindOfficeMotion(document);
}
const selectCoreChapter = selectChapter;
selectChapter = function (index) {
  selectCoreChapter(index);
  renderCatalogue();
  renderSelectedChapter();
};
function showPage(name, updateHash = true) {
  const names = [
    "home",
    "chapters",
    "practice",
    "plan",
    "report",
    "exam",
    "favorites",
    "wrong",
    "vip",
    "login",
    "ai",
    "settings",
    "certificates",
  ];
  if (!names.includes(name)) name = "home";
  names.forEach((page) => {
    const element = $("#" + page + "-page");
    if (element) element.hidden = page !== name;
  });
  const session = window.AceStudyFlow?.activeSession();
  const nav =
    name === "practice" || name === "report"
      ? window.AceStudyFlow?.origin(session) || "chapters"
      : name;
  document.querySelectorAll(".sidebar .nav-item").forEach((button) => {
    const selected = button.dataset.action === nav;
    button.classList.toggle("active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.body.dataset.page = name;
  const titles = {
    home: "学习首页",
    chapters: "章节练习",
    practice: "章节刷题",
    plan: "学习计划",
    report: "练习报告",
    exam: "模拟考试",
    favorites: "我的收藏",
    wrong: "错题本",
    vip: "VIP 会员",
    login: "登录与注册",
    ai: "AI 精讲",
    settings: "设置",
    certificates: "证书选择",
  };
  document.title = titles[name] + " · 考匠 Web Demo";
  if (updateHash && location.hash !== "#" + name)
    history.pushState(null, "", "#" + name);
  if (dialog.open) closeDialog();
  if (name === "chapters") {
    renderCatalogue();
    renderSelectedChapter();
  }
  document.dispatchEvent(new CustomEvent("demo:route", { detail: { name } }));
  window.scrollTo({ top: 0, behavior: "auto" });
  $("#main").focus({ preventScroll: true });
}
function startConfiguredPractice() {
  const list = configuredQuestions();
  if (!list.length) {
    toast("当前范围没有题目，请切换题目范围。");
    return;
  }
  startQuiz("practice", activeChapter, list);
}
actions.chapters = () => showPage("chapters");
actions.home = () => showPage("home");
actions.practice = startConfiguredPractice;
actions["configured-practice"] = startConfiguredPractice;
actions["clear-chapter-filters"] = () => {
  chapterFilter = "all";
  $("#chapter-search").value = "";
  renderCatalogue();
};
const submitCoreAnswer = submitAnswer;
submitAnswer = function () {
  if (!quiz || quiz.selected === null || quiz.submitted) return;
  const question = quiz.list[quiz.index];
  const attemptedBefore = chapters[quiz.chapter].attempted;
  const known = question.id && practiceRecords.has(question.id);
  submitCoreAnswer();
  if (question.id)
    practiceRecords.set(question.id, {
      correct: quiz.selected === question.answer,
    });
  if (known) chapters[quiz.chapter].attempted = attemptedBefore;
  renderChapters();
  updateHeroProgress();
  renderCatalogue();
  renderSelectedChapter();
};
const resetCoreDemo = actions.reset;
actions.reset = () => {
  [0, 0, 0].forEach((count, index) => (chapters[index + 4].attempted = count));
  practiceConfig.mode = "sequential";
  practiceConfig.range = "all";
  practiceConfig.count = "10";
  practiceRecords.clear();
  chapters
    .slice(0, 4)
    .forEach((chapter, index) =>
      chapterQuestions[index]
        .slice(
          0,
          Math.min(
            [1, 3, 9, 1][index],
            Math.floor(chapterQuestions[index].length / 2),
          ),
        )
        .forEach((question) =>
          practiceRecords.set(question.id, { correct: true }),
        ),
    );
  practiceRecords.set("2-1", { correct: false });
  practiceRecords.set("2-5", { correct: false });
  resetCoreDemo();
  renderCatalogue();
  renderSelectedChapter();
};
chapters
  .slice(4)
  .forEach((chapter, index) =>
    searchItems.push({ title: chapter.title, chapter: index + 4 }),
  );
document.addEventListener("click", (event) => {
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    chapterFilter = filter.dataset.filter;
    renderCatalogue();
    return;
  }
  const setting = event.target.closest("[data-setting]");
  if (setting) {
    practiceConfig[setting.dataset.setting] = setting.dataset.value;
    renderSelectedChapter();
  }
});
$("#chapter-search").addEventListener("input", renderCatalogue);
$(".chapter-filters").addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const tabs = [...document.querySelectorAll('.chapter-filters [role="tab"]')];
  const index = tabs.indexOf(document.activeElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
          tabs.length;
  tabs[next].click();
  tabs[next].focus();
});
window.addEventListener("hashchange", () =>
  showPage(location.hash.slice(1) || "home", false),
);
renderChapters();
selectChapter(activeChapter);
showPage(location.hash.slice(1) || "home", false);

$("#chapter-search").addEventListener("search", renderCatalogue);
$("#chapter-search").addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    event.target.value = "";
    renderCatalogue();
  }
});
