import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
const dir = path.resolve("public/demo/home-blue");
const sheets = [
  "style",
  "chapters",
  "study-flow",
  "exam-favorites",
  "vip-wrong",
  "login",
  "ai-study",
];
const excluded =
  /(?:\.art(?:\b|-)|office-|app-badge|app-file|vip-crown|landing-(?:study-art|web-art|art-|tag-))/;
function hsv(hex) {
  let s = hex.slice(1);
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  if (s.length === 8) s = s.slice(0, 6);
  const rgb = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
  const max = Math.max(...rgb),
    min = Math.min(...rgb),
    d = max - min;
  let h = 0;
  if (d) {
    const i = rgb.indexOf(max);
    h =
      (i === 0
        ? (rgb[1] - rgb[2]) / d
        : i === 1
          ? (rgb[2] - rgb[0]) / d + 2
          : (rgb[0] - rgb[1]) / d + 4) * 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max, l: (max + min) / 2 };
}
function tint(h, purpose) {
  const type =
    h >= 65 && h < 180
      ? "green"
      : h >= 180 && h < 260
        ? "blue"
        : h >= 260 && h < 330
          ? "purple"
          : h < 20 || h >= 330
            ? "red"
            : "gold";
  const text = {
    green: "#6bddbc",
    blue: "#a7bdff",
    purple: "#d3b5ff",
    red: "#ffa894",
    gold: "#f4ca80",
  };
  const surface = {
    green: "#19362f",
    blue: "#223451",
    purple: "#302443",
    red: "#392722",
    gold: "#352c20",
  };
  return (purpose === "color" ? text : surface)[type];
}
function mapHex(hex, purpose) {
  const c = hsv(hex);
  if (purpose === "color") {
    if (c.l > 0.94 && c.s < 0.12) return "#f7faff";
    if (c.v < 0.32) return "#edf3ff";
    if (c.s < 0.18) return "#aebedb";
    return tint(c.h, "color");
  }
  if (purpose === "border")
    return c.s > 0.3 && c.l < 0.76 ? "#617cb8" : "#34435e";
  if (c.l > 0.965 && c.s < 0.06) return "#172237";
  if (c.l > 0.76) return c.s < 0.035 ? "#202d43" : tint(c.h, "surface");
  if (c.l > 0.6 && c.s < 0.25) return "#34445f";
  return hex;
}
function transform(value, purpose) {
  if (purpose === "background")
    value = value
      .replace(/var\(--(?:blue|landing-blue)(?:-dark)?\)/g, "#355af6")
      .replace(/var\(--vip-(?:accent|strong)\)/g, "var(--vip-solid)");
  return value
    .replace(/#[\da-f]{8}\b|#[\da-f]{6}\b|#[\da-f]{3}\b/gi, (m) =>
      mapHex(m, purpose),
    )
    .replace(/\bwhite\b/g, purpose === "color" ? "#f7faff" : "#172237")
    .replace(/\bblack\b/g, purpose === "color" ? "#edf3ff" : "#080e19")
    .replace(
      /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*([.\d]+)\s*\)/g,
      (_, a) => "rgba(23,34,55," + a + ")",
    );
}
const dark = postcss.root();
for (const name of sheets) {
  const filename = path.join(dir, name + ".css");
  const css = postcss.parse(fs.readFileSync(filename, "utf8"));
  let scaled = false;
  css.walkDecls("font-size", (decl) => {
    if (excluded.test(decl.parent.selector || "")) return;
    if (/^\d+(?:\.\d+)?px$/.test(decl.value)) {
      decl.value = "calc(" + decl.value + " * var(--demo-font-factor, 1))";
      scaled = true;
    }
  });
  if (scaled) fs.writeFileSync(filename, css.toString(), "utf8");
  css.walkRules((rule) => {
    if (excluded.test(rule.selector) || rule.selector.includes(":root")) return;
    let ancestor = rule.parent;
    while (ancestor.type !== "root") {
      if (ancestor.type === "atrule" && ancestor.name.includes("keyframes"))
        return;
      ancestor = ancestor.parent;
    }
    const next = postcss.rule({
      selector: rule.selectors
        .map((s) => ':root[data-theme="dark"] ' + s)
        .join(",\n"),
    });
    rule.nodes.forEach((decl) => {
      if (decl.type !== "decl") return;
      const tokenPurpose = decl.prop.startsWith("--")
        ? /(?:-bg|-surface|-soft|-track|-label|-icon-start|-icon-end)$/.test(
            decl.prop,
          )
          ? "background"
          : /(?:-border|-line)$/.test(decl.prop)
            ? "border"
            : /(?:-ink|-muted|-accent|-strong|-error|-blue|-blue-dark|-green|-amber)$/.test(
                  decl.prop,
                )
              ? "color"
              : null
        : null;
      const purpose =
        tokenPurpose ||
        (decl.prop === "color"
          ? "color"
          : /^background(?:-color)?$/.test(decl.prop)
            ? "background"
            : /^border(?:-(?:top|bottom|left|right))?(?:-color)?$/.test(
                  decl.prop,
                )
              ? "border"
              : null);
      if (!purpose) return;
      const value = transform(
        decl.value,
        purpose === "border" && /:checked.*:after/.test(rule.selector)
          ? "color"
          : purpose,
      );
      if (value !== decl.value)
        next.append({ prop: decl.prop, value, important: decl.important });
    });
    if (!next.nodes.length) return;
    const parents = [];
    let parent = rule.parent;
    while (parent.type !== "root") {
      if (parent.type === "atrule") parents.push(parent);
      parent = parent.parent;
    }
    let result = next;
    for (const item of parents) {
      const wrapper = postcss.atRule({ name: item.name, params: item.params });
      wrapper.append(result);
      result = wrapper;
    }
    dark.append(result);
  });
}
const base = `/* Shared appearance for every Web demo route. Rebuild with scripts/build-home-blue-appearance.mjs. */
:root { --demo-font-factor: 1; }
:root[data-font="larger"] { --demo-font-factor: 1.12; }
:root[data-font="large"] { --demo-font-factor: 1.24; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"] {
  color-scheme: dark;
  --ink: #edf3ff; --muted: #a9bad9; --line: #34435e; --page: #10192b;
  --blue: #a7bdff; --blue-dark: #b8caff;
  --study-green: #6bddbc; --study-red: #ffa894; --study-soft-blue: #223451;
}
:root[data-theme="dark"] [data-vip-tier] { --vip-solid: #235ce9; }
:root[data-theme="dark"] [data-vip-tier="plus"] { --vip-solid: #7b35e7; }
:root[data-theme="dark"] [data-vip-tier="pro"] { --vip-solid: #ac610b; }
:root[data-theme="dark"] #ai-page { --ai-line: #34435e; --ai-muted: #a9bad9; --ai-soft: #223451; --ai-green: #6bddbc; --ai-amber: #f4ca80; }
:root[data-theme="dark"] :is(.primary-button,.ai-primary,.landing-button,.start-configured) { background: #355af6; border-color: #355af6; color: #fff; }
:root[data-theme="dark"] :is(.primary-button,.ai-primary,.landing-button):hover { background: #2447d9; color: #fff; }
:root[data-theme="dark"] :is(.round-arrow,.icon-button) { background: #24334e; color: #bfd0ff; }
:root[data-theme="dark"] :is(.brand strong, .settings-profile-name) { color: #edf3ff; }
:root[data-theme="dark"] :is(.search-wrap input, .library-search input, .catalogue-search input, .ai-search input) { color: #edf3ff; }
:root[data-theme="dark"] :is(.ai-green,.green) { color: #6bddbc !important; }
:root[data-theme="dark"] .ai-amber { color: #f4ca80 !important; }
:root[data-theme="dark"] dialog::backdrop { background: rgba(4,8,18,.72); }
:root[data-theme="dark"] #toast { background: #edf3ff; color: #172237; }
body[data-reduced-motion="true"] *,body[data-reduced-motion="true"] *::before,body[data-reduced-motion="true"] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
.study-analysis-collapsed { border: 1px dashed #c8d9fc; border-radius: 9px; padding: 12px 15px; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:calc(13px * var(--demo-font-factor,1)); margin-bottom:12px; }
.demo-auto-next { display:flex; gap:10px; align-items:center; justify-content:space-between; padding:9px 12px; border-radius:8px; background:#edf4ff; color:#3b60a8; font-size:calc(12px * var(--demo-font-factor,1)); margin-top:12px; }
.demo-auto-next button { color:inherit; text-decoration:underline; text-underline-offset:3px; }
:root[data-theme="dark"] .demo-auto-next { background:#223451; color:#bfd0ff; }
#favorite-count-options { display:flex; flex-wrap:wrap; gap:6px; }
#favorite-count-options button { flex:1; min-width:46px; }
:root[data-theme="dark"] :is(.answer-jump.current,.ai-question-number.is-active) { background:#355af6; color:#fff; }
:root[data-theme="dark"] :is(.nav-item.active,.chapter-filters button[aria-selected="true"]) { color:#bfd0ff; }
@media (max-width:600px) { .study-analysis-collapsed { align-items:flex-start; flex-wrap:wrap; } }
`;
fs.writeFileSync(
  path.join(dir, "appearance.css"),
  base + "\n" + dark.toString(),
  "utf8",
);
console.log("Built shared light/dark themes and text scaling.");
