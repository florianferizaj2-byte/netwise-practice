import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  exportTutorCurriculum,
  tutorCurriculumSchema,
} from "../scripts/export-tutor-curriculum.mjs";

test("the course index contains no answer keys and the reviewed engine loads without any public demo directory", async () => {
  const root = fileURLToPath(new URL("../", import.meta.url)),
    parent = path.resolve(root, "outputs");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "tutor-runtime-"));
  try {
    const source = JSON.parse(
      fs.readFileSync(
        new URL(
          "./fixtures/tutor-curriculum-source.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    assert.deepEqual(exportTutorCurriculum(source, true), {
      lessons: 147,
      answerKeysIncluded: false,
    });
    const index = tutorCurriculumSchema.parse(
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../server/demo-tutor/curriculum-index.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    );
    assert(!JSON.stringify(index).includes('"answer":'));
    assert(!JSON.stringify(index).includes('"questions":'));
    assert.throws(() =>
      tutorCurriculumSchema.parse({ ...index, code: "eval()" }),
    );
    const destination = path.join(directory, "server", "demo-tutor");
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(path.join(root, "server", "demo-tutor"), destination, {
      recursive: true,
    });
    assert(!fs.existsSync(path.join(directory, "public")));
    const module = await import(
      pathToFileURL(path.join(destination, "registry.js"))
    );
    assert.equal(module.catalogue().coverage.ready, 39);
    assert.equal(module.allBundles().length, 40);
    assert.equal(
      module.getBundle("vlan-broadcast-domain").course.title,
      "VLAN 广播域",
    );
  } finally {
    assert.equal(path.dirname(directory), parent);
    assert(path.basename(directory).startsWith("tutor-runtime-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
