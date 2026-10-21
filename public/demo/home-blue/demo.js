"use strict";
const $ = (selector, root = document) => root.querySelector(selector);
const icon = (name) =>
  '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
let illustrationInstance = 0;
const svg = (inner) => {
  const prefix = "illustration-" + ++illustrationInstance;
  const unique = inner
    .replace(/id="([^"]+)"/g, (_, id) => 'id="' + prefix + "-" + id + '"')
    .replace(/url\(#([^)]+)\)/g, (_, id) => "url(#" + prefix + "-" + id + ")");
  return (
    '<svg viewBox="0 0 240 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    unique +
    "</svg>"
  );
};
const art = {
  office: () =>
    '<div class="art office-art"><span class="art-halo"></span>' +
    svg(
      '<defs><linearGradient id="office-blue" x1="80" y1="20" x2="220" y2="175" gradientUnits="userSpaceOnUse"><stop stop-color="#a7cdff"/><stop offset="1" stop-color="#6b9feb"/></linearGradient></defs><path d="m17 149 108-42 104 51-111 39Z" fill="#d2e4ff" opacity=".65"/><path d="m64 38 139-18a10 10 0 0 1 11 9l13 119a8 8 0 0 1-7 9L79 178l-7-3Z" fill="#80ace8"/><path d="m61 37 138-18a8 8 0 0 1 9 7l13 122a8 8 0 0 1-7 9L76 175a8 8 0 0 1-9-7L53 46a8 8 0 0 1 8-9Z" fill="white" stroke="#bad5fa" stroke-width="2"/><path d="m61 37 138-18a8 8 0 0 1 9 7l2 15L55 61l-2-15a8 8 0 0 1 8-9Z" fill="url(#office-blue)"/><circle cx="65" cy="48" r="3" fill="white"/><circle cx="76" cy="47" r="3" fill="white"/><circle cx="87" cy="45" r="3" fill="white"/><path d="m110 73 79-10m-77 22 70-9m-69 22 85-11" stroke="#dce8fa" stroke-width="5" stroke-linecap="round"/><path d="m115 114 81-11 5 40-81 11Z" fill="#eef5ff" stroke="#cfdef6" stroke-width="1.5"/><path d="m137 111 5 39m24-43 5 39m-53-22 81-11m-79 26 81-11" stroke="#c1d6f1" stroke-width="1.4"/><path d="m168 174 48-8 13 10-48 9Z" fill="#b7d0f2"/><path d="m165 167 48-8 13 10-48 9Z" fill="#fff" stroke="#c8dbf4"/><path d="m165 167 1 6 12 10 1-6" fill="#d1e1f8"/>',
    ) +
    '<span class="office-tile office-w"><span class="app-file"></span><span class="app-badge">W</span></span><span class="office-tile office-x"><span class="app-file"></span><span class="app-badge">X</span></span><span class="office-tile office-p"><span class="app-file"></span><span class="app-badge">P</span></span></div>',
  computer: () =>
    '<div class="art computer-art">' +
    svg(
      '<defs><linearGradient id="monitor-gradient" x1="38" y1="54" x2="140" y2="143" gradientUnits="userSpaceOnUse"><stop stop-color="#8fc7ff"/><stop offset="1" stop-color="#4d8dea"/></linearGradient></defs><path d="m13 139 114-48 99 56-110 46Z" fill="#cbdffd"/><g class="computer-tower"><path d="m164 44 38 14v106l-38-15Z" fill="#4475bd"/><path d="m149 50 15-6v105l-15 8Z" fill="#87b8f0"/><path d="m149 50 38 14 15-6-38-14Z" fill="#afd1fd"/><path d="m170 73 25 9m-25 6 25 9m-25 6 25 9" stroke="#84ade5" stroke-width="4"/><circle cx="182" cy="137" r="4" fill="#b7dcff"/></g><path d="m95 141 12 6-2 17 17 8-27 11-29-13 24-9Z" fill="#6096d8"/><g class="monitor"><path d="m32 52 93-19 10 99-98 22Z" fill="#31558e"/><path d="m26 48 93-20a7 7 0 0 1 8 6l11 94a7 7 0 0 1-6 8l-92 20a7 7 0 0 1-8-6L21 56a7 7 0 0 1 5-8Z" fill="#74acef"/><path d="m29 55 89-19 9 85-89 20Z" fill="url(#monitor-gradient)"/><path d="m37 60 48-10-37 77-9 2Z" fill="#d5ebff" opacity=".35"/><circle cx="81" cy="139" r="3" fill="#d4e7ff"/></g><g class="keyboard"><path d="m99 170 65-20 36 20-67 22Z" fill="#b9d7fc"/><path d="m104 169 58-16 27 16-58 18Z" fill="#e3efff"/><path d="m121 165 33-9m-24 16 35-10m-30 18 36-11" stroke="#a0c5f4" stroke-width="3"/></g>',
    ) +
    "</div>",
  chip: () =>
    '<div class="art chip-art">' +
    svg(
      '<path d="m18 126 101-59 106 57-99 62Z" fill="#ceeee0"/><path d="m29 117 91-50 93 50-90 53Z" fill="#71c4a8"/><path d="m29 117 94 53v8l-94-53Z" fill="#3da78a"/><path d="m123 170 90-53v8l-90 53Z" fill="#209179"/><path d="m54 119 38 20 32-19 24 13 40-23m-135 3 24-13 27 15m30 38 22-13 36-21" stroke="#b2e6d4" stroke-width="2.5"/><circle class="chip-led" cx="53" cy="117" r="4" fill="#d6ffec"/><circle class="chip-led" cx="185" cy="113" r="4" fill="#d6ffec"/><g class="chip-core"><path d="m67 74 55-31 57 31-56 33Z" fill="#506c87"/><path d="m67 74 56 33v12L67 86Z" fill="#334d69"/><path d="m123 107 56-33v12l-56 33Z" fill="#233b56"/><path d="m81 72 42-23 42 24-42 24Z" fill="#708da2"/><path d="m91 73 32-18 31 18-31 18Z" fill="#a5c6cd"/><path d="m89 62 6-8m9 5 6-8m-29 19-7-4m13 12-7-4m73-14 7-5m0 14 7-4m-29 31 6 8m8-16 6 8" stroke="#c0e0d6" stroke-width="4" stroke-linecap="round"/></g><g class="chip-small"><path d="m159 147 24-14 23 14-24 14Z" fill="#628693"/><path d="m166 147 17-10 15 10-16 9Z" fill="#b9dbd7"/><path d="m182 141 6 7-6 3-6-6Z" fill="#527b85"/></g>',
    ) +
    "</div>",
  code: () =>
    '<div class="art code-art">' +
    svg(
      '<defs><linearGradient id="code-gradient" x1="48" y1="47" x2="191" y2="170" gradientUnits="userSpaceOnUse"><stop stop-color="#957ddf"/><stop offset="1" stop-color="#6551be"/></linearGradient></defs><path d="m21 151 99-42 103 45-99 42Z" fill="#e0d6fc"/><g class="code-window"><path d="m61 43 127-23 15 132-130 28Z" fill="#6247b2"/><path d="m51 40 127-22a9 9 0 0 1 10 8l15 122a9 9 0 0 1-7 10L69 181a9 9 0 0 1-10-8L44 50a9 9 0 0 1 7-10Z" fill="url(#code-gradient)"/><path d="m51 40 127-22a9 9 0 0 1 10 8l2 18-143 25-3-19a9 9 0 0 1 7-10Z" fill="#b3a0ec"/><circle cx="59" cy="51" r="3" fill="#ede6ff"/><circle cx="70" cy="49" r="3" fill="#ede6ff"/><circle cx="81" cy="47" r="3" fill="#ede6ff"/><g class="code-brackets" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="m90 93-17 18 22 13m61-42 22 13-17 19m-32-30-16 45"/></g><path class="code-line" d="m82 143 66-12" stroke="#bda8f1" stroke-width="4" stroke-linecap="round"/><path class="code-line" d="m84 154 48-9" stroke="#bda8f1" stroke-width="4" stroke-linecap="round"/><path class="code-cursor" d="m155 127 3 14" stroke="#f5d992" stroke-width="3"/></g>',
    ) +
    "</div>",
  review: () =>
    '<div class="art">' +
    svg(
      '<path d="m49 48 96-28 54 135-95 31Z" fill="#ffe1c7" opacity=".7"/><g class="sheet-back"><path d="m100 22 87 14a9 9 0 0 1 7 10l-21 119-101-17 20-118a9 9 0 0 1 8-8Z" fill="#fff8f0"/><path d="m115 47 52 8m-55 7 52 8m-55 7 52 8" stroke="#f3d7be" stroke-width="6" stroke-linecap="round"/></g><g class="sheet-front"><path d="m44 86 95-18a8 8 0 0 1 10 7l18 109-112 17-18-105a8 8 0 0 1 7-10Z" fill="#fffefa" stroke="#ffe7d1" stroke-width="2"/><path d="m60 111 49-9m-47 22 63-11m-61 24 63-11m-61 24 42-7" stroke="#f3ddc9" stroke-width="5" stroke-linecap="round"/><circle cx="149" cy="88" r="25" fill="#ee9973"/><path d="m141 81 16 14m-14-17-13 18" stroke="#fff" stroke-width="4" stroke-linecap="round"/></g>',
    ) +
    "</div>",
  exam: () =>
    '<div class="art">' +
    svg(
      '<g class="exam-paper"><rect x="49" y="18" width="128" height="165" rx="16" fill="#b3b0ed"/><rect x="58" y="25" width="108" height="147" rx="10" fill="#f8f8ff"/><rect x="94" y="12" width="44" height="30" rx="9" fill="#7873d4"/><rect x="106" y="19" width="20" height="9" rx="4.5" fill="#e4e3ff"/><path d="m79 78 7 7 13-15m-20 42 7 7 13-15m13-24h32m-32 32h32m-65 35h65" stroke="#aaa9e7" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></g>',
    ) +
    "</div>",
  book: () =>
    '<div class="art">' +
    svg(
      '<path d="M120 52c-35-27-73-24-106-17v125c34-8 71-11 106 15 35-26 73-23 107-15V35c-34-7-71-10-107 17Z" fill="#3aa784"/><g class="book-page-left"><path d="M112 49c-29-20-57-19-85-13v110c28-6 57-7 85 13Z" fill="#f2fff8"/><path d="M42 61c19-2 39 0 54 10m-54 14c19-2 39 0 54 10m-54 14c19-2 39 0 54 10" stroke="#b6e0cb" stroke-width="5" stroke-linecap="round"/></g><g class="book-page-right"><path d="M128 49c30-20 58-19 86-13v110c-28-6-57-7-86 13Z" fill="#defff0"/><path d="M145 71c17-10 35-12 54-10m-54 34c17-10 35-12 54-10m-54 34c17-10 35-12 54-10" stroke="#a3d6bd" stroke-width="5" stroke-linecap="round"/></g><path d="M120 53v122" stroke="#258665" stroke-width="5"/>',
    ) +
    "</div>",
};
art.hero = art.office;
document.querySelectorAll(".art-mount").forEach((mount) => {
  mount.innerHTML = art[mount.dataset.art]();
});
const chapters = [
  {
    title: "计算机基础知识",
    kind: "computer",
    tone: "blue",
    attempted: 1,
    total: 42,
    note: "从基础概念开始，打牢计算机知识",
  },
  {
    title: "计算机软硬件基础",
    kind: "chip",
    tone: "mint",
    attempted: 3,
    total: 42,
    note: "理解硬件组成与操作系统",
  },
  {
    title: "办公自动化",
    kind: "office",
    tone: "peach",
    attempted: 9,
    total: 75,
    note: "Word、Excel 与 PowerPoint",
  },
  {
    title: "算法与程序设计",
    kind: "code",
    tone: "purple",
    attempted: 1,
    total: 14,
    note: "把程序的思路一步步理清",
  },
];
let activeChapter = 2;
function renderChapters() {
  motionStates.forEach((_, root) => {
    if (root.matches(".chapter-card")) {
      stopOffice(root, true);
      motionStates.delete(root);
    }
  });
  $("#chapter-grid").innerHTML = chapters
    .slice(0, 4)
    .map(
      (chapter, index) =>
        '<button class="chapter-card ' +
        chapter.tone +
        "-card" +
        (index === activeChapter ? " is-selected" : "") +
        '" data-chapter="' +
        index +
        '" aria-pressed="' +
        (index === activeChapter) +
        '" aria-label="' +
        chapter.title +
        "，已练 " +
        chapter.attempted +
        " / " +
        chapter.total +
        ' 题"><div class="chapter-top"><span class="chapter-art" aria-hidden="true">' +
        art[chapter.kind]() +
        '</span><span class="chapter-copy"><h3>' +
        chapter.title +
        "</h3><p><strong>" +
        chapter.attempted +
        "</strong> / " +
        chapter.total +
        ' 题</p></span></div><div class="chapter-bottom"><div class="progress-track"><div class="progress-fill" style="width:' +
        (chapter.attempted / chapter.total) * 100 +
        '%"></div></div><span class="round-arrow">' +
        icon("chevron") +
        "</span></div></button>",
    )
    .join("");
  bindOfficeMotion($("#chapter-grid"));
}
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let motionEnabled = true;
const motionStates = new Map();
function motionAllowed() {
  return motionEnabled && !reducedMotion.matches;
}
function stopOffice(root, immediate = false) {
  const running = motionStates.get(root) || [];
  const returning = [];
  running.forEach(({ element, animation }) => {
    const current = getComputedStyle(element).transform;
    animation.cancel();
    if (!immediate && motionAllowed())
      returning.push({
        element,
        animation: element.animate(
          [{ transform: current }, { transform: "translateY(0) rotate(0deg)" }],
          { duration: 350, easing: "cubic-bezier(.22,.68,0,1.01)" },
        ),
      });
  });
  motionStates.set(root, returning);
}
function startOffice(root) {
  if (!motionAllowed()) return;
  stopOffice(root, true);
  const running = [...root.querySelectorAll(".app-badge")].map(
    (element, index) => ({
      element,
      animation: element.animate(
        [
          { transform: "translateY(0) rotate(0deg)" },
          {
            transform:
              "translateY(" +
              (-5 - index) +
              "px) rotate(" +
              (index === 1 ? -3 : 3) +
              "deg)",
          },
          { transform: "translateY(0) rotate(0deg)" },
        ],
        {
          duration: 1600 + index * 240,
          delay: index * 100,
          iterations: Infinity,
          easing: "ease-in-out",
        },
      ),
    }),
  );
  motionStates.set(root, running);
}
function bindOfficeMotion(root) {
  root.querySelectorAll(".chapter-card,.continue-card").forEach((card) => {
    if (!card.querySelector(".office-art") || card.dataset.motionBound) return;
    card.dataset.motionBound = "true";
    card.addEventListener("pointerenter", () => startOffice(card));
    card.addEventListener("pointerleave", () => {
      if (
        !card.matches(":focus-visible") &&
        !card.querySelector(":focus-visible")
      )
        stopOffice(card);
    });
    card.addEventListener("focusin", (event) => {
      if (event.target.matches(":focus-visible")) startOffice(card);
    });
    card.addEventListener("focusout", (event) => {
      if (!card.contains(event.relatedTarget) && !card.matches(":hover"))
        stopOffice(card);
    });
  });
}
reducedMotion.addEventListener("change", () => {
  motionStates.forEach((_, root) => stopOffice(root, true));
});
function updateHeroProgress() {
  const chapter = chapters[activeChapter];
  $(".continue-copy > p strong").textContent =
    chapter.attempted + " / " + chapter.total;
}
function selectChapter(index) {
  if (!chapters[index]) return;
  activeChapter = index;
  const chapter = chapters[index];
  const hero = $(".continue-card");
  stopOffice(hero, true);
  $(".continue-copy h2").textContent = chapter.title;
  updateHeroProgress();
  $(".continue-copy .primary-button span").textContent =
    "开始 " + (index === 2 ? 10 : 3) + " 题练习";
  hero.setAttribute("aria-label", "继续练习：" + chapter.title);
  hero.dataset.chapterKind = chapter.kind;
  const heroArt = $(".hero-art");
  heroArt.dataset.art = chapter.kind;
  heroArt.innerHTML = art[chapter.kind]();
  document.querySelectorAll(".chapter-card").forEach((card) => {
    const selected = Number(card.dataset.chapter) === index;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-pressed", String(selected));
  });
  bindOfficeMotion(document);
}
bindOfficeMotion(document);
renderChapters();
selectChapter(activeChapter);
const dialog = $("#demo-dialog");
let opener = null;
let quiz = null;
let examInterval = null;
let todayCount = 12;
let answeredTotal = 21;
let correctTotal = 17;
let toastTimer;
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 2600);
}
function showDialog(title, content, kicker = "学习预览") {
  if (!dialog.open) opener = document.activeElement;
  $("#dialog-title").textContent = title;
  $("#dialog-kicker").textContent = kicker;
  $("#dialog-content").innerHTML = content;
  if (!dialog.open) dialog.showModal();
  $(".close-dialog").focus({ preventScroll: true });
}
function closeDialog() {
  dialog.close();
}
dialog.addEventListener("close", () => {
  clearInterval(examInterval);
  examInterval = null;
  if (opener && document.contains(opener))
    opener.focus({ preventScroll: true });
});
$(".close-dialog").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      closeDialog();
  }
});
const questions = [
  {
    q: "在 Word 中，要一次选中整篇文档的内容，应使用哪个快捷键？",
    options: ["Ctrl + C", "Ctrl + A", "Ctrl + V", "Ctrl + Z"],
    answer: 1,
    explain: "Ctrl + A 是全选。Ctrl + C 复制，Ctrl + V 粘贴，Ctrl + Z 撤销。",
  },
  {
    q: "在 Excel 中，计算 A1 到 A5 单元格之和的正确公式是？",
    options: ["=SUM(A1:A5)", "=SUM(A1,A5)", "=ADD(A1:A5)", "=A1-A5"],
    answer: 0,
    explain:
      "SUM 用于求和，冒号表示连续区域。A1:A5 包含 A1、A2、A3、A4 和 A5。",
  },
  {
    q: "在 PowerPoint 桌面版中，从第一张幻灯片开始放映通常使用哪个功能键？",
    options: ["F1", "F2", "F5", "F12"],
    answer: 2,
    explain: "F5 从第一张幻灯片开始放映；Shift + F5 从当前幻灯片开始。",
  },
  {
    q: "以下哪个扩展名通常对应 Word 文档？",
    options: [".xlsx", ".pptx", ".docx", ".png"],
    answer: 2,
    explain:
      ".docx 对应 Word 文档，.xlsx 对应 Excel 工作簿，.pptx 对应 PowerPoint 演示文稿。",
  },
  {
    q: "复制选中内容，通常使用哪个快捷键？",
    options: ["Ctrl + X", "Ctrl + C", "Ctrl + S", "Ctrl + P"],
    answer: 1,
    explain: "Ctrl + C 复制，Ctrl + X 剪切，Ctrl + S 保存，Ctrl + P 打印。",
  },
  {
    q: "在 Excel 中，单元格输入公式通常需要以什么符号开始？",
    options: ["#", "@", "=", "&"],
    answer: 2,
    explain: "Excel 公式通常以等号 = 开始，例如 =A1+B1。",
  },
  {
    q: "计算机内存 RAM 通常具有什么特点？",
    options: [
      "断电后数据仍然永久保存",
      "断电后其中的数据会丢失",
      "只能读取不能写入",
      "主要用于打印文档",
    ],
    answer: 1,
    explain:
      "常见 RAM 是易失性存储，断电后数据会丢失。需要长期保存的文件应写入存储设备。",
  },
  {
    q: "一个字节（Byte）包含多少个二进制位（bit）？",
    options: ["2", "4", "8", "16"],
    answer: 2,
    explain: "1 Byte = 8 bit。位是二进制信息单位，一个字节包含 8 位。",
  },
  {
    q: "以下哪个扩展名通常对应 PowerPoint 演示文稿？",
    options: [".docx", ".xlsx", ".pptx", ".txt"],
    answer: 2,
    explain: ".pptx 是常见的 PowerPoint 演示文稿格式。",
  },
  {
    q: "在 Excel 中，$A$1 表示哪一种引用？",
    options: [
      "相对引用",
      "绝对引用",
      "只固定行的混合引用",
      "只固定列的混合引用",
    ],
    answer: 1,
    explain: "列 A 和行 1 前都有 $，表示行与列都固定，是绝对引用。",
  },
];
const chapterQuestions = {
  0: [questions[6], questions[7], questions[4]],
  1: [questions[6], questions[7], questions[3]],
  2: questions,
  3: [
    {
      q: "执行算法的步骤必须具有什么特点？",
      options: [
        "可以无限含糊",
        "应当明确且可执行",
        "每次结果必须随机",
        "不能接受输入",
      ],
      answer: 1,
      explain: "算法的每个步骤应当明确、可执行，这是确定性与可行性的要求。",
    },
    {
      q: "遍历数组时，循环通常用于什么？",
      options: [
        "逐个处理数组元素",
        "改变显示器亮度",
        "永久删除操作系统",
        "把十进制变成文字",
      ],
      answer: 0,
      explain: "循环可以依次访问数组元素，并对每个元素执行处理。",
    },
    {
      q: "以下哪种结构根据条件选择执行路径？",
      options: ["顺序结构", "分支结构", "纯注释", "文件扩展名"],
      answer: 1,
      explain: "分支结构根据条件判断选择路径，例如 if / else。",
    },
  ],
};
function startQuiz(mode = "practice", chapter = 2, selection = null) {
  if (mode === "practice") selectChapter(chapter);
  clearInterval(examInterval);
  const list =
    selection ||
    (mode === "wrong"
      ? [questions[1], questions[5]]
      : mode === "exam"
        ? questions
        : chapterQuestions[chapter]);
  quiz = {
    mode,
    chapter,
    list,
    index: 0,
    selected: null,
    submitted: false,
    correct: 0,
    finished: false,
    started: Date.now(),
  };
  showDialog(
    mode === "wrong"
      ? "错题巩固"
      : mode === "exam"
        ? "模拟考试"
        : chapters[chapter].title,
    "",
    "示例题 · 交互体验",
  );
  renderQuestion();
  if (mode === "exam")
    examInterval = setInterval(() => {
      const timer = $("#exam-timer");
      if (timer)
        timer.textContent = formatTime(
          Math.floor((Date.now() - quiz.started) / 1000),
        );
    }, 1000);
}
function formatTime(seconds) {
  return (
    String(Math.floor(seconds / 60)).padStart(2, "0") +
    ":" +
    String(seconds % 60).padStart(2, "0")
  );
}
function renderQuestion() {
  const q = quiz.list[quiz.index];
  $("#dialog-content").innerHTML =
    '<div class="question-meta"><span>第 ' +
    (quiz.index + 1) +
    " / " +
    quiz.list.length +
    " 题</span><span>" +
    (quiz.mode === "exam"
      ? '<span id="exam-timer">' +
        formatTime(Math.floor((Date.now() - quiz.started) / 1000)) +
        "</span>"
      : "单项选择") +
    '</span></div><div class="question-bar"><i style="width:' +
    ((quiz.index + 1) / quiz.list.length) * 100 +
    '%"></i></div><h3 class="question-text">' +
    q.q +
    '</h3><div class="answer-options">' +
    q.options
      .map(
        (option, index) =>
          '<button class="answer-option ' +
          (quiz.selected === index ? "selected " : "") +
          (quiz.submitted && q.answer === index
            ? "correct "
            : quiz.submitted && quiz.selected === index
              ? "wrong "
              : "") +
          '" data-option="' +
          index +
          '" aria-pressed="' +
          (quiz.selected === index) +
          '" ' +
          (quiz.submitted ? "disabled" : "") +
          '><span class="option-letter">' +
          String.fromCharCode(65 + index) +
          "</span><span>" +
          option +
          "</span></button>",
      )
      .join("") +
    "</div>" +
    (quiz.submitted
      ? '<div class="question-feedback" role="status"><strong>' +
        (quiz.selected === q.answer
          ? "答对了，继续保持"
          : "正确答案是 " + String.fromCharCode(65 + q.answer)) +
        "</strong><p>" +
        q.explain +
        "</p></div>"
      : "") +
    '<div class="question-actions"><small>本页练习仅用于体验，不保存到账号</small><button class="primary-button" data-quiz-action="' +
    (quiz.submitted ? "next" : "submit") +
    '" ' +
    (quiz.selected === null ? "disabled" : "") +
    ">" +
    (quiz.submitted
      ? quiz.index === quiz.list.length - 1
        ? "查看结果"
        : "下一题"
      : "提交答案") +
    icon("arrow") +
    "</button></div>";
}
function updateStats() {
  $("#today-count").textContent = todayCount;
  $("#accuracy").textContent =
    Math.round((correctTotal / answeredTotal) * 100) + "%";
}
function submitAnswer() {
  if (quiz.selected === null || quiz.submitted) return;
  quiz.submitted = true;
  const correct = quiz.selected === quiz.list[quiz.index].answer;
  if (correct) {
    quiz.correct++;
    correctTotal++;
  }
  todayCount++;
  answeredTotal++;
  chapters[quiz.chapter].attempted = Math.min(
    chapters[quiz.chapter].total,
    chapters[quiz.chapter].attempted + 1,
  );
  updateStats();
  renderChapters();
  updateHeroProgress();
  renderQuestion();
  $('[data-quiz-action="next"]').focus({ preventScroll: true });
}
function finishQuiz() {
  quiz.finished = true;
  clearInterval(examInterval);
  $("#dialog-content").innerHTML =
    '<div class="result-summary"><div class="result-icon">' +
    icon("check") +
    '</div><h3>这一组，练完了</h3><p>把每一次练习，变成真正的进步。</p><div class="result-values"><div><strong>' +
    quiz.list.length +
    "</strong><span>完成题数</span></div><div><strong>" +
    Math.round((quiz.correct / quiz.list.length) * 100) +
    '%</strong><span>本组正确率</span></div></div><button class="primary-button" data-action="close">返回学习首页' +
    icon("arrow") +
    "</button></div>";
}
function chapterDialog() {
  showDialog(
    "按章节开始练习",
    '<p class="dialog-lead">选择你想继续学习的章节。办公自动化可以体验完整的 10 题练习。</p>' +
      chapters
        .map(
          (chapter, index) =>
            '<button class="dialog-row" data-start-chapter="' +
            index +
            '"><span class="row-icon">' +
            icon(index === 2 ? "pen" : "book") +
            '</span><span class="row-copy"><strong>' +
            chapter.title +
            "</strong><small>已练 " +
            chapter.attempted +
            " / " +
            chapter.total +
            " 题</small></span>" +
            icon("chevron") +
            "</button>",
        )
        .join(""),
  );
}
function aiDialog() {
  showDialog(
    "办公自动化 · 知识点精讲",
    '<p class="dialog-lead">先讲清楚，再用练习检查自己是否掌握。这是精讲页面的内容预览。</p><div class="pill-list"><span class="pill">Word</span><span class="pill">Excel</span><span class="pill">PowerPoint</span></div><div class="lesson-note"><h3>Excel：相对引用与绝对引用</h3><p><code>A1</code> 是相对引用。把公式复制到别的位置时，引用会跟着位置改变。</p><p><code>$A$1</code> 是绝对引用。行与列都固定，复制公式时仍然指向 A1。</p><p><code>$A1</code> 固定列，<code>A$1</code> 固定行，它们是混合引用。</p></div><button class="primary-button" data-action="practice">用练习检验一下' +
      icon("arrow") +
      "</button>",
    "精讲预览 · 示例内容",
  );
}
function examDialog() {
  showDialog(
    "做一次小型模拟考试",
    '<p class="dialog-lead">用 10 道示例题体验计时考试。本次结果只在 demo 页面显示。</p><div class="lesson-note"><h3>计算机综合练习</h3><p>题目数量：10 道单项选择</p><p>覆盖内容：计算机基础、Word、Excel、PowerPoint</p><p>开始后，右上角会显示用时。</p></div><button class="primary-button" data-action="start-exam">开始计时考试' +
      icon("arrow") +
      "</button>",
    "模拟考试 · 示例试卷",
  );
}
function settingsDialog() {
  showDialog(
    "让学习页更适合你",
    '<div class="setting-row"><div><strong>插画悬停动效</strong><p>W、X、P 浮动，以及其他章节的细节变化。</p></div><label class="switch"><input id="motion-switch" type="checkbox" ' +
      (motionEnabled ? "checked" : "") +
      ' aria-label="插画悬停动效"></label></div><p class="dialog-lead" style="margin-top:19px">' +
      (reducedMotion.matches
        ? "当前系统设置为减少动态效果，动画已自动关闭。"
        : "动效在鼠标悬停或键盘聚焦时触发，离开后归位。") +
      '</p><button class="text-button" data-action="reset">重置 demo 学习数据' +
      icon("arrow") +
      "</button>",
  );
}
const actions = {
  home: () => {
    if (dialog.open) closeDialog();
    $("#main").scrollIntoView({
      behavior: motionAllowed() ? "smooth" : "auto",
    });
  },
  chapters: chapterDialog,
  practice: () => startQuiz("practice", activeChapter),
  wrong: () => startQuiz("wrong", 2),
  exam: examDialog,
  "start-exam": () => startQuiz("exam", 2),
  ai: aiDialog,
  settings: settingsDialog,
  close: closeDialog,
  plan: () =>
    showDialog(
      "今天的小目标",
      '<p class="dialog-lead">每天练一点，把目标拆成可以完成的小步。</p><div class="plan-item"><span class="plan-check done">' +
        icon("check") +
        '</span><span><strong>开始今天的学习</strong><p>已完成 12 道练习题</p></span></div><div class="plan-item"><span class="plan-check"></span><span><strong>再练 10 道办公自动化</strong><p>复习 Word 与 Excel 的常用操作</p></span></div><div class="plan-item"><span class="plan-check"></span><span><strong>巩固 2 道错题</strong><p>弄清原因，再做一遍</p></span></div><div style="margin-top:25px"><button class="primary-button" data-action="practice">继续今天的练习' +
        icon("arrow") +
        "</button></div>",
    ),
  favorites: () =>
    showDialog(
      "留住容易混淆的知识",
      '<p class="dialog-lead">这些示例知识点值得再看一次。</p><button class="dialog-row" data-action="ai"><span class="row-icon">' +
        icon("book") +
        '</span><span class="row-copy"><strong>Excel 的相对与绝对引用</strong><small>办公自动化 · 高频知识点</small></span>' +
        icon("chevron") +
        '</button><button class="dialog-row" data-action="practice"><span class="row-icon">' +
        icon("pen") +
        '</span><span class="row-copy"><strong>常用 Office 快捷键</strong><small>通过练习巩固</small></span>' +
        icon("chevron") +
        "</button>",
    ),
  profile: () =>
    showDialog(
      "你的学习空间",
      '<p class="dialog-lead">这是网页版首页的交互 demo，你可以直接体验练习与章节动效。</p><div class="lesson-note"><h3>学习者</h3><p>当前科目：' +
        $("#course").value +
        "</p><p>今日已答：" +
        todayCount +
        ' 题</p><p>示例数据仅在当前页面使用。</p></div><button class="primary-button" data-action="settings">调整悬停动效' +
        icon("arrow") +
        "</button>",
    ),
  download: () => toast("当前预览为 Web 版，可直接在浏览器中体验。"),
  reset: () => {
    todayCount = 12;
    answeredTotal = 21;
    correctTotal = 17;
    [1, 3, 9, 1].forEach((n, index) => (chapters[index].attempted = n));
    updateStats();
    renderChapters();
    selectChapter(2);
    closeDialog();
    toast("学习数据已恢复为初始示例");
  },
};
document.addEventListener("click", (event) => {
  const option = event.target.closest("[data-option]");
  if (option && quiz && !quiz.submitted) {
    quiz.selected = Number(option.dataset.option);
    renderQuestion();
    $('[data-option="' + quiz.selected + '"]').focus({ preventScroll: true });
    return;
  }
  const quizAction = event.target.closest("[data-quiz-action]");
  if (quizAction && quiz) {
    if (quizAction.dataset.quizAction === "submit") submitAnswer();
    else if (quiz.index === quiz.list.length - 1) finishQuiz();
    else {
      quiz.index++;
      quiz.selected = null;
      quiz.submitted = false;
      renderQuestion();
      $(".question-text").scrollIntoView({ block: "nearest" });
    }
    return;
  }
  const chapter = event.target.closest("[data-chapter]");
  if (chapter) {
    selectChapter(Number(chapter.dataset.chapter));
    return;
  }
  const practiceChapter = event.target.closest("[data-start-chapter]");
  if (practiceChapter) {
    startQuiz("practice", Number(practiceChapter.dataset.startChapter));
    return;
  }
  const action = event.target.closest("[data-action]");
  if (action && actions[action.dataset.action])
    actions[action.dataset.action]();
});
document.addEventListener("change", (event) => {
  if (event.target.id === "motion-switch") {
    motionEnabled = event.target.checked;
    document.body.classList.toggle("motion-paused", !motionEnabled);
    motionStates.forEach((_, root) => stopOffice(root, true));
  }
});
$("#course").addEventListener("change", () => {
  $(".course-caption").textContent = $("#course").value;
  toast("已切换演示科目");
});
const searchItems = chapters
  .map((chapter, index) => ({ title: chapter.title, chapter: index }))
  .concat([
    { title: "AI 精讲与练习", action: "ai" },
    { title: "错题巩固", action: "wrong" },
    { title: "模拟考试", action: "exam" },
  ]);
function searchResults() {
  const query = $("#search").value.trim().toLowerCase();
  const found = searchItems.filter(
    (item) =>
      !query ||
      item.title.toLowerCase().includes(query) ||
      (query === "office" && item.chapter === 2),
  );
  $("#search-results").innerHTML = found.length
    ? found
        .map(
          (item) =>
            '<button class="search-result" role="option" ' +
            (item.action
              ? 'data-action="' + item.action + '"'
              : 'data-start-chapter="' + item.chapter + '"') +
            ">" +
            icon("search") +
            "<span>" +
            item.title +
            "</span></button>",
        )
        .join("")
    : '<p class="search-empty">没有找到，试试“办公”或“模拟考试”。</p>';
  $("#search-results").hidden = false;
  $("#search").setAttribute("aria-expanded", "true");
}
function hideSearch() {
  $("#search-results").hidden = true;
  $("#search").setAttribute("aria-expanded", "false");
}
$("#search").addEventListener("input", searchResults);
$("#search").addEventListener("focus", searchResults);
$("#search").addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    $(".search-result")?.focus();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    hideSearch();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    $(".search-result")?.click();
    hideSearch();
  }
});
$("#search-results").addEventListener("keydown", (event) => {
  const items = [...document.querySelectorAll(".search-result")];
  const index = items.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    items[
      (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
        items.length
    ]?.focus();
  }
  if (event.key === "Escape") {
    hideSearch();
    $("#search").focus();
    hideSearch();
  }
});
$("#search-results").addEventListener("click", hideSearch);
document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".search-wrap")) hideSearch();
});
document.addEventListener("keydown", (event) => {
  if (
    !dialog.open &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "k"
  ) {
    event.preventDefault();
    const target =
      document.body.dataset.page === "login"
        ? $("#landing-direction-search")
        : $("#search");
    target?.focus();
  }
});
