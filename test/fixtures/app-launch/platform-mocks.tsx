import React from "react";
import { AnnouncementClient } from "../../../mobile/src/announcements/client";

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
  id: params.get("id") ?? "test",
  enabled: true,
  title: "启动公告",
  body: params.get("body") ?? "测试公告",
  updatedAt: "2026-10-20T00:00:00+08:00",
};
export const publicAnnouncements = new AnnouncementClient({
  getItem: (key) => params.get("notice") === "hang"
    ? new Promise<string | null>(() => {})
    : Promise.resolve(localStorage.getItem(key)),
  setItem: async (key, value) => { localStorage.setItem(key, value); },
}, async () => {
  await new Promise(resolve => setTimeout(resolve, Number(params.get("notice") ?? 100)));
  return notice;
});
export function AnnouncementDialog({ visible, onClose }: any) {
  return visible ? (
    <div data-testid="launch-announcement">
      <button onClick={onClose}>关闭公告</button>
    </div>
  ) : null;
}
