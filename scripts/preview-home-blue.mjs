import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDemoTutorApp } from "../server/demo-tutor/app.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.ACEEXAM_DEMO_PORT || 4177);
const app = createDemoTutorApp({
  databasePath: path.join(root, "outputs/home-blue-demo/tutor-demo.sqlite"),
  publicPath: path.join(root, "public"),
});
const server = app.listen(port, "127.0.0.1", () => {
  console.log(`考匠 Web demo: http://127.0.0.1:${port}/demo/home-blue/#ai`);
  console.log("VLAN 互动课使用审核内容与独立演示记录，未连接收费 AI。 ");
});
server.on("error", (error) => {
  console.error(error.message);
  app.locals.closeTutor();
  process.exitCode = 1;
});
const close = () =>
  server.close(() => {
    app.locals.closeTutor();
    process.exit(0);
  });
process.on("SIGINT", close);
process.on("SIGTERM", close);
