import { z } from "zod";
import { studyError } from "./study-content.js";
import { reminderClock } from "./web-preference-values.js";

const checkSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().nonnegative(),
  })
  .strict();

// One daily opportunity per account, across certificates, browsers and devices.
// This records a served reminder, not proof that the learner read it.
export function registerStudyReminders({
  route,
  store,
  requestUserId,
  preferences,
  now = Date.now,
}) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS user_study_reminders (
    user_id TEXT PRIMARY KEY, local_date TEXT NOT NULL,
    request_id TEXT NOT NULL, created_at TEXT NOT NULL)`);
  const claim = db.prepare(`INSERT INTO user_study_reminders VALUES (?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET local_date=excluded.local_date,
    request_id=excluded.request_id, created_at=excluded.created_at
    WHERE user_study_reminders.local_date < excluded.local_date`);
  route("post", "/api/study-reminders/check", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) throw studyError("请先登录", 401);
    const body = checkSchema.parse(req.body),
      user = requestUserId(req);
    const current = preferences.read(user, req.user.certificateId);
    const output = { preferences: current, notice: null };
    if (body.version !== current.version || !current.values.reminderEnabled)
      return output;
    const timestamp = now(),
      clock = reminderClock(timestamp, current.values.reminderTimeZone);
    if (clock.time < current.values.reminderTime) return output;
    // A single SQL statement elects the winner; a lost response retries its UUID.
    const changed = claim.run(
      user,
      clock.date,
      body.requestId,
      new Date(timestamp).toISOString(),
    ).changes;
    const saved = db
      .prepare(
        "SELECT local_date, request_id FROM user_study_reminders WHERE user_id=?",
      )
      .get(user);
    if (
      changed ||
      (saved.local_date === clock.date && saved.request_id === body.requestId)
    ) {
      output.notice = {
        id: body.requestId,
        localDate: clock.date,
        time: current.values.reminderTime,
        timeZone: current.values.reminderTimeZone,
      };
    }
    return output;
  });
}
