import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../server/store.js";
import { createApp } from "../server/index.js";

const tinyPng =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

test("community supports one public room, custom names, text, emoji and images", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "netwise-community-"));
  const store = createStore(dir);
  const app = await createApp({ store, withFrontend: false, authRequired: true });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    app.locals.stop();
    await new Promise((resolve) => server.close(resolve));
    store.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const register = async (username) => {
    const response = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "mobile" },
      body: JSON.stringify({ username, password: "safe-password" }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).sessionToken;
  };
  const request = async (token, route, body, method = body ? "POST" : "GET") => {
    const response = await fetch(`${base}/api${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Client": "mobile",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };

  const firstToken = await register("community_alpha");
  const secondToken = await register("community_beta");
  const renamed = await request(
    firstToken,
    "/community/profile",
    { name: "夜航小组长" },
    "PUT",
  );
  assert.equal(renamed.status, 200);
  assert.equal(renamed.data.profile.name, "夜航小组长");
  assert.equal(renamed.data.user.communityName, "夜航小组长");

  const textMessage = await request(firstToken, "/community/messages", {
    text: "今天也要稳稳刷题 💪",
  });
  assert.equal(textMessage.status, 200);
  assert.equal(textMessage.data.message.authorName, "夜航小组长");

  const imageMessage = await request(firstToken, "/community/messages", {
    text: "给大家分享一张图",
    image: { data: tinyPng, mimeType: "image/png" },
  });
  assert.equal(imageMessage.status, 200);
  assert.match(imageMessage.data.message.imageUrl, /^\/community\/uploads\//);
  assert.ok(imageMessage.data.room.storageUsedBytes > 0);

  const messages = await request(secondToken, "/community/messages");
  assert.equal(messages.status, 200);
  assert.equal(messages.data.room.id, "global");
  assert.equal(messages.data.messages.length, 2);
  assert.equal(messages.data.messages[0].authorName, "夜航小组长");
  assert.equal(messages.data.messages[0].text, "今天也要稳稳刷题 💪");

  const imageResponse = await fetch(
    `${base}${imageMessage.data.message.imageUrl}`,
  );
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/png");
});
