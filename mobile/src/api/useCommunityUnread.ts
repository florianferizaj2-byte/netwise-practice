import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_BASE_URL, mobileApi } from './client';
import {
  communityCursor, countCommunityUnread, isAfterCommunityCursor, parseCommunityReadCursor, type CommunityCursor,
} from './communityUnread';

const POLL_MS = 10_000;

type Tracker = {
  key: string;
  cursor: CommunityCursor | null | undefined;
  ready?: Promise<void>;
  writes: Promise<void>;
};

function loadReadCursor(tracker: Tracker) {
  return tracker.ready ??= AsyncStorage.getItem(tracker.key)
    .then((value) => { tracker.cursor = parseCommunityReadCursor(value); })
    .catch(() => undefined);
}

function advanceReadCursor(tracker: Tracker, next: CommunityCursor | null) {
  if (tracker.cursor !== undefined && (!next || !isAfterCommunityCursor(next, tracker.cursor))) return;
  tracker.cursor = next;
  tracker.writes = tracker.writes.then(() => AsyncStorage.setItem(tracker.key, JSON.stringify(next))).catch(() => undefined);
}

export function useCommunityUnread(userId: string | undefined, poll: boolean) {
  const tracker = useMemo<Tracker | null>(() => userId ? {
    key: `kaojiang-community-read:${JSON.stringify([API_BASE_URL, userId])}`,
    cursor: undefined, writes: Promise.resolve(),
  } : null, [userId]);
  const [badge, setBadge] = useState<{ tracker: Tracker; count: number } | null>(null);

  const markRead = useCallback((latest: CommunityCursor | null) => {
    if (!tracker) return;
    // The screen reports only messages from a successful refresh while visible.
    if (tracker.cursor === undefined) {
      void loadReadCursor(tracker).then(() => advanceReadCursor(tracker, latest));
    } else {
      advanceReadCursor(tracker, latest);
    }
    setBadge((current) => current?.tracker === tracker && current.count === 0 ? current : { tracker, count: 0 });
  }, [tracker]);

  useEffect(() => {
    if (!tracker || !userId || !poll) return;
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh(activeTracker: Tracker, viewerId: string) {
      try {
        await loadReadCursor(activeTracker);
        if (signal.aborted) return;
        const baseline = activeTracker.cursor;
        if (baseline === undefined) {
          const { messages } = await mobileApi.communityMessages(undefined, 1, signal);
          // On first use, count future messages, not the entire existing history.
          if (!signal.aborted && activeTracker.cursor === undefined) {
            advanceReadCursor(activeTracker, communityCursor(messages.at(-1)));
          }
          return;
        }
        const count = await countCommunityUnread(baseline, viewerId, mobileApi.communityMessages, signal);
        if (!signal.aborted && activeTracker.cursor === baseline) {
          setBadge((current) => current?.tracker === activeTracker && current.count === count ? current : { tracker: activeTracker, count });
        }
      } catch { /* Keep the previous count if offline, then retry on the next poll. */ }
      finally {
        if (!signal.aborted) timer = setTimeout(() => void refresh(activeTracker, viewerId), POLL_MS);
      }
    }

    void refresh(tracker, userId);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [poll, tracker, userId]);

  return { count: tracker && badge?.tracker === tracker ? badge.count : 0, markRead };
}
