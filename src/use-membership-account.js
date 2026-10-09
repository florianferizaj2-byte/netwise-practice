import { useCallback, useEffect, useRef, useState } from "react";

const isMemberPage = (page) => ["vip", "redeem", "settings", "study"].includes(page);

// Keep account data in memory, scoped to the signed-in user. A mutation invalidates
// older reads so a delayed refresh cannot overwrite newly redeemed entitlements.
export function useMembershipAccount(api, userId, page) {
  const [state, setState] = useState({
    userId: null,
    data: null,
    loading: false,
    error: "",
  });
  const revision = useRef(0);
  const refreshedAt = useRef(0);
  const requestedAt = useRef(0);
  const previous = useRef({ userId, page });
  const replace = useCallback(
    (data) => {
      revision.current++;
      refreshedAt.current = Date.now();
      setState({ userId, data, loading: false, error: "" });
    },
    [userId],
  );
  const reload = useCallback(async () => {
    if (!userId) return;
    const request = ++revision.current;
    requestedAt.current = Date.now();
    setState((old) => ({
      userId,
      data: old.userId === userId ? old.data : null,
      loading: true,
      error: "",
    }));
    try {
      const data = await api("/account/entitlements");
      if (request !== revision.current) return;
      refreshedAt.current = Date.now();
      setState({ userId, data, loading: false, error: "" });
    } catch (cause) {
      if (request === revision.current)
        setState((old) => ({
          ...old,
          loading: false,
          error: cause.message || "权益读取失败，请重试。",
        }));
    }
  }, [api, userId]);
  useEffect(() => {
    refreshedAt.current = 0;
    if (userId) void reload();
    else setState({ userId: null, data: null, loading: false, error: "" });
    return () => {
      revision.current++;
    };
  }, [reload, userId]);
  useEffect(() => {
    if (
      previous.current.userId === userId &&
      previous.current.page !== page &&
      isMemberPage(page) &&
      Date.now() - Math.max(refreshedAt.current, requestedAt.current) >= 60000
    )
      void reload();
    previous.current = { userId, page };
  }, [page, userId, reload]);
  useEffect(() => {
    if (!userId || !isMemberPage(page)) return;
    const refreshVisible = () => {
      if (
        !document.hidden &&
        Date.now() - Math.max(refreshedAt.current, requestedAt.current) > 60000
      )
        void reload();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    const timer = window.setInterval(refreshVisible, 60000);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.clearInterval(timer);
    };
  }, [page, userId, reload]);
  return {
    account: state.userId === userId ? state.data : null,
    loading: state.userId === userId ? state.loading : !!userId,
    error: state.userId === userId ? state.error : "",
    reload,
    replace,
  };
}
