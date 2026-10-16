import fs from "node:fs";
import vm from "node:vm";

// Compile only the repository-authored drawing definitions, never lesson/model content.
const root = new URL("../", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, root), "utf8");
const source = read("public/demo/home-blue/demo.js");
const additions = read("public/demo/home-blue/chapters.js");
const visuals = read("public/demo/home-blue/chapter-visuals.js");
const context = vm.createContext({ window: {} });
vm.runInContext(
  read("public/demo/home-blue/chapter-visual-catalog.js"),
  context,
);
vm.runInContext(source.slice(0, source.indexOf("art.hero =")), context);
vm.runInContext(
  additions.slice(0, additions.indexOf("chapters.push(")),
  context,
);
vm.runInContext(
  visuals.slice(
    visuals.indexOf("  const originals ="),
    visuals.indexOf("  const find ="),
  ) + "\nglobalThis.renderChapterKind = renderKind;",
  context,
);
const catalog = context.window.AceChapterVisualCatalog;
const kinds = new Set(
  catalog.certificates.flatMap((c) => c.chapters.map((ch) => ch.kind)),
);
const illustrations = Object.fromEntries(
  [...kinds].sort().map((kind) => {
    const html = context
      .renderChapterKind(kind)
      .replace(/illustration-\d+/g, "__ACE_ICON__");
    if (
      /<(?:script|iframe|object|embed|image|foreignObject)\b|\bon\w+\s*=|javascript:|\b(?:src|href)\s*=/i.test(
        html,
      )
    )
      throw new Error("Unsafe chapter drawing: " + kind);
    return [kind, html];
  }),
);
const output = JSON.stringify({ ...catalog, illustrations }, null, 2) + "\n";
const target = new URL("src/generated/chapter-art.json", root);
if (process.argv.includes("--check")) {
  if (read("src/generated/chapter-art.json") !== output)
    throw new Error(
      "Web chapter drawings differ from the approved demo; regenerate them.",
    );
} else {
  fs.mkdirSync(new URL("src/generated/", root), { recursive: true });
  fs.writeFileSync(target, output);
}
console.log(
  JSON.stringify({
    chapters: catalog.certificates.reduce((n, c) => n + c.chapters.length, 0),
    illustrations: kinds.size,
  }),
);
