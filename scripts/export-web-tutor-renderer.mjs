import fs from "node:fs";
const root = new URL("../", import.meta.url);
const source = fs.readFileSync(
  new URL("public/demo/home-blue/tutor-renderer.js", root),
  "utf8",
).replaceAll("\r\n", "\n");
const sprite = fs.readFileSync(
  new URL("public/demo/home-blue/index.html", root),
  "utf8",
).replaceAll("\r\n", "\n");
const icons = Object.fromEntries(
  [
    ...sprite.matchAll(/<symbol id="i-([a-z-]+)"[^>]*>([\s\S]*?)<\/symbol>/g),
  ].map((m) => [m[1], m[2].trim()]),
);
let body = source.slice(
  source.indexOf("  let drawing ="),
  source.indexOf("  window.AceTutorRenderer ="),
);
if (!body || /\b(?:window|document|eval)\b/.test(body))
  throw new Error("Renderer needs explicit browser adapter review");
const header = `/* Generated from the fixed, allowlisted demo renderer; texts are escaped, no model HTML is accepted. */\nconst icons=${JSON.stringify(icons)};\nconst icon=name=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">'+(icons[name]||icons.book)+'</svg>';\nconst safe=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));\n`;
const output = header + body + "\nexport {render,validate,network};\n";
const target = new URL("src/generated/tutor-renderer.js", root);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8").replaceAll("\r\n", "\n") !== output)
    throw new Error("Formal renderer differs from its checked source");
} else {
  fs.mkdirSync(new URL("src/generated/", root), { recursive: true });
  fs.writeFileSync(target, output);
}
console.log("Checked teaching renderer exported");
