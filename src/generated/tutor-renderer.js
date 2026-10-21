/* Generated from the fixed, allowlisted demo renderer; texts are escaped, no model HTML is accepted. */
const icons={"bookmark":"<path d=\"M6 3h12a1 1 0 0 1 1 1v17l-7-5-7 5V4a1 1 0 0 1 1-1Z\" />","history":"<path d=\"M3 11a9 9 0 1 1 2.6 7M3 4v7h7m2-4v5l3 2\" />","trash":"<path d=\"M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7\" />","more":"<circle cx=\"4\" cy=\"12\" r=\"1\" />\n        <circle cx=\"12\" cy=\"12\" r=\"1\" />\n        <circle cx=\"20\" cy=\"12\" r=\"1\" />","info":"<circle cx=\"12\" cy=\"12\" r=\"9\" />\n        <path d=\"M12 11v6m0-10v.5\" />","crown":"<path d=\"m3 7 4 4 5-8 5 8 4-4-3 13H6ZM8 17h8\" />\n        <circle cx=\"3\" cy=\"6\" r=\"1\" />\n        <circle cx=\"12\" cy=\"2\" r=\"1\" />\n        <circle cx=\"21\" cy=\"6\" r=\"1\" />","gift":"<rect x=\"3\" y=\"8\" width=\"18\" height=\"5\" rx=\"1\" />\n        <path d=\"M5 13v8h14v-8M12 8v13\" />\n        <path d=\"M12 8H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z\" />","sparkles":"<path\n          d=\"m8 2 2 6 6 2-6 2-2 6-2-6-5-2 5-2Zm10 11 1 4 4 1-4 1-1 4-1-4-4-1 4-1Zm1-11 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8Z\"\n        />","home":"<path d=\"m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z\" />","book":"<path\n          d=\"M12 5v16M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2z\"\n        />","chapter":"<rect x=\"5\" y=\"3\" width=\"15\" height=\"18\" rx=\"2\" />\n        <path d=\"M5 7H3m2 5H3m2 5H3m6-10h7m-7 5h7m-7 5h4\" />","play":"<rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"3\" />\n        <path d=\"m10 8 6 4-6 4z\" />","wrong":"<path\n          d=\"M7 3h10l4 4v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2m10 0v5h5m-12 5 6 6m0-6-6 6\"\n        />","exam":"<path\n          d=\"M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4\"\n        />\n        <rect x=\"9\" y=\"2\" width=\"6\" height=\"5\" rx=\"1\" />\n        <path d=\"M8 12h8m-8 5h5\" />","star":"<path\n          d=\"m12 2 3.1 6.3L22 9.4l-5 4.8 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2l-5-4.8 6.9-1.1z\"\n        />","settings":"<path\n          d=\"m9 3 1-1h4l1 1 .5 2 2 1 2-.5 2 3-.5 2-1.5 1v2l1.5 1 .5 2-2 3-2-.5-2 1-.5 2-1 1h-4l-1-1-.5-2-2-1-2 .5-2-3 .5-2 1.5-1v-2L3 11l-.5-2 2-3 2 .5 2-1z\"\n        />\n        <circle cx=\"12\" cy=\"12\" r=\"3\" />","calendar":"<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"3\" />\n        <path d=\"M7 2v6m10-6v6M3 11h18m-13 5 3 3 5-5\" />","search":"<circle cx=\"10.5\" cy=\"10.5\" r=\"6.5\" />\n        <path d=\"m16 16 5 5\" />","arrow":"<path d=\"M4 12h16m-6-6 6 6-6 6\" />","chevron":"<path d=\"m9 5 7 7-7 7\" />","down":"<path d=\"m6 9 6 6 6-6\" />","download":"<path d=\"M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5\" />","pie":"<path d=\"M12 3a9 9 0 1 0 9 9h-9zm3-1v7h7a9 9 0 0 0-7-7z\" />","pen":"<path\n          d=\"M12 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-7M15 5l4 4m-9 5 1-4L19 2l4 4-8 8z\"\n        />","close":"<path d=\"m6 6 12 12M6 18 18 6\" />","check":"<path d=\"m5 12 4 4L19 6\" />","time":"<circle cx=\"12\" cy=\"12\" r=\"9\" />\n        <path d=\"M12 7v5l3 2\" />","menu":"<path d=\"M4 6h16M4 12h16M4 18h16\" />","grid":"<rect x=\"3\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\" />\n        <rect x=\"14\" y=\"3\" width=\"7\" height=\"7\" rx=\"1.5\" />\n        <rect x=\"3\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\" />\n        <rect x=\"14\" y=\"14\" width=\"7\" height=\"7\" rx=\"1.5\" />","keyboard":"<rect x=\"2\" y=\"5\" width=\"20\" height=\"14\" rx=\"2\" />\n        <path d=\"M6 9h1m3 0h1m3 0h1m3 0h1M6 12h1m3 0h1m3 0h1m3 0h1m-11 3h8\" />","route":"<path d=\"m3 5 6-3 6 3 6-3v17l-6 3-6-3-6 3zM9 2v17m6-14v17\" />","bell":"<path d=\"M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9m4 12h4M12 1v2\" />","plus":"<circle cx=\"12\" cy=\"12\" r=\"9\" />\n        <path d=\"M12 7v10M7 12h10\" />","sliders":"<path d=\"M3 6h4m4 0h10M3 12h10m4 0h4M3 18h4m4 0h10\" />\n        <circle cx=\"9\" cy=\"6\" r=\"2\" />\n        <circle cx=\"15\" cy=\"12\" r=\"2\" />\n        <circle cx=\"9\" cy=\"18\" r=\"2\" />","save":"<path\n          d=\"M18 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v10M7 3v6h9V3M7 21v-8h8\"\n        />\n        <path d=\"m15 18 2 2 5-6\" />"};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+(icons[name]||icons.book)+'</svg>';
const safe=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let drawing = 0;
  const word = (value) =>
    typeof value === "string" && value.length > 0 && value.length <= 650;
  const short = (value) => word(value) && value.length <= 100;
  const id = (value) =>
    typeof value === "string" && /^[a-zA-Z0-9:._-]{1,100}$/.test(value);
  const list = (value, check, max = 4) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= max &&
    value.every(check);
  const registry = Object.create(null);
  const exactFields = (value, allowed) => value && typeof value === "object" &&
    !Array.isArray(value) && Object.keys(value).every((key) => allowed.includes(key));
  const fields = {
    ExplanationCard: ["type", "id", "title", "paragraphs"],
    KnowledgeCard: ["type", "id", "title", "items"],
    ComparisonTable: ["type", "id", "title", "columns", "rows"],
    NetworkDiagram: [
      "type",
      "id",
      "title",
      "scenario",
      "caption",
      "source",
      "hosts",
    ],
    MiniQuiz: ["type", "id", "title", "prompt", "options", "kind"],
    EyeDiagram: ["type", "id", "title", "scenario", "caption"],
    FeedbackCard: [
      "type",
      "id",
      "title",
      "correct",
      "selectedId",
      "correctId",
      "correctText",
      "explanation",
      "errorType",
      "nextHint",
    ],
    LessonProgress: ["type", "id", "current", "total", "concepts"],
  };
  const checks = {
    EyeDiagram: (c) =>
      short(c.title) &&
      word(c.caption) &&
      ["amplitude-noise", "timing-jitter"].includes(c.scenario),
    ExplanationCard: (c) => short(c.title) && list(c.paragraphs, word, 3),
    KnowledgeCard: (c) => short(c.title) && list(c.items, word),
    ComparisonTable: (c) =>
      short(c.title) &&
      c.columns?.length >= 2 &&
      list(c.columns, short, 3) &&
      list(
        c.rows,
        (row) =>
          Array.isArray(row) &&
          row.length === c.columns.length &&
          row.every(short),
        5,
      ),
    NetworkDiagram: (c) =>
      short(c.title) &&
      word(c.caption) &&
      ["single-domain", "vlan-isolation", "access-port"].includes(c.scenario) &&
      ["A", "B", "C", "D"].includes(c.source) &&
      Array.isArray(c.hosts) &&
      c.hosts.length === 4 &&
      c.hosts.every(
        (h) =>
          exactFields(h, ["id", "vlan", "port"]) &&
          ["A", "B", "C", "D"].includes(h.id) &&
          [10, 20].includes(h.vlan) &&
          Number.isInteger(h.port) &&
          h.port >= 1 &&
          h.port <= 4,
      ) &&
      new Set(c.hosts.map((h) => h.id)).size === 4 &&
      new Set(c.hosts.map((h) => h.port)).size === 4,
    MiniQuiz: (c) =>
      short(c.title) &&
      word(c.prompt) &&
      ["check", "variant"].includes(c.kind) &&
      c.options?.length >= 2 &&
      list(c.options, (o) => exactFields(o, ["id", "text"]) && id(o.id) && word(o.text)) &&
      new Set(c.options.map((o) => o.id)).size === c.options.length &&
      !["answer", "correctId", "grading", "branches"].some((key) => key in c),
    FeedbackCard: (c) =>
      short(c.title) &&
      typeof c.correct === "boolean" &&
      id(c.selectedId) &&
      id(c.correctId) &&
      word(c.correctText) &&
      word(c.explanation) &&
      word(c.nextHint),
    LessonProgress: (c) =>
      Number.isInteger(c.total) &&
      c.total >= 1 &&
      c.total <= 12 &&
      Number.isInteger(c.current) &&
      c.current >= 0 &&
      c.current <= c.total &&
      Array.isArray(c.concepts) &&
      c.concepts.length === c.total &&
      c.concepts.every(
        (p) =>
          exactFields(p, ["id", "title", "status"]) &&
          id(p.id) &&
          short(p.title) &&
          ["locked", "current", "mastered", "review"].includes(p.status),
      ),
  };
  function validate(lesson) {
    if (
      !lesson ||
      lesson.schemaVersion !== 1 ||
      !list(
        lesson.components,
        (c) =>
          c &&
          id(c.id) &&
          Object.hasOwn(fields, c.type) &&
          Object.keys(c).every((key) => fields[c.type].includes(key)) &&
          checks[c.type]?.(c),
        10,
      ) ||
      new Set(lesson.components.map((c) => c.id)).size !==
        lesson.components.length
    )
      throw new Error("教学内容格式不正确，请重新连接。");
    return lesson;
  }
  const paragraphs = (values) =>
    values.map((p) => `<p>${safe(p)}</p>`).join("");
  registry.ExplanationCard = (c) =>
    `<section class="tutor-explanation" data-tutor-component="ExplanationCard"><h3>${safe(c.title)}</h3>${paragraphs(c.paragraphs)}</section>`;
  registry.KnowledgeCard = (c) =>
    `<aside class="tutor-knowledge" data-tutor-component="KnowledgeCard"><h3>${icon("book")}${safe(c.title)}</h3><ul>${c.items.map((item) => `<li>${safe(item)}</li>`).join("")}</ul></aside>`;
  registry.ComparisonTable = (c) =>
    `<section class="tutor-comparison" data-tutor-component="ComparisonTable"><h3>${safe(c.title)}</h3><table><caption class="sr-only">${safe(c.title)}</caption><thead><tr>${c.columns.map((col) => `<th scope="col">${safe(col)}</th>`).join("")}</tr></thead><tbody>${c.rows.map((row) => `<tr>${row.map((cell, i) => `<${i ? "td" : "th"}${i ? "" : ' scope="row"'}>${safe(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  registry.LessonProgress = (c) =>
    `<nav class="tutor-progress" aria-label="互动课程进度" data-tutor-component="LessonProgress"><ol>${c.concepts.map((p, i) => `<li class="${safe(p.status)}" ${p.status === "current" ? 'aria-current="step"' : ""}><span class="tutor-step-dot">${p.status === "mastered" ? icon("check") : i + 1}</span><span>${safe(p.title)}<small>${{ locked: i <= c.current ? "已学习" : "待学习", current: "正在学习", mastered: "已掌握", review: "待巩固" }[p.status]}</small></span></li>`).join("")}</ol><div class="tutor-progress-track" role="progressbar" aria-label="已学概念" aria-valuemin="0" aria-valuemax="${c.total}" aria-valuenow="${c.current}"><span style="width:${Math.round((c.current / c.total) * 100)}%"></span></div></nav>`;
  registry.MiniQuiz = (c, ctx) =>
    `<section class="tutor-quiz" data-tutor-component="MiniQuiz"><div class="tutor-section-meta"><span>${c.kind === "variant" ? "变式检验" : "理解小测"}</span><small>单选题</small></div><h3 id="tutor-quiz-title">${safe(c.title)}</h3><form id="tutor-quiz-form"><fieldset><legend>${safe(c.prompt)}</legend><div class="tutor-options">${c.options.map((o, i) => `<label class="tutor-option${ctx.selection === o.id ? " is-selected" : ""}"><input type="radio" name="tutor-answer" value="${safe(o.id)}"${ctx.selection === o.id ? " checked" : ""}${ctx.offline || ctx.busy ? " disabled" : ""}><span class="tutor-option-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${safe(o.text)}</span><span class="tutor-option-check" aria-hidden="true">${icon("check")}</span></label>`).join("")}</div></fieldset><div id="tutor-answer-error" role="alert" class="tutor-field-error"></div><div class="tutor-quiz-footer"><span>${icon("keyboard")}选择后按 Enter 提交</span><button class="ai-button ai-primary" type="submit"${ctx.offline || ctx.busy ? " disabled" : ""}>${ctx.busy ? "正在判分…" : "提交答案"}${icon("check")}</button></div></form></section>`;
  registry.FeedbackCard = (c) =>
    `<section class="tutor-feedback ${c.correct ? "correct" : "incorrect"}" data-tutor-component="FeedbackCard" tabindex="-1" aria-labelledby="tutor-feedback-title"><div class="tutor-feedback-head"><span class="tutor-feedback-symbol">${icon(c.correct ? "check" : "info")}</span><div><span>${c.correct ? "判断准确" : "找到一个需要澄清的地方"}</span><h3 id="tutor-feedback-title">${safe(c.title)}</h3></div></div><p>${safe(c.explanation)}</p><div class="tutor-correct-answer"><span>正确答案 ${safe(c.correctId.toUpperCase())}</span><strong>${safe(c.correctText)}</strong></div><p class="tutor-next-hint">${icon("arrow")}${safe(c.nextHint)}</p></section>`;

  function svgDiagram(c, source, played, mobile, interactive) {
    const tag = "tutor-network-" + ++drawing;
    const from = c.hosts.find((h) => h.id === source);
    const recipients = c.hosts
      .filter((h) => h.id !== source && h.vlan === from.vlan)
      .map((h) => h.id);
    const positions = mobile
      ? { A: [65, 65], B: [315, 65], C: [65, 270], D: [315, 270] }
      : { A: [84, 83], B: [84, 218], C: [636, 83], D: [636, 218] };
    const ports = mobile
      ? { A: [151, 126], B: [229, 126], C: [151, 204], D: [229, 204] }
      : { A: [282, 128], B: [282, 161], C: [438, 128], D: [438, 161] };
    const [sx, sy, sw, sh] = mobile ? [120, 126, 140, 78] : [282, 102, 156, 88];
    const connections = c.hosts
      .map((h) => {
        const [x, y] = positions[h.id],
          [px, py] = ports[h.id];
        const live = played && (h.id === source || recipients.includes(h.id));
        const points = mobile
          ? [
              [x + (x < 190 ? 46 : -46), y],
              [px, y],
              [px, py],
            ]
          : [
              [x + (x < 200 ? 46 : -46), y],
              [px + (x < 200 ? -26 : 26), y],
              [px, py],
            ];
        const pathOf = (values) =>
          values.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
        const path = pathOf(points);
        // The sender flows toward the switch; copies flow from the switch to recipients.
        const direction = h.id === source ? points : [...points].reverse();
        return `<path class="tutor-cable" d="${path}"/><path class="tutor-flow vlan-${h.vlan}${live ? " is-lit" : ""}" data-flow-role="${h.id === source ? "ingress" : "egress"}" d="${pathOf(direction)}"${live ? ` pathLength="100" marker-end="url(#${tag}-arrow-${h.vlan})"` : ""}/><circle class="tutor-switch-port" cx="${px}" cy="${py}" r="4"/>`;
      })
      .join("");
    const hosts = c.hosts
      .map((h) => {
        const [x, y] = positions[h.id];
        const received = played && recipients.includes(h.id);
        const sender = h.id === source;
        return `<g class="tutor-pc vlan-${h.vlan}" data-host="${h.id}" data-vlan="${h.vlan}" data-receives="${received}">
        <rect class="tutor-pc-halo" x="${x - 43}" y="${y - 35}" width="86" height="68" rx="13"/>
        <rect class="tutor-pc-screen" x="${x - 29}" y="${y - 22}" width="58" height="35" rx="5"/>
        <path class="tutor-pc-screen-line" d="M${x - 17} ${y - 12}h24m-24 7h32m-32 7h19"/>
        <path class="tutor-pc-stand" d="M${x - 4} ${y + 14}v9h-14m14 0h22"/>
        <text class="tutor-pc-label" x="${x}" y="${y + 49}" text-anchor="middle">主机 ${h.id} · 端口 ${h.port}</text>
        <text class="tutor-vlan-label" x="${x}" y="${y - 45}" text-anchor="middle">VLAN ${h.vlan}</text>
        ${sender ? `<text class="tutor-pc-state sender" x="${x}" y="${y + 67}" text-anchor="middle">${played ? "广播发送端" : "本图发送端"}</text>` : played ? `<text class="tutor-pc-state${received ? " received" : ""}" x="${x}" y="${y + 67}" text-anchor="middle">${received ? "收到广播" : "另一个 VLAN · 不转发"}</text>` : ""}
      </g>`;
      })
      .join("");
    return `<svg class="tutor-topology ${mobile ? "is-mobile" : "is-desktop"}${played ? " is-playing" : ""}" role="img" aria-labelledby="${tag}-title ${tag}-desc" viewBox="0 0 ${mobile ? "380 362" : "720 310"}" xmlns="http://www.w3.org/2000/svg">
      <defs>${[10, 20].map((vlan) => `<marker id="${tag}-arrow-${vlan}" markerWidth="4" markerHeight="4" refX="7" refY="4" orient="auto" viewBox="0 0 8 8"><path d="M0 0 8 4 0 8Z" class="tutor-arrow vlan-${vlan}"/></marker>`).join("")}</defs>
      <title id="${tag}-title">${safe(c.title)}</title><desc id="${tag}-desc">${safe(c.hosts.map((h) => `主机 ${h.id} 接端口 ${h.port}，属于 VLAN ${h.vlan}`).join("；"))}。${played ? safe(`主机 ${source} 发出的广播仅转发给 ${recipients.join("、") || "其他同 VLAN 主机（当前没有）"}。`) : interactive ? "点击发送按钮观察广播范围。" : "根据这些端口与 VLAN 条件判断广播范围。"}</desc>
      ${connections}<g class="tutor-switch"><rect class="tutor-switch-base" x="${sx}" y="${sy + 9}" width="${sw}" height="${sh}" rx="12"/>
      <rect class="tutor-switch-body" x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="12"/>
      <text x="${sx + sw / 2}" y="${sy + 29}" text-anchor="middle">二层交换机</text>
      <path d="M${sx + 40} ${sy + 48}h28m-8-7 8 7-8 7m36-7h-28m8-7-8 7 8 7"/>
      </g>${hosts}</svg>`;
  }
  function network(c, ctx = {}) {
    const source =
      ctx.interactive &&
      ["A", "B", "C", "D"].includes(ctx.diagramSources?.[c.id])
        ? ctx.diagramSources[c.id]
        : c.source;
    const played = !!ctx.played?.[c.id] && ctx.interactive;
    const from = c.hosts.find((h) => h.id === source);
    const recipients = c.hosts.filter(
      (h) => h.id !== source && h.vlan === from.vlan,
    );
    return `<section class="tutor-network" data-tutor-component="NetworkDiagram" data-diagram-id="${safe(c.id)}"><div class="tutor-network-heading"><h3>${safe(c.title)}</h3><div class="tutor-network-legend"><span class="vlan-10">VLAN 10</span>${c.hosts.some((h) => h.vlan === 20) ? '<span class="vlan-20">VLAN 20</span>' : ""}</div></div>
      <div class="tutor-drawing">${svgDiagram(c, source, played, false, ctx.interactive)}${svgDiagram(c, source, played, true, ctx.interactive)}</div>
      ${ctx.interactive ? `<div class="tutor-network-controls"><span>亲手试一下</span>${["A", "C"].map((h) => `<button type="button" class="ai-button" data-tutor-action="broadcast" data-diagram="${safe(c.id)}" data-source="${h}" aria-pressed="${played && source === h}">${icon("arrow")}从主机 ${h} 发广播</button>`).join("")}</div>` : '<p class="tutor-diagram-quiz-note">根据端口与 VLAN 标签判断，提交后查看结果。</p>'}
      <div class="tutor-network-result" role="status" aria-live="polite">${played ? `<strong>${source} 发出的广播</strong><span>${recipients.length ? recipients.map((h) => h.id).join("、") + " 收到；其他 VLAN 不转发，入口端口不回发。" : "没有其他同 VLAN 主机可接收；入口端口不回发。"}</span>` : `<span>${ctx.interactive ? "先选一台主机，观察帧会走向哪些端口。" : "只展示本题的网络条件，作答前不显示判分结果。"}</span>`}</div>
      ${c.scenario === "access-port" ? '<div class="tutor-access-path"><span>电脑发送<br/><strong>未标记帧</strong></span><i aria-hidden="true">→</i><span>Access 端口<br/><strong>按端口配置归属</strong></span><i aria-hidden="true">→</i><span>同一 VLAN<br/><strong>转发到其他端口</strong></span></div>' : ""}
      <p class="tutor-diagram-caption">${safe(c.caption)}</p></section>`;
  }
  registry.NetworkDiagram = network;
  registry.EyeDiagram = (c) => {
    const uid = "eye-" + ++drawing,
      noisy = c.scenario === "amplitude-noise";
    function graph(affected) {
      const label = affected
        ? noisy
          ? "幅度噪声增加"
          : "时间抖动增加"
        : "参照示意";
      const paths = [];
      for (let i = -3; i <= 3; i++) {
        const dy = affected && noisy ? i * 5 : i,
          dx = affected && !noisy ? i * 7 : 0;
        paths.push(
          `<path d="M45 ${170 + dy} C${100 + dx} ${170 + dy} ${130 + dx} ${70 + dy} 200 ${70 + dy} S${310 + dx} ${170 + dy} 385 ${170 + dy}"/><path d="M45 ${70 + dy} C${100 + dx} ${70 + dy} ${130 + dx} ${170 + dy} 200 ${170 + dy} S${310 + dx} ${70 + dy} 385 ${70 + dy}"/>`,
        );
      }
      const tag = uid + (affected ? "-affected" : "-reference");
      return `<figure class="tutor-eye-panel" data-eye-scenario="${affected ? c.scenario : "reference"}"><figcaption>${label}</figcaption><svg role="img" aria-labelledby="${tag}-title ${tag}-desc" viewBox="0 0 430 235" xmlns="http://www.w3.org/2000/svg"><title id="${tag}-title">${label}</title><desc id="${tag}-desc">${affected ? (noisy ? "波形在电压方向更分散，纵向判决余量减小。" : "波形跳变在时间方向更分散，横向判决余量减小。") : "眼图参照：纵轴是电压，横轴是时间。"}仅为示意，不代表测量数值或误码率。</desc><g class="tutor-eye-grid"><path d="M45 35v165h345M45 70h340M45 120h340M45 170h340M130 35v165M215 35v165M300 35v165"/></g><g class="tutor-eye-traces">${paths.join("")}</g><text x="13" y="25">电压</text><text x="365" y="222">时间</text><path class="tutor-eye-sampling" d="M215 45v145"/></svg></figure>`;
    }
    return `<section class="tutor-eye" data-tutor-component="EyeDiagram"><h3>${safe(c.title)}</h3><div class="tutor-eye-pair">${graph(false)}${graph(true)}</div><p class="tutor-diagram-caption">${safe(c.caption)}</p></section>`;
  };
  function render(lesson, ctx = {}) {
    return validate(lesson)
      .components.map((c) => registry[c.type](c, ctx))
      .join("");
  }

export {render,validate,network};
