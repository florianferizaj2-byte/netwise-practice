// Local operator recovery only. This module is never mounted as an HTTP endpoint.
import "dotenv/config";
import crypto from "node:crypto";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface, emitKeypressEvents } from "node:readline";
import { stdin, stdout } from "node:process";
import { accountUsername, accountPassword } from "./account-security.js";
const scrypt = promisify(crypto.scrypt);

export async function recoverAccountAfterReview(
  db,
  { username, password, reason, ownershipReviewed },
) {
  if (ownershipReviewed !== true) throw new Error("必须先核验账号归属");
  accountUsername.parse(username);
  accountPassword.parse(password);
  if (
    typeof reason !== "string" ||
    reason.trim().length < 6 ||
    reason.length > 120 ||
    /[\r\n\u0000-\u001f]/.test(reason)
  )
    throw new Error("请填写 6–120 字的核验工单编号或简要理由");
  const row = db
    .prepare("SELECT id,password_hash FROM users WHERE username=?")
    .get(username);
  if (!row) throw new Error("账号不存在；请确认原始账号名的大小写");
  const salt = crypto.randomBytes(16).toString("base64"),
    hash = (await scrypt(password, salt, 64)).toString("base64");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (
      db.prepare("SELECT password_hash FROM users WHERE id=?").get(row.id)
        ?.password_hash !== row.password_hash
    )
      throw new Error("密码刚刚发生变化，请重新核验后操作");
    db.prepare("UPDATE users SET password_hash=?,salt=? WHERE id=?").run(
      hash,
      salt,
      row.id,
    );
    db.prepare("DELETE FROM auth_sessions WHERE user_id=?").run(row.id);
    if (
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='account_email_codes'",
        )
        .get()
    )
      db.prepare(
        "UPDATE account_email_codes SET status='used' WHERE user_id=?",
      ).run(row.id);
    db.exec(`CREATE TABLE IF NOT EXISTS account_recovery_audit (
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,reason TEXT NOT NULL,actor TEXT NOT NULL,created_at TEXT NOT NULL
    )`);
    db.prepare(
      "INSERT INTO account_recovery_audit VALUES (?,?,?,'local-operator',?)",
    ).run(crypto.randomUUID(), row.id, reason.trim(), new Date().toISOString());
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { changed: true, userId: row.id };
}
function ask(prompt) {
  const reader = createInterface({ input: stdin, output: stdout });
  return new Promise((resolve) =>
    reader.question(prompt, (answer) => {
      reader.close();
      resolve(answer);
    }),
  );
}
function secret(prompt) {
  stdout.write(prompt);
  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.off("keypress", press);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    };
    const press = (text, key = {}) => {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("已取消"));
      } else if (key.name === "return") {
        cleanup();
        resolve(value);
      } else if (key.name === "backspace")
        value = [...value].slice(0, -1).join("");
      else if (
        !key.ctrl &&
        !key.meta &&
        text &&
        !/[\u0000-\u001f\u007f]/.test(text) &&
        value.length < 128
      )
        value += text;
    };
    stdin.on("keypress", press);
  });
}
async function main() {
  if (
    !stdin.isTTY ||
    process.argv.length !== 4 ||
    process.argv[2] !== "--username"
  )
    throw new Error(
      "请在服务器交互终端运行：node server/account-recovery.js --username 原账号名。密码不可放在命令行参数中。",
    );
  const username = accountUsername.parse(process.argv[3]);
  const filename = path.resolve(
    process.env.DATA_DIR || "data",
    "netwise.sqlite",
  );
  if (!fs.existsSync(filename))
    throw new Error("数据库不存在，请检查 DATA_DIR；未创建或修改数据库。");
  stdout.write(
    "仅供服务器管理员处理未绑定邮箱且忘记密码的老账号。先通过独立渠道核验账号归属，不能只凭账号名、公开资料或新邮箱操作。\n",
  );
  if ((await ask("核验完成后输入“已核验账号归属”：")) !== "已核验账号归属")
    throw new Error("未确认核验，已取消");
  const reason = await ask(
    "核验工单编号或简要理由（勿填写证件号、邮箱、聊天内容）：",
  );
  const password = await secret("输入新密码（不回显，8–128 位）：");
  if (password !== (await secret("再次输入新密码：")))
    throw new Error("两次密码不一致，未修改账号");
  const db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
    await recoverAccountAfterReview(db, {
      username,
      password,
      reason,
      ownershipReviewed: true,
    });
    stdout.write(
      "密码已重置，全部旧登录已退出，已记录恢复操作。让用户登录后立即绑定恢复邮箱，并自行修改密码。\n",
    );
  } finally {
    db.close();
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
