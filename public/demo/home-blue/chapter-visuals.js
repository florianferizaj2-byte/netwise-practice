"use strict";
(() => {
  const catalog = window.AceChapterVisualCatalog;
  if (!catalog) return;
  const safe = (text) =>
    String(text).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const originals = { ...art };
  const blue = "#4c86ed",
    ink = "#285bd2",
    green = "#23ae8d",
    purple = "#8b65db";
  const base = '<ellipse cx="120" cy="173" rx="94" ry="20" fill="#dceaff"/>';
  const badge = (text, color = ink, x = 162, y = 49) =>
    `<g class="cv-spark"><rect x="${x}" y="${y}" width="56" height="31" rx="8" fill="${color}"/><text x="${x + 28}" y="${y + 21}" text-anchor="middle" fill="white" font-size="15" font-weight="700">${text}</text></g>`;
  const panel = (inside, color = blue) =>
    `<g class="cv-lift"><path d="m54 38 126-16 12 137-130 20Z" fill="${ink}"/><path d="m44 35 126-16a8 8 0 0 1 9 8l13 123a8 8 0 0 1-7 9L60 176a8 8 0 0 1-9-7L36 44a8 8 0 0 1 8-9Z" fill="#f9fcff" stroke="#b9d2fa" stroke-width="2"/><path d="m44 35 126-16a8 8 0 0 1 9 8l2 18-142 18-3-19a8 8 0 0 1 8-9Z" fill="${color}"/><circle cx="49" cy="46" r="3" fill="white"/><circle cx="61" cy="44" r="3" fill="white"/><circle cx="73" cy="43" r="3" fill="white"/>${inside}</g>`;
  const host = (x, y, color = blue) =>
    `<g class="cv-node"><rect x="${x}" y="${y}" width="40" height="29" rx="5" fill="${color}"/><path d="M${x + 5} ${y + 25}h30" stroke="#daebff" stroke-width="2"/><path d="M${x + 20} ${y + 30}v7m-13 0h26" stroke="${ink}" stroke-width="3" stroke-linecap="round"/></g>`;
  const router = (label = "", color = blue) =>
    `<g class="cv-lift"><path d="M67 110v31c0 37 111 37 111 0v-31" fill="${ink}"/><ellipse cx="122" cy="110" rx="56" ry="25" fill="${color}"/><path d="m96 103 12-8-2 9m-10-1 16 9m36-18-11 9 11 3m-11-2 16 8m-36 9 13-8 3 8m-4-7 16-9" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${label ? `<text x="123" y="148" text-anchor="middle" fill="white" font-size="14" font-weight="700">${label}</text>` : ""}</g>`;
  const gear = (x = 180, y = 133) =>
    `<g class="cv-spin"><circle cx="${x}" cy="${y}" r="22" fill="${purple}"/><path d="M${x} ${y - 27}v8m0 38v8m-27-27h8m38 0h8m-46-19 6 6m26 26 6 6m-38 0 6-6m26-26 6-6" stroke="${purple}" stroke-width="9"/><circle cx="${x}" cy="${y}" r="9" fill="#eee6ff"/></g>`;
  const server = (x, y, color = blue) =>
    `<g class="cv-lift"><path d="m${x + 46} ${y} 13 7v117l-13 9Z" fill="${ink}"/><rect x="${x}" y="${y}" width="47" height="133" rx="7" fill="${color}"/>${[17, 49, 81].map((n) => `<rect x="${x + 6}" y="${y + n}" width="35" height="23" rx="4" fill="#dfeaff"/><path d="M${x + 11} ${y + n + 8}h13m-13 6h13" stroke="${ink}" stroke-width="2"/><circle class="cv-led" cx="${x + 33}" cy="${y + n + 12}" r="3" fill="${green}"/>`).join("")}</g>`;
  const wave = (x = 120, y = 39) =>
    `<g class="cv-wave" fill="none" stroke="${blue}" stroke-width="7" stroke-linecap="round"><path d="M${x - 42} ${y}q42-36 84 0"/><path d="M${x - 26} ${y + 16}q26-22 52 0"/><path d="M${x - 10} ${y + 32}q10-8 20 0"/></g>`;
  const packet =
    '<circle class="cv-packet" cx="51" cy="122" r="6" fill="#ffba58"/>';
  function topology(kind) {
    const left = kind === "vlan" ? green : blue;
    const lines =
      kind === "aggregation"
        ? '<path d="M66 73 184 122m-119-36 118 49m-119-36 118 49" stroke="#8cb4ef" stroke-width="5"/>'
        : '<path d="M65 69 124 116 186 69m-62 47-62 38m62-38 62 38" stroke="#91b8ee" stroke-width="4"/>';
    return (
      lines +
      host(42, 40, left) +
      host(166, 40) +
      host(42, 140, left) +
      host(166, 140) +
      '<g class="cv-lift"><path d="m99 105 25-14 28 15-27 15Z" fill="#9bc8ff"/><path d="m99 105 26 16v23l-26-16Z" fill="#3b7fe2"/><path d="m125 121 27-15v23l-27 15Z" fill="#2860c3"/></g>' +
      packet +
      (kind === "vlan"
        ? badge("10", green, 23, 89) + badge("20", ink, 159, 89)
        : kind === "tree"
          ? '<path d="m152 118 24 22m-24 0 24-22" stroke="#f29267" stroke-width="5" stroke-linecap="round"/>'
          : kind === "aggregation"
            ? badge("LACP")
            : kind === "design"
              ? badge("LAN")
              : "")
    );
  }
  function officeFile(letter, color) {
    const content =
      letter === "W"
        ? '<g class="cv-scan" stroke="#8fb4f0" stroke-width="5" stroke-linecap="round"><path d="M72 82h82m-82 18h82m-82 18h57m-57 18h73"/></g>'
        : letter === "X"
          ? '<g stroke="#a2dbc9" stroke-width="2"><path d="M72 75h89v64H72Zm30 0v64m30-64v64M72 97h89m-89 21h89"/></g><g class="cv-bars" fill="#3fbb91"><rect x="83" y="105" width="10" height="24"/><rect x="113" y="91" width="10" height="38"/><rect x="143" y="79" width="10" height="50"/></g>'
          : '<g class="cv-bars"><rect x="80" y="109" width="18" height="27" rx="3" fill="#ffbd80"/><rect x="108" y="91" width="18" height="45" rx="3" fill="#ff9650"/><rect x="136" y="78" width="18" height="58" rx="3" fill="#ed7732"/></g>';
    return (
      panel(content, color) +
      `<g class="cv-spark"><rect x="28" y="83" width="53" height="57" rx="9" fill="${color}"/><text x="54" y="122" text-anchor="middle" fill="white" font-size="35" font-weight="800">${letter}</text></g>`
    );
  }
  const drawings = {
    layers: () =>
      [0, 1, 2, 3]
        .map(
          (n) =>
            `<g class="cv-layer" style="--cv-delay:${n * 70}ms"><path d="m51 ${111 - n * 22} 70-32 70 32-70 33Z" fill="${["#245bc8", "#4c86ed", "#87b4f5", "#bbd9ff"][n]}" stroke="#eaf4ff" stroke-width="2"/><text x="121" y="${124 - n * 22}" text-anchor="middle" fill="${n > 1 ? ink : "white"}" font-size="14" font-weight="700">${["网络接入", "网络层", "传输层", "应用层"][n]}</text></g>`,
        )
        .join(""),
    terminal: () =>
      panel(
        '<rect x="61" y="75" width="108" height="68" rx="7" fill="#28416c"/><text x="73" y="104" fill="#8ce1c5" font-size="20" font-family="monospace">&gt;_</text><path class="cv-cursor" d="M111 104h13" stroke="white" stroke-width="3"/><path class="cv-scan" d="M74 122h59" stroke="#8cb6f5" stroke-width="4"/>',
      ),
    switch: () => topology("switch"),
    vlan: () => topology("vlan"),
    tree: () => topology("tree"),
    aggregation: () => topology("aggregation"),
    design: () => topology("design"),
    routing: () =>
      '<path d="M43 88h43m80 0h34M120 47v33" stroke="#8ab6ec" stroke-width="4"/>' +
      host(23, 54) +
      host(179, 54) +
      router("IP") +
      packet,
    ospf: () =>
      '<circle class="cv-orbit" cx="121" cy="101" r="71" stroke="#a9c8f7" stroke-width="4" stroke-dasharray="7 7"/>' +
      router("OSPF", purple) +
      badge("邻居", purple),
    address: () =>
      panel(
        '<text x="69" y="89" fill="#265cca" font-size="20" font-weight="700">IPv4</text><g class="cv-scan" fill="#d4e5ff">' +
          [0, 1, 2, 3]
            .map(
              (n) =>
                `<rect x="${66 + n * 26}" y="105" width="22" height="25" rx="5"/>`,
            )
            .join("") +
          '</g><text x="76" y="147" fill="#53749e" font-size="14">地址 · 子网</text>',
      ) + badge("/24"),
    ipv6: () =>
      panel(
        '<text x="69" y="89" fill="#7252bd" font-size="22" font-weight="700">IPv6</text><path class="cv-scan" d="M69 109h17m7 0h17m7 0h17m7 0h17m-89 18h17m7 0h17m7 0h17m7 0h17" stroke="#b4a0e1" stroke-width="7" stroke-linecap="round"/>',
        purple,
      ) + badge("128", purple),
    nat: () =>
      panel(
        '<g class="cv-scan"><rect x="66" y="77" width="97" height="30" rx="6" fill="#e1f6ec"/><text x="115" y="97" text-anchor="middle" fill="#19856c" font-size="15">私网地址</text><path d="M113 112v15m-6-5 6 6 6-6" stroke="#668dd0" stroke-width="3"/><rect x="71" y="133" width="98" height="25" rx="6" fill="#dceaff"/><text x="120" y="151" text-anchor="middle" fill="#2459c5" font-size="15">公网地址</text></g>',
      ) + badge("NAT"),
    security: () =>
      '<g class="cv-lift"><path d="M119 26c21 18 47 25 71 28v53c0 33-29 58-71 77-42-19-71-44-71-77V54c24-3 50-10 71-28Z" fill="#1c977c"/><path d="M112 25c21 18 44 25 67 28v49c0 31-26 54-67 72-40-18-66-41-66-72V53c23-3 46-10 66-28Z" fill="#43c8a3" stroke="#a8efd8" stroke-width="4"/><path class="cv-scan" d="m79 92 25 25 48-50" stroke="white" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      badge("安全", green),
    acl: () =>
      panel(
        '<g class="cv-scan">' +
          [0, 1, 2]
            .map(
              (n) =>
                `<path d="M87 ${84 + n * 27}h67" stroke="#a8c7f6" stroke-width="6" stroke-linecap="round"/><circle cx="68" cy="${84 + n * 27}" r="9" fill="${n === 1 ? "#f39a73" : green}"/><path d="${n === 1 ? `m64 ${80 + n * 27} 8 8m-8 0 8-8` : `m64 ${84 + n * 27} 3 3 5-6`}" stroke="white" stroke-width="2"/>`,
            )
            .join("") +
          "</g>",
      ) + badge("ACL"),
    identity: () =>
      panel(
        '<circle cx="115" cy="85" r="17" fill="#7caceb"/><path d="M79 137c0-41 73-41 73 0" fill="#b9d5fb"/><g class="cv-spark"><circle cx="154" cy="122" r="21" fill="#30b28e"/><path d="m144 123 7 7 14-18" stroke="white" stroke-width="4" stroke-linecap="round"/></g>',
      ) + badge("AAA", green),
    services: () => server(64, 31) + server(121, 42, "#80b0f3") + badge("服务"),
    datacenter: () =>
      server(33, 40, "#a2c4f7") + server(91, 23) + server(151, 42, "#7ba9eb"),
    wireless: () =>
      wave() +
      router("Wi-Fi") +
      '<path d="M78 82v40m89-40v40" stroke="#3771cc" stroke-width="7" stroke-linecap="round"/>',
    "wlan-network": () =>
      wave(120, 34) +
      '<path d="M54 126h132m-66-31v32" stroke="#8cb5eb" stroke-width="4"/>' +
      host(30, 124, green) +
      host(166, 124) +
      router("WLAN"),
    "wlan-config": () => wave() + router("AP") + gear(187, 133),
    management: () =>
      server(42, 34) +
      panel(
        '<g class="cv-bars" fill="#74a9ef"><rect x="100" y="109" width="13" height="27"/><rect x="124" y="90" width="13" height="46"/><rect x="148" y="77" width="13" height="59"/></g>',
      ) +
      badge("监控"),
    automation: () =>
      panel(
        '<g class="cv-scan" stroke="#8b65db" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="m87 86-16 20 16 13m50-38 18 14-14 20m-28-39-11 47"/></g>',
        purple,
      ) + gear(),
    troubleshooting: () =>
      panel(
        '<path class="cv-scan" d="M64 117h24l12-33 19 49 14-23h26" stroke="#70a6ec" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>',
      ) +
      '<g class="cv-spark"><circle cx="175" cy="135" r="24" fill="#eaf4ff" stroke="#4c86ed" stroke-width="7"/><path d="m194 153 22 22" stroke="#285bd2" stroke-width="10" stroke-linecap="round"/></g>',
    project: () =>
      panel(
        '<g class="cv-scan"><path d="M71 83h26m-26 23h42m-42 24h31" stroke="#b3c9e9" stroke-width="5" stroke-linecap="round"/><rect x="116" y="74" width="42" height="13" rx="4" fill="#9dbeee"/><rect x="125" y="98" width="40" height="13" rx="4" fill="#6d9fe8"/><rect x="111" y="122" width="35" height="13" rx="4" fill="#f6b767"/></g>',
      ) + badge("计划", purple),
    word: () => officeFile("W", blue),
    excel: () => officeFile("X", green),
    powerpoint: () => officeFile("P", "#f49445"),
    "c-program": () =>
      panel(
        '<g font-family="monospace" font-weight="700"><text x="64" y="89" fill="#8b65db" font-size="15">int main()</text><text x="66" y="113" fill="#285bd2" font-size="20">{</text><path class="cv-scan" d="M86 110h53m-53 16h40" stroke="#94b8ef" stroke-width="5" stroke-linecap="round"/><text x="72" y="148" fill="#285bd2" font-size="20">}</text></g>',
        purple,
      ) + badge("C", purple),
    "c-types": () =>
      panel(
        '<g class="cv-scan" font-family="monospace" font-weight="700" font-size="15"><rect x="61" y="73" width="101" height="25" rx="5" fill="#e2edff"/><text x="70" y="91" fill="#285bd2">int 42</text><rect x="65" y="103" width="101" height="25" rx="5" fill="#e7defb"/><text x="74" y="121" fill="#7550c4">char \'A\'</text><text x="72" y="148" fill="#19856c">double 3.5</text></g>',
      ),
    "c-statements": () =>
      panel(
        '<g font-family="monospace" font-size="15" font-weight="700" fill="#285bd2"><text x="63" y="91">scanf()</text><path class="cv-packet" d="M74 105h42" stroke="#23ae8d" stroke-width="5" stroke-linecap="round"/><text x="69" y="137">printf()</text></g><path class="cv-scan" d="m150 81 12 8-12 8m-61 52 12 8-12 8" stroke="#8b65db" stroke-width="3" fill="none"/>',
      ),
    "c-control": () =>
      '<g class="cv-lift"><path d="m120 29 43 29-43 29-43-29Z" fill="#a58ae6" stroke="#d6c7fa" stroke-width="3"/><text x="120" y="64" text-anchor="middle" fill="white" font-family="monospace" font-size="17" font-weight="700">if</text><path d="M77 58H46v64m117-64h32v64M46 148v23h149v-23" stroke="#91b8ee" stroke-width="4" fill="none"/><rect x="25" y="121" width="64" height="30" rx="7" fill="#6ca4f1"/><rect x="154" y="121" width="64" height="30" rx="7" fill="#46bb9b"/><text x="57" y="142" text-anchor="middle" fill="white" font-size="14">分支</text><text x="186" y="142" text-anchor="middle" fill="white" font-size="14">循环</text></g><circle class="cv-packet" cx="46" cy="98" r="6" fill="#ffba58"/>',
    "c-array": () =>
      panel(
        '<text x="63" y="87" fill="#285bd2" font-family="monospace" font-weight="700" font-size="17">a[4]</text>' +
          [0, 1, 2, 3]
            .map(
              (n) =>
                `<g class="cv-layer" style="--cv-delay:${n * 70}ms"><rect x="${61 + n * 27}" y="101" width="24" height="32" rx="4" fill="${n === 1 ? "#8b65db" : "#77a8ed"}"/><text x="${73 + n * 27}" y="123" text-anchor="middle" fill="white" font-family="monospace" font-size="16">${n + 2}</text><text x="${73 + n * 27}" y="149" text-anchor="middle" fill="#53749e" font-family="monospace" font-size="13">${n}</text></g>`,
            )
            .join(""),
      ),
    "c-function": () =>
      '<g class="cv-lift"><path d="m80 61 98-13 12 98-98 13Z" fill="#8b65db" stroke="#cdb9fa" stroke-width="4"/><text x="135" y="111" text-anchor="middle" fill="white" font-family="monospace" font-size="31" font-weight="700">f(x)</text></g><path class="cv-scan" d="M25 108h43m-10-8 10 8-10 8m131-8h37m-10-8 10 8-10 8" fill="none" stroke="#4c86ed" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><text x="46" y="146" text-anchor="middle" fill="#53749e" font-size="14">参数</text><text x="210" y="146" text-anchor="middle" fill="#53749e" font-size="14">返回值</text>',
    "c-preprocessor": () =>
      panel(
        '<g class="cv-scan" font-family="monospace" font-weight="700" font-size="15"><text x="62" y="90" fill="#7550c4">#include</text><text x="67" y="118" fill="#285bd2">#define</text><path d="M71 137h77" stroke="#a8c7f6" stroke-width="5" stroke-linecap="round"/></g>',
        purple,
      ) + gear(189, 143),
    "c-pointer": () =>
      '<g class="cv-lift"><rect x="28" y="80" width="67" height="64" rx="9" fill="#8b65db" stroke="#d4c6f5" stroke-width="3"/><text x="61" y="121" text-anchor="middle" fill="white" font-family="monospace" font-size="28" font-weight="700">*p</text><rect x="157" y="80" width="66" height="64" rx="9" fill="#6ca4f1" stroke="#b6d5ff" stroke-width="3"/><text x="190" y="121" text-anchor="middle" fill="white" font-family="monospace" font-size="28" font-weight="700">x</text></g><path class="cv-scan" d="M104 110h42m-10-10 10 10-10 10" stroke="#23ae8d" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><text x="61" y="62" text-anchor="middle" fill="#7550c4" font-size="14">指针</text><text x="189" y="62" text-anchor="middle" fill="#285bd2" font-size="14">对象</text>',
    "c-record": () =>
      panel(
        '<text x="63" y="84" fill="#7550c4" font-family="monospace" font-size="16" font-weight="700">struct</text><g class="cv-layer"><rect x="65" y="96" width="100" height="22" rx="5" fill="#80adee"/><text x="76" y="112" fill="white" font-family="monospace" font-size="13">int id;</text></g><g class="cv-layer" style="--cv-delay:80ms"><rect x="69" y="122" width="100" height="24" rx="5" fill="#a58ae6"/><text x="80" y="139" fill="white" font-family="monospace" font-size="13">char tag;</text></g>',
        purple,
      ),
    "c-bits": () =>
      panel(
        '<g class="cv-scan" font-family="monospace" font-size="22" font-weight="700"><text x="66" y="92" fill="#285bd2">0 1 0 1</text><text x="69" y="122" fill="#23ae8d">1 0 1 0</text><path d="M71 136h90" stroke="#b9d2fa" stroke-width="3"/><text x="92" y="159" fill="#7550c4" font-size="17">&amp; | ^</text></g>',
      ),
    "c-file": () =>
      '<g class="cv-lift"><path d="M57 35h84l28 29v99H57Z" fill="#f9fcff" stroke="#b9d2fa" stroke-width="3"/><path d="M141 35v30h28" fill="#a8c7f6"/><path class="cv-scan" d="M77 82h66m-66 20h66m-66 20h43" stroke="#80adee" stroke-width="5" stroke-linecap="round"/></g><g class="cv-spark"><rect x="129" y="121" width="83" height="39" rx="9" fill="#8b65db"/><text x="170" y="147" text-anchor="middle" fill="white" font-family="monospace" font-size="20" font-weight="700">FILE*</text></g>',
  };
  const supported = new Set([
    ...Object.keys(drawings),
    ...Object.keys(originals),
  ]);
  function renderKind(kind) {
    if (!supported.has(kind)) throw new Error("章节插画尚未登记：" + kind);
    const content = drawings[kind]
      ? '<div class="art chapter-code-art">' +
        svg(base + drawings[kind]()) +
        "</div>"
      : originals[kind]();
    return `<span class="chapter-visual" data-visual-kind="${kind}" aria-hidden="true">${content}</span>`;
  }
  const find = (certificateId, title) =>
    catalog.certificates
      .find((c) => c.id === certificateId)
      ?.chapters.find((c) => c.title === title || c.id === title);
  let galleryCertificate = catalog.certificates[0].id,
    galleryChapter = null;
  function paintGallery() {
    const mount = $("#chapter-visual-gallery");
    if (!mount) return;
    const certificate = catalog.certificates.find(
      (c) => c.id === galleryCertificate,
    );
    galleryChapter =
      certificate.chapters.find((c) => c.id === galleryChapter)?.id ||
      certificate.chapters[0].id;
    const q = $("#cv-search").value.trim().toLowerCase();
    const list = certificate.chapters.filter((c) =>
      (c.title + " " + c.topics.join(" ")).toLowerCase().includes(q),
    );
    mount
      .querySelectorAll("[data-cv-certificate]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.cvCertificate === galleryCertificate),
        ),
      );
    $("#cv-count").textContent =
      `${certificate.name} · ${list.length} / ${certificate.chapters.length} 个章节`;
    $("#cv-list").innerHTML = list.length
      ? list
          .map(
            (c) =>
              `<button type="button" class="cv-card cv-trigger" data-cv-chapter="${safe(c.id)}" aria-pressed="${c.id === galleryChapter}"><span class="cv-card-art">${renderKind(c.kind)}</span><span><strong>${safe(c.title)}</strong><small>${safe(c.topics.slice(0, 2).join(" · "))}</small></span>${icon("chevron")}</button>`,
          )
          .join("")
      : '<p class="cv-empty" role="status">没有匹配的章节，试试其他关键词。</p>';
    const c = certificate.chapters.find((c) => c.id === galleryChapter);
    $("#cv-preview").innerHTML =
      `<span class="cv-preview-label">章节主视觉</span><div class="cv-stage cv-trigger" tabindex="0" aria-label="${safe(c.title)}的大图标；聚焦可预览动效">${renderKind(c.kind)}</div><h3>${safe(c.title)}</h3><div class="cv-topics">${c.topics
        .slice(0, 3)
        .map((t) => `<span>${safe(t)}</span>`)
        .join(
          "",
        )}</div><div class="cv-preview-actions"><button type="button" class="study-outline" data-cv-replay>${icon("play")}播放动效</button>${["network-engineer", "sichuan-upgrading-computer"].includes(certificate.id) ? `<button type="button" class="primary-button" data-cv-study>进入本章精讲 ${icon("arrow")}</button>` : ""}</div><p class="cv-preview-note">卡片小图与主视觉共用同一插画。<br>悬停、键盘聚焦或点击按钮可预览。</p>`;
  }
  function open(
    certificateId = window.AceCertificates?.active().id,
    chapterTitle,
  ) {
    galleryCertificate = catalog.certificates.some(
      (c) => c.id === certificateId,
    )
      ? certificateId
      : catalog.certificates[0].id;
    galleryChapter = find(galleryCertificate, chapterTitle)?.id || null;
    showDialog(
      "每一章，都有自己的图标",
      `<section id="chapter-visual-gallery"><div class="cv-certificates" role="group" aria-label="查看证书章节">${catalog.certificates.map((c) => `<button type="button" data-cv-certificate="${c.id}" aria-pressed="false">${safe(c.name)}</button>`).join("")}</div><div class="cv-toolbar"><p id="cv-count" role="status" aria-live="polite"></p><label class="cv-search">${icon("search")}<input id="cv-search" type="search" placeholder="搜索章节或知识点" aria-label="搜索章节或知识点"></label></div><div class="cv-layout"><nav id="cv-list" aria-label="选择章节插画"></nav><aside id="cv-preview" aria-label="当前章节的大图标"></aside></div><p class="cv-footnote">目录来自当前项目的证书配置，共 44 个章节。HCIA 与 NCRE 在此可预览章节；当前 demo 的练习入口仍按已有内容开放。</p></section>`,
      "证书章节与动效预览",
    );
    dialog.classList.add("chapter-visual-dialog");
    paintGallery();
  }
  document.addEventListener("click", (event) => {
    const target = event.target.closest(
      "[data-chapter-gallery],[data-cv-certificate],[data-cv-chapter],[data-cv-replay],[data-cv-study]",
    );
    if (!target) return;
    if (target.hasAttribute("data-chapter-gallery"))
      open(
        target.dataset.chapterGallery || undefined,
        target.dataset.chapterTitle,
      );
    else if (target.dataset.cvCertificate) {
      galleryCertificate = target.dataset.cvCertificate;
      galleryChapter = null;
      $("#cv-search").value = "";
      paintGallery();
    } else if (target.dataset.cvChapter) {
      galleryChapter = target.dataset.cvChapter;
      paintGallery();
      $(`[data-cv-chapter="${galleryChapter}"]`)?.focus({
        preventScroll: true,
      });
    } else if (target.hasAttribute("data-cv-study")) {
      const certificate = catalog.certificates.find(
        (c) => c.id === galleryCertificate,
      );
      const chapter = certificate.chapters.find((c) => c.id === galleryChapter);
      closeDialog();
      window.AceAiStudyDemo?.openChapter(certificate.id, chapter.title);
    } else {
      const stage = $(".cv-stage");
      stage.classList.remove("is-playing");
      void stage.offsetWidth;
      stage.classList.add("is-playing");
      setTimeout(() => stage.classList.remove("is-playing"), 1800);
    }
  });
  document.addEventListener("input", (event) => {
    if (event.target.id === "cv-search") paintGallery();
  });
  dialog.addEventListener("close", () =>
    dialog.classList.remove("chapter-visual-dialog"),
  );
  document.addEventListener("DOMContentLoaded", () => {
    const requested = new URL(location.href).searchParams.get("chapter-icons");
    if (catalog.certificates.some((c) => c.id === requested)) open(requested);
  });
  window.AceChapterVisuals = Object.freeze({
    render: (certificateId, title) => {
      const c = find(certificateId, title);
      return c ? renderKind(c.kind) : "";
    },
    renderKind,
    open,
    supported: () => [...supported],
    catalog: () => structuredClone(catalog),
  });
})();
