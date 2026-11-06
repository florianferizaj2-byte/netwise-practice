import { CryptoDigestAlgorithm, digestStringAsync } from 'expo-crypto';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { API_BASE_URL } from '../api/endpoint';
import { shanghaiStudyDay, type OfflineAnswer } from './offlineStudyCore';
import type { OfflinePackOwner } from './offlinePacks.android';


export type OnlineStudyAttempt = {
  serverId: string; questionId: string; correct: boolean; occurredAt: number; timeMs: number;
};
export type OfflineSyncReceipt = {
  accepted: { id: string; serverId: string; correct: boolean; occurredAt: number }[];
  rejected: { id: string; code: string }[];
};
const serverIdFor = (userId: string, id: string) =>
  digestStringAsync(CryptoDigestAlgorithm.SHA256, userId + ':practice:' + id);
const serverIdPattern = /^(?:[a-f0-9]{64}|[a-f0-9-]{36})$/;
const name = 'kaojiang-offline-study-v1.db';
export const offlineOwnerKey = ({ userId, certificateId }: OfflinePackOwner) =>
  JSON.stringify([API_BASE_URL, userId, certificateId]);

let opening: Promise<SQLiteDatabase> | undefined;
function database() {
  opening ??= openDatabaseAsync(name).then(async (db) => {
    try {
      await db.execAsync(
        'PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;' +
        'CREATE TABLE IF NOT EXISTS offline_attempts (' +
        ' scope TEXT NOT NULL, id TEXT NOT NULL, question_id TEXT NOT NULL, day TEXT NOT NULL,' +
        ' occurred_at INTEGER NOT NULL, correct INTEGER NOT NULL, event TEXT NOT NULL,' +
        ' sync_state INTEGER NOT NULL DEFAULT 0, server_id TEXT, PRIMARY KEY(scope, id));' +
        'CREATE INDEX IF NOT EXISTS offline_attempts_day ON offline_attempts(scope, day);' +
        'CREATE INDEX IF NOT EXISTS offline_attempts_question ON offline_attempts(scope, question_id, occurred_at DESC);' +
        'CREATE INDEX IF NOT EXISTS offline_attempts_sync ON offline_attempts(scope, sync_state, occurred_at);' +
        'CREATE UNIQUE INDEX IF NOT EXISTS offline_attempts_server ON offline_attempts(scope, server_id) WHERE server_id IS NOT NULL;' +
        'CREATE TABLE IF NOT EXISTS offline_favorites (' +
        ' scope TEXT NOT NULL, question_id TEXT NOT NULL, favorite INTEGER NOT NULL, updated_at INTEGER NOT NULL,' +
        ' PRIMARY KEY(scope, question_id));' +
        'CREATE TABLE IF NOT EXISTS offline_sessions (' +
        ' scope TEXT NOT NULL, session_id TEXT NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL,' +
        ' PRIMARY KEY(scope, session_id));',
      );
      return db;
    } catch (cause) {
      await db.closeAsync().catch(() => undefined);
      throw cause;
    }
  }).catch((cause) => { opening = undefined; throw cause; });
  return opening;
}

// Serialize writes through the app connection. Readers see only committed rows;
// Android's native location module can open the same file read-only.
let writes: Promise<unknown> = Promise.resolve();
const write = <T,>(fn: () => Promise<T>): Promise<T> => {
  const next = writes.then(fn);
  writes = next.catch(() => undefined);
  return next;
};
type Executor = Pick<SQLiteDatabase, 'getFirstAsync' | 'runAsync'>;
type SessionUpdate = { id: string; data: unknown };

async function insertAttempt(db: Executor, scope: string, row: OfflineAnswer, serverId: string) {
  const event = JSON.stringify(row);
  const { changes } = await db.runAsync(
    'INSERT INTO offline_attempts(scope,id,question_id,day,occurred_at,correct,event,server_id) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(scope,id) DO NOTHING',
    scope, row.id, row.questionId, shanghaiStudyDay(row.occurredAt), row.occurredAt, row.correct ? 1 : 0, event, serverId,
  );
  if (changes === 0) {
    const prior = await db.getFirstAsync<{ event: string }>(
      'SELECT event FROM offline_attempts WHERE scope=? AND id=?', scope, row.id);
    if (prior?.event !== event) throw new Error('该作答记录已存在，请重新打开练习。');
  }
}

async function putSession(db: Executor, scope: string, session: SessionUpdate) {
  await db.runAsync(
    'INSERT INTO offline_sessions(scope,session_id,data,updated_at) VALUES(?,?,?,?) ' +
    'ON CONFLICT(scope,session_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
    scope, session.id, JSON.stringify(session.data), Date.now(),
  );
}

export const offlineStudyStore = {
  async record(owner: OfflinePackOwner, rows: OfflineAnswer[], session?: SessionUpdate) {
    const scope = offlineOwnerKey(owner);
    return write(async () => {
      const db = await database();
      await db.withExclusiveTransactionAsync(async (txn) => {
        const serverIds = await Promise.all(rows.map((row) => serverIdFor(owner.userId, row.id)));
        for (const [index, row] of rows.entries()) await insertAttempt(txn, scope, row, serverIds[index]);
        if (session) await putSession(txn, scope, session);
      });
    });
  },

  async setFavorite(owner: OfflinePackOwner, questionId: string, favorite: boolean) {
    const scope = offlineOwnerKey(owner);
    return write(async () => {
      const db = await database();
      await db.runAsync('INSERT INTO offline_favorites(scope,question_id,favorite,updated_at) VALUES(?,?,?,?) ' +
        'ON CONFLICT(scope,question_id) DO UPDATE SET favorite=excluded.favorite,updated_at=excluded.updated_at',
      scope, questionId, favorite ? 1 : 0, Date.now());
    });
  },

  async readSession<T>(owner: OfflinePackOwner, id: string): Promise<T | null> {
    const db = await database();
    const row = await db.getFirstAsync<{ data: string }>('SELECT data FROM offline_sessions WHERE scope=? AND session_id=?',
      offlineOwnerKey(owner), id);
    return row ? JSON.parse(row.data) as T : null;
  },

  async saveSession(owner: OfflinePackOwner, session: SessionUpdate) {
    const scope = offlineOwnerKey(owner);
    return write(async () => putSession(await database(), scope, session));
  },


  async pending(owner: OfflinePackOwner) {
    const db = await database();
    const rows = await db.getAllAsync<{ event: string }>(
      'SELECT event FROM offline_attempts WHERE scope=? AND sync_state=0 ORDER BY occurred_at,id LIMIT 100',
      offlineOwnerKey(owner));
    return rows.map((row) => JSON.parse(row.event) as OfflineAnswer);
  },

  async applyReceipt(owner: OfflinePackOwner, ids: string[], result: OfflineSyncReceipt) {
    const scope = offlineOwnerKey(owner);
    const expected = new Set(ids);
    if (!Array.isArray(result.accepted) || !Array.isArray(result.rejected) ||
      [...result.accepted, ...result.rejected].some((row) => !row || !expected.delete(row.id)) || expected.size)
      throw new Error('同步结果不完整，本机记录仍保留。');
    const verified = await Promise.all(result.accepted.map(async (row) =>
      row.serverId === await serverIdFor(owner.userId, row.id)));
    if (verified.some((ok) => !ok)) throw new Error('同步记录不属于当前账号。');
    return write(async () => {
      const db = await database();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const row of result.accepted) {
          await txn.runAsync('UPDATE offline_attempts SET sync_state=1 WHERE scope=? AND id=? AND server_id=?',
            scope, row.id, row.serverId);
        }
        for (const row of result.rejected) {
          if (row.code === 'OFFLINE_CLOCK_AHEAD') continue;
          if (['OFFLINE_QUESTION_UNAVAILABLE', 'OFFLINE_ANSWER_INVALID', 'OFFLINE_ATTEMPT_CONFLICT'].includes(row.code))
            await txn.runAsync('UPDATE offline_attempts SET sync_state=2 WHERE scope=? AND id=? AND sync_state=0', scope, row.id);
        }
      });
    });
  },

  async importOnline(owner: OfflinePackOwner, day: string, rows: OnlineStudyAttempt[]) {
    const scope = offlineOwnerKey(owner);
    if (rows.some((row) => !row || !serverIdPattern.test(row.serverId) ||
      typeof row.questionId !== 'string' || !row.questionId || typeof row.correct !== 'boolean' ||
      !Number.isSafeInteger(row.occurredAt) || shanghaiStudyDay(row.occurredAt) !== day))
      throw new Error('服务器作答记录不完整。');
    return write(async () => {
      const db = await database();
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const row of rows) {
          await txn.runAsync(
            'INSERT INTO offline_attempts(scope,id,question_id,day,occurred_at,correct,event,sync_state,server_id) ' +
            'VALUES(?,?,?,?,?,?,?,1,?) ON CONFLICT DO NOTHING',
            scope, 'server:' + row.serverId, row.questionId, day, row.occurredAt,
            row.correct ? 1 : 0, JSON.stringify(row), row.serverId,
          );
        }
      });
    });
  },
  async todayCount(owner: OfflinePackOwner, now = Date.now()) {
    const db = await database();
    const row = await db.getFirstAsync<{ count: number }>(
      'SELECT count(*) AS count FROM offline_attempts WHERE scope=? AND day=?',
      offlineOwnerKey(owner), shanghaiStudyDay(now));
    return row?.count ?? 0;
  },

  async progress(owner: OfflinePackOwner) {
    const db = await database();
    const scope = offlineOwnerKey(owner);
    const [history, favorites, totals] = await Promise.all([
      db.getAllAsync<{ question_id: string; correct: number }>(
        'SELECT question_id,correct FROM (SELECT question_id,correct,ROW_NUMBER() OVER ' +
        '(PARTITION BY question_id ORDER BY occurred_at DESC,rowid DESC) AS position FROM offline_attempts WHERE scope=?) WHERE position=1', scope),
      db.getAllAsync<{ question_id: string }>('SELECT question_id FROM offline_favorites WHERE scope=? AND favorite=1', scope),
      db.getFirstAsync<{ attempts: number; correct: number | null; pending: number | null; rejected: number | null }>(
        'SELECT count(*) AS attempts,sum(correct) AS correct,sum(CASE WHEN sync_state=0 THEN 1 ELSE 0 END) AS pending,sum(CASE WHEN sync_state=2 THEN 1 ELSE 0 END) AS rejected FROM offline_attempts WHERE scope=?', scope),
    ]);
    return {
      answered: new Set(history.map((r) => r.question_id)),
      wrong: new Set(history.filter((r) => !r.correct).map((r) => r.question_id)),
      favorites: new Set(favorites.map((r) => r.question_id)),
      attempts: totals?.attempts ?? 0, correct: totals?.correct ?? 0, pending: totals?.pending ?? 0, rejected: totals?.rejected ?? 0,
    };
  },
};
