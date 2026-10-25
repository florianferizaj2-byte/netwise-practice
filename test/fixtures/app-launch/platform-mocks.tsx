import React from "react";

// Native launch orchestration is rendered through RN Web; platform APIs are inert.
export default function Svg({ accessible, children, ...props }: any) {
  return <svg {...props}>{children}</svg>;
}
export function Path(props: any) {
  return <path {...props} />;
}
export function Rect(props: any) {
  return <rect {...props} />;
}
export function StatusBar() {
  return null;
}
export async function preventAutoHideAsync() {
  return true;
}
export function setOptions() {}
export async function hideAsync() {}
export function useTheme() {
  return {
    reduceMotion: new URLSearchParams(location.search).get("reduced") === "1",
    animationScale: 1,
    resolvedMode: "light" as const,
  };
}

const params = new URLSearchParams(location.search);
const notice = {
  schemaVersion: 1 as const,
  id: "test",
  enabled: true,
  title: "启动公告",
  body: "测试公告",
  updatedAt: "2026-10-20T00:00:00+08:00",
};
export const publicAnnouncements = {
  snapshot: () => notice,
  hydrate: () =>
    params.get("notice") === "hang"
      ? new Promise<void>(() => {})
      : Promise.resolve(),
  refresh: () =>
    new Promise<void>((resolve) =>
      setTimeout(resolve, Number(params.get("notice") ?? 100)),
    ),
};
export function AnnouncementDialog({ visible, onClose }: any) {
  return visible ? (
    <div data-testid="launch-announcement">
      <button onClick={onClose}>关闭公告</button>
    </div>
  ) : null;
}
