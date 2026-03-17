import React from 'react';
import { getInitials, getAvatarColor } from './gitUtils';

export default function GitAvatar({ author, avatarUrl, size = 16, className }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={author}
        title={author}
        className={className}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  return (
    <div
      className={className}
      title={author}
      style={{ width: size, height: size, borderRadius: '50%', background: getAvatarColor(author), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(7, size * 0.4), fontWeight: 700, color: '#fff', flexShrink: 0, letterSpacing: '0.02em' }}
    >
      {getInitials(author)}
    </div>
  );
}
