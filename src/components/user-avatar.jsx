import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import "./user-avatar.css";

export function UserAvatar({ url, className = "" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return (
    <span className={`user-avatar ${className}`} aria-hidden="true">
      {url && !failed ? (
        <img src={url} alt="" onError={() => setFailed(true)} />
      ) : (
        <UserRound />
      )}
    </span>
  );
}
