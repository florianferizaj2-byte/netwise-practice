import crypto from "node:crypto";
import { createApp } from "../server/index.js";
import { createStore } from "../server/store.js";
import { OpenAICompatibleProvider } from "../server/ai.js";
import { mockAI } from "./ai-fixture.js";
process.env.AI_MASTER_KEY = crypto.randomBytes(32).toString("base64");
const store = createStore("test-output/browser-fixture");
const app = await createApp({
  store,
  provider: new OpenAICompatibleProvider(store, { fetch: mockAI() }),
  production: true,
  authRequired: false,
});
app.listen(5174, "127.0.0.1", () =>
  console.log("Disposable mock-AI fixture: http://127.0.0.1:5174"),
);
