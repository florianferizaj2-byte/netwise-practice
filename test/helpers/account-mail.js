import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApp } from "../../server/index.js";

export function accountTestMailbox() {
  const messages = [];
  return {
    available: true,
    messages,
    async sendCode(message) {
      messages.push({ ...message });
    },
    latest(email, purpose) {
      return messages.findLast(
        (message) =>
          message.email.toLowerCase() === email.toLowerCase() &&
          message.purpose === purpose,
      );
    },
  };
}
export async function verifiedRegistration(
  base,
  credentials,
  mailbox,
  options = {},
) {
  const email =
    credentials.email || `${credentials.username.toLowerCase()}@example.test`;
  const sent = await fetch(`${base}/api/auth/email-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose: "register",
      username: credentials.username,
      email,
    }),
  });
  assert.equal(sent.status, 200, JSON.stringify(await sent.clone().json()));
  const { challengeId } = await sent.json();
  return fetch(`${base}/api/auth/register`, {
    ...options,
    method: "POST",
    headers: { "Content-Type": "application/json", ...options.headers },
    body: JSON.stringify({
      ...credentials,
      email,
      challengeId,
      code: mailbox.latest(email, "register").code,
    }),
  });
}

// Existing API regressions still use the real email-code endpoint and consume a real,
// single-use code delivered to this isolated in-process mailbox. Production has no bypass.
const apiMailbox = accountTestMailbox();
export const createVerifiedTestApp = (options) =>
  createApp({
    ...options,
    accountSecurity: { enabled: true, mailer: apiMailbox, ...options.accountSecurity },
  });
export async function verifiedFetch(url, options) {
  const body = JSON.parse(options.body);
  if (!body.username || !body.password || body.challengeId)
    return fetch(url, options);
  const base = new URL(url).origin;
  const email = `${body.username.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const sent = await fetch(`${base}/api/auth/email-code`, {
    method: "POST",
    headers: options.headers,
    body: JSON.stringify({
      purpose: "register",
      username: body.username,
      email,
    }),
  });
  assert.equal(sent.status, 200, JSON.stringify(await sent.clone().json()));
  const { challengeId } = await sent.json();
  return fetch(url, {
    ...options,
    body: JSON.stringify({
      ...body,
      email,
      challengeId,
      code: apiMailbox.latest(email, "register").code,
    }),
  });
}
