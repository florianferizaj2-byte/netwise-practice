import crypto from "node:crypto";

export function masterKey() {
  const key = Buffer.from(process.env.AI_MASTER_KEY || "", "base64");
  if (key.length !== 32)
    throw new Error(
      "请在服务器环境变量 AI_MASTER_KEY 中配置 32 字节 Base64 主密钥",
    );
  return key;
}
export function encrypt(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString("base64"))
    .join(".");
}
export function decrypt(value) {
  try {
    const [iv, tag, data] = value
      .split(".")
      .map((s) => Buffer.from(s, "base64"));
    const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString(
      "utf8",
    );
  } catch {
    throw new Error("无法解密 API Key，请检查服务器主密钥或重新保存 API Key");
  }
}
export function redact(value, secrets = []) {
  if (Array.isArray(value)) return value.map((item) => redact(item, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /authorization|api.?key|token|secret/i.test(k)
          ? "[REDACTED]"
          : redact(v, secrets),
      ]),
    );
  let text = String(value ?? "");
  for (const secret of secrets.filter(Boolean))
    text = text.split(secret).join("[REDACTED]");
  return text
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [REDACTED]")
    .replace(/sk-[\w-]+/g, "[REDACTED]")
    .replace(
      /(authorization|api[ _-]?key)\s*[:=]\s*[^\s,}]+/gi,
      "$1: [REDACTED]",
    )
    .replace(/(?:\[REDACTED\])+/g, "[REDACTED]");
}
export function safeLog(...values) {
  console.log(...values.map((value) => redact(value)));
}
export function validateBaseUrl(raw) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash)
    throw new Error("Base URL 不可包含账户、查询参数或片段");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error("远程 API 必须使用 HTTPS；本地模型可使用 localhost HTTP");
  return url.href.replace(/\/$/, "");
}
