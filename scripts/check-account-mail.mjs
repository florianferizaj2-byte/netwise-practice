import "dotenv/config";
import { accountEmailEnabled, createAccountMailer } from "../server/account-mail.js";
const mailer = createAccountMailer();
try {
  if (!accountEmailEnabled()) {
    console.log("邮箱功能已关闭，不连接 SMTP、不发送邮件。账号密码注册和登录正常保留。");
  } else if (!mailer.available) {
    console.error(
      "尚未配置发信邮箱。请按 docs/account-email-verification.md 在服务器设置 AUTH_SMTP_*。已有账号仍可登录；新账号验证和邮箱找回暂不可用。",
    );
    process.exitCode = 1;
  } else {
    await mailer.verify();
    console.log(
      "SMTP 加密连接和登录验证通过。未发送任何邮件；真实验证码送达仍需使用自己的收件邮箱完成注册/找回流程验收。",
    );
  }
} catch (error) {
  const code = /^[A-Z_]{2,30}$/.test(error.code || "")
    ? `（${error.code}）`
    : "";
  console.error(
    `SMTP 验证失败${code}。请检查服务器出站端口、邮箱服务开通状态和授权密码；未输出账号或密码。`,
  );
  process.exitCode = 1;
} finally {
  mailer.close();
}
