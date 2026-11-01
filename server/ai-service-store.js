import crypto from "node:crypto";
const fail = (message, code = "AI_SERVICES_CONFLICT", status = 409) => {
  throw Object.assign(new Error(message), { code, status });
};
export function createAiServiceStore(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS ai_service_policy(id INTEGER PRIMARY KEY CHECK(id=1),managed INTEGER NOT NULL DEFAULT 0 CHECK(managed IN(0,1)),revision INTEGER NOT NULL DEFAULT 0);
    INSERT OR IGNORE INTO ai_service_policy VALUES(1,0,0);
    CREATE TABLE IF NOT EXISTS ai_service_channels(id TEXT PRIMARY KEY,data TEXT NOT NULL,key_cipher TEXT,enabled INTEGER NOT NULL CHECK(enabled IN(0,1)),priority INTEGER NOT NULL CHECK(priority BETWEEN 1 AND 9999),revision INTEGER NOT NULL DEFAULT 1,last_test TEXT,created_by TEXT NOT NULL,updated_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
  const policy = () =>
    db
      .prepare("SELECT managed,revision FROM ai_service_policy WHERE id=1")
      .get();
  const channel = (row) =>
    row
      ? {
          ...JSON.parse(row.data),
          id: row.id,
          keyCipher: row.key_cipher,
          enabled: !!row.enabled,
          priority: row.priority,
          revision: row.revision,
          lastTest: row.last_test ? JSON.parse(row.last_test) : null,
        }
      : null;
  const channels = () =>
    db
      .prepare(
        "SELECT * FROM ai_service_channels ORDER BY priority,created_at,id",
      )
      .all()
      .map(channel);
  const get = (id) =>
    channel(db.prepare("SELECT * FROM ai_service_channels WHERE id=?").get(id));
  const mutate = (revision, run) => {
    const name = "services_" + crypto.randomBytes(6).toString("hex");
    db.exec("SAVEPOINT " + name);
    try {
      const changed = db
        .prepare(
          "UPDATE ai_service_policy SET revision=revision+1 WHERE id=1 AND revision=?",
        )
        .run(revision);
      if (!changed.changes) fail("接口列表已被其他页面修改，请刷新后再操作");
      const result = run();
      db.exec("RELEASE " + name);
      return result;
    } catch (error) {
      db.exec("ROLLBACK TO " + name);
      db.exec("RELEASE " + name);
      throw error;
    }
  };
  return {
    policy,
    channels,
    get,
    save({ id, data, keyCipher, enabled, priority, actor, revision }) {
      return mutate(revision, () => {
        const old = id ? get(id) : null;
        if (id && !old) fail("接口不存在", "AI_SERVICES_NOT_FOUND", 404);
        const nextId = id || crypto.randomUUID(),
          time = new Date().toISOString();
        db.prepare(
          `INSERT INTO ai_service_channels VALUES(?,?,?,?,?,1,NULL,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,key_cipher=excluded.key_cipher,enabled=excluded.enabled,priority=excluded.priority,revision=ai_service_channels.revision+1,last_test=NULL,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        ).run(
          nextId,
          JSON.stringify(data),
          keyCipher || null,
          enabled ? 1 : 0,
          priority,
          actor,
          actor,
          time,
          time,
        );
        return get(nextId);
      });
    },
    setManaged(managed, revision) {
      return mutate(revision, () =>
        db
          .prepare("UPDATE ai_service_policy SET managed=? WHERE id=1")
          .run(managed ? 1 : 0),
      );
    },
    setEnabled(id, enabled, revision, actor) {
      return mutate(revision, () => {
        if (!get(id)) fail("接口不存在", "AI_SERVICES_NOT_FOUND", 404);
        db.prepare(
          "UPDATE ai_service_channels SET enabled=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=?",
        ).run(enabled ? 1 : 0, actor, new Date().toISOString(), id);
      });
    },
    reorder(ids, revision, actor) {
      return mutate(revision, () => {
        const old = channels();
        if (
          new Set(ids).size !== ids.length ||
          old.length !== ids.length ||
          old.some((row) => !ids.includes(row.id))
        )
          fail("排序必须包含当前全部接口");
        const query = db.prepare(
            "UPDATE ai_service_channels SET priority=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=?",
          ),
          time = new Date().toISOString();
        ids.forEach((id, index) => query.run(index + 1, actor, time, id));
      });
    },
    remove(id, revision) {
      return mutate(revision, () => {
        if (
          !db.prepare("DELETE FROM ai_service_channels WHERE id=?").run(id)
            .changes
        )
          fail("接口不存在", "AI_SERVICES_NOT_FOUND", 404);
      });
    },
    recordTest(id, revision, result) {
      db.prepare(
        "UPDATE ai_service_channels SET last_test=? WHERE id=? AND revision=?",
      ).run(
        JSON.stringify({ ...result, at: new Date().toISOString() }),
        id,
        revision,
      );
    },
  };
}
