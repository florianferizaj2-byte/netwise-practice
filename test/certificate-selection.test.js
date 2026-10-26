import assert from "node:assert/strict";
import test from "node:test";
import { certificates } from "../server/certificates.js";
import {
  certificateChoices,
  filterCertificateChoices,
} from "../src/certificate-choices.js";
import { requestCertificateSwitch } from "../src/certificate-switch.js";

test("certificate choices preserve exactly the server catalogue without adding future certificates", () => {
  const choices = certificateChoices(certificates);
  assert.deepEqual(
    choices.map((c) => c.id),
    certificates.map((c) => c.id),
  );
  assert.equal(choices.length, certificates.length);
  assert(choices.every((c) => c.available));
  assert.deepEqual(certificateChoices([]), []);
  assert(!choices.some((c) => c.id === "software-designer"));
  assert.deepEqual(
    filterCertificateChoices(choices, { query: "ＥＸＣＥＬ" }).map((c) => c.id),
    ["ncre-ms-office"],
  );
  assert.deepEqual(
    filterCertificateChoices(choices, {
      query: "C语言",
      category: "certification",
    }).map((c) => c.id),
    ["ncre-l2-c-programming"],
  );
  assert.deepEqual(
    filterCertificateChoices(choices, {
      category: "upgrade",
      region: "sichuan",
    }).map((c) => c.id),
    ["sichuan-upgrading-computer"],
  );
  assert.equal(
    filterCertificateChoices(choices, { query: "<img src=x onerror=alert(1)>" })
      .length,
    0,
  );
  const future = certificateChoices([
    { id: "installed-later", name: "用户后续安装的证书" },
  ]);
  assert.equal(future.length, 1);
  assert.equal(future[0].category, "other");
  assert.equal(future[0].title, "用户后续安装的证书");
});

test("switch recovery confirms a committed target without repeating the mutation", async () => {
  const before = { id: "learner", certificateId: "old" },
    target = { ...before, certificateId: "new" };
  const calls = [];
  const api = async (...args) => {
    calls.push(args);
    if (args[0] === "/auth/certificate") throw new Error("response lost");
    return { authenticated: true, user: target };
  };
  assert.equal(await requestCertificateSwitch(api, "new", before), target);
  assert.deepEqual(
    calls.map((c) => c[0]),
    ["/auth/certificate", "/auth/me"],
  );
  assert.deepEqual(calls[0].slice(1), [{ certificateId: "new" }, "PUT"]);
  assert.deepEqual(calls[1][3], { cache: false });
  let reads = 0;
  const rejected = Object.assign(new Error("certificate unavailable"), {
    status: 400,
  });
  await assert.rejects(
    requestCertificateSwitch(
      async (url) => {
        if (url === "/auth/me") reads++;
        throw rejected;
      },
      "new",
      before,
    ),
    (e) => e === rejected,
  );
  assert.equal(
    reads,
    0,
    "a definite server rejection is not treated as a committed change",
  );
});

test("an unchanged certificate keeps the original failure; uncertain scope and expired login are explicit", async () => {
  const user = { id: "learner", certificateId: "old" },
    original = new Error("network failed");
  const service = (read) => async (url) => {
    if (url === "/auth/certificate") throw original;
    return read();
  };
  await assert.rejects(
    requestCertificateSwitch(
      service(() => ({ authenticated: true, user })),
      "new",
      user,
    ),
    (e) => e === original,
  );
  for (const read of [
    () => {
      throw new Error("read failed");
    },
    () => ({ authenticated: true, user: { ...user, id: "other" } }),
    () => ({
      authenticated: true,
      user: { ...user, certificateId: "elsewhere" },
    }),
  ])
    await assert.rejects(
      requestCertificateSwitch(service(read), "new", user),
      (e) => e.certificateStateUnknown === true,
    );
  await assert.rejects(
    requestCertificateSwitch(
      service(() => ({ authenticated: false })),
      "new",
      user,
    ),
    (e) => e.status === 401,
  );
});
