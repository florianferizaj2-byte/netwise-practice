import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { View } from "react-native";
import { AppLaunch } from "../../../mobile/src/launch/AppLaunch.tsx";
import { useLaunchStage } from "../../../mobile/src/launch/LaunchReadiness";
import { LaunchAnnouncement } from "../../../mobile/src/components/LaunchAnnouncement.native";

const params = new URLSearchParams(location.search);
function Home() {
  const [ready, setReady] = useState(false);
  useLaunchStage("home", ready);
  useEffect(() => {
    if (params.get("home") === "hang") return;
    const timer = setTimeout(
      () => setReady(true),
      Number(params.get("home") ?? 150),
    );
    return () => clearTimeout(timer);
  }, []);
  return (
    <div data-testid="fixture-home" data-ready={ready}>
      首页
    </div>
  );
}
function Route() {
  const [ready, setReady] = useState(false),
    [replaced, setReplaced] = useState(false);
  useLaunchStage("route", ready);
  useEffect(() => {
    const route = setTimeout(() => setReady(true), 50);
    const replace = params.has("replace")
      ? setTimeout(() => setReplaced(true), 500)
      : undefined;
    return () => {
      clearTimeout(route);
      clearTimeout(replace);
    };
  }, []);
  if (!ready) return <div>恢复会话</div>;
  return replaced ? <div data-testid="fixture-auth">登录</div> : <Home />;
}
createRoot(document.getElementById("root")!).render(
  <div style={{ width: 375, height: 812, display: "flex" }}>
    <AppLaunch>
      <LaunchAnnouncement>
        <View style={{ flex: 1 }}>
          <Route />
        </View>
      </LaunchAnnouncement>
    </AppLaunch>
  </div>,
);
