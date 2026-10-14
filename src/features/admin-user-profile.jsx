import { useEffect, useState } from 'react';
import './admin-user-profile.css';

export function AdminUserIdentity({ user }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatarUrl]);
  const name = user.communityName || '未设置昵称';
  return <div className="admin-user-identity">
    {user.avatarUrl && !failed
      ? <img className="admin-user-avatar" src={user.avatarUrl} alt={`${name}的头像`} onError={() => setFailed(true)} />
      : <span className="admin-user-avatar admin-user-avatar-fallback" aria-hidden="true">{(user.communityName || user.username || '?').slice(0, 1)}</span>}
    <div><strong>{name}</strong><small>{user.username}{user.isAdmin ? ' · 管理员' : ''}</small></div>
  </div>;
}
