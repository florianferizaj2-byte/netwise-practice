// Public defaults; no credentials. Explicit administrator model names are kept.
export const deepSeekDefaults = Object.freeze({
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
  temperature: 0.3,
});
export function officialDeepSeek(baseUrl) {
  try {
    return new URL(baseUrl).origin === deepSeekDefaults.baseUrl;
  } catch {
    return false;
  }
}
export function defaultAiModel(baseUrl) {
  return officialDeepSeek(baseUrl) ? deepSeekDefaults.model : "deepseek-chat";
}
