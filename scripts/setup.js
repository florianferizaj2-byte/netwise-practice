import fs from "node:fs";
import crypto from "node:crypto";
if (!fs.existsSync(".env")) {
  fs.writeFileSync(
    ".env",
    `AI_MASTER_KEY=${crypto.randomBytes(32).toString("base64")}\nPORT=5173\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log(
    "Local encryption environment created. Key contents are never printed.",
  );
} else console.log("Existing .env preserved.");
