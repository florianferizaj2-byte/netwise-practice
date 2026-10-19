import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const filename = new URL(
  "../server/demo-tutor/curriculum-index.json",
  import.meta.url,
);
export const tutorCurriculumSchema = z
  .object({
    schemaVersion: z.literal(1),
    course: z
      .object({
        id: z.literal("network-engineer"),
        title: z.string().min(2).max(90),
      })
      .strict(),
    lessons: z
      .array(
        z
          .object({
            id: z.string().regex(/^network-engineer:[a-zA-Z0-9:._-]+$/),
            name: z.string().min(2).max(90),
            chapter: z.string().min(2).max(90),
            section: z.string().min(2).max(90),
            version: z.string().min(1).max(80),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export function exportTutorCurriculum(snapshot, check = false) {
  const data = tutorCurriculumSchema.parse({
    schemaVersion: 1,
    course: { id: snapshot.course.id, title: snapshot.course.title },
    lessons: snapshot.lessons.map((n) => ({
      id: n.id,
      name: n.name,
      chapter: n.chapter,
      section: n.section,
      version: n.version,
    })),
  });
  if (new Set(data.lessons.map((n) => n.id)).size !== data.lessons.length)
    throw new Error("重复的课程索引编号");
  const text = JSON.stringify(data, null, 2) + "\n";
  if (check) {
    if (!fs.existsSync(filename) || fs.readFileSync(filename, "utf8").replace(/\r\n/g, "\n") !== text)
      throw new Error("服务端课程索引需要重新导出");
  } else fs.writeFileSync(filename, text);
  return { lessons: data.lessons.length, answerKeysIncluded: false };
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  const snapshot = JSON.parse(
    fs.readFileSync(
      new URL(
        "../public/demo/home-blue/ai-content-network-engineer.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  console.log(
    JSON.stringify(
      exportTutorCurriculum(snapshot, process.argv.includes("--check")),
    ),
  );
}
