"use strict";
(() => {
  art.landingStudy = () =>
    '<div class="landing-study-art" aria-hidden="true">' +
    svg(`<defs>
      <linearGradient id="landing-blue" x1="70" y1="40" x2="194" y2="157" gradientUnits="userSpaceOnUse"><stop stop-color="#9fcaff"/><stop offset=".55" stop-color="#538fff"/><stop offset="1" stop-color="#3262e8"/></linearGradient>
      <linearGradient id="landing-book" x1="32" y1="124" x2="91" y2="170" gradientUnits="userSpaceOnUse"><stop stop-color="#96d1ff"/><stop offset="1" stop-color="#4e89f4"/></linearGradient>
    </defs>
    <ellipse cx="121" cy="111" rx="111" ry="82" fill="#dcecff" opacity=".72"/>
    <ellipse cx="126" cy="179" rx="102" ry="15" fill="#bedbff" opacity=".5"/>
    <path d="m57 146 98-23 70 35-98 26Z" fill="#e3f0ff" stroke="#cfE1ff"/>
    <g class="landing-art-browser">
      <path d="m70 48 123-12a9 9 0 0 1 10 9l4 91a9 9 0 0 1-8 9L76 157a9 9 0 0 1-10-9l-4-90a9 9 0 0 1 8-10Z" fill="url(#landing-blue)"/>
      <path d="m71 53 120-11a5 5 0 0 1 5 5l4 86a5 5 0 0 1-5 5L79 150a5 5 0 0 1-6-5l-4-86a5 5 0 0 1 2-6Z" fill="white" stroke="#bed9ff" stroke-width="1.5"/>
      <path d="m71 53 120-11a5 5 0 0 1 5 5l.5 10L70 70l-1-10a5 5 0 0 1 2-7Z" fill="#79adff"/>
      <circle cx="79" cy="60" r="2.5" fill="white"/><circle cx="88" cy="59" r="2.5" fill="white"/><circle cx="97" cy="58" r="2.5" fill="white"/>
      <path d="m81 79 30-3 2 59-30 3Z" fill="#edf5ff"/>
      <path d="m85 85 18-2m-18 10 18-2m-18 10 18-2m-18 10 18-2" stroke="#a6c7ff" stroke-width="3" stroke-linecap="round"/>
      <path d="m119 79 63-6 1 35-62 6Z" fill="#eef5ff"/>
      <path d="m122 121 57-5m-57 14 41-4" stroke="#c7ddff" stroke-width="4" stroke-linecap="round"/>
      <circle cx="151" cy="92" r="14" fill="#4a86ff"/>
      <path d="m148 84 10 7-9 7Z" fill="white"/>
      <path d="m117 151 24-3 4 15-24 4Z" fill="#8db9f7"/>
      <path d="m109 164 47-5 8 7-48 6Z" fill="#aacbfa"/>
    </g>
    <g class="landing-art-books">
      <path d="m29 149 50-15 32 12-51 16Z" fill="#7ac1ff"/>
      <path d="m29 149 2 15 28 13 1-15Z" fill="#4a85ee"/>
      <path d="m60 162 51-16v15l-51 16Z" fill="#d4eaff"/>
      <path d="m32 165 48-15 33 13-49 16Z" fill="#417cf0"/>
      <path d="m32 165 1 10 30 13 1-9Z" fill="#275edb"/>
      <path d="m64 179 49-16v9l-50 16Z" fill="#9fc9ff"/>
      <path d="m28 136 48-14 31 13-48 15Z" fill="url(#landing-book)"/>
      <path d="m28 136 1 11 29 12 1-9Z" fill="#3b87ef"/>
      <path d="m59 150 48-15v10l-49 14Z" fill="#f5faff" stroke="#bed8fb"/>
    </g>
    <g class="landing-art-note">
      <path d="m182 134 34 5-7 45-33-5Z" fill="#80b1f7"/>
      <path d="m179 130 35 5a4 4 0 0 1 3 5l-7 42a4 4 0 0 1-4 3l-33-6a4 4 0 0 1-3-4l6-42a4 4 0 0 1 3-3Z" fill="white" stroke="#cfE1ff" stroke-width="1.5"/>
      <path d="m181 140 6 1-1 7-6-1Z" fill="#6aa4ff"/>
      <path d="m190 142 18 3m-28 12 24 4m-26 5 18 3" stroke="#bcd7ff" stroke-width="3" stroke-linecap="round"/>
    </g>
    <path d="m215 62 3 6 6 2-6 3-3 7-2-7-6-3 6-2Z" fill="#aacfff"/>
    <circle cx="27" cy="75" r="3" fill="#b5d5ff"/>
`) +
    '<span class="landing-float-tag landing-tag-chapter">章节练习</span>' +
    '<span class="landing-float-tag landing-tag-wrong">错题复习</span>' +
    '<span class="landing-float-tag landing-tag-ai">' +
    icon("sparkles") +
    "AI 精讲</span></div>";

  art.landingNotebook = () =>
    '<div class="landing-notebook-art" aria-hidden="true">' +
    svg(`<defs><linearGradient id="notebook-blue" x1="30" y1="104" x2="121" y2="178" gradientUnits="userSpaceOnUse"><stop stop-color="#a1d8ff"/><stop offset="1" stop-color="#487af0"/></linearGradient></defs>
    <ellipse cx="115" cy="171" rx="101" ry="20" fill="#e0eeff"/>
    <path d="m30 121 68-24 36 19-69 25Z" fill="url(#notebook-blue)"/>
    <path d="m30 121 2 14 33 18v-12Z" fill="#4d87ef"/>
    <path d="m65 141 69-25v12l-69 25Z" fill="#e8f4ff"/>
    <path d="m27 141 69-23 38 20-70 23Z" fill="#629cf7"/>
    <path d="m27 141 1 10 36 19v-9Z" fill="#366bdc"/>
    <path d="m64 161 70-23v9l-70 23Z" fill="#bbd8ff"/>
    <g class="landing-notebook-page">
      <path d="m88 58 77-13 16 110-77 13Z" fill="#85b3f7"/>
      <path d="m82 56 77-13a6 6 0 0 1 7 5l15 101a6 6 0 0 1-5 7l-76 13a6 6 0 0 1-7-5L78 63a6 6 0 0 1 4-7Z" fill="white" stroke="#c7ddff" stroke-width="1.5"/>
      <path d="m82 56 77-13a6 6 0 0 1 7 5l2 14-88 15-2-14a6 6 0 0 1 4-7Z" fill="#7eb4ff"/>
      <circle cx="89" cy="65" r="3" fill="white"/><circle cx="100" cy="63" r="3" fill="white"/><circle cx="111" cy="61" r="3" fill="white"/>
      <path d="m94 90 10-2 2 12-10 2Z" fill="#77acff"/>
      <path d="m112 88 41-7m-59 34 62-11m-60 22 49-9m-47 20 56-10" stroke="#bfd9ff" stroke-width="5" stroke-linecap="round"/>
    </g>
    <g class="landing-notebook-bulb">
      <circle cx="199" cy="78" r="19" fill="#fff1cf"/>
      <path d="M191 76a8 8 0 1 1 13 6c-3 2-3 5-3 7h-8c0-3-1-5-3-7a8 8 0 0 1 1-6Z" fill="#ffc266" stroke="#f5a13e"/>
      <path d="M194 91h6m-6 4h6" stroke="#e9a04f" stroke-width="2.5" stroke-linecap="round"/>
    </g>
    <path d="m181 153 13-28 6 3-13 28-8 7Z" fill="#5c94f5"/>
    <path d="m179 163 8-7-5-2Z" fill="#c4ddff"/>
`) +
    "</div>";

  art.landingWeb = () =>
    '<div class="landing-web-art" aria-hidden="true">' +
    svg(`<defs><linearGradient id="web-frame" x1="43" y1="32" x2="195" y2="160" gradientUnits="userSpaceOnUse"><stop stop-color="#92c6ff"/><stop offset="1" stop-color="#3c75ed"/></linearGradient></defs>
    <ellipse cx="121" cy="172" rx="99" ry="18" fill="#cfe3ff"/>
    <path d="m42 34 144-10a8 8 0 0 1 9 8l5 112a8 8 0 0 1-8 8L49 162a8 8 0 0 1-9-8L35 44a9 9 0 0 1 7-10Z" fill="url(#web-frame)"/>
    <path d="m44 42 140-10 5 111-140 10Z" fill="white" stroke="#bfdaff" stroke-width="1.5"/>
    <path d="m44 42 140-10 1 14-140 10Z" fill="#eef6ff"/>
    <circle cx="51" cy="48" r="2" fill="#94baf7"/><circle cx="58" cy="47" r="2" fill="#94baf7"/><circle cx="65" cy="47" r="2" fill="#94baf7"/>
    <path d="m49 62 32-2 3 87-31 2Z" fill="#f0f6ff"/>
    <path d="m58 71 15-1m-15 12 15-1m-15 12 15-1m-15 12 15-1" stroke="#a9c9fa" stroke-width="3" stroke-linecap="round"/>
    <path d="m93 66 75-5 1 23-75 5Z" fill="#dcebff"/>
    <path d="m101 73 33-2m-33 9 46-3" stroke="#70a4f6" stroke-width="3" stroke-linecap="round"/>
    <path d="m95 100 30-2 1 16-30 2Zm41-3 33-2 1 16-33 2Z" fill="#f0f6ff" stroke="#d5e5ff"/>
    <path d="m97 128 70-5" stroke="#c2d9fc" stroke-width="4" stroke-linecap="round"/>
    <path d="m105 159 29-2 5 14-31 3Z" fill="#87b4f6"/>
    <path d="m94 173 54-4 10 8-56 5Z" fill="#abcafa"/>
    <g class="landing-web-check">
      <circle cx="192" cy="146" r="23" fill="#51cdb4" stroke="#a0ecda" stroke-width="2"/>
      <path d="m181 145 8 8 14-18" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
`) +
    "</div>";
})();
("use strict");
(() => {
  const flow = window.AceStudyFlow;
  const root = $("#login-page");
  if (!flow || !root) return;
  const safe = flow.safe;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const storageKey = "aceexam.home-blue.access.v1";
  const typeNames = {
    single_choice: "单选题",
    multiple_choice: "多选题",
    true_false: "判断题",
  };
  const localIcon = (name) => {
    const paths = {
      user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
      lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/>',
      eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
      eyeOff:
        '<path d="m3 3 18 18M9.5 5.3A11 11 0 0 1 12 5c6.5 0 10 7 10 7a20 20 0 0 1-3.2 4.2M6 6.4A20 20 0 0 0 2 12s3.5 7 10 7a12 12 0 0 0 4.7-1"/><path d="M10 10a3 3 0 0 0 4 4"/>',
      target:
        '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 8-8m-1 0h3v3"/>',
      chart: '<path d="M4 20V13h3v7m4 0V9h3v11m4 0V5h3v15M3 8l7-5 5 2 6-4"/>',
      layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
      monitor:
        '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 22h8m-4-5v5"/>',
      cap: '<path d="m2 8 10-5 10 5-10 5-10-5Zm4 2v7c4 3 8 3 12 0v-7M22 8v8"/>',
    };
    return (
      '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
      (paths[name] || paths.target) +
      "</svg>"
    );
  };
  let authMode = "login";
  let submitTimer = null;
  let authAnimation = null;
  let submitting = false;
  const guest = {
    subject: "computer",
    index: 0,
    selections: {},
    responses: {},
    showReport: false,
  };
  const questions = [...flow.questionMap.values()];
  const guestLists = {};
  function samples(subject) {
    if (guestLists[subject]) return guestLists[subject];
    const pool =
      subject === "network"
        ? questions.filter((q) => q.chapter === "网络与信息安全")
        : questions;
    const preferred = pool.find(
      (q) =>
        q.type === "single_choice" &&
        (subject === "network"
          ? /端到端/.test(q.q)
          : /SUM\(|数值.*总和|求和/.test(q.q)),
    );
    const rest = pool.filter((q) => q !== preferred);
    const multi = rest.find((q) => q.type === "multiple_choice");
    const judge = rest.find((q) => q.type === "true_false");
    const singles = rest.filter(
      (q) => q.type === "single_choice" && q !== multi && q !== judge,
    );
    const chosen = [preferred, ...singles.slice(0, 2), judge, multi].filter(
      Boolean,
    );
    for (const q of pool) {
      if (chosen.length >= 5) break;
      if (!chosen.some((item) => item.id === q.id)) chosen.push(q);
    }
    guestLists[subject] = chosen.slice(0, 5);
    return guestLists[subject];
  }
  function readAccess() {
    try {
      const raw =
        localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey);
      const value = JSON.parse(raw || "null");
      return value?.demo === true ? value : null;
    } catch {
      return null;
    }
  }
  function paintAccess() {
    const button = $("#landing-header-login");
    button.textContent = readAccess() ? "进入学习空间" : "登录";
    button.dataset.landingAction = readAccess() ? "enter" : "login";
  }
  function mounted() {
    return !!$("#landing-auth-form");
  }
  function mount() {
    if (mounted()) return;
    const features = [
      {
        title: "章节练习",
        copy: "按章节推进，把基础练扎实",
        route: "chapters",
        illustration: art.computer,
      },
      {
        title: "AI 精讲与练习",
        copy: "讲明知识点，再用练习巩固理解",
        route: "ai",
        illustration: art.vipBook,
        vip: true,
      },
      {
        title: "错题复习",
        copy: "记住易错点，有针对性地回顾",
        route: "wrong",
        illustration: art.review,
      },
      {
        title: "模拟考试",
        copy: "按考试节奏，检验掌握程度",
        route: "exam",
        illustration: art.exam,
      },
      {
        title: "学习计划",
        copy: "把目标拆成每天的小任务",
        route: "plan",
        illustration: art.schedule,
      },
      {
        title: "知识掌握度",
        copy: "从作答记录，找到下一步",
        route: "home",
        illustration: art.technology,
      },
    ];
    root.innerHTML = `
      <header class="landing-header">
        <div class="landing-header-inner landing-container">
          <button class="landing-brand" data-landing-action="top" aria-label="考匠登录页顶部">
            <img src="../../kaojiang-logo-192.png" width="34" height="34" alt=""/>
            <span><strong>考匠</strong><small>AceExam</small></span>
          </button>
          <nav class="landing-nav" aria-label="登录页导航">
            <button data-landing-scroll="landing-method">学习方式</button>
            <button data-landing-scroll="landing-features">全部功能</button>
            <button data-landing-scroll="landing-directions">备考方向</button>
            <button data-landing-scroll="landing-web">Web 学习</button>
          </nav>
          <div class="landing-header-actions">
            <button class="landing-button landing-button-outline" id="landing-header-login" data-landing-action="login">登录</button>
            <button class="landing-button" data-landing-action="register">免费注册</button>
          </div>
        </div>
      </header>
      <div class="landing-top">
        <section class="landing-hero landing-container" aria-labelledby="landing-title">
          <div class="landing-hero-story">
            <div class="landing-hero-copy">
              <span class="landing-eyebrow">你的备考学习空间</span>
              <h1 id="landing-title">把每一道题，<br/>学成你的<span>底气。</span></h1>
              <p class="landing-lead">有路径地练，有针对性地学，有依据地复盘。</p>
              <p class="landing-description">章节练习、错题复习与 AI 精讲，<br/>陪你把知识点学懂，把备考节奏走稳。</p>
              <div class="landing-hero-cta">
                <button class="landing-button" data-landing-scroll="landing-trial">免费试做 5 道题 ${icon("arrow")}</button>
                <span>无需注册，先体验一题</span>
              </div>
            </div>
            <div class="landing-hero-visual">${art.landingStudy()}</div>
          </div>
          <section class="landing-auth-card" aria-labelledby="landing-auth-title">
            <div class="landing-auth-heading">
              <h2 id="landing-auth-title">欢迎回到考匠</h2>
              <p id="landing-auth-caption">登录后，继续你的学习进度</p>
            </div>
            <div class="landing-auth-tabs" role="tablist" aria-label="账号操作">
              <button class="is-active" id="auth-tab-login" role="tab" aria-selected="true" aria-controls="landing-auth-panel" tabindex="0" data-auth-mode="login">登录</button>
              <button id="auth-tab-register" role="tab" aria-selected="false" aria-controls="landing-auth-panel" tabindex="-1" data-auth-mode="register">注册</button>
            </div>
            <div id="landing-auth-panel" role="tabpanel" aria-labelledby="auth-tab-login">
              <form id="landing-auth-form" novalidate>
                <div class="landing-field" data-auth-field="account">
                  <label for="auth-account">账号</label>
                  <div class="landing-input-wrap">${localIcon("user")}<input id="auth-account" name="username" type="text" maxlength="40" autocomplete="username" placeholder="请输入账号" aria-describedby="auth-account-error"/></div>
                  <p class="landing-field-error" id="auth-account-error" hidden></p>
                </div>
                <div class="landing-field" data-auth-field="password">
                  <label for="auth-password">密码</label>
                  <div class="landing-input-wrap">${localIcon("lock")}<input id="auth-password" name="password" type="password" maxlength="72" autocomplete="current-password" placeholder="请输入密码" aria-describedby="auth-password-error"/>
                    <button type="button" class="landing-password-toggle" data-auth-toggle="auth-password" aria-label="显示密码" aria-pressed="false">${localIcon("eye")}</button>
                  </div>
                  <p class="landing-field-error" id="auth-password-error" hidden></p>
                </div>
                <div class="landing-field" data-auth-field="confirm" hidden>
                  <label for="auth-confirm">确认密码</label>
                  <div class="landing-input-wrap">${localIcon("lock")}<input id="auth-confirm" name="confirmPassword" type="password" maxlength="72" autocomplete="new-password" placeholder="再次输入密码" aria-describedby="auth-confirm-error"/>
                    <button type="button" class="landing-password-toggle" data-auth-toggle="auth-confirm" aria-label="显示确认密码" aria-pressed="false">${localIcon("eye")}</button>
                  </div>
                  <p class="landing-field-error" id="auth-confirm-error" hidden></p>
                </div>
                <div class="landing-auth-options" id="auth-login-options">
                  <label><input id="auth-remember" type="checkbox" checked/>记住体验状态</label>
                  <button type="button" data-landing-action="forgot">忘记密码</button>
                </div>
                <label class="landing-agreement" id="auth-register-agreement" hidden>
                  <input id="auth-agree" type="checkbox"/>
                  <span>我已阅读并同意 <button type="button" data-landing-action="terms">用户协议</button> 和 <button type="button" data-landing-action="privacy">隐私政策</button></span>
                </label>
                <p class="landing-field-error" id="auth-agreement-error" hidden></p>
                <p class="landing-auth-status" id="auth-form-status" role="alert" hidden></p>
                <button type="submit" class="landing-button landing-auth-submit" id="auth-submit">登录，开始学习 ${icon("arrow")}</button>
              </form>
            </div>
            <p class="landing-auth-switch"><span id="auth-switch-copy">还没有账号？</span><button id="auth-switch-button" data-auth-mode="register">立即注册</button></p>
            <button class="landing-demo-entry" data-landing-action="demo">使用体验账号 ${icon("chevron")}</button>
            <p class="landing-auth-demo-note">界面体验，不会创建真实账号</p>
            <div class="landing-auth-legal"><button data-landing-action="terms">用户协议</button><span>·</span><button data-landing-action="privacy">隐私政策</button></div>
          </section>
        </section>
        <section class="landing-method landing-container" id="landing-method" aria-label="考匠学习方式">
          <div><span class="landing-method-icon">${icon("book")}</span><div><h2><span>01</span>有路径地练</h2><p>按章节与知识点，逐步打牢基础</p></div></div>
          <div><span class="landing-method-icon">${localIcon("target")}</span><div><h2><span>02</span>有针对性地学</h2><p>找出薄弱环节，把重点讲清楚</p></div></div>
          <div><span class="landing-method-icon">${localIcon("chart")}</span><div><h2><span>03</span>有依据地复盘</h2><p>从错题与练习记录，看见下一步</p></div></div>
        </section>
        <section class="landing-trial landing-container" id="landing-trial" aria-labelledby="landing-trial-title">
          <div class="landing-trial-intro">
            <h2 id="landing-trial-title" tabindex="-1">先做一题，感受考匠</h2>
            <p>免费试做 5 道题，无需注册。</p>
            <p class="landing-description">从一道题开始，体验真实的练习过程。<br/>看看考匠如何帮你学会、记牢。</p>
            ${art.landingNotebook()}
          </div>
          <section class="landing-guest-card" id="landing-guest-card" aria-label="免费体验练习">
            <div class="landing-guest-top"><strong>${icon("chapter")}免费体验练习</strong>
              <label class="sr-only" for="guest-subject">体验题组</label>
              <select id="guest-subject"><option value="computer">四川专升本 · 计算机</option><option value="network">软考 · 网络工程师示例</option></select>
            </div>
            <div class="landing-guest-nav" id="guest-nav" role="group" aria-label="体验题目"></div>
            <div id="guest-view"></div>
            <div class="landing-guest-bottom" id="guest-bottom">
              <span>${icon("sparkles")}登录后，继续系统学习</span>
              <button class="landing-button" id="guest-primary" data-guest-action="primary">确认答案 ${icon("arrow")}</button>
            </div>
          </section>
        </section>
      </div>
      <section class="landing-features landing-container landing-section" id="landing-features" aria-labelledby="landing-features-title">
        <div class="landing-section-heading"><h2 id="landing-features-title" tabindex="-1">你的备考，一处就绪。</h2><p>从这一题，到下一次进步。</p></div>
        <div class="landing-feature-grid">
          ${features
            .map(
              (
                feature,
              ) => `<button class="landing-feature" data-landing-route="${feature.route}">
            <span class="landing-feature-art">${feature.illustration()}</span>
            <span class="landing-feature-copy"><strong>${feature.title}${feature.vip ? "<small>VIP</small>" : ""}</strong><span>${feature.copy}</span></span>
            <span class="landing-feature-arrow">${icon("chevron")}</span>
          </button>`,
            )
            .join("")}
        </div>
        <div class="landing-extra-features">
          <button data-landing-route="ai">${icon("sparkles")}AI 专项训练</button>
          <button data-landing-action="bank">${localIcon("layers")}共享题库</button>
          <button data-landing-route="favorites">${icon("bookmark")}重点收藏</button>
          <button data-landing-route="vip">${icon("crown")}会员与 AI 服务</button>
        </div>
        <p class="landing-feature-note">AI 精讲为 VIP 功能，月额度随套餐发放；会员通过卡密兑换开通。</p>
      </section>
      <section class="landing-directions landing-container landing-section" id="landing-directions" aria-labelledby="landing-directions-title">
        <div class="landing-section-heading landing-directions-heading"><div><h2 id="landing-directions-title" tabindex="-1">选好方向，下一步交给行动。</h2><p>找到适合自己的备考目标，进入对应学习空间。</p></div>
          <div class="landing-direction-search">${icon("search")}<label class="sr-only" for="landing-direction-search">搜索考试或证书</label><input id="landing-direction-search" type="search" placeholder="搜索考试或证书" autocomplete="off"/></div>
        </div>
        <div class="landing-direction-grid" id="landing-direction-grid">
          <button class="landing-direction" data-landing-direction="computer" data-direction-search="专升本 四川 计算机">
            <span class="landing-direction-art">${localIcon("cap")}</span><span><strong>专升本</strong><small>四川专升本 · 计算机</small><b>查看科目 ${icon("arrow")}</b></span>
          </button>
          <button class="landing-direction" data-landing-direction="network" data-direction-search="软考 网络工程师 网络">
            <span class="landing-direction-art landing-direction-screen">${art.computer()}</span><span><strong>软考</strong><small>网络工程师备考方向</small><b>体验题目 ${icon("arrow")}</b></span>
          </button>
          <button class="landing-direction" data-landing-action="directions" data-direction-search="更多 考试 证书 全部">
            <span class="landing-direction-art landing-direction-books">${art.book()}</span><span><strong>更多考试与证书</strong><small>按你的目标，选择学习内容</small><b>浏览方向 ${icon("arrow")}</b></span>
          </button>
        </div>
        <p id="landing-direction-status" class="landing-direction-status" role="status" aria-live="polite" hidden></p>
      </section>
      <section class="landing-web landing-container" id="landing-web" aria-labelledby="landing-web-title">
        <div class="landing-web-visual">${art.landingWeb()}</div>
        <div><h2 id="landing-web-title" tabindex="-1">打开浏览器，<br/>就是你的学习空间。</h2><p>在电脑上系统练习，按自己的节奏推进。<br/>章节、错题、计划，陪你走好每一步。</p>
          <div class="landing-web-actions"><button class="landing-button" data-landing-action="enter">${localIcon("monitor")}进入 Web 学习空间 ${icon("arrow")}</button><button class="landing-button landing-button-outline" data-landing-scroll="landing-trial">先试做 5 题</button></div>
        </div>
      </section>
      <section class="landing-final landing-container"><div><h2>下一次进步，从这一题开始。</h2><p>给自己一个专注的学习空间。</p></div>
        <div><button class="landing-button" data-landing-action="login">登录考匠 ${icon("arrow")}</button><button class="landing-text-link" data-landing-action="register">免费注册</button></div>
      </section>
      <footer class="landing-footer"><div class="landing-container">
        <div class="landing-footer-brand"><img src="../../kaojiang-logo-48.png" width="28" height="28" alt=""/><strong>考匠</strong><span>AceExam</span><small>认真练习，从容应考。</small></div>
        <nav aria-label="网站信息"><button data-landing-action="about">关于考匠</button><button data-landing-action="terms">用户协议</button><button data-landing-action="privacy">隐私政策</button></nav>
        <small>© 2026 考匠 AceExam</small>
      </div></footer>`;
    paintAccess();
    renderGuest();
  }
  function scrollLanding(id) {
    const target = $("#" + id);
    if (!target) return;
    target.scrollIntoView({
      behavior: motionAllowed() ? "smooth" : "auto",
      block: "start",
    });
  }
  function clearError(field) {
    const input = $("#auth-" + field);
    const error = $("#auth-" + field + "-error");
    if (input) {
      input.removeAttribute("aria-invalid");
      input.closest(".landing-field")?.classList.remove("has-error");
    }
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
  }
  function fieldError(field, message) {
    const input = $("#auth-" + field),
      error = $("#auth-" + field + "-error");
    input.setAttribute("aria-invalid", "true");
    input.closest(".landing-field").classList.add("has-error");
    error.textContent = message;
    error.hidden = false;
  }
  function clearFormErrors() {
    ["account", "password", "confirm"].forEach(clearError);
    $("#auth-agreement-error").hidden = true;
    $("#auth-agree").removeAttribute("aria-invalid");
    $("#auth-form-status").hidden = true;
    $("#auth-form-status").textContent = "";
  }
  function cancelSubmit() {
    clearTimeout(submitTimer);
    submitTimer = null;
    submitting = false;
    const form = $("#landing-auth-form");
    if (!form) return;
    form.removeAttribute("aria-busy");
    form.querySelectorAll("input,button").forEach((control) => {
      control.disabled = false;
    });
    root.querySelectorAll(".landing-auth-tabs button").forEach((button) => {
      button.disabled = false;
    });
    $("#auth-submit").innerHTML =
      (authMode === "login" ? "登录，开始学习" : "注册，开启学习") +
      icon("arrow");
  }
  function setAuthMode(mode, focus = false) {
    if (!["login", "register"].includes(mode)) return;
    cancelSubmit();
    const changed = mode !== authMode;
    authMode = mode;
    root
      .querySelectorAll(".landing-auth-tabs [data-auth-mode]")
      .forEach((button) => {
        const active = button.dataset.authMode === mode;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
      });
    $("#landing-auth-panel").setAttribute(
      "aria-labelledby",
      "auth-tab-" + mode,
    );
    $('[data-auth-field="confirm"]').hidden = mode !== "register";
    $("#auth-login-options").hidden = mode !== "login";
    $("#auth-register-agreement").hidden = mode !== "register";
    $("#landing-auth-title").textContent =
      mode === "login" ? "欢迎回到考匠" : "开启你的学习空间";
    $("#landing-auth-caption").textContent =
      mode === "login"
        ? "登录后，继续你的学习进度"
        : "把下一次进步，交给每天的小积累";
    $("#auth-submit").innerHTML =
      (mode === "login" ? "登录，开始学习" : "注册，开启学习") + icon("arrow");
    $("#auth-switch-copy").textContent =
      mode === "login" ? "还没有账号？" : "已有账号？";
    $("#auth-switch-button").textContent =
      mode === "login" ? "立即注册" : "立即登录";
    $("#auth-switch-button").dataset.authMode =
      mode === "login" ? "register" : "login";
    $("#auth-password").autocomplete =
      mode === "login" ? "current-password" : "new-password";
    $("#auth-password").placeholder =
      mode === "login" ? "请输入密码" : "设置密码，至少 6 个字符";
    if (changed) {
      $("#auth-password").value = "";
      $("#auth-confirm").value = "";
      $("#auth-agree").checked = false;
      root.querySelectorAll("[data-auth-toggle]").forEach((button) => {
        $("#" + button.dataset.authToggle).type = "password";
        button.setAttribute("aria-pressed", "false");
        button.setAttribute(
          "aria-label",
          button.dataset.authToggle === "auth-confirm"
            ? "显示确认密码"
            : "显示密码",
        );
        button.innerHTML = localIcon("eye");
      });
      clearFormErrors();
      authAnimation?.cancel();
      if (motionAllowed())
        authAnimation = $("#landing-auth-panel").animate(
          [
            { opacity: 0.45, transform: "translateY(4px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 220, easing: "ease-out" },
        );
    }
    if (focus) {
      scrollLanding("landing-auth-title");
      $("#auth-account").focus({ preventScroll: true });
    }
  }
  function togglePassword(button) {
    const input = $("#" + button.dataset.authToggle);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    button.setAttribute("aria-pressed", String(show));
    button.setAttribute(
      "aria-label",
      (show ? "隐藏" : "显示") +
        (input.id === "auth-confirm" ? "确认密码" : "密码"),
    );
    button.innerHTML = localIcon(show ? "eyeOff" : "eye");
  }
  function enterDemo() {
    cancelSubmit();
    $("#auth-password").value = "";
    $("#auth-confirm").value = "";
    $("#auth-account").value = "";
    if (window.AceDemoSettings) window.AceDemoSettings.enterSpace();
    else showPage("home");
    toast("已进入 Web 学习体验空间");
  }
  function submitAuth(event) {
    event.preventDefault();
    if (submitting) return;
    clearFormErrors();
    const account = $("#auth-account").value.trim();
    const password = $("#auth-password").value;
    const confirm = $("#auth-confirm").value;
    let firstInvalid = null;
    const invalid = (field, message) => {
      fieldError(field, message);
      firstInvalid ||= $("#auth-" + field);
    };
    if (account.length < 3) invalid("account", "请输入至少 3 个字符的账号");
    if (password.length < 6) invalid("password", "密码至少需要 6 个字符");
    if (authMode === "register" && password !== confirm)
      invalid("confirm", "两次输入的密码不一致");
    if (authMode === "register" && !$("#auth-agree").checked) {
      $("#auth-agreement-error").textContent =
        "请先阅读并勾选用户协议与隐私政策";
      $("#auth-agreement-error").hidden = false;
      $("#auth-agree").setAttribute("aria-invalid", "true");
      firstInvalid ||= $("#auth-agree");
    }
    if (firstInvalid) {
      $("#auth-form-status").textContent = "请修改表单中标注的内容后再试";
      $("#auth-form-status").hidden = false;
      firstInvalid.focus();
      return;
    }
    submitting = true;
    const form = $("#landing-auth-form");
    const remember = authMode === "login" ? $("#auth-remember").checked : true;
    form.setAttribute("aria-busy", "true");
    form.querySelectorAll("input,button").forEach((control) => {
      control.disabled = true;
    });
    root.querySelectorAll(".landing-auth-tabs button").forEach((button) => {
      button.disabled = true;
    });
    $("#auth-submit").innerHTML =
      '<span class="landing-spinner" aria-hidden="true"></span>正在进入体验空间';
    submitTimer = setTimeout(() => {
      // Store only a demo access flag. No account name, password, token, or real authentication.
      try {
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
        (remember ? localStorage : sessionStorage).setItem(
          storageKey,
          JSON.stringify({ demo: true, enteredAt: Date.now() }),
        );
      } catch {}
      paintAccess();
      enterDemo();
    }, 280);
  }
  function fillDemo() {
    closeDialog();
    setAuthMode("login", true);
    $("#auth-account").value = "kaojiang_demo";
    $("#auth-password").value = "demo123456";
    clearFormErrors();
    $("#auth-submit").focus({ preventScroll: true });
    toast("体验账号已填入，点击登录即可继续");
  }
  function openInfo(kind) {
    const content = {
      terms: [
        "用户协议",
        "当前页面提供考匠 Web 界面体验。表单不连接正式账号服务，点击登录或注册会进入本地学习演示，不创建真实账号。",
        "练习、计划、收藏和会员兑换均使用演示数据；正式服务的使用规则以正式发布的协议为准。",
      ],
      privacy: [
        "隐私政策",
        "此演示不会发送登录表单中的账号或密码，也不会把它们写入浏览器存储。",
        "勾选“记住体验状态”时，仅保存已进入体验的标记。学习演示数据保存在当前浏览器，设置中的重置功能可恢复初始示例。",
      ],
      about: [
        "关于考匠",
        "考匠把章节练习、错题复习、模拟考试与学习计划放在一个学习空间。",
        "现在可以直接体验 Web 界面，先做一题，再找到适合自己的学习节奏。",
      ],
      bank: [
        "共享题库",
        "本次演示复用现有公开题库快照，共 " +
          flow.questionMap.size +
          " 道题，包含单选、多选和判断。",
        "你可以按章节练习，也可以在模拟考试中组合知识点。软考入口在此页提供网络题目的体验题组。",
      ],
    }[kind];
    if (!content) return;
    showDialog(
      content[0],
      '<p class="dialog-lead">' +
        safe(content[1]) +
        '</p><div class="lesson-note"><p>' +
        safe(content[2]) +
        '</p></div><div class="study-form-actions"><button class="primary-button" data-action="close">我知道了</button></div>',
      "考匠 Web 体验",
    );
  }
  function showRecovery() {
    showDialog(
      "找回密码",
      '<p class="dialog-lead">在正式服务中，可通过已绑定的账号信息找回密码。</p><div class="lesson-note"><h3>正在体验登录页？</h3><p>当前演示不验证真实账号，也不发送验证码。可以使用体验账号，继续查看学习界面。</p></div><div class="study-form-actions"><button class="study-outline" data-action="close">返回登录</button><button class="primary-button" data-landing-action="demo">使用体验账号' +
        icon("arrow") +
        "</button></div>",
      "账号帮助",
    );
  }
  function directionDialog() {
    showDialog(
      "选择备考方向",
      '<p class="dialog-lead">选择一个方向，先看看怎样开始学习。</p><button class="dialog-row" data-landing-direction="computer"><span class="row-icon">' +
        localIcon("cap") +
        '</span><span class="row-copy"><strong>四川专升本 · 计算机</strong><small>七章、206 道题的 Web 学习演示</small></span>' +
        icon("chevron") +
        '</button><button class="dialog-row" data-landing-direction="network"><span class="row-icon">' +
        localIcon("monitor") +
        '</span><span class="row-copy"><strong>软考 · 网络工程师</strong><small>先试做网络知识点的示例题组</small></span>' +
        icon("chevron") +
        "</button>",
      "备考方向",
    );
  }
  function chooseDirection(direction) {
    closeDialog();
    if (direction === "computer") {
      $("#course").selectedIndex = 0;
      showPage("chapters");
    } else {
      if (document.body.dataset.page !== "login") showPage("login");
      $("#guest-subject").value = "network";
      resetGuest("network");
      scrollLanding("landing-trial");
      $("#landing-trial-title").focus({ preventScroll: true });
    }
  }
  function resetGuest(subject = guest.subject) {
    guest.subject = subject;
    guest.index = 0;
    guest.selections = {};
    guest.responses = {};
    guest.showReport = false;
    renderGuest();
  }
  function renderGuest() {
    const list = samples(guest.subject);
    const current = list[guest.index];
    const answered = Object.keys(guest.responses).length;
    $("#guest-nav").innerHTML = list
      .map((q, index) => {
        const response = guest.responses[q.id];
        const label =
          "第 " +
          (index + 1) +
          " 题" +
          (response
            ? response.correct
              ? "，回答正确"
              : "，回答错误"
            : "，未作答");
        return (
          '<button data-guest-index="' +
          index +
          '" class="' +
          (index === guest.index && !guest.showReport ? "is-current " : "") +
          (response ? (response.correct ? "is-correct" : "is-wrong") : "") +
          '" aria-label="' +
          label +
          '"' +
          (index === guest.index && !guest.showReport
            ? ' aria-current="step"'
            : "") +
          ">" +
          (index + 1) +
          "</button>"
        );
      })
      .join("");
    if (guest.showReport) {
      const correct = list.filter((q) => guest.responses[q.id]?.correct).length;
      $("#guest-view").innerHTML =
        '<div class="landing-guest-report"><span class="landing-report-icon">' +
        icon("check") +
        '</span><h3 id="guest-question-title" tabindex="-1">这一步，已经迈出去了。</h3><p>5 道题已完成，答对 <strong>' +
        correct +
        '</strong> 道。继续理解知识点，比一次全对更重要。</p><div><button class="landing-button" data-landing-action="login">登录，继续学习' +
        icon("arrow") +
        '</button><button class="landing-text-link" data-guest-action="reset">重新试做</button></div></div>';
      $("#guest-bottom").hidden = true;
      return;
    }
    $("#guest-bottom").hidden = false;
    const selected = guest.selections[current.id] || [];
    const response = guest.responses[current.id];
    const isMulti = current.type === "multiple_choice";
    $("#guest-view").innerHTML =
      '<div class="landing-guest-question">' +
      '<div class="landing-guest-meta"><span>' +
      typeNames[current.type] +
      "</span><small>第 " +
      (guest.index + 1) +
      " / 5 题 · " +
      safe(current.point || current.chapter) +
      "</small></div>" +
      '<h3 id="guest-question-title" tabindex="-1">' +
      safe(current.q) +
      "</h3>" +
      '<fieldset class="landing-guest-options" id="guest-options"><legend class="sr-only">' +
      (isMulti ? "选择所有正确答案" : "选择一个正确答案") +
      "</legend>" +
      current.options
        .map((option, index) => {
          const chosen = selected.includes(index);
          const correct = response && current.answers.includes(index);
          const wrong = response && chosen && !correct;
          return (
            '<label class="landing-guest-option ' +
            (chosen ? "is-selected " : "") +
            (correct ? "is-correct " : "") +
            (wrong ? "is-wrong" : "") +
            '" data-guest-label="' +
            index +
            '">' +
            '<input id="guest-option-' +
            index +
            '" type="' +
            (isMulti ? "checkbox" : "radio") +
            '" name="guest-choice" value="' +
            index +
            '"' +
            (chosen ? " checked" : "") +
            (response ? " disabled" : "") +
            '/><span class="landing-guest-letter">' +
            String.fromCharCode(65 + index) +
            "</span><span>" +
            safe(option) +
            "</span>" +
            (correct ? icon("check") : "") +
            "</label>"
          );
        })
        .join("") +
      '</fieldset><p class="landing-field-error" id="guest-error" role="alert" hidden></p>' +
      (response
        ? '<div class="landing-guest-explanation ' +
          (response.correct ? "is-correct" : "is-wrong") +
          '" role="status"><strong>' +
          icon(response.correct ? "check" : "info") +
          (response.correct ? "回答正确" : "再记牢一点") +
          " · 正确答案 " +
          current.answers
            .map((index) => String.fromCharCode(65 + index))
            .join("、") +
          "</strong><p>" +
          safe(current.explain) +
          "</p></div>"
        : "") +
      "</div>";
    const text = !response
      ? "确认答案"
      : guest.index < list.length - 1
        ? "下一题"
        : answered < list.length
          ? "继续未答题"
          : "查看体验结果";
    $("#guest-primary").innerHTML = text + icon("arrow");
  }
  function guestPrimary() {
    const list = samples(guest.subject);
    const q = list[guest.index];
    if (!guest.responses[q.id]) {
      const selected = guest.selections[q.id] || [];
      if (!selected.length) {
        $("#guest-error").textContent =
          q.type === "multiple_choice"
            ? "请至少选择一个答案"
            : "请先选择一个答案";
        $("#guest-error").hidden = false;
        $("#guest-option-0").focus();
        return;
      }
      guest.responses[q.id] = {
        selected: [...selected],
        correct:
          [...selected].sort((a, b) => a - b).join(",") ===
          [...q.answers].sort((a, b) => a - b).join(","),
      };
      renderGuest();
      $("#guest-primary").focus({ preventScroll: true });
    } else {
      if (guest.index < list.length - 1) guest.index++;
      else {
        const next = list.findIndex(
          (question) => !guest.responses[question.id],
        );
        if (next >= 0) guest.index = next;
        else guest.showReport = true;
      }
      renderGuest();
      $("#guest-question-title").focus({ preventScroll: true });
    }
  }
  function updateGuestChoice(input) {
    const q = samples(guest.subject)[guest.index];
    if (guest.responses[q.id]) return;
    const current = guest.selections[q.id] || [];
    guest.selections[q.id] =
      q.type === "multiple_choice"
        ? input.checked
          ? [...new Set([...current, Number(input.value)])]
          : current.filter((index) => index !== Number(input.value))
        : [Number(input.value)];
    root.querySelectorAll("[data-guest-label]").forEach((label) => {
      label.classList.toggle(
        "is-selected",
        guest.selections[q.id].includes(Number(label.dataset.guestLabel)),
      );
    });
    $("#guest-error").hidden = true;
  }
  root.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.authMode)
      setAuthMode(
        button.dataset.authMode,
        !button.classList.contains("is-active") &&
          !button.closest(".landing-auth-tabs"),
      );
    else if (button.dataset.authToggle) togglePassword(button);
    else if (button.dataset.landingScroll)
      scrollLanding(button.dataset.landingScroll);
    else if (button.dataset.landingRoute) {
      const route = button.dataset.landingRoute;
      if (route === "ai") actions.ai();
      else showPage(route);
    } else if (button.dataset.landingDirection)
      chooseDirection(button.dataset.landingDirection);
    else if (button.dataset.guestIndex !== undefined) {
      guest.index = Number(button.dataset.guestIndex);
      guest.showReport = false;
      renderGuest();
      $("#guest-question-title").focus({ preventScroll: true });
    } else if (button.dataset.guestAction === "primary") guestPrimary();
    else if (button.dataset.guestAction === "reset") resetGuest();
    else if (button.dataset.landingAction) {
      const action = button.dataset.landingAction;
      if (action === "login" || action === "register")
        setAuthMode(action, true);
      else if (action === "enter") enterDemo();
      else if (action === "demo") fillDemo();
      else if (action === "forgot") showRecovery();
      else if (action === "top")
        window.scrollTo({
          top: 0,
          behavior: motionAllowed() ? "smooth" : "auto",
        });
      else if (action === "directions") showPage("certificates");
      else openInfo(action);
    }
  });
  // Dialog controls live outside the landing page.
  document.addEventListener("click", (event) => {
    if (!event.target.closest("#demo-dialog")) return;
    const demo = event.target.closest('[data-landing-action="demo"]');
    const direction = event.target.closest("[data-landing-direction]");
    if (demo) fillDemo();
    if (direction) chooseDirection(direction.dataset.landingDirection);
  });
  root.addEventListener("submit", (event) => {
    if (event.target.id === "landing-auth-form") submitAuth(event);
  });
  root.addEventListener("input", (event) => {
    if (
      ["auth-account", "auth-password", "auth-confirm"].includes(
        event.target.id,
      )
    ) {
      clearError(event.target.id.replace("auth-", ""));
      $("#auth-form-status").hidden = true;
    }
    if (event.target.id === "landing-direction-search") {
      const query = event.target.value.trim().toLowerCase();
      let count = 0;
      root.querySelectorAll("[data-direction-search]").forEach((card) => {
        card.hidden =
          query !== "" &&
          !card.dataset.directionSearch.toLowerCase().includes(query);
        if (!card.hidden) count++;
      });
      const status = $("#landing-direction-status");
      status.hidden = !query;
      status.textContent = count
        ? "找到 " + count + " 个备考入口"
        : "暂未找到对应方向，可以试试“计算机”或“软考”";
    }
  });
  root.addEventListener("change", (event) => {
    if (event.target.name === "guest-choice") updateGuestChoice(event.target);
    if (event.target.id === "guest-subject") resetGuest(event.target.value);
    if (event.target.id === "auth-agree" && event.target.checked) {
      $("#auth-agreement-error").hidden = true;
      event.target.removeAttribute("aria-invalid");
    }
  });
  root.addEventListener("keydown", (event) => {
    const tab = event.target.closest(".landing-auth-tabs [role=tab]");
    if (tab && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? "login"
          : event.key === "End"
            ? "register"
            : authMode === "login"
              ? "register"
              : "login";
      setAuthMode(next);
      $("#auth-tab-" + next).focus();
    }
    if (event.key === "Enter" && event.target.closest("#guest-options")) {
      event.preventDefault();
      guestPrimary();
    }
  });
  actions.login = () => showPage("login");
  const previousProfile = actions.profile;
  actions.profile = () => {
    previousProfile();
    $("#dialog-content").insertAdjacentHTML(
      "beforeend",
      '<div class="study-form-actions"><button class="study-outline" data-action="login">' +
        localIcon("user") +
        "预览登录与注册页面</button></div>",
    );
  };
  const previousReset = actions.reset;
  actions.reset = () => {
    previousReset();
    try {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch {}
    resetGuest();
    paintAccess();
  };
  document.addEventListener("demo:route", (event) => {
    if (event.detail.name === "login") {
      mount();
      paintAccess();
    } else {
      cancelSubmit();
      $("#auth-account").value = "";
      $("#auth-password").value = "";
      $("#auth-confirm").value = "";
      authAnimation?.cancel();
    }
  });
  motion.addEventListener("change", (event) => {
    if (event.matches) authAnimation?.cancel();
  });
  mount();
  if (document.body.dataset.page === "login") showPage("login", false);
})();
