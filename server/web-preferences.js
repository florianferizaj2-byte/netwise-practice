import crypto from "node:crypto";
import { z } from "zod";
import {
  preferenceThemes,
  preferenceTextSizes,
  preferenceCounts,
  webPreferenceDefaults,
  validReminderTime,
  validReminderTimeZone,
} from "./web-preference-values.js";
import { studyError } from "./study-content.js";

const valuesSchema = z
  .object({
    theme: z.enum(preferenceThemes),
    textSize: z.enum(preferenceTextSizes),
    reducedMotion: z.boolean(),
    defaultCount: z.union(preferenceCounts.map((n) => z.literal(n))),
    showAnalysis: z.boolean().optional(),
    autoNext: z.boolean().optional(),
    reminderEnabled: z.boolean().optional(),
    reminderTime: z.string().refine(validReminderTime).optional(),
    reminderTimeZone: z
      .string()
      .max(100)
      .refine(validReminderTimeZone)
      .optional(),
  })
  .strict();
const writeSchema = z
  .object({
    requestId: z.uuid(),
    version: z.number().int().nonnegative(),
    certificateId: z.string().min(1).max(100),
    values: valuesSchema,
  })
  .strict();
export function registerWebPreferences({ route, store, requestUserId }) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS user_web_preferences (user_id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS web_preference_requests (user_id TEXT NOT NULL,request_id TEXT NOT NULL,input_hash TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(user_id,request_id));`);
  const context = (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!req.user) throw studyError("请先登录", 401);
    return { user: requestUserId(req), certificate: req.user.certificateId };
  };
  const read = (user) => {
    const row = db
      .prepare("SELECT * FROM user_web_preferences WHERE user_id=?")
      .get(user);
    return row
      ? { version: row.version, data: JSON.parse(row.data) }
      : { version: 0, data: { ...webPreferenceDefaults, counts: {} } };
  };
  const view = ({ version, data }, certificate) => ({
    version,
    certificateId: certificate,
    values: {
      theme: data.theme,
      textSize: data.textSize,
      reducedMotion: data.reducedMotion,
      defaultCount: data.counts?.[certificate] || 10,
      showAnalysis: data.showAnalysis ?? webPreferenceDefaults.showAnalysis,
      autoNext: data.autoNext ?? webPreferenceDefaults.autoNext,
      reminderEnabled:
        data.reminderEnabled ?? webPreferenceDefaults.reminderEnabled,
      reminderTime: data.reminderTime ?? webPreferenceDefaults.reminderTime,
      reminderTimeZone:
        data.reminderTimeZone ?? webPreferenceDefaults.reminderTimeZone,
    },
  });
  route("get", "/api/web-preferences", (req, res) => {
    const { user, certificate } = context(req, res);
    return view(read(user), certificate);
  });
  route("put", "/api/web-preferences", (req, res) => {
    const { user, certificate } = context(req, res),
      body = writeSchema.parse(req.body);
    if (body.certificateId !== certificate)
      throw studyError(
        "备考方向已改变，请刷新页面后重新保存。",
        409,
        "WEB_PREFERENCE_CONTEXT_CHANGED",
      );
    const signature = crypto
      .createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const saved = db
      .prepare(
        "SELECT input_hash FROM web_preference_requests WHERE user_id=? AND request_id=?",
      )
      .get(user, body.requestId);
    if (saved) {
      if (saved.input_hash !== signature)
        throw studyError(
          "这次保存内容已改变，请重新读取设置。",
          409,
          "WEB_PREFERENCE_REQUEST_CONFLICT",
        );
      return view(read(user), certificate);
    }
    const current = read(user);
    const recent = db
      .prepare(
        "SELECT COUNT(*) n FROM web_preference_requests WHERE user_id=? AND created_at>=?",
      )
      .get(user, new Date(Date.now() - 60000).toISOString()).n;
    if (recent >= 60)
      throw studyError(
        "保存较频繁，请稍后再试。",
        429,
        "WEB_PREFERENCE_RATE_LIMIT",
      );
    if (body.version !== current.version)
      throw studyError(
        "设置已在其他窗口更新，请重新读取后再修改。",
        409,
        "WEB_PREFERENCE_CONFLICT",
      );
    const now = new Date().toISOString(),
      data = {
        theme: body.values.theme,
        textSize: body.values.textSize,
        reducedMotion: body.values.reducedMotion,
        showAnalysis:
          body.values.showAnalysis ??
          current.data.showAnalysis ??
          webPreferenceDefaults.showAnalysis,
        autoNext:
          body.values.autoNext ??
          current.data.autoNext ??
          webPreferenceDefaults.autoNext,
        reminderEnabled:
          body.values.reminderEnabled ??
          current.data.reminderEnabled ??
          webPreferenceDefaults.reminderEnabled,
        reminderTime:
          body.values.reminderTime ??
          current.data.reminderTime ??
          webPreferenceDefaults.reminderTime,
        reminderTimeZone:
          body.values.reminderTimeZone ??
          current.data.reminderTimeZone ??
          webPreferenceDefaults.reminderTimeZone,
        counts: {
          ...current.data.counts,
          [certificate]: body.values.defaultCount,
        },
      };
    db.exec("SAVEPOINT web_preference_save");
    try {
      db.prepare(
        "INSERT INTO user_web_preferences VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,data=excluded.data,updated_at=excluded.updated_at",
      ).run(user, current.version + 1, JSON.stringify(data), now);
      db.prepare("INSERT INTO web_preference_requests VALUES (?,?,?,?)").run(
        user,
        body.requestId,
        signature,
        now,
      );
      db.exec("RELEASE web_preference_save");
    } catch (e) {
      db.exec("ROLLBACK TO web_preference_save");
      db.exec("RELEASE web_preference_save");
      throw e;
    }
    return view(read(user), certificate);
  });
  return { read: (user, certificate) => view(read(user), certificate) };
}
