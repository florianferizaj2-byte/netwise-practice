"use strict";
(() => {
  const flow = window.AceStudyFlow,
    root = $("#settings-page");
  if (!flow || !root) return;
  const safe = flow.safe;
  const courseNames = ["四川专升本 · 计算机", "软考 · 网络工程师"];
  const themeMedia = matchMedia("(prefers-color-scheme: dark)");
  const motionMedia = matchMedia("(prefers-reduced-motion: reduce)");
  const defaults = () => ({
    defaultCourse: courseNames[0],
    questionCount: "10",
    showAnalysis: true,
    autoNext: false,
    rememberPosition: true,
    theme: "light",
    font: "standard",
    reduceMotion: false,
    notifications: true,
  });
  const clone = (x) => structuredClone(x);
  const icons = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.5 1.5m12.6 12.6 1.5 1.5M4.2 19.8l1.5-1.5M18.3 5.7l1.5-1.5"/>',
    shield:
      '<path d="m12 2 9 4v6c0 5-5 8-9 10-4-2-9-5-9-10V6Z"/><path d="m8 12 3 3 5-6"/>',
    device:
      '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 22h8m-4-5v5"/>',
    logout:
      '<path d="M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6M8 12h13m-4-4 4 4-4 4"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m4 7v3"/>',
  };
  const localIcon = (name) =>
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
    icons[name] +
    "</svg>";
  const button = (action, label, className = "settings-button", extra = "") =>
    '<button type="button" class="' +
    className +
    '" data-settings-action="' +
    action +
    '" ' +
    extra +
    ">" +
    label +
    "</button>";
  function data() {
    const state = flow.state();
    if (!state.settingsDemo || state.settingsDemo.version !== 1)
      state.settingsDemo = {
        version: 1,
        prefs: defaults(),
        profile: {
          nickname: "学习者",
          bio: "管理个人资料与学习偏好",
          color: "blue",
        },
        notices: [],
        seeded: false,
        savedAt: null,
        lastLearning: null,
      };
    const d = state.settingsDemo;
    d.prefs = { ...defaults(), ...d.prefs };
    if (!courseNames.includes(d.prefs.defaultCourse))
      d.prefs.defaultCourse = courseNames[0];
    if (!["10", "20", "30"].includes(d.prefs.questionCount))
      d.prefs.questionCount = "10";
    if (!["light", "dark", "system"].includes(d.prefs.theme))
      d.prefs.theme = "light";
    if (!["standard", "larger", "large"].includes(d.prefs.font))
      d.prefs.font = "standard";
    for (const key of [
      "showAnalysis",
      "autoNext",
      "rememberPosition",
      "reduceMotion",
      "notifications",
    ])
      if (typeof d.prefs[key] !== "boolean") d.prefs[key] = defaults()[key];
    d.profile ||= {
      nickname: "学习者",
      bio: "管理个人资料与学习偏好",
      color: "blue",
    };
    d.profile.nickname = String(d.profile.nickname || "学习者").slice(0, 16);
    d.profile.bio = String(d.profile.bio || "管理个人资料与学习偏好").slice(
      0,
      60,
    );
    if (!["blue", "purple", "green"].includes(d.profile.color))
      d.profile.color = "blue";
    if (!Array.isArray(d.notices)) d.notices = [];
    return d;
  }
  function prefs() {
    return {
      ...data().prefs,
      reminder: !!flow.state().plan.reminder,
      reminderTime: flow.state().plan.reminderTime || "20:00",
    };
  }
  let draft = null,
    baseline = null,
    storageFailed = false,
    startup = true,
    auto = null;
  function saveStorage() {
    flow.save();
    return !$("#study-save-note").classList.contains("save-error");
  }
  function applyDisplay(p) {
    const theme =
      p.theme === "system" ? (themeMedia.matches ? "dark" : "light") : p.theme;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.font = p.font;
    document.body.dataset.reducedMotion = String(
      p.reduceMotion || motionMedia.matches,
    );
    motionEnabled = !p.reduceMotion;
    document.body.classList.toggle("motion-paused", !motionAllowed());
    if (!motionAllowed()) {
      motionStates.forEach((_, el) => stopOffice(el, true));
      document.getAnimations().forEach((a) => a.cancel());
    }
    $('meta[name="theme-color"]').content =
      theme === "dark" ? "#10192b" : "#355af6";
  }
  function paintProfile() {
    const p = data().profile;
    $(".profile-button > span:last-of-type").textContent = p.nickname;
    $(".profile-button").setAttribute("aria-label", p.nickname + "个人信息");
    const avatar = $(".profile-button .avatar");
    avatar.dataset.avatar = p.color;
    const circle = $("circle", avatar),
      body = $("svg > path", avatar);
    if (circle)
      circle.setAttribute(
        "fill",
        { blue: "#dcebff", purple: "#eee2ff", green: "#d5f2e8" }[p.color],
      );
    if (body)
      body.setAttribute(
        "fill",
        { blue: "#355af6", purple: "#8148db", green: "#009b7d" }[p.color],
      );
  }
  function activeMember() {
    const m = flow.state().memberDemo?.active;
    return m && m.expiresAt > Date.now() ? m : null;
  }
  function avatar() {
    return (
      '<span class="settings-avatar ' +
      safe(data().profile.color) +
      '">' +
      $(".profile-button .avatar").innerHTML +
      "</span>"
    );
  }
  const row = (name, help, control) =>
    '<div class="settings-row"><div class="settings-row-copy"><h3>' +
    name +
    "</h3><p>" +
    help +
    "</p></div>" +
    control +
    "</div>";
  const toggle = (key, label, help) =>
    row(
      label,
      help,
      '<label class="settings-switch"><input id="setting-' +
        key +
        '" type="checkbox" data-pref="' +
        key +
        '" aria-label="' +
        label +
        '"><span aria-hidden="true"></span></label>',
    );
  const choices = (key, items) =>
    '<div class="settings-choices" role="group" aria-label="' +
    { questionCount: "每次练习题量", font: "文字大小" }[key] +
    '">' +
    items
      .map(
        ([value, label]) =>
          '<label><input type="radio" name="' +
          key +
          '" data-pref="' +
          key +
          '" value="' +
          value +
          '"><span>' +
          label +
          "</span></label>",
      )
      .join("") +
    "</div>";
  function mount() {
    const p = data().profile,
      m = activeMember();
    const memberName = m
      ? { basic: "基础 VIP", plus: "进阶 VIP", pro: "尊享 VIP" }[m.planId] ||
        "VIP 会员"
      : "未开通会员";
    root.innerHTML = `<div class="page-heading settings-heading"><div><h1>设置</h1><p>按自己的习惯，调整学习体验。</p></div><button type="button" id="settings-save" class="primary-button" data-settings-action="save">${icon("check")}保存设置</button></div>
    <section class="settings-profile" aria-label="个人资料">
      ${avatar()}<div class="settings-profile-copy"><div><h2 class="settings-profile-name">${safe(p.nickname)}</h2><button type="button" class="settings-member ${m?.planId || "inactive"}" data-action="vip">${icon("crown")}${safe(memberName)}</button></div><p>${safe(p.bio)}</p></div>
      <span class="settings-account-state"><i></i>本地体验账号</span>
      <div class="settings-profile-actions">${button("profile", icon("pen") + "编辑资料")}${button("membership", "管理会员" + icon("chevron"), "settings-text-button")}</div>
    </section>
    <div class="settings-columns"><div class="settings-column">
      <section class="settings-panel" aria-labelledby="settings-study-heading"><header><h2 id="settings-study-heading">${icon("book")}学习偏好</h2><p>设置适合自己的练习节奏</p></header>
        ${row("默认备考方向", "进入学习空间时优先显示", '<div class="settings-course"><label class="sr-only" for="setting-defaultCourse">默认备考方向</label><select id="setting-defaultCourse" data-pref="defaultCourse">' + courseNames.map((name) => "<option>" + safe(name) + "</option>").join("") + '</select><small id="settings-course-note" hidden>网络工程师将进入已开放的精讲课程。</small></div>')}
        ${row(
          "每次练习题量",
          "用于章节练习与收藏练习",
          choices("questionCount", [
            ["10", "10 题"],
            ["20", "20 题"],
            ["30", "30 题"],
          ]),
        )}
        ${toggle("showAnalysis", "作答后查看解析", "提交答案后，展开答案与讲解")}
        ${toggle("autoNext", "自动切换下一题", "提交后停留 3 秒，也可以留在当前题")}
        ${toggle("rememberPosition", "记住上次学习位置", "下次从上次的章节和题目继续")}
      </section>
      <section class="settings-panel settings-security" aria-labelledby="settings-security-heading"><header><h2 id="settings-security-heading">${localIcon("shield")}账号与安全</h2></header>
        ${row("登录密码", "保护账号安全", button("password", "修改密码"))}
        ${row("登录设备", "查看当前浏览器的体验状态", button("devices", "管理设备"))}
        <footer><div>${button("terms", "用户协议", "settings-text-button")}${button("privacy", "隐私政策", "settings-text-button")}${button("about", "关于考匠", "settings-text-button")}</div>${button("logout", localIcon("logout") + "退出登录", "settings-text-button settings-logout")}</footer>
      </section>
    </div><div class="settings-column">
      <section class="settings-panel settings-display" aria-labelledby="settings-display-heading"><header><h2 id="settings-display-heading">${localIcon("sun")}显示设置</h2></header>
        <fieldset class="settings-theme-field"><legend>主题外观</legend><div class="settings-theme-options">${[
          ["light", "浅色"],
          ["dark", "深色"],
          ["system", "跟随系统"],
        ]
          .map(
            ([value, label]) =>
              '<label class="settings-theme-choice"><input type="radio" name="theme" data-pref="theme" value="' +
              value +
              '"><span class="settings-theme-preview ' +
              value +
              '" aria-hidden="true"><span class="settings-theme-mini"><i></i><i></i><i></i><i></i></span></span><strong>' +
              label +
              '</strong><span class="settings-choice-check" aria-hidden="true">' +
              icon("check") +
              "</span></label>",
          )
          .join("")}</div></fieldset>
        ${row(
          "文字大小",
          "用舒服的字号，读清每一道题。",
          choices("font", [
            ["standard", "标准"],
            ["larger", "较大"],
            ["large", "大号"],
          ]),
        )}
        ${toggle("reduceMotion", "减少动画", "使用更简洁的过渡效果")}
        <p class="settings-system-motion" id="settings-system-motion" hidden>${icon("info")}系统已开启减少动态效果。</p>
      </section>
      <section class="settings-panel settings-notifications" aria-labelledby="settings-reminder-heading"><header><h2 id="settings-reminder-heading">${icon("bell")}通知提醒</h2></header>
        ${toggle("reminder", "每日学习提醒", "给每天的学习留一点时间")}
        <div class="settings-reminder-time"><label for="setting-reminderTime">${icon("time")}提醒时间</label><input id="setting-reminderTime" type="time" data-pref="reminderTime" aria-label="提醒时间" aria-describedby="settings-time-error" required></div><p id="settings-time-error" class="settings-form-error" hidden></p>
        ${toggle("notifications", "消息通知", "接收本页的学习进展与会员消息")}
        <p class="settings-reminder-help">${icon("info")}学习提醒在页面打开时显示。</p>
      </section>
      <div class="settings-footer-status"><span id="settings-status" role="status" aria-live="polite"></span>${button("defaults", "恢复默认设置", "settings-text-button")}</div>
    </div></div>
    <div class="settings-demo-tools"><span>当前为 Web 交互预览，资料与设置保存在此浏览器。</span>${button("reset", "重置演示数据", "settings-text-button")}</div>`;
    bindDraft();
  }
  function dirty() {
    return storageFailed || JSON.stringify(draft) !== JSON.stringify(prefs());
  }
  function bindDraft() {
    root.querySelectorAll("[data-pref]").forEach((el) => {
      const value = draft[el.dataset.pref];
      if (el.type === "checkbox") el.checked = value;
      else if (el.type === "radio") el.checked = el.value === value;
      else el.value = value;
    });
    $("#setting-reminderTime").disabled = !draft.reminder;
    $("#setting-reminderTime").removeAttribute("aria-invalid");
    $("#settings-time-error").hidden = true;
    $("#settings-course-note").hidden = draft.defaultCourse === courseNames[0];
    $("#settings-system-motion").hidden = !motionMedia.matches;
    updateStatus();
  }
  function updateStatus(message) {
    const status = $("#settings-status");
    if (!status) return;
    status.classList.toggle("is-unsaved", dirty());
    status.classList.toggle("is-error", storageFailed);
    status.innerHTML =
      icon(storageFailed ? "info" : dirty() ? "pen" : "check") +
      "<span>" +
      safe(
        message ||
          (storageFailed
            ? "已应用，但浏览器未能保存"
            : dirty()
              ? "有未保存的修改"
              : "修改完成后，点击保存设置。"),
      ) +
      "</span>";
    $("#settings-save").classList.toggle("has-changes", dirty());
  }
  function save() {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.reminderTime)) {
      $("#setting-reminderTime").setAttribute("aria-invalid", "true");
      $("#settings-time-error").hidden = false;
      $("#settings-time-error").textContent = "请输入有效的提醒时间";
      $("#setting-reminderTime").focus();
      updateStatus("请输入有效的提醒时间");
      return;
    }
    const d = data(),
      old = prefs(),
      first = !d.savedAt;
    d.prefs = Object.fromEntries(
      Object.keys(defaults()).map((k) => [k, draft[k]]),
    );
    flow.state().plan.reminder = draft.reminder;
    flow.state().plan.reminderTime = draft.reminderTime;
    if (first || old.questionCount !== draft.questionCount) {
      practiceConfig.count = draft.questionCount;
      if (flow.state().collection?.practice)
        flow.state().collection.practice.count = draft.questionCount;
    }
    if (!draft.rememberPosition || old.defaultCourse !== draft.defaultCourse)
      d.lastLearning = null;
    d.savedAt = Date.now();
    storageFailed = !saveStorage();
    baseline = clone(prefs());
    draft = clone(baseline);
    applyDisplay(draft);
    paintNotifications();
    renderSelectedChapter();
    document.dispatchEvent(
      new CustomEvent("demo:settings-saved", {
        detail: { old, current: prefs() },
      }),
    );
    updateStatus(
      storageFailed ? "已应用，但浏览器未能保存" : "设置已保存，刷新后仍会保留",
    );
    toast(storageFailed ? "设置已应用，本次未能保存到浏览器" : "设置已保存");
    $("#settings-save").focus({ preventScroll: true });
  }
  function enter() {
    const current = prefs();
    if (!draft) draft = clone(current);
    else
      for (const key of Object.keys(current))
        if (draft[key] === baseline?.[key]) draft[key] = current[key];
    baseline = clone(current);
    mount();
    applyDisplay(draft);
  }
  function enterSpace() {
    const p = prefs();
    const last = p.rememberPosition ? data().lastLearning : null;
    if (
      last &&
      ["practice", "ai", "chapters"].includes(last.route) &&
      (last.route !== "practice" ||
        (flow.activeSession() && !flow.activeSession().finished))
    ) {
      showPage(last.route);
      return;
    }
    if (window.AceCertificates) {
      window.AceCertificates.enterDefault(p.defaultCourse);
      return;
    }
    if (p.defaultCourse === courseNames[1]) {
      if (flow.state().aiStudyDemo)
        flow.state().aiStudyDemo.course = "network-engineer";
      showPage("ai");
    } else showPage("home");
  }
  function editProfile() {
    const p = data().profile;
    showDialog(
      "编辑个人资料",
      '<form id="settings-profile-form" class="settings-form" novalidate><label for="settings-nickname">昵称<input id="settings-nickname" name="nickname" value="' +
        safe(p.nickname) +
        '" maxlength="16" autocomplete="off" aria-describedby="settings-profile-error"></label><label for="settings-bio">学习签名<input id="settings-bio" name="bio" value="' +
        safe(p.bio) +
        '" maxlength="60" autocomplete="off"></label><fieldset><legend>头像配色</legend><div class="settings-avatar-colors">' +
        ["blue", "purple", "green"]
          .map(
            (color, i) =>
              '<label><input type="radio" name="avatarColor" value="' +
              color +
              '" ' +
              (p.color === color ? "checked" : "") +
              '><span class="' +
              color +
              '">' +
              ["蓝色", "紫色", "绿色"][i] +
              "</span></label>",
          )
          .join("") +
        '</div></fieldset><p id="settings-profile-error" class="settings-form-error" role="alert" hidden></p><p class="settings-form-help">资料仅保存在当前浏览器，未关联正式账号。</p><div class="study-form-actions"><button type="button" class="study-outline" data-action="close">取消</button><button type="submit" class="primary-button">保存资料' +
        icon("check") +
        "</button></div></form>",
      "个人资料",
    );
    $("#settings-nickname").focus();
  }
  function changePassword() {
    showDialog(
      "修改登录密码",
      '<form id="settings-password-form" class="settings-form" novalidate>' +
        [
          ["current", "当前密码", "current-password"],
          ["new", "新密码", "new-password"],
          ["confirm", "确认新密码", "new-password"],
        ]
          .map(
            ([key, label, complete]) =>
              '<label for="settings-password-' +
              key +
              '">' +
              label +
              '<input id="settings-password-' +
              key +
              '" name="' +
              key +
              '" type="password" maxlength="64" autocomplete="' +
              complete +
              '" aria-describedby="settings-password-error-' +
              key +
              '"><span id="settings-password-error-' +
              key +
              '" class="settings-form-error" hidden></span></label>',
          )
          .join("") +
        '<p class="settings-form-help">此处演示表单校验；不会修改正式账号密码，也不发送或保存输入内容。</p><div class="study-form-actions"><button type="button" class="study-outline" data-action="close">取消</button><button type="submit" class="primary-button">确认修改' +
        icon("check") +
        "</button></div></form>",
      "账号安全 · 表单预览",
    );
  }
  function devices() {
    let access = null;
    try {
      access = JSON.parse(
        localStorage.getItem("aceexam.home-blue.access.v1") ||
          sessionStorage.getItem("aceexam.home-blue.access.v1") ||
          "null",
      );
    } catch {}
    showDialog(
      "当前登录设备",
      '<div class="settings-device">' +
        localIcon("device") +
        "<div><h3>当前浏览器</h3><p>Web 本地体验" +
        (access?.enteredAt
          ? " · 进入于 " + new Date(access.enteredAt).toLocaleString("zh-CN")
          : "") +
        '</p><span>当前使用</span></div></div><p class="dialog-lead">此预览没有服务器登录设备记录，只展示当前浏览器的体验状态。</p><div class="study-form-actions">' +
        button("logout", "退出当前体验", "settings-button settings-danger") +
        '<button class="study-outline" data-action="close">返回设置</button></div>',
      "账号安全",
    );
  }
  function info(kind) {
    const content = {
      terms: [
        "用户协议",
        "当前提供 Web 界面体验，表单不连接正式账号服务。学习、会员和设置使用本地演示数据。",
        "正式服务的使用规则以正式发布的协议为准。",
      ],
      privacy: [
        "隐私政策",
        "学习进度、设置和主动填写的昵称、签名保存在当前浏览器。密码表单内容不发送、不保存；AI 老师聊天也不写入存储。",
        "可恢复默认偏好，或重置演示数据清除本地体验记录。",
      ],
      about: [
        "关于考匠",
        "考匠 AceExam，把章节练习、错题复习、模拟考试、AI 精讲与学习计划放在一个学习空间。",
        "当前为蓝白 Web Demo，可直接体验页面和交互。",
      ],
    }[kind];
    showDialog(
      content[0],
      content
        .slice(1)
        .map((p) => '<p class="dialog-lead">' + safe(p) + "</p>")
        .join("") +
        '<button class="study-outline" data-action="close">返回设置</button>',
      "Web Demo",
    );
  }
  function logout() {
    cancelAuto();
    try {
      localStorage.removeItem("aceexam.home-blue.access.v1");
      sessionStorage.removeItem("aceexam.home-blue.access.v1");
    } catch {}
    if (dialog.open) closeDialog();
    showPage("login");
    toast("已退出当前体验，学习记录仍保留在此浏览器");
  }
  function confirmReset() {
    showDialog(
      "重置本地演示数据？",
      '<p class="dialog-lead">会恢复初始示例，并清除当前浏览器里的练习记录、学习计划、收藏、AI 作答、会员兑换、个人资料和设置。</p><div class="study-form-actions"><button class="study-outline" data-action="close">保留数据</button><button class="primary-button" data-action="reset">确认重置' +
        icon("check") +
        "</button></div>",
      "本地体验数据",
    );
  }
  function notices() {
    return data().notices;
  }
  const noticeButton = document.createElement("button");
  noticeButton.type = "button";
  noticeButton.className = "settings-notice-button";
  noticeButton.dataset.settingsAction = "notices";
  noticeButton.setAttribute("aria-label", "消息通知");
  noticeButton.innerHTML =
    icon("bell") + '<span class="settings-notice-badge" hidden></span>';
  $(".topbar").insertBefore(noticeButton, $(".profile-button"));
  function paintNotifications() {
    const count = prefs().notifications
      ? notices().filter((n) => !n.read).length
      : 0;
    const badge = $(".settings-notice-badge", noticeButton);
    badge.hidden = !count;
    badge.textContent = count > 9 ? "9+" : count;
    noticeButton.setAttribute(
      "aria-label",
      "消息通知" + (count ? "，" + count + " 条未读" : ""),
    );
  }
  function notify(title, message, key) {
    if (!prefs().notifications) return;
    const list = notices();
    if (key && list.some((n) => n.key === key)) return;
    list.unshift({
      title: String(title).slice(0, 60),
      message: String(message).slice(0, 120),
      key: key || null,
      time: Date.now(),
      read: false,
    });
    data().notices = list.slice(0, 30);
    saveStorage();
    paintNotifications();
  }
  function showNotices() {
    const list = notices();
    showDialog(
      "消息通知",
      (!prefs().notifications
        ? '<p class="settings-notice-disabled">' +
          icon("bell") +
          "消息通知已关闭，可前往设置重新开启。</p>"
        : "") +
        (list.length
          ? list
              .map(
                (n) =>
                  '<article class="settings-notice-item"><h3>' +
                  safe(n.title) +
                  "</h3><p>" +
                  safe(n.message) +
                  "</p><small>" +
                  new Date(n.time).toLocaleString("zh-CN") +
                  "</small></article>",
              )
              .join("")
          : '<p class="dialog-lead">还没有消息，继续按自己的节奏学习。</p>') +
        '<div class="study-form-actions">' +
        button("notices-clear", "清空消息", "settings-text-button") +
        '<button class="study-outline" data-action="settings">通知设置</button></div>',
      "学习空间",
    );
    list.forEach((n) => (n.read = true));
    saveStorage();
    paintNotifications();
  }
  function cancelAuto() {
    if (!auto) return;
    clearTimeout(auto.timer);
    auto.row.remove();
    auto = null;
  }
  function queueNext(container, advance, valid) {
    cancelAuto();
    if (!prefs().autoNext || !container) return;
    const row = document.createElement("div");
    row.className = "demo-auto-next";
    row.setAttribute("role", "status");
    row.innerHTML =
      "<span>3 秒后进入下一题</span>" +
      button("cancel-auto", "留在这题", "settings-text-button");
    container.append(row);
    const timer = setTimeout(() => {
      const current = auto,
        connected = row.isConnected;
      auto = null;
      row.remove();
      if (
        current &&
        connected &&
        !document.hidden &&
        row.ownerDocument.contains(container) &&
        valid()
      )
        advance();
    }, 3000);
    auto = { timer, row };
  }
  document.addEventListener(
    "click",
    (event) => {
      if (auto && event.target.closest("button,input,select,a")) cancelAuto();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (auto && !["Shift", "Control", "Meta", "Alt"].includes(event.key))
        cancelAuto();
    },
    true,
  );
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAuto();
  });
  root.addEventListener("change", (event) => {
    const el = event.target.closest("[data-pref]");
    if (!el) return;
    draft[el.dataset.pref] = el.type === "checkbox" ? el.checked : el.value;
    storageFailed = false;
    bindDraft();
    applyDisplay(draft);
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-settings-action]");
    if (!target || target.disabled) return;
    switch (target.dataset.settingsAction) {
      case "save":
        save();
        break;
      case "profile":
        editProfile();
        break;
      case "password":
        changePassword();
        break;
      case "devices":
        devices();
        break;
      case "membership":
        actions.vip();
        break;
      case "logout":
        logout();
        break;
      case "terms":
      case "privacy":
      case "about":
        info(target.dataset.settingsAction);
        break;
      case "reset":
        confirmReset();
        break;
      case "defaults":
        draft = { ...defaults(), reminder: true, reminderTime: "20:00" };
        storageFailed = false;
        bindDraft();
        applyDisplay(draft);
        updateStatus("默认偏好已预览，点击保存后生效");
        break;
      case "notices":
        showNotices();
        break;
      case "notices-clear":
        data().notices = [];
        saveStorage();
        paintNotifications();
        showNotices();
        break;
      case "cancel-auto":
        cancelAuto();
        break;
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (form.id === "settings-profile-form") {
      event.preventDefault();
      const fields = new FormData(form),
        name = String(fields.get("nickname") || "").trim();
      const error = $("#settings-profile-error");
      if (name.length < 2 || name.length > 16) {
        error.hidden = false;
        error.textContent = "昵称需要 2 到 16 个字符";
        $("#settings-nickname").setAttribute("aria-invalid", "true");
        $("#settings-nickname").focus();
        return;
      }
      data().profile = {
        nickname: name,
        bio: String(fields.get("bio") || "")
          .trim()
          .slice(0, 60),
        color: String(fields.get("avatarColor") || "blue"),
      };
      const saved = saveStorage();
      paintProfile();
      closeDialog();
      if (document.body.dataset.page === "settings") mount();
      toast(
        saved ? "个人资料已保存在此浏览器" : "资料已应用，本次未能保存到浏览器",
      );
    }
    if (form.id === "settings-password-form") {
      event.preventDefault();
      let invalid = null;
      const old = $("#settings-password-current"),
        next = $("#settings-password-new"),
        confirm = $("#settings-password-confirm");
      const errors = {
        current: old.value.length < 6 ? "请填写至少 6 个字符的当前密码" : "",
        new:
          next.value.length < 6
            ? "新密码至少需要 6 个字符"
            : next.value === old.value
              ? "新密码需要与当前密码不同"
              : "",
        confirm: confirm.value !== next.value ? "两次输入的新密码不一致" : "",
      };
      for (const [key, message] of Object.entries(errors)) {
        const field = $("#settings-password-" + key),
          error = $("#settings-password-error-" + key);
        error.textContent = message;
        error.hidden = !message;
        field.setAttribute("aria-invalid", String(!!message));
        if (message) invalid ||= field;
      }
      if (invalid) {
        invalid.focus();
        return;
      }
      [old, next, confirm].forEach((el) => (el.value = ""));
      closeDialog();
      toast("密码表单校验通过；此预览未修改正式账号密码");
    }
  });
  dialog.addEventListener("close", () => {
    dialog
      .querySelectorAll("#settings-password-form input")
      .forEach((el) => (el.value = ""));
  });
  function rememberRoute(name) {
    if (
      prefs().rememberPosition &&
      ["ai", "chapters", "practice"].includes(name)
    ) {
      data().lastLearning = {
        route: name,
        courseId: window.AceCertificates?.active().id || null,
        time: Date.now(),
      };
      saveStorage();
    }
  }
  document.addEventListener("demo:route", (event) => {
    cancelAuto();
    if (event.detail.name === "settings") enter();
    else {
      applyDisplay(prefs());
      if (!startup) rememberRoute(event.detail.name);
    }
    paintProfile();
    paintNotifications();
  });
  [themeMedia, motionMedia].forEach((media) =>
    media.addEventListener("change", () => {
      applyDisplay(
        document.body.dataset.page === "settings" && draft ? draft : prefs(),
      );
      if (document.body.dataset.page === "settings")
        $("#settings-system-motion").hidden = !motionMedia.matches;
    }),
  );
  const previousProfile = actions.profile;
  actions.profile = () => {
    previousProfile();
    const name = $("#dialog-content .lesson-note h3");
    if (name) name.textContent = data().profile.nickname;
    $("#dialog-content").insertAdjacentHTML(
      "beforeend",
      '<div class="study-form-actions"><button class="study-outline" data-action="settings">' +
        icon("settings") +
        "个人资料与设置</button></div>",
    );
  };
  const previousReset = actions.reset;
  actions.reset = () => {
    cancelAuto();
    previousReset();
    draft = null;
    baseline = null;
    storageFailed = false;
    data().seeded = true;
    applyDisplay(prefs());
    paintProfile();
    paintNotifications();
    saveStorage();
  };
  actions.settings = () => showPage("settings");
  searchItems.push({
    title: "设置 · 主题、字号与学习偏好",
    action: "settings",
  });
  window.AceDemoSettings = {
    prefs,
    queueNext,
    cancelAuto,
    notify,
    enterSpace,
    rememberPosition: () => prefs().rememberPosition,
  };
  const p = prefs();
  if (!p.rememberPosition) {
    const session = flow.activeSession();
    if (session && session.mode !== "exam" && !session.finished)
      session.index = 0;
    const ai = flow.state().aiStudyDemo;
    if (ai) {
      ai.last = {};
      Object.values(ai.progress).forEach((progress) => {
        progress.index = 0;
        progress.tab = "lesson";
      });
    }
    activeChapter = 2;
    selectChapter(activeChapter);
    saveStorage();
  }
  applyDisplay(p);
  paintProfile();
  if (!data().seeded) {
    data().seeded = true;
    notify(
      "把学习空间调成喜欢的样子",
      "在设置中选择练习节奏、主题与字号，保存后下次继续。",
      "welcome",
    );
  }
  paintNotifications();
  if (document.body.dataset.page === "settings") enter();
  else if (!location.hash) enterSpace();
  else if (document.body.dataset.page === "practice") flow.renderPractice();
  startup = false;
  rememberRoute(document.body.dataset.page);
})();
