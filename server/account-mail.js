import nodemailer from "nodemailer";

export const accountEmailEnabled = (env = process.env) =>
  /^(1|true)$/i.test(String(env.AUTH_EMAIL_VERIFICATION_ENABLED || "").trim());

export function createAccountMailer(env = process.env) {
  const host = env.AUTH_SMTP_HOST?.trim();
  const user = env.AUTH_SMTP_USER?.trim();
  const pass = env.AUTH_SMTP_PASSWORD;
  const from = env.AUTH_SMTP_FROM?.trim();
  const port = Number(env.AUTH_SMTP_PORT || 465);
  const available = !!(
    host &&
    user &&
    pass &&
    from &&
    [465, 587].includes(port)
  );
  const transport = available
    ? nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        requireTLS: port !== 465,
        auth: { user, pass },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
        disableFileAccess: true,
        disableUrlAccess: true,
        logger: false,
        debug: false,
      })
    : null;
  return {
    available,
    async verify() {
      if (!transport) throw new Error("MAIL_UNAVAILABLE");
      await transport.verify();
      return true;
    },
    async sendCode({ email, code, purpose }) {
      if (!transport) throw new Error("MAIL_UNAVAILABLE");
      const action = {
        register: "注册账号",
        reset: "重置密码",
        bind: "绑定邮箱",
      }[purpose];
      const info = await transport.sendMail({
        from,
        to: email,
        subject: `考匠${action}验证码`,
        text: `你正在进行${action}。\n\n验证码：${code}\n\n10 分钟内有效，仅能使用一次。请勿向任何人透露验证码。\n找回密码仅适用于此前已绑定此邮箱的账号。若非本人操作，请忽略此邮件。`,
      });
      if (!info.accepted?.length) throw new Error("MAIL_REJECTED");
    },
    close() {
      transport?.close();
    },
  };
}
