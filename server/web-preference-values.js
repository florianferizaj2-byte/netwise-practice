// Public preference values only; this module is also safe to bundle in the Web client.
export const preferenceThemes = ["light", "dark", "system"];
export const preferenceTextSizes = ["standard", "large", "largest"];
export const preferenceCounts = [10, 20, 30];
export const webPreferenceDefaults = Object.freeze({
  theme: "light",
  textSize: "standard",
  reducedMotion: false,
  defaultCount: 10,
  showAnalysis: true,
  autoNext: false,
  reminderEnabled: false,
  reminderTime: "20:00",
  reminderTimeZone: "Asia/Shanghai",
});
export const validReminderTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validReminderTimeZone(value) {
  if (typeof value !== "string" || value.length > 100) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}
export function reminderClock(timestamp, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(timestamp)
      .map(({ type, value }) => [type, value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}
export function validWebPreferences(value) {
  return (
    value &&
    Object.keys(value).every((key) =>
      Object.hasOwn(webPreferenceDefaults, key),
    ) &&
    preferenceThemes.includes(value.theme) &&
    preferenceTextSizes.includes(value.textSize) &&
    typeof value.reducedMotion === "boolean" &&
    preferenceCounts.includes(value.defaultCount) &&
    (value.showAnalysis === undefined ||
      typeof value.showAnalysis === "boolean") &&
    (value.autoNext === undefined || typeof value.autoNext === "boolean") &&
    (value.reminderEnabled === undefined ||
      typeof value.reminderEnabled === "boolean") &&
    (value.reminderTime === undefined ||
      validReminderTime(value.reminderTime)) &&
    (value.reminderTimeZone === undefined ||
      validReminderTimeZone(value.reminderTimeZone))
  );
}
