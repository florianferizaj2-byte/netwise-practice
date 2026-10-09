import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { api } from "../api.js";
import { ContentPlaceholder } from "../components/content-placeholder.jsx";
import { Heading, IconButton } from "../components/study-ui.jsx";

export const mergeCommunityMessages = (current, incoming) => {
  const byId = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => byId.set(message.id, message));
  return [...byId.values()].sort((a, b) => {
    const created = String(a.createdAt || "").localeCompare(
      String(b.createdAt || ""),
    );
    return created || String(a.id).localeCompare(String(b.id));
  });
};

export const formatCommunityBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
};

export const formatCommunityTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
};

export function CommunityChatView({ currentUserId }) {
  const [room, setRoom] = useState(null),
    [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [attachment, setAttachment] = useState(null),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [sending, setSending] = useState(false),
    [hasMore, setHasMore] = useState(false),
    [before, setBefore] = useState(""),
    [chatError, setChatError] = useState(""),
    [leaderboards, setLeaderboards] = useState(null),
    [leaderboardOpen, setLeaderboardOpen] = useState(false),
    [leaderboardBusy, setLeaderboardBusy] = useState(false),
    [leaderboardError, setLeaderboardError] = useState(""),
    [leaderboardTab, setLeaderboardTab] = useState("answered");
  const leaderboardTypes = [
    ["answered", "刷题量", "题"],
    ["accuracy", "正确率", "%"],
    ["streakDays", "坚持天数", "天"],
    ["submitted", "提交题目", "题"],
  ];
  const activeBoard = leaderboards?.[leaderboardTab];
  const leaderboardUnit =
    leaderboardTypes.find(([id]) => id === leaderboardTab)?.[2] || "";
  const openLeaderboard = async () => {
    if (leaderboardOpen) {
      setLeaderboardOpen(false);
      return;
    }
    setLeaderboardOpen(true);
    setLeaderboardBusy(true);
    setLeaderboardError("");
    try {
      setLeaderboards(await api("/community/leaderboards"));
    } catch (error) {
      setLeaderboardError(error.message);
    } finally {
      setLeaderboardBusy(false);
    }
  };
  const messagesRef = useRef(null);
  const firstLoadRef = useRef(true);
  useEffect(() => {
    let active = true;
    const loadLatest = async (initial = false) => {
      try {
        const result = await api("/community/messages?limit=50");
        if (!active) return;
        setRoom(result.room);
        setMessages((current) =>
          initial
            ? result.messages
            : mergeCommunityMessages(current, result.messages),
        );
        setHasMore((current) =>
          initial ? result.hasMore : current || result.hasMore,
        );
        if (initial) setBefore(result.nextBefore || "");
        setChatError("");
      } catch (error) {
        if (active) setChatError(error.message);
      } finally {
        if (active && initial) setLoading(false);
      }
    };
    loadLatest(true);
    const timer = window.setInterval(() => loadLatest(false), 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!firstLoadRef.current || loading || !messages.length) return;
    const element = messagesRef.current;
    if (element) element.scrollTop = element.scrollHeight;
    firstLoadRef.current = false;
  }, [loading, messages.length]);
  const refresh = async () => {
    setRefreshing(true);
    try {
      const result = await api("/community/messages?limit=50");
      setRoom(result.room);
      setMessages((current) =>
        mergeCommunityMessages(current, result.messages),
      );
      setHasMore((current) => current || result.hasMore);
      if (!before) setBefore(result.nextBefore || "");
      setChatError("");
    } catch (error) {
      setChatError(error.message);
    } finally {
      setRefreshing(false);
    }
  };
  const loadOlder = async () => {
    if (!hasMore || !before || loadingMore) return;
    const element = messagesRef.current;
    const previousHeight = element?.scrollHeight || 0;
    const previousTop = element?.scrollTop || 0;
    setLoadingMore(true);
    try {
      const result = await api(
        `/community/messages?limit=50&before=${encodeURIComponent(before)}`,
      );
      setMessages((current) =>
        mergeCommunityMessages(result.messages, current),
      );
      setBefore(result.nextBefore || "");
      setHasMore(result.hasMore);
      setRoom(result.room);
      setChatError("");
      window.requestAnimationFrame(() => {
        if (element)
          element.scrollTop =
            element.scrollHeight - previousHeight + previousTop;
      });
    } catch (error) {
      setChatError(error.message);
    } finally {
      setLoadingMore(false);
    }
  };
  const chooseImage = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!supported.includes(file.type)) {
      setChatError("只支持 JPG、PNG、GIF 或 WebP 图片");
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setChatError("单张图片不能超过 6MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        setChatError("图片读取失败，请重试");
        return;
      }
      setAttachment({
        name: file.name,
        size: file.size,
        mimeType: file.type,
        data: dataUrl.slice(comma + 1),
        preview: dataUrl,
      });
      setChatError("");
    };
    reader.onerror = () => setChatError("图片读取失败，请重试");
    reader.readAsDataURL(file);
  };
  const send = async () => {
    const text = draft.trim();
    if (sending || (!text && !attachment)) return;
    setSending(true);
    try {
      const result = await api(
        "/community/messages",
        {
          ...(text ? { text } : {}),
          ...(attachment
            ? {
                image: { data: attachment.data, mimeType: attachment.mimeType },
              }
            : {}),
        },
        "POST",
      );
      setRoom(result.room);
      setMessages((current) =>
        mergeCommunityMessages(current, [result.message]),
      );
      setDraft("");
      setAttachment(null);
      setChatError("");
      window.requestAnimationFrame(() => {
        const element = messagesRef.current;
        if (element) element.scrollTop = element.scrollHeight;
      });
    } catch (error) {
      setChatError(error.message);
    } finally {
      setSending(false);
    }
  };
  return (
    <>
      <Heading
        title="考匠社区"
        subtitle="一个公共大群 · 不加好友 · 和所有正在努力的人交流"
      >
        <button onClick={openLeaderboard} aria-expanded={leaderboardOpen}>
          <ChartNoAxesCombined size={16} />
          排行榜
        </button>
        <button onClick={refresh} disabled={refreshing || loading}>
          <RefreshCw size={16} className={refreshing ? "spin" : ""} />
          刷新消息
        </button>
      </Heading>
      {leaderboardOpen && (
        <section className="community-leaderboards" aria-label="社区排行榜">
          <div
            className="community-leaderboard-tabs"
            role="tablist"
            aria-label="榜单类型"
          >
            {leaderboardTypes.map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={leaderboardTab === id}
                className={leaderboardTab === id ? "active" : ""}
                onClick={() => setLeaderboardTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="community-leaderboard-rule">
            {leaderboardTab === "accuracy"
              ? `至少作答 ${leaderboards?.accuracyMinAttempts ?? 20} 题参与正确率排行`
              : leaderboardTab === "streakDays"
                ? "按北京时间计算连续刷题天数；今天未刷时保留昨日连续记录"
                : leaderboardTab === "submitted"
                  ? "统计通过双重核验并提交到服务器的题目"
                  : "统计累计作答次数"}
          </p>
          {leaderboardBusy && (
            <ContentPlaceholder variant="list" rows={3} />
          )}
          {leaderboardError && (
            <p className="community-leaderboard-error" role="alert">
              {leaderboardError}
            </p>
          )}
          {!leaderboardBusy &&
            !leaderboardError &&
            !activeBoard?.top.length && (
              <p className="community-leaderboard-empty">
                这个榜单还没有记录，开始刷题吧。
              </p>
            )}
          {!!activeBoard?.top.length && (
            <ol className="community-leaderboard-list">
              {activeBoard.top.map((entry) => (
                <li
                  key={entry.userId}
                  className={entry.userId === currentUserId ? "own" : ""}
                >
                  <strong className="community-leaderboard-rank">
                    {entry.rank}
                  </strong>
                  <span>
                    {entry.name}
                    {entry.userId === currentUserId ? " · 我" : ""}
                  </span>
                  {leaderboardTab === "accuracy" && (
                    <small>
                      {entry.correct}/{entry.answered} 题正确
                    </small>
                  )}
                  <b>
                    {entry.value}
                    {leaderboardUnit}
                  </b>
                </li>
              ))}
            </ol>
          )}
          {activeBoard?.me && activeBoard.me.rank > activeBoard.top.length && (
            <div className="community-leaderboard-me">
              我的排名 #{activeBoard.me.rank} · {activeBoard.me.value}
              {leaderboardUnit}
            </div>
          )}
        </section>
      )}
      {chatError && (
        <div className="alert error" role="alert">
          <TriangleAlert size={18} />
          <span>{chatError}</span>
          <IconButton
            icon={X}
            label="关闭社区提示"
            onClick={() => setChatError("")}
          />
        </div>
      )}
      {room && (
        <section className="chat-room-summary">
          <div className="chat-room-icon">
            <Users size={23} />
          </div>
          <div className="chat-room-copy">
            <strong>{room.name}</strong>
            <p>{room.description}</p>
            <small>
              {room.memberCount} 位成员 · {room.messageCount} 条消息
            </small>
          </div>
          <div className="chat-room-storage">
            <span>公共存储</span>
            <strong>
              {formatCommunityBytes(room.storageUsedBytes)} /{" "}
              {formatCommunityBytes(room.storageLimitBytes)}
            </strong>
          </div>
        </section>
      )}
      <section className="community-chat-shell">
        <div className="community-chat-messages" ref={messagesRef}>
          {hasMore && (
            <button
              className="chat-load-more"
              onClick={loadOlder}
              disabled={loadingMore}
            >
              {loadingMore ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <ChevronDown size={15} />
              )}
              {loadingMore ? "正在加载" : "加载更早消息"}
            </button>
          )}
          {loading && !messages.length ? (
            <ContentPlaceholder variant="list" rows={4} />
          ) : messages.length ? (
            messages.map((message) => {
              const own = message.userId === currentUserId;
              return (
                <article
                  className={`chat-message-row ${own ? "own" : ""}`}
                  key={message.id}
                >
                  <div className="chat-message-block">
                    <div className="chat-author">
                      <strong>
                        {own ? "我" : message.authorName || "考匠用户"}
                      </strong>
                      <time>{formatCommunityTime(message.createdAt)}</time>
                    </div>
                    <div className={`chat-bubble ${own ? "own" : ""}`}>
                      {message.text && (
                        <p className="chat-text">{message.text}</p>
                      )}
                      {message.imageUrl && (
                        <img
                          className="chat-image"
                          src={message.imageUrl}
                          alt="社区图片"
                          loading="lazy"
                        />
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="chat-empty">
              <MessageCircle size={28} />
              <strong>社区还没有消息</strong>
              <span>发一条文字、Emoji 或图片，和大家打个招呼吧。</span>
            </div>
          )}
        </div>
        <div className="community-chat-composer">
          {attachment && (
            <div className="chat-attachment-preview">
              <img src={attachment.preview} alt={attachment.name} />
              <div>
                <strong>{attachment.name}</strong>
                <small>{formatCommunityBytes(attachment.size)}</small>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="移除图片"
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="chat-emoji-row" aria-label="常用 Emoji">
            {["😀", "👏", "💪", "📚", "🎉", "❤️"].map((emoji) => (
              <button
                type="button"
                className="chat-emoji-button"
                key={emoji}
                onClick={() => setDraft((value) => value + emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <div className="chat-input-row">
            <label className="chat-attach" title="发送图片">
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={chooseImage}
              />
              <FileText size={18} />
              <span>图片</span>
            </label>
            <textarea
              value={draft}
              maxLength={2000}
              placeholder="输入消息，Enter 发送，Shift + Enter 换行"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="primary chat-send"
              onClick={send}
              disabled={sending || (!draft.trim() && !attachment)}
            >
              {sending ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <ArrowRight size={17} />
              )}
              {sending ? "发送中" : "发送"}
            </button>
          </div>
          <div className="chat-composer-foot">
            <span>仅支持文字、Emoji 和图片 · 图片单张最大 6MB</span>
            <small>{draft.length} / 2000</small>
          </div>
        </div>
      </section>
    </>
  );
}
