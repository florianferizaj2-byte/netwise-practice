import { StyleSheet, type TextStyle } from "react-native";
import type { CSSProperties } from "react";
import type { AppIconProps } from "./AppIcon";

// One outline family for navigation, list accessories, controls and feedback.
const paths: Record<string, string[]> = {
  home: ["M3 10 12 3l9 7", "M5 9v11h5v-6h4v6h5V9"],
  book: [
    "M12 6v15",
    "M12 6C8 3 4 4 2 5v14c3-1 6-1 10 2 4-3 7-3 10-2V5c-2-1-6-2-10 1",
  ],
  wrong: [
    "M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z",
    "M14 3v6h6",
    "m9 12 6 6m0-6-6 6",
  ],
  exam: [
    "M9 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-4",
    "M9 2h6v4H9z",
    "m7 12 3 3 7-7",
    "M7 18h10",
  ],
  crown: ["m3 6 5 4 4-7 4 7 5-4-2 13H5Z", "M7 16h10"],
  person: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0", "M4 21v-2a8 8 0 0 1 16 0v2"],
  sparkles: [
    "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
    "M20 2v4m-2-2h4",
  ],
  check: ["m5 12 4 4L19 6"],
  close: ["m6 6 12 12M6 18 18 6"],
  "chevron-right": ["m9 5 7 7-7 7"],
  "chevron-left": ["m15 5-7 7 7 7"],
  "chevron-down": ["m5 9 7 7 7-7"],
  "chevron-up": ["m5 15 7-7 7 7"],
  arrow: ["M4 12h16m-6-6 6 6-6 6"],
  "arrow-left": ["M20 12H4m6-6-6 6 6 6"],
  star: [
    "m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z",
  ],
  list: ["M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"],
  shuffle: [
    "M3 5h3l12 14h3m-4-4 4 4-4 4",
    "M3 19h3l4-5M14 9l4-4h3m-4-4 4 4-4 4",
  ],
  chart: ["M4 20h17M7 16V9m5 7V4m5 12v-5"],
  search: ["M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0", "m16 16 6 6"],
  info: ["M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0", "M12 11v6M12 7h.01"],
  message: [
    "M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-5a9 9 0 1 1 16.6-4.5",
    "M8 11h8M8 15h5",
  ],
  image: ["M3 3h18v18H3z", "M9 8h.01", "m3 17 5-5 4 4 4-6 5 7"],
  send: ["m22 2-7 20-4-9L2 9Z", "M22 2 11 13"],
  settings: [
    "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8",
    "m10 2-.6 3-2 .9-2.7-1-2 3.4L5 10v4l-2.3 1.7 2 3.4 2.7-1 2 .9.6 3h4l.6-3 2-.9 2.7 1 2-3.4L19 14v-4l2.3-1.7-2-3.4-2.7 1-2-.9-.6-3Z",
  ],
  trophy: [
    "M8 3h8v9a4 4 0 0 1-8 0Z",
    "M8 5H3v3a4 4 0 0 0 5 4m8-7h5v3a4 4 0 0 1-5 4",
    "M12 16v5m-4 0h8",
  ],
  calendar: [
    "M5 5h14a2 2 0 0 1 2 2v13H3V7a2 2 0 0 1 2-2",
    "M7 2v6m10-6v6M3 11h18",
    "m8 16 2 2 5-5",
  ],
  refresh: [
    "M20 7a9 9 0 0 0-15-2L2 8m0-6v6h6",
    "M4 17a9 9 0 0 0 15 2l3-3m0 6v-6h-6",
  ],
  lock: ["M6 10h12v11H6z", "M8 10V6a4 4 0 0 1 8 0v4", "M12 14v3"],
  download: ["M12 3v12m-5-5 5 5 5-5", "M4 16v5h16v-5"],
};

const glyphNames: Record<string, string> = {
  "⌂": "home",
  "✦": "sparkles",
  "✧": "crown",
  "◎": "person",
  "□": "exam",
  "×": "close",
  "✕": "close",
  "✓": "check",
  "›": "chevron-right",
  "‹": "chevron-left",
  "→": "arrow",
  "←": "arrow-left",
  "⌄": "chevron-down",
  "⌃": "chevron-up",
  "▾": "chevron-down",
  "▴": "chevron-up",
  "★": "star",
  "☆": "star",
  "≡": "list",
  "↗": "chart",
  "⌘": "sparkles",
  "↻": "refresh",
  错: "wrong",
  藏: "star",
  AI: "sparkles",
  进: "chart",
  顺: "list",
  随: "shuffle",
  "⊙": "exam",
  "+": "image",
  "⇄": "shuffle",
  今: "chart",
  知: "book",
  "⚠︎": "info",
  "↓": "download",
  "＋": "image",
};

export function AppIcon({
  name,
  children,
  size,
  color,
  style,
  selected = false,
}: AppIconProps) {
  const resolved = StyleSheet.flatten(style) as TextStyle | undefined;
  const iconName = name ?? glyphNames[children ?? ""] ?? "sparkles";
  const iconSize = size ?? Math.min(28, resolved?.fontSize ?? 20);
  const wrapper: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: (resolved?.width as CSSProperties["width"]) ?? iconSize,
    height: (resolved?.height as CSSProperties["height"]) ?? iconSize,
    marginLeft: resolved?.marginLeft as CSSProperties["marginLeft"],
    marginRight: resolved?.marginRight as CSSProperties["marginRight"],
    marginTop: resolved?.marginTop as CSSProperties["marginTop"],
    marginBottom: resolved?.marginBottom as CSSProperties["marginBottom"],
    color: color ?? (resolved?.color as string) ?? "currentColor",
  };
  return (
    <span aria-hidden="true" style={wrapper}>
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill={
          selected && ["home", "crown", "star"].includes(iconName)
            ? "currentColor"
            : "none"
        }
        stroke="currentColor"
        strokeWidth={selected ? 1.9 : 1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {(paths[iconName] ?? paths.sparkles).map((d, index) => (
          <path key={index} d={d} />
        ))}
      </svg>
    </span>
  );
}
