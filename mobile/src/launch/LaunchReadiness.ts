import { createContext, useContext, useEffect } from "react";

export type LaunchStage = "route" | "home" | "announcement";
export type LaunchReadiness = {
  active: boolean;
  report: (stage: LaunchStage, ready: boolean) => void;
};

// Web uses its existing launch flow and has no native launch provider.
export const LaunchContext = createContext<LaunchReadiness | null>(null);

export function useLaunchStage(stage: LaunchStage, ready: boolean) {
  const report = useContext(LaunchContext)?.report;
  useEffect(() => {
    report?.(stage, ready);
    // A replaced route must not leave an unmounted home screen blocking launch.
    return () => report?.(stage, true);
  }, [ready, report, stage]);
}

export function useLaunchActive() {
  return useContext(LaunchContext)?.active ?? false;
}
