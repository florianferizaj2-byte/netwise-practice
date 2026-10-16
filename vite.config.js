import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Demo source data includes its teaching answer keys. Keep the standalone local demo,
// but exclude it from all production/static-hosting artifacts.
function excludeLocalDemo() {
  const root = fileURLToPath(new URL("./", import.meta.url));
  let output;
  return {
    name: "exclude-local-demo",
    apply: "build",
    configResolved(config) {
      output = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const expected = path.resolve(root, "dist");
      const target = path.resolve(output, "demo");
      if (
        output !== expected ||
        path.dirname(target) !== expected ||
        path.basename(target) !== "demo"
      )
        throw new Error(
          "Demo cleanup must stay inside this project's dist/demo directory.",
        );
      fs.rmSync(target, { recursive: true, force: true });
    },
  };
}
export default defineConfig({
  plugins: [react(), excludeLocalDemo()],
  build: { outDir: "dist" },
});
