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
});
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
    (value.autoNext === undefined || typeof value.autoNext === "boolean")
  );
}
