import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { registerWebPreferences } from "../server/web-preferences.js";
import { registerStudyReminders } from "../server/study-reminders.js";
import {
  reminderClock,
  validReminderTime,
  validReminderTimeZone,
  validWebPreferences,
  webPreferenceDefaults,
} from "../server/web-preference-values.js";

function fixture(t) {
  const db = new DatabaseSync(":memory:"),
    routes = new Map();
  const route = (method, path, fn) => routes.set(`${method} ${path}`, fn);
  const options = { route, store: { db }, requestUserId: (req) => req.user.id };
  const preferences = registerWebPreferences(options);
  let timestamp = Date.parse("2026-10-17T11:59:00Z");
  registerStudyReminders({ ...options, preferences, now: () => timestamp });
  t.after(() => db.close());
  const user = { id: "one", certificateId: "network-engineer" };
  const call = (method, path, body, who = user) => {
    const headers = {},
      data = routes.get(`${method} /api/${path}`)(
        { user: who, body },
        {
          setHeader: (key, value) => {
            headers[key] = value;
          },
        },
      );
    assert.equal(headers["Cache-Control"], "no-store");
    return data;
  };
  const read = (who = user) => call("get", "web-preferences", undefined, who);
  const save = (values, who = user) =>
    call(
      "put",
      "web-preferences",
      {
        requestId: crypto.randomUUID(),
        version: read(who).version,
        certificateId: who.certificateId,
        values,
      },
      who,
    );
  const check = (
    requestId = crypto.randomUUID(),
    who = user,
    version = read(who).version,
  ) => call("post", "study-reminders/check", { requestId, version }, who);
  return {
    db,
    call,
    user,
    read,
    save,
    check,
    at: (time) => {
      timestamp = Date.parse(time);
    },
  };
}

test("reminder preferences accept only valid times and zones and preserve choices on legacy saves", (t) => {
  const f = fixture(t);
  assert.deepEqual(f.read().values, webPreferenceDefaults);
  for (const value of ["24:00", "20:60", "8:30", "<script>", "", null])
    assert(!validReminderTime(value));
  for (const value of ["UTC", "Asia/Shanghai", "America/New_York"])
    assert(validReminderTimeZone(value));
  for (const value of ["not/a-zone", "", 123])
    assert(!validReminderTimeZone(value));
  const chosen = {
    ...webPreferenceDefaults,
    reminderEnabled: true,
    reminderTime: "21:15",
    reminderTimeZone: "America/New_York",
  };
  assert(validWebPreferences(chosen));
  assert(!validWebPreferences({ ...chosen, reminderEnabled: "true" }));
  assert(!validWebPreferences({ ...chosen, reminderTimeZone: "unknown" }));
  assert.deepEqual(f.save(chosen).values, chosen);
  const legacy = {
    theme: "dark",
    textSize: "standard",
    reducedMotion: false,
    defaultCount: 20,
  };
  const saved = f.save(legacy);
  assert.deepEqual(saved.values, { ...chosen, ...legacy });
  assert.throws(() => f.save({ ...chosen, reminderTime: "25:00" }));
  assert.throws(() => f.save({ ...chosen, reminderTimeZone: "unknown" }));
  assert.throws(() => f.save({ ...chosen, reminderEnabled: 1 }));
  assert.equal(f.read().version, 2);
  assert.deepEqual(
    f.read({ id: "other", certificateId: "network-engineer" }).values,
    webPreferenceDefaults,
  );
  assert.equal(
    f.read({ ...f.user, certificateId: "ncre-l2-c-programming" }).values
      .reminderTime,
    "21:15",
  );
});

test("daily claims use saved zone and server time, elect one winner across tabs and certificates, and retry lost acknowledgements", (t) => {
  const f = fixture(t);
  assert.equal(f.check().notice, null, "disabled by default");
  f.save({ ...webPreferenceDefaults, reminderEnabled: true });
  assert.equal(f.check().notice, null, "19:59 in Shanghai");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM user_study_reminders").get().n,
    0,
  );
  f.at("2026-10-17T12:00:00Z");
  const id = crypto.randomUUID(),
    winner = f.check(id);
  assert.deepEqual(winner.notice, {
    id,
    localDate: "2026-10-17",
    time: "20:00",
    timeZone: "Asia/Shanghai",
  });
  assert.deepEqual(
    f.check(id),
    winner,
    "same operation restores the acknowledgement",
  );
  const row = f.db.prepare("SELECT * FROM user_study_reminders").get();
  for (let i = 0; i < 10; i++) assert.equal(f.check().notice, null);
  assert.equal(
    f.check(undefined, { ...f.user, certificateId: "ncre-l2-c-programming" })
      .notice,
    null,
  );
  assert.deepEqual(
    f.db.prepare("SELECT * FROM user_study_reminders").get(),
    row,
  );
  // Re-registering the module (a process restart) must keep the daily claim.
  registerStudyReminders({
    route: () => {},
    store: { db: f.db },
    requestUserId: (r) => r.user.id,
    preferences: { read: f.read },
  });
  assert.equal(f.check().notice, null);
  f.at("2026-10-18T12:00:00Z");
  assert.equal(f.check().notice.localDate, "2026-10-18");
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM user_study_reminders").get().n,
    1,
    "bounded to one row per account",
  );
});

test("stale configurations, disabled reminders, timezone rollback and hostile request fields cannot claim a day", (t) => {
  const f = fixture(t);
  f.save({
    ...webPreferenceDefaults,
    reminderEnabled: true,
    reminderTime: "00:00",
    reminderTimeZone: "UTC",
  });
  assert.equal(f.check(undefined, f.user, 0).notice, null);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM user_study_reminders").get().n,
    0,
  );
  assert.throws(() =>
    f.call("post", "study-reminders/check", {
      version: 1,
      requestId: crypto.randomUUID(),
      date: "2100-01-01",
    }),
  );
  assert.throws(() =>
    f.call("post", "study-reminders/check", {
      version: 1,
      requestId: "invalid",
    }),
  );
  assert.throws(
    () => f.check(undefined, null),
    (e) => e.status === 401,
  );
  assert(f.check().notice);
  f.save({ ...f.read().values, reminderEnabled: false });
  f.at("2026-10-18T12:00:00Z");
  assert.equal(f.check().notice, null);
  f.save({ ...f.read().values, reminderEnabled: true });
  assert(f.check().notice);
  f.at("2026-10-17T12:00:00Z");
  assert.equal(
    f.check().notice,
    null,
    "moving the timezone/date backwards cannot reset the daily claim",
  );
  const peer = { id: "two", certificateId: "network-engineer" };
  f.save(
    { ...webPreferenceDefaults, reminderEnabled: true, reminderTime: "00:00" },
    peer,
  );
  assert(f.check(undefined, peer).notice);
  assert.equal(
    f.db.prepare("SELECT COUNT(*) n FROM user_study_reminders").get().n,
    2,
  );
});

test("zone clock handles midnight, leap day and repeated daylight-saving times without creating a second day", () => {
  assert.deepEqual(
    reminderClock(Date.parse("2026-10-17T16:00:00Z"), "Asia/Shanghai"),
    { date: "2026-10-18", time: "00:00" },
  );
  assert.deepEqual(reminderClock(Date.parse("2028-02-29T20:00:00Z"), "UTC"), {
    date: "2028-02-29",
    time: "20:00",
  });
  for (const time of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
    assert.deepEqual(reminderClock(Date.parse(time), "America/New_York"), {
      date: "2026-11-01",
      time: "01:30",
    });
});
