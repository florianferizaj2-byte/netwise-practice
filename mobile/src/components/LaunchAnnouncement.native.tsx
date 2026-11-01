import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import type { Announcement } from "../announcements/client";
import { publicAnnouncements } from "../announcements/current";
import { useLaunchActive, useLaunchStage } from "../launch/LaunchReadiness";
import { AnnouncementDialog } from "./AnnouncementDialog";

/** Start the page immediately; show the launch notice after the window opens. */
export function LaunchAnnouncement({ children }: { children: ReactNode }) {
  const active = useLaunchActive();
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<Announcement | null>(null);
  useLaunchStage("announcement", ready);

  useEffect(() => {
    let mounted = true,
      settled = false;
    const finish = () => {
      if (!mounted || settled) return;
      settled = true;
      clearTimeout(timer);
      const current = publicAnnouncements.snapshot();
      setNotice(publicAnnouncements.needsDisplay(current) ? current : null);
      setReady(true);
    };
    // Include local hydration in the deadline, not only the network request.
    const timer = setTimeout(finish, 2_000);
    void publicAnnouncements
      .hydrate()
      .then(() => publicAnnouncements.refresh(true))
      .finally(finish);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <View style={styles.root} testID={ready ? "announcement-ready" : undefined}>
      {children}
      {notice && (
        <AnnouncementDialog
          content={notice}
          visible={ready && !active}
          launch
          onClose={() => { if (notice) void publicAnnouncements.markRead(notice); setNotice(null); }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
