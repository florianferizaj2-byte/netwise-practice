import { readFileSync } from "node:fs";

const files = ["network-engineer", "sichuan-upgrading-computer"];
export const deploymentStudySeeds = files.flatMap((certificateId) => {
  const collection = JSON.parse(readFileSync(new URL(`./${certificateId}.json`, import.meta.url), "utf8"));
  if (collection.schemaVersion !== 1 || !Array.isArray(collection.packages) || !collection.packages.length ||
      collection.packages.some((item) => !item.nodeId?.startsWith(`${certificateId}:`)))
    throw new Error(`${certificateId}课程部署种子格式无效`);
  return collection.packages;
});
