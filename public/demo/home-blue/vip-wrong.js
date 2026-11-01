"use strict";
(() => {
  const flow = window.AceStudyFlow;
  if (!flow) return;
  const esc = flow.safe;
  const questionTypes = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    true_false: "判断题",
  };
  const plans = [
    {
      id: "basic",
      name: "基础 VIP",
      price: 19,
      quota: 100,
      description: "适合轻量学习",
    },
    {
      id: "plus",
      name: "进阶 VIP",
      price: 39,
      quota: 300,
      description: "适合日常备考",
    },
    {
      id: "pro",
      name: "尊享 VIP",
      price: 79,
      quota: 1000,
      description: "适合高频学习",
    },
  ];
  const state = () => flow.state();
  const member = () => state().memberDemo;
  const book = () => state().wrongBook;
  let wrongTab = "pending",
    wrongPage = 1,
    manageMode = false,
    selectedWrong = new Set();
  let undoChange = null,
    undoTimeout = null;
  const dateText = (time) =>
    new Date(time || Date.now()).toLocaleDateString("zh-CN", {
      month: "long",
      day: "numeric",
    });
  const dateTimeText = (time) =>
    new Date(time || Date.now()).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  const planById = (id) => plans.find((p) => p.id === id) || plans[1];
  function ensureData() {
    const s = state();
    if (!s.memberDemo || typeof s.memberDemo !== "object")
      s.memberDemo = {
        selected: "plus",
        active: null,
        issued: [],
        redemptions: [],
      };
    const m = s.memberDemo;
    if (!plans.some((p) => p.id === m.selected)) m.selected = "plus";
    if (!Array.isArray(m.issued)) m.issued = [];
    if (!Array.isArray(m.redemptions)) m.redemptions = [];
    if (
      m.active &&
      (!plans.some((p) => p.id === m.active.planId) ||
        !Number.isFinite(m.active.expiresAt))
    )
      m.active = null;
    if (!s.wrongBook || typeof s.wrongBook !== "object")
      s.wrongBook = {
        entries: {},
        config: { order: "sequential", count: "10" },
      };
    s.wrongBook.entries ||= {};
    s.wrongBook.config ||= { order: "sequential", count: "10" };
    if (!["sequential", "random"].includes(s.wrongBook.config.order))
      s.wrongBook.config.order = "sequential";
    if (!["5", "10", "all"].includes(s.wrongBook.config.count))
      s.wrongBook.config.count = "10";
    Object.entries(s.records).forEach(([id, record]) => {
      if (
        record.correct === false &&
        flow.questionMap.has(id) &&
        !s.wrongBook.entries[id]
      ) {
        s.wrongBook.entries[id] = {
          firstWrongAt: record.lastAnsweredAt || Date.now(),
          lastWrongAt: record.lastAnsweredAt || Date.now(),
          wrongCount: 1,
          status: "pending",
        };
      }
    });
    flow.save();
  }
  const activeMembership = () =>
    member().active && member().active.expiresAt > Date.now()
      ? member().active
      : null;
  function vipBadgeArt(tier) {
    const badges = {
      basic: `<defs>
        <linearGradient id="shield-face" x1="27" y1="12" x2="67" y2="75" gradientUnits="userSpaceOnUse"><stop stop-color="#87c9ff"/><stop offset=".48" stop-color="#3b91ff"/><stop offset="1" stop-color="#225ae7"/></linearGradient>
        <linearGradient id="shield-core" x1="31" y1="22" x2="65" y2="66" gradientUnits="userSpaceOnUse"><stop stop-color="#368dfd"/><stop offset="1" stop-color="#154aca"/></linearGradient>
        <clipPath id="shield-cut"><path d="M48 11c-9 7-19 9-30 12v23c0 17 12 29 30 38 18-9 30-21 30-38V23c-11-3-21-5-30-12Z"/></clipPath>
      </defs>
      <ellipse class="vip-badge-shadow" cx="49" cy="86" rx="24" ry="4" fill="#3585ed" opacity=".18"/>
      <g class="vip-badge-body">
        <path d="M51 15c-9 7-19 9-30 12v22c0 17 12 29 30 37 18-8 30-20 30-37V27c-11-3-21-5-30-12Z" fill="#1763d8"/>
        <path d="M48 11c-9 7-19 9-30 12v23c0 17 12 29 30 38 18-9 30-21 30-38V23c-11-3-21-5-30-12Z" fill="url(#shield-face)" stroke="#afd9ff" stroke-width="2"/>
        <path d="M48 21c-7 5-14 8-22 10v16c0 12 9 22 22 29 13-7 22-17 22-29V31c-8-2-15-5-22-10Z" fill="url(#shield-core)" stroke="#79baff" stroke-width="1.5"/>
        <path d="M22 29v17c0 14 11 25 26 33" stroke="#e1f1ff" stroke-width="2" stroke-linecap="round" opacity=".55"/>
        <path class="vip-badge-star" d="m48 32 5 11 12 5-12 5-5 12-5-12-12-5 12-5Z" fill="white"/>
        <g clip-path="url(#shield-cut)"><path class="vip-shine-sweep" d="m-32 2 16-6 65 105-16 6Z" fill="white" opacity=".48"/></g>
      </g>
      <path class="vip-glint vip-glint-one" d="m81 17 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#68adff"/>`,
      plus: `<defs>
        <linearGradient id="diamond-face" x1="27" y1="17" x2="67" y2="74" gradientUnits="userSpaceOnUse"><stop stop-color="#c3a3ff"/><stop offset=".5" stop-color="#9350f8"/><stop offset="1" stop-color="#6924dc"/></linearGradient>
        <clipPath id="diamond-cut"><path d="m17 33 13-16h36l14 16-32 46Z"/></clipPath>
      </defs>
      <ellipse class="vip-badge-shadow" cx="48" cy="84" rx="25" ry="4" fill="#8951e7" opacity=".18"/>
      <g class="vip-badge-body">
        <path d="m19 36 13-16h36l14 16-32 46Z" fill="#6927d8"/>
        <path d="m17 33 13-16h36l14 16-32 46Z" fill="url(#diamond-face)" stroke="#c9adff" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="m17 33 13-16 7 16Z" fill="#b997fb"/>
        <path d="m30 17 18 16H37Z" fill="#e4d4ff"/>
        <path d="m30 17 18 16 18-16Z" fill="#b183fa"/>
        <path class="vip-diamond-facet" d="m48 33 18-16-7 16Z" fill="#eee3ff"/>
        <path d="m66 17 14 16H59Z" fill="#aa7af7"/>
        <path d="m17 33 31 46-11-46Z" fill="#8444e6"/>
        <path class="vip-diamond-facet" d="m37 33 11 46 11-46Z" fill="#b176ff"/>
        <path d="m59 33-11 46 32-46Z" fill="#7430e3"/>
        <path d="M18 33h61M37 33l11 45 11-45" stroke="#e8d6ff" stroke-width="1" opacity=".55"/>
        <g clip-path="url(#diamond-cut)"><path class="vip-shine-sweep" d="m-32 2 16-6 65 105-16 6Z" fill="white" opacity=".6"/></g>
      </g>
      <path class="vip-glint vip-glint-one" d="m83 16 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#a875ff"/>
      <path class="vip-glint vip-glint-two" d="m14 61 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="#c2a2ff"/>`,
      pro: `<defs>
        <linearGradient id="crown-face" x1="31" y1="23" x2="61" y2="75" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe99d"/><stop offset=".45" stop-color="#ffc44b"/><stop offset="1" stop-color="#e9920a"/></linearGradient>
        <linearGradient id="crown-band" x1="23" y1="63" x2="73" y2="78" gradientUnits="userSpaceOnUse"><stop stop-color="#ffe19b"/><stop offset=".4" stop-color="#ef9f1b"/><stop offset="1" stop-color="#c47508"/></linearGradient>
        <clipPath id="crown-cut"><path d="m17 34 17 18 14-29 14 29 17-18-8 36H25Z"/></clipPath>
      </defs>
      <ellipse class="vip-badge-shadow" cx="49" cy="84" rx="26" ry="4" fill="#c98920" opacity=".18"/>
      <g class="vip-badge-body">
        <path d="m20 37 17 18 14-29 14 29 17-18-8 36H28Z" fill="#c9800d"/>
        <path d="m17 34 17 18 14-29 14 29 17-18-8 36H25Z" fill="url(#crown-face)" stroke="#ffc85c" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="m21 41 7 25h41" stroke="#fff2c4" stroke-width="2" stroke-linecap="round" opacity=".85"/>
        <path d="m48 27 2 31 12-6Z" fill="#ffe9a8" opacity=".5"/>
        <path d="M26 65h44v9a4 4 0 0 1-4 4H30a4 4 0 0 1-4-4Z" fill="url(#crown-band)" stroke="#efaf38" stroke-width="1"/>
        <path d="M29 68h38" stroke="#fff0be" stroke-width="2" stroke-linecap="round"/>
        <path class="vip-crown-gem" d="m48 44 6 8-6 8-6-8Z" fill="#fff9e1"/>
        <circle cx="17" cy="31" r="5" fill="#ffcd60" stroke="#ffe8a2" stroke-width="1.5"/>
        <circle cx="48" cy="19" r="5.5" fill="#ffc551" stroke="#ffe9ad" stroke-width="1.5"/>
        <circle cx="79" cy="31" r="5" fill="#f5b637" stroke="#ffe19b" stroke-width="1.5"/>
        <g clip-path="url(#crown-cut)"><path class="vip-shine-sweep" d="m-32 2 16-6 65 105-16 6Z" fill="white" opacity=".55"/></g>
      </g>
      <path class="vip-glint vip-glint-one" d="m81 12 2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill="#f2bb4b"/>
      <path class="vip-glint vip-glint-two" d="m14 61 1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5Z" fill="#f2cf7b"/>`,
    };
    return svg(badges[tier] || badges.plus)
      .replace('viewBox="0 0 240 200"', 'viewBox="0 0 96 96"')
      .replace(
        "<svg ",
        '<svg class="vip-emblem" data-vip-emblem="' + tier + '" ',
      );
  }
  art.vipBook = () =>
    '<div class="art">' +
    svg(
      '<defs><linearGradient id="vipBlue" x1="40" y1="40" x2="155" y2="177" gradientUnits="userSpaceOnUse"><stop stop-color="#8bc6ff"/><stop offset="1" stop-color="#3476f1"/></linearGradient><linearGradient id="vipGreen"><stop stop-color="#5bdbb3"/><stop offset="1" stop-color="#00a782"/></linearGradient></defs><ellipse cx="123" cy="178" rx="112" ry="18" fill="#ccE4ff"/><g class="vip-book-cover"><path d="m42 50 103-31 13 130-105 32Z" fill="#7baff7"/><path d="m52 40 94-28a8 8 0 0 1 10 7l13 126a8 8 0 0 1-6 9l-91 29a9 9 0 0 1-11-7L48 51a9 9 0 0 1 4-11Z" fill="url(#vipBlue)" stroke="#aacfff" stroke-width="3"/><path d="m57 42 91-26" stroke="#d3eaff" stroke-width="5"/><path d="m66 57 12 113" stroke="#bee0ff" stroke-width="4"/><text x="73" y="117" fill="white" font-size="36" font-weight="700" font-family="Arial,sans-serif" transform="rotate(-14 100 105)">AI</text></g><g class="vip-speech"><path d="m130 63 68 9a13 13 0 0 1 12 14l-6 65a13 13 0 0 1-14 11l-36-5-23 13 4-19-13-2a12 12 0 0 1-11-13l7-61a12 12 0 0 1 12-12Z" fill="white" stroke="#d0e5ff" stroke-width="2"/><path d="m134 86 49 7m-51 11 49 7m-51 11 36 6" stroke="#88baff" stroke-width="7" stroke-linecap="round"/></g><circle cx="196" cy="153" r="29" fill="url(#vipGreen)" stroke="#8ee8cb" stroke-width="3"/><path d="m182 154 9 9 18-23" stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="m203 21 4 13 11 5-12 5-4 14-4-14-11-5 12-5Z" fill="#589cff"/>',
    ) +
    "</div>";
  function renderPlanCards() {
    const selected = member().selected;
    const container = $("#vip-plan-cards");
    // Keep radio controls and SVGs mounted so hover motion and keyboard focus survive selection.
    if (!container.children.length) {
      container.innerHTML = plans
        .map(
          (p) =>
            '<label class="vip-plan-card" data-vip-tier="' +
            p.id +
            '">' +
            (p.id === "plus"
              ? '<span class="vip-recommended">推荐</span>'
              : "") +
            '<div class="vip-plan-top"><span class="vip-crown-art">' +
            vipBadgeArt(p.id) +
            "</span><div><h3>" +
            p.name +
            "</h3><p>" +
            p.description +
            '</p></div></div><div class="vip-card-price">¥ <b>' +
            p.price +
            '</b> / 张</div><p class="vip-validity">会员有效期 30 天</p>' +
            '<span class="vip-quota-label">AI 精讲月额度</span><div class="vip-quota-value"><b>' +
            p.quota +
            "</b> 次 / 月</div><ul><li>" +
            icon("check") +
            "解锁 AI 精讲</li><li>" +
            icon("check") +
            '每月额度更新</li></ul><div class="vip-card-select"><input type="radio" name="vip-plan" value="' +
            p.id +
            '" aria-label="选择' +
            p.name +
            '"/><span></span></div></label>',
        )
        .join("");
    }
    plans.forEach((p) => {
      const card = $('[data-vip-tier="' + p.id + '"]', container);
      card.classList.toggle("is-selected", p.id === selected);
      $("input", card).checked = p.id === selected;
      $(".vip-card-select > span", card).textContent =
        (p.id === selected ? "已选" : "选择") + p.name;
    });
  }
  const vipMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let tierAnimations = [];
  function cancelTierAnimations() {
    tierAnimations.forEach((animation) => animation.cancel());
    tierAnimations = [];
  }
  vipMotionQuery.addEventListener("change", (event) => {
    if (event.matches) cancelTierAnimations();
  });
  function animateTierSelection(tier) {
    cancelTierAnimations();
    if (!motionAllowed() || document.body.dataset.page !== "vip") return;
    const card = $('#vip-plan-cards [data-vip-tier="' + tier + '"]');
    const targets = [
      $(".vip-card-select", card),
      $(".vip-redeem-panel .vip-current-plan"),
      $("#vip-selected-price"),
    ];
    targets.forEach((target, index) => {
      tierAnimations.push(
        target.animate(
          [
            { opacity: 0.45, transform: "translateY(5px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          {
            duration: 260,
            delay: index === 2 ? 40 : 0,
            easing: "cubic-bezier(.2,.7,.2,1)",
          },
        ),
      );
    });
  }
  function renderVip() {
    ensureData();
    const p = planById(member().selected),
      active = activeMembership(),
      old = member().active;
    const redeemPanel = $(".vip-redeem-panel");
    const previousTier = redeemPanel.dataset.vipTier;
    if (!$("#vip-hero-art").children.length)
      $("#vip-hero-art").innerHTML = art.vipBook();
    renderPlanCards();
    redeemPanel.dataset.vipTier = p.id;
    const currentPlan = $(".vip-current-plan", redeemPanel);
    currentPlan.dataset.vipTier = p.id;
    if (previousTier !== p.id || !$(".vip-emblem", currentPlan))
      $(".vip-crown-small", currentPlan).innerHTML = vipBadgeArt(p.id);
    $("#vip-selected-name").textContent = p.name;
    $("#vip-selected-info").textContent =
      "有效期 30 天 · AI 精讲 " + p.quota + " 次 / 月";
    $("#vip-selected-price").textContent = "¥" + p.price.toFixed(2);
    $('[data-member-action="purchase"]').innerHTML =
      "购买" + p.name + " 卡密" + icon("arrow");
    $("#vip-status").textContent =
      "当前会员：" +
      (active ? planById(active.planId).name : old ? "已到期" : "未开通");
    $("#vip-ai-state").textContent = active
      ? "剩余 " +
        Math.max(0, active.quota - active.used) +
        " / " +
        active.quota +
        " 次"
      : "开通会员后可用";
    $("#vip-membership-detail").hidden = !active;
    $("#vip-membership-detail").textContent = active
      ? "有效期至 " +
        dateText(active.expiresAt) +
        " · 本周期已用 " +
        active.used +
        " 次"
      : "";
    $("#vip-active-summary").hidden = !active;
    $("#vip-active-summary").innerHTML = active
      ? "<strong>" +
        icon("check") +
        planById(active.planId).name +
        " 已开通</strong><p>有效期至 " +
        dateTimeText(active.expiresAt) +
        "</p><p>本周期剩余 " +
        Math.max(0, active.quota - active.used) +
        " / " +
        active.quota +
        " 次演示额度</p>"
      : "";
    if (previousTier && previousTier !== p.id) animateTierSelection(p.id);
  }
  function showPurchasePreview() {
    const p = planById(member().selected);
    showDialog(
      "购买" + p.name + "卡密",
      '<p class="dialog-lead">这里可以体验卡密购买与兑换流程。生成的 DEMO 卡密仅用于当前浏览器，不产生付款。</p><div class="vip-purchase-preview" data-vip-tier="' +
        p.id +
        '"><div class="vip-current-plan"><div><span class="vip-crown-small">' +
        vipBadgeArt(p.id) +
        "</span><div><h3>" +
        p.name +
        "</h3><p>有效期 30 天 · AI 精讲 " +
        p.quota +
        ' 次 / 月</p></div></div></div><div class="vip-price-row"><span>示例参考价</span><strong>¥' +
        p.price.toFixed(2) +
        '</strong></div><div class="study-form-actions"><button class="study-outline" data-action="close">返回选择</button><button class="primary-button" data-member-action="issue" data-plan="' +
        p.id +
        '">生成演示卡密' +
        icon("arrow") +
        "</button></div></div>",
      "会员购买预览",
    );
  }
  function issueDemoCard(planId) {
    const p = planById(planId),
      suffix = (
        globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)
      )
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8)
        .toUpperCase();
    const code = "DEMO-" + p.id.toUpperCase() + "-" + suffix;
    member().issued.push({
      code,
      planId: p.id,
      createdAt: Date.now(),
      usedAt: null,
    });
    // Redemption history displays only a suffix; the issued DEMO cards prevent repeat redemption.
    member().issued = member().issued.slice(-100);
    flow.save();
    showDialog(
      "演示卡密已生成",
      '<p class="dialog-lead">' +
        p.name +
        " · 30 天 · " +
        p.quota +
        ' 次 / 月。复制卡密，或直接填入右侧兑换区。</p><label for="vip-issued-code" class="library-caption">仅供当前浏览器体验的 DEMO 卡密</label><div class="vip-issued-code"><input id="vip-issued-code" value="' +
        esc(code) +
        '" readonly/><button class="study-outline" data-member-action="copy">复制</button></div><div class="study-form-actions"><button class="study-outline" data-action="close">稍后兑换</button><button class="primary-button" data-member-action="fill" data-code="' +
        esc(code) +
        '">填入兑换' +
        icon("arrow") +
        "</button></div>",
      "卡密购买预览",
    );
  }
  function setCodeError(message) {
    const el = $("#vip-code-error");
    el.textContent = message;
    el.hidden = !message;
    $("#vip-code").setAttribute("aria-invalid", String(!!message));
    if (message) $("#vip-code").focus();
  }
  function redeemCode(code, confirmed = false) {
    if (!code) {
      setCodeError("请先输入演示卡密，或从购买预览中生成一张。");
      return;
    }
    const card = member().issued.find((c) => c.code === code);
    if (!card) {
      setCodeError("未找到这张演示卡密，请使用购买预览中生成的 DEMO 卡密。");
      return;
    }
    if (card.usedAt) {
      setCodeError("这张演示卡密已经兑换，可在兑换记录中查看。");
      return;
    }
    const p = planById(card.planId),
      active = activeMembership();
    if (active && !confirmed) {
      showDialog(
        "更新演示会员？",
        '<p class="dialog-lead">当前已开通 ' +
          planById(active.planId).name +
          "。本次演示兑换将更新为 <strong>" +
          p.name +
          "</strong>，有效期重新从现在起计算 30 天，演示额度更新为 " +
          p.quota +
          ' 次。</p><div class="study-form-actions"><button class="study-outline" data-action="close">暂不兑换</button><button class="primary-button" data-member-action="redeem-confirm" data-code="' +
          esc(code) +
          '">确认更新会员' +
          icon("arrow") +
          "</button></div>",
        "VIP 会员",
      );
      return;
    }
    const now = Date.now();
    card.usedAt = now;
    member().active = {
      planId: p.id,
      startedAt: now,
      expiresAt: now + 30 * 86400000,
      quota: p.quota,
      used: 0,
    };
    member().redemptions.push({
      id: globalThis.crypto?.randomUUID?.() || "redeem-" + now,
      planId: p.id,
      redeemedAt: now,
      expiresAt: now + 30 * 86400000,
      codeSuffix: code.slice(-4),
    });
    member().redemptions = member().redemptions.slice(-100);
    member().selected = p.id;
    flow.save();
    closeDialog();
    $("#vip-code").value = "";
    setCodeError("");
    renderVip();
    window.AceDemoSettings?.notify(
      "演示会员已开通",
      p.name + " 的有效期与学习额度已更新。",
      "membership-" + member().active.startedAt,
    );
    showDialog(
      p.name + " 已开通",
      '<div class="vip-history-card"><h3>' +
        icon("check") +
        "兑换成功</h3><p>有效期至 " +
        dateTimeText(member().active.expiresAt) +
        "</p><p>本周期 AI 精讲演示额度：" +
        p.quota +
        ' 次</p><small>会员状态与兑换记录已保存在当前浏览器。</small></div><div class="study-form-actions"><button class="study-outline" data-action="close">查看会员</button><button class="primary-button" data-member-action="ai">体验 AI 精讲' +
        icon("arrow") +
        "</button></div>",
      "会员兑换",
    );
  }
  function showMemberHistory() {
    const rows = [...member().redemptions].reverse();
    showDialog(
      "兑换记录",
      rows.length
        ? rows
            .map(
              (r) =>
                '<article class="vip-history-card"><h3>' +
                icon("check") +
                planById(r.planId).name +
                " · 兑换成功</h3><p>兑换时间：" +
                dateTimeText(r.redeemedAt) +
                "</p><p>有效期至：" +
                dateTimeText(r.expiresAt) +
                "</p><small>演示卡密尾号 " +
                esc(r.codeSuffix) +
                " · " +
                planById(r.planId).quota +
                " 次 / 月</small></article>",
            )
            .join("")
        : '<div class="library-empty">' +
            icon("history") +
            '<h3>还没有兑换记录</h3><p>兑换一张演示卡密，就能在这里看到记录。</p><button class="study-outline" data-action="close">返回会员页</button></div>',
      "VIP 会员",
    );
  }
  function showMemberHelp() {
    showDialog(
      "会员说明",
      '<div class="vip-help-list"><h3>如何开通？</h3><p>先选择会员类型，再在购买预览中生成 DEMO 卡密，填入兑换区即可体验开通。</p><h3>会员类型与额度</h3><p>基础、进阶、尊享 VIP 的演示月额度分别为 100、300、1000 次，兑换后有效期为 30 天。</p><h3>额度怎么使用？</h3><p>会员可查看 AI 精讲示例内容。主动获取一条 AI 老师示例回答会使用 1 次本地演示额度；浏览精讲与练习不扣额；到期后重新兑换即可继续体验。</p><h3>再次兑换</h3><p>使用新卡密时会先确认，确认后更新为该卡密对应类型、重新计算 30 天有效期并重置演示额度；同一张卡密只能兑换一次。</p><h3>关于当前页面</h3><p>套餐价格、购买、兑换和精讲额度均为设计演示，不产生付款。当前页面只接受本地生成的 DEMO 卡密，状态保存在当前浏览器。</p></div>',
      "VIP 会员",
    );
  }
  function openAI() {
    showPage("ai");
  }
  function wrongItems() {
    return Object.entries(book().entries)
      .filter(([id, e]) => flow.questionMap.has(id) && e.status !== "removed")
      .map(([id, e]) => ({ id, ...e, q: flow.questionMap.get(id) }));
  }
  function statusItems() {
    return wrongItems().filter(
      (e) => wrongTab === "all" || e.status === wrongTab,
    );
  }
  function filteredWrong() {
    const term = $("#wrong-search").value.trim().toLowerCase(),
      ch = $("#wrong-chapter-filter").value,
      type = $("#wrong-type-filter").value,
      sort = $("#wrong-sort").value;
    return statusItems()
      .filter(
        (e) =>
          (ch === "all" || String(e.q.chapterIndex) === ch) &&
          (type === "all" || e.q.type === type) &&
          (!term ||
            (e.q.q + " " + e.q.point + " " + e.q.section + " " + e.q.chapter)
              .toLowerCase()
              .includes(term)),
      )
      .sort((a, b) =>
        sort === "errors"
          ? b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt
          : sort === "chapter"
            ? a.q.chapterIndex - b.q.chapterIndex ||
              b.lastWrongAt - a.lastWrongAt
            : b.lastWrongAt - a.lastWrongAt,
      );
  }
  function renderWrongSummary() {
    const all = wrongItems(),
      pending = all.filter((e) => e.status === "pending"),
      mastered = all.filter((e) => e.status === "mastered");
    $("#wrong-pending-total").textContent = pending.length;
    $("#wrong-mastered-total").textContent = mastered.length;
    $("#wrong-chapter-total").textContent = new Set(
      all.map((e) => e.q.chapterIndex),
    ).size;
    $("#wrong-tab-pending").textContent = pending.length;
    $("#wrong-tab-mastered").textContent = mastered.length;
    $("#wrong-tab-all").textContent = all.length;
    const chapter = $("#wrong-chapter-filter").value;
    $("#wrong-chapter-summary").innerHTML = chapters
      .map((c, i) => {
        const count = statusItems().filter(
          (e) => e.q.chapterIndex === i,
        ).length;
        return (
          '<button class="wrong-chapter-button ' +
          (count ? "has-wrong" : "") +
          '" data-wrong-chapter="' +
          i +
          '" aria-pressed="' +
          (chapter === String(i)) +
          '" title="' +
          esc(c.title) +
          '">' +
          icon(
            ["home", "grid", "chapter", "keyboard", "save", "route", "pie"][i],
          ) +
          "<span>" +
          esc(c.title) +
          "</span><strong>" +
          count +
          "</strong></button>"
        );
      })
      .join("");
  }
  function renderWrongList() {
    const list = filteredWrong(),
      pages = Math.max(1, Math.ceil(list.length / 3));
    wrongPage = Math.min(Math.max(1, wrongPage), pages);
    const valid = new Set(wrongItems().map((e) => e.id));
    selectedWrong = new Set([...selectedWrong].filter((id) => valid.has(id)));
    $("#wrong-list").setAttribute(
      "aria-labelledby",
      "wrong-" + wrongTab + "-tab",
    );
    $("#wrong-list").innerHTML = list.length
      ? list
          .slice((wrongPage - 1) * 3, wrongPage * 3)
          .map(
            (e) =>
              '<article class="favorite-card wrong-card ' +
              (selectedWrong.has(e.id) ? "is-checked" : "") +
              '"><label class="favorite-checkbox"><input type="checkbox" data-wrong-select="' +
              esc(e.id) +
              '" aria-label="选择' +
              esc(e.q.q) +
              '"' +
              (selectedWrong.has(e.id) ? " checked" : "") +
              '/></label><div class="favorite-card-main"><div class="favorite-card-top"><b class="favorite-card-tag">' +
              questionTypes[e.q.type] +
              '</b><b class="favorite-card-tag chapter">' +
              esc(e.q.chapter) +
              "</b><span>" +
              esc(e.q.section || e.q.point) +
              "</span></div><h3>" +
              esc(e.q.q) +
              '</h3><div class="favorite-card-meta"><span class="favorite-status ' +
              e.status +
              '">' +
              icon(e.status === "mastered" ? "check" : "wrong") +
              (e.status === "mastered" ? "已掌握" : "待巩固") +
              "</span><small>答错 " +
              e.wrongCount +
              " 次 · 最近 " +
              dateText(e.lastWrongAt) +
              '</small><button class="library-text-button favorite-card-view" data-wrong-action="detail" data-id="' +
              esc(e.id) +
              '">查看解析' +
              icon("arrow") +
              '</button></div></div><div class="favorite-card-tools"><button data-wrong-action="menu" data-id="' +
              esc(e.id) +
              '" aria-label="错题更多操作">' +
              icon("more") +
              "</button></div></article>",
          )
          .join("")
      : '<div class="library-empty">' +
        icon("check") +
        "<h3>" +
        (wrongItems().length ? "这个范围没有错题" : "暂时没有错题") +
        "</h3><p>" +
        (wrongItems().length
          ? "可以切换状态、章节或清除筛选。"
          : "答错的题会自动留在这里，先去练几道题吧。") +
        '</p><button class="study-outline" ' +
        (wrongItems().length
          ? 'data-wrong-action="filter-reset">查看全部错题'
          : 'data-action="chapters">去章节练习') +
        "</button></div>";
    const visibleSelected = list.filter((e) => selectedWrong.has(e.id)).length;
    $("#wrong-select-all").checked =
      !!list.length && visibleSelected === list.length;
    $("#wrong-select-all").indeterminate =
      visibleSelected > 0 && visibleSelected < list.length;
    $("#wrong-select-all").disabled = !list.length;
    $("#wrong-selected-count").textContent = selectedWrong.size;
    ["practice-selected", "master-selected", "remove-selected"].forEach(
      (a) =>
        ($('[data-wrong-action="' + a + '"]').disabled = !selectedWrong.size),
    );
    const nums = [
      ...new Set(
        (pages <= 5
          ? Array.from({ length: pages }, (_, i) => i + 1)
          : [1, wrongPage - 1, wrongPage, wrongPage + 1, pages]
        ).filter((n) => n >= 1 && n <= pages),
      ),
    ].sort((a, b) => a - b);
    $("#wrong-pagination").innerHTML = nums
      .map(
        (n, i) =>
          (i && n > nums[i - 1] + 1
            ? '<span class="pagination-gap">…</span>'
            : "") +
          '<button data-wrong-page="' +
          n +
          '"' +
          (wrongPage === n ? ' aria-current="page"' : "") +
          ' aria-label="错题第 ' +
          n +
          ' 页">' +
          n +
          "</button>",
      )
      .join("");
    renderWrongPractice();
  }
  function renderWrongPractice() {
    const config = book().config,
      pool = filteredWrong(),
      count =
        config.count === "all"
          ? pool.length
          : Math.min(Number(config.count), pool.length);
    const segments = (options, key, value) =>
      options
        .map(
          ([v, label]) =>
            '<button data-wrong-setting="' +
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
    $("#wrong-order-options").innerHTML = segments(
      [
        ["sequential", "顺序练习"],
        ["random", "随机练习"],
      ],
      "order",
      config.order,
    );
    $("#wrong-count-options").innerHTML = segments(
      [
        ["5", "5 题"],
        ["10", "10 题"],
        ["all", "全部"],
      ],
      "count",
      config.count,
    );
    $("#wrong-practice-total").textContent = pool.length;
    $('[data-wrong-action="practice"]').disabled = !count;
    $('[data-wrong-action="practice"]').innerHTML =
      "开始巩固（" + count + " 题）" + icon("arrow");
    $("#wrong-practice-estimate").textContent = count
      ? "预计用时约 " + Math.max(1, Math.ceil(count * 1.5)) + " 分钟"
      : "换一个范围，或先去章节练习";
  }
  function renderWrong() {
    ensureData();
    if (!$("#wrong-chapter-filter").options.length)
      $("#wrong-chapter-filter").innerHTML =
        '<option value="all">全部章节</option>' +
        chapters
          .map(
            (c, i) => '<option value="' + i + '">' + esc(c.title) + "</option>",
          )
          .join("");
    $("#wrong-hero-art").innerHTML = art.review();
    $("#wrong-manage-label").textContent = manageMode ? "完成管理" : "管理错题";
    $('[data-wrong-action="manage"]').setAttribute(
      "aria-pressed",
      String(manageMode),
    );
    document.querySelectorAll("[data-wrong-tab]").forEach((t) => {
      const active = t.dataset.wrongTab === wrongTab;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
    });
    renderWrongSummary();
    renderWrongList();
  }
  function startWrongPractice(ids) {
    let list = [...new Set(ids)]
      .map((id) => flow.questionMap.get(id))
      .filter(Boolean);
    if (book().config.order === "random") list = flow.shuffled(list);
    if (book().config.count !== "all")
      list = list.slice(0, Number(book().config.count));
    if (!list.length) {
      toast("当前范围暂无错题，先选择复习内容");
      return;
    }
    flow.createSession("wrong", list[0].chapterIndex, list, {
      forceNew: true,
      origin: "wrong",
      sessionData: { title: "错题巩固", order: book().config.order },
    });
  }
  function changeWrongStatus(ids, status) {
    const previous = ids
      .filter(
        (id) => book().entries[id] && book().entries[id].status !== status,
      )
      .map((id) => ({ id, value: { ...book().entries[id] } }));
    if (!previous.length) {
      toast(status === "mastered" ? "这些题已经掌握" : "没有需要更新的错题");
      return;
    }
    previous.forEach(({ id }) => {
      book().entries[id].status = status;
      if (status === "mastered") book().entries[id].masteredAt = Date.now();
      selectedWrong.delete(id);
    });
    undoChange = previous.map((item) => ({ ...item, appliedStatus: status }));
    clearTimeout(undoTimeout);
    flow.sync();
    flow.save();
    if (document.body.dataset.page === "wrong") renderWrong();
    toast(
      status === "removed"
        ? "已移出 " + previous.length + " 道错题"
        : status === "pending"
          ? "已重新加入待巩固"
          : "已标记 " + previous.length + " 道题为已掌握",
    );
    clearTimeout(toastTimer);
    $("#toast").insertAdjacentHTML(
      "beforeend",
      '<button data-wrong-action="undo">撤销</button>',
    );
    undoTimeout = setTimeout(() => {
      undoChange = null;
      $("#toast").classList.remove("show");
    }, 6500);
  }
  function undoWrongChange() {
    if (!undoChange) return;
    let restored = 0;
    undoChange.forEach(({ id, value, appliedStatus }) => {
      const current = book().entries[id];
      if (
        current?.status === appliedStatus &&
        current.lastReviewedAt === value.lastReviewedAt &&
        current.lastWrongAt === value.lastWrongAt
      ) {
        book().entries[id] = value;
        restored++;
      }
    });
    undoChange = null;
    clearTimeout(undoTimeout);
    flow.sync();
    flow.save();
    renderWrong();
    toast(restored ? "已恢复错题状态" : "已保留最新作答记录");
  }
  function wrongDetail(id) {
    const e = book().entries[id],
      q = flow.questionMap.get(id);
    if (!e || !q) return;
    const previous = state().sessions.findLast(
      (s) =>
        s.responses[id]?.kind === "answer" && s.responses[id].correct === false,
    )?.responses[id];
    const answerLetters = (indices) =>
      indices.map((i) => String.fromCharCode(65 + i)).join("、");
    showDialog(
      "错题解析",
      '<div class="library-detail-tags"><b class="favorite-card-tag">' +
        questionTypes[q.type] +
        '</b><b class="favorite-card-tag chapter">' +
        esc(q.chapter) +
        "</b><span>" +
        esc(q.point || q.section) +
        '</span></div><h3 class="library-detail-question">' +
        esc(q.q) +
        '</h3><div class="library-detail-options">' +
        q.options
          .map(
            (o, i) =>
              '<div class="library-detail-option ' +
              (q.answers.includes(i)
                ? "is-correct"
                : previous?.selected.includes(i)
                  ? "is-wrong"
                  : "") +
              '"><b>' +
              String.fromCharCode(65 + i) +
              "</b><span>" +
              esc(o) +
              "</span>" +
              (q.answers.includes(i) ? icon("check") : "") +
              "</div>",
          )
          .join("") +
        '</div><div class="library-detail-analysis"><strong>正确答案：' +
        answerLetters(q.answers) +
        "</strong>" +
        (previous
          ? "<p>上次错误选择：" + answerLetters(previous.selected) + "</p>"
          : "") +
        "<p>" +
        esc(q.explain) +
        "</p><small>题目来源：" +
        esc(q.source || "四川计算机章节练习") +
        '</small></div><div class="wrong-detail-history">累计答错 ' +
        e.wrongCount +
        " 次 · 最近答错 " +
        dateTimeText(e.lastWrongAt) +
        "<br/>当前状态：" +
        (e.status === "mastered" ? "已掌握" : "待巩固") +
        '</div><div class="study-form-actions"><button class="study-outline" data-wrong-action="favorite" data-id="' +
        esc(id) +
        '">' +
        icon("star") +
        (state().favorites.includes(id) ? "已收藏" : "收藏题目") +
        '</button><button class="study-outline" data-wrong-action="status-dialog" data-id="' +
        esc(id) +
        '" data-status="' +
        (e.status === "mastered" ? "pending" : "mastered") +
        '">' +
        (e.status === "mastered" ? "重新巩固" : "标记已掌握") +
        '</button><button class="primary-button" data-wrong-action="practice-one" data-id="' +
        esc(id) +
        '">重新作答' +
        icon("arrow") +
        "</button></div>",
      "错题本",
    );
  }
  function wrongMenu(id) {
    const e = book().entries[id],
      q = flow.questionMap.get(id);
    if (!e || !q) return;
    showDialog(
      "错题操作",
      '<p class="dialog-lead">' +
        esc(q.q) +
        '</p><div class="library-menu-actions"><button class="study-outline" data-wrong-action="detail" data-id="' +
        esc(id) +
        '">' +
        icon("book") +
        '查看解析</button><button class="study-outline" data-wrong-action="practice-one" data-id="' +
        esc(id) +
        '">' +
        icon("play") +
        '重新作答</button><button class="study-outline" data-wrong-action="status-dialog" data-id="' +
        esc(id) +
        '" data-status="' +
        (e.status === "mastered" ? "pending" : "mastered") +
        '">' +
        icon("check") +
        (e.status === "mastered" ? "重新加入待巩固" : "标记已掌握") +
        '</button><button class="study-outline" data-wrong-action="status-dialog" data-id="' +
        esc(id) +
        '" data-status="removed">' +
        icon("trash") +
        "移出错题本</button></div>",
      "错题本",
    );
  }
  function resetWrongFilters() {
    wrongTab = "all";
    wrongPage = 1;
    selectedWrong.clear();
    $("#wrong-search").value = "";
    $("#wrong-chapter-filter").value = "all";
    $("#wrong-type-filter").value = "all";
    renderWrong();
  }
  function syncReportReturn() {
    const s = flow.activeSession();
    if (!s || s.mode === "exam") return;
    const origin = flow.origin(s),
      name =
        origin === "wrong"
          ? "返回错题本"
          : origin === "favorites"
            ? "返回收藏"
            : origin === "exam"
              ? "返回组卷"
              : "返回章节";
    const back = $("#report-page .study-back");
    back.dataset.action = origin;
    back.innerHTML = icon("arrow") + name;
    const footer = $(
      "#study-report-body .study-report-actions [data-action='chapters']",
    );
    if (footer) {
      footer.dataset.action = origin;
      footer.textContent = name;
    }
    $("#report-title").textContent = "本轮练习报告";
  }
  async function memberAction(action, button) {
    switch (action) {
      case "history":
        showMemberHistory();
        break;
      case "help":
        showMemberHelp();
        break;
      case "purchase":
        showPurchasePreview();
        break;
      case "issue":
        issueDemoCard(button.dataset.plan);
        break;
      case "fill": {
        const code = button.dataset.code;
        closeDialog();
        showPage("vip");
        $("#vip-code").value = code;
        setCodeError("");
        $("#vip-code").focus();
        break;
      }
      case "copy": {
        const input = $("#vip-issued-code");
        try {
          await navigator.clipboard.writeText(input.value);
          toast("演示卡密已复制");
        } catch {
          input.select();
          toast("卡密已选中，可以按 Ctrl+C 复制");
        }
        break;
      }
      case "redeem-confirm":
        redeemCode(button.dataset.code, true);
        break;
      case "ai":
        openAI();
        break;
    }
  }
  function wrongAction(action, button) {
    const id = button.dataset.id;
    switch (action) {
      case "manage":
        manageMode = !manageMode;
        renderWrong();
        if (manageMode) {
          $("#wrong-select-all").focus({ preventScroll: true });
          toast("勾选题目后，可以批量复习或管理错题");
        }
        break;
      case "chapter-reset":
        $("#wrong-chapter-filter").value = "all";
        wrongPage = 1;
        selectedWrong.clear();
        renderWrong();
        break;
      case "filter-reset":
        resetWrongFilters();
        break;
      case "practice":
        startWrongPractice(filteredWrong().map((e) => e.id));
        break;
      case "practice-selected":
        startWrongPractice([...selectedWrong]);
        break;
      case "practice-one":
        startWrongPractice([id]);
        break;
      case "master-selected":
        changeWrongStatus([...selectedWrong], "mastered");
        break;
      case "remove-selected":
        changeWrongStatus([...selectedWrong], "removed");
        break;
      case "undo":
        undoWrongChange();
        break;
      case "detail":
        wrongDetail(id);
        break;
      case "menu":
        wrongMenu(id);
        break;
      case "status-dialog":
        closeDialog();
        changeWrongStatus([id], button.dataset.status);
        break;
      case "favorite": {
        const added = !state().favorites.includes(id);
        state().favorites = added
          ? [...state().favorites, id]
          : state().favorites.filter((x) => x !== id);
        document.dispatchEvent(
          new CustomEvent("demo:favorite-changed", { detail: { id, added } }),
        );
        flow.save();
        wrongDetail(id);
        toast(added ? "已添加到我的收藏" : "已取消收藏");
        break;
      }
    }
  }
  document.addEventListener("click", (event) => {
    const m = event.target.closest("[data-member-action]");
    if (m && !m.disabled) {
      void memberAction(m.dataset.memberAction, m);
      return;
    }
    const w = event.target.closest("[data-wrong-action]");
    if (w && !w.disabled) {
      wrongAction(w.dataset.wrongAction, w);
      return;
    }
    const tab = event.target.closest("[data-wrong-tab]");
    if (tab) {
      wrongTab = tab.dataset.wrongTab;
      wrongPage = 1;
      selectedWrong.clear();
      renderWrong();
      tab.focus();
      return;
    }
    const chapter = event.target.closest("[data-wrong-chapter]");
    if (chapter) {
      $("#wrong-chapter-filter").value = chapter.dataset.wrongChapter;
      wrongPage = 1;
      selectedWrong.clear();
      renderWrong();
      $('[data-wrong-chapter="' + chapter.dataset.wrongChapter + '"]').focus({
        preventScroll: true,
      });
      return;
    }
    const setting = event.target.closest("[data-wrong-setting]");
    if (setting) {
      book().config[setting.dataset.wrongSetting] = setting.dataset.value;
      flow.save();
      renderWrongPractice();
      $(
        '[data-wrong-setting="' +
          setting.dataset.wrongSetting +
          '"][data-value="' +
          setting.dataset.value +
          '"]',
      ).focus({ preventScroll: true });
      return;
    }
    const page = event.target.closest("[data-wrong-page]");
    if (page) {
      wrongPage = Number(page.dataset.wrongPage);
      renderWrongList();
    }
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.matches('input[name="vip-plan"]')) {
      member().selected = el.value;
      flow.save();
      renderVip();
      $('input[name="vip-plan"][value="' + el.value + '"]').focus({
        preventScroll: true,
      });
    } else if (el.matches("[data-wrong-select]")) {
      if (el.checked) selectedWrong.add(el.dataset.wrongSelect);
      else selectedWrong.delete(el.dataset.wrongSelect);
      renderWrongList();
      $('[data-wrong-select="' + el.dataset.wrongSelect + '"]')?.focus({
        preventScroll: true,
      });
    } else if (el.id === "wrong-select-all") {
      const ids = filteredWrong().map((e) => e.id);
      if (el.checked) ids.forEach((id) => selectedWrong.add(id));
      else ids.forEach((id) => selectedWrong.delete(id));
      renderWrongList();
    } else if (
      ["wrong-chapter-filter", "wrong-type-filter", "wrong-sort"].includes(
        el.id,
      )
    ) {
      wrongPage = 1;
      selectedWrong.clear();
      renderWrongSummary();
      renderWrongList();
    }
  });
  $("#vip-redeem-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = $("#vip-code").value.replace(/\s+/g, "").toUpperCase();
    redeemCode(code);
  });
  $("#vip-code").addEventListener("input", () => setCodeError(""));
  $("#wrong-search").addEventListener("input", () => {
    wrongPage = 1;
    selectedWrong.clear();
    renderWrongList();
  });
  $(".wrong-tabs").addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabs = ["pending", "mastered", "all"],
      i = tabs.indexOf(wrongTab);
    wrongTab =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs[2]
          : tabs[(i + (event.key === "ArrowRight" ? 1 : -1) + 3) % 3];
    wrongPage = 1;
    selectedWrong.clear();
    renderWrong();
    $('[data-wrong-tab="' + wrongTab + '"]').focus();
  });
  actions.vip = () => showPage("vip");
  actions.wrong = () => showPage("wrong");
  actions.ai = openAI;
  const resetPrevious = actions.reset;
  actions.reset = () => {
    resetPrevious();
    selectedWrong.clear();
    undoChange = null;
    clearTimeout(undoTimeout);
    wrongTab = "pending";
    wrongPage = 1;
    ensureData();
    flow.sync();
  };
  searchItems.push(
    { title: "VIP 会员", action: "vip" },
    { title: "错题本总览", action: "wrong" },
  );
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name === "vip") renderVip();
    if (event.detail.name === "wrong") renderWrong();
    if (event.detail.name === "report") syncReportReturn();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && document.body.dataset.page === "vip") renderVip();
  });
  ensureData();
  flow.sync();
  if (document.body.dataset.page === "vip") renderVip();
  if (document.body.dataset.page === "wrong") renderWrong();
  if (document.body.dataset.page === "report") syncReportReturn();
})();
