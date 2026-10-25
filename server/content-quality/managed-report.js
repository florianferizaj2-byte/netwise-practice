import fs from "node:fs";
import path from "node:path";

// Resolve existing ancestors (including Windows junctions) BEFORE validating.
// Return the canonical target so a lexical tmp/ prefix is never sufficient.
export function managedReportPath(root, value) {
  const realRoot = fs.realpathSync(root);
  let ancestor = path.resolve(root, value);
  const suffix = [];
  while (!fs.existsSync(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) throw new Error("report ancestor is unavailable");
    suffix.unshift(path.basename(ancestor));
    ancestor = parent;
  }
  const target = path.join(fs.realpathSync(ancestor), ...suffix);
  const relative = path.relative(realRoot, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." ||
    path.isAbsolute(relative) || !["tmp", "outputs"].includes(relative.split(path.sep)[0]))
    throw new Error("reports must resolve inside this repository's tmp/ or outputs/");
  return target;
}
