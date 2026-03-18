import React, { useMemo, useState, useRef, useEffect } from 'react';
import { FiUser, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import styles from './UserMessage.module.css';

const COLLAPSED_HEIGHT = 100; // px – roughly ~4 lines at 13px/1.6

// Cache profile across all UserMessage instances
let cachedProfile = null;
let profilePromise = null;

function loadProfile() {
  if (cachedProfile) return Promise.resolve(cachedProfile);
  if (!profilePromise) {
    profilePromise = window.foundry?.getProfile?.()
      .then(p => { cachedProfile = p; return p; })
      .catch(() => null);
  }
  return profilePromise;
}

export default function UserMessage({ msg }) {
  const [expanded, setExpanded] = useState(false);
  const [needsTruncation, setNeedsTruncation] = useState(false);
  const [profile, setProfile] = useState(cachedProfile);
  const contentRef = useRef(null);

  // Generate data URLs for stored images (base64 in DB) — memoize to avoid re-creation
  const imageUrls = useMemo(() => {
    if (!msg.images || msg.images.length === 0) return [];
    return msg.images.map(img => ({
      id: img.id,
      url: img.preview || `data:${img.mediaType};base64,${img.base64}`,
      name: img.name,
    }));
  }, [msg.images]);

  useEffect(() => {
    if (!cachedProfile) {
      loadProfile().then(p => p && setProfile(p));
    }
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setNeedsTruncation(contentRef.current.scrollHeight > COLLAPSED_HEIGHT);
    }
  }, [msg.content]);

  const initials = profile
    ? `${(profile.first_name || '')[0] || ''}${(profile.last_name || '')[0] || ''}`.toUpperCase()
    : '';

  return (
    <div className={styles.message}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          {profile?.profile_photo_data ? (
            <img src={profile.profile_photo_data} alt="" className={styles.avatarImg} />
          ) : initials ? (
            <span className={styles.avatarInitials}>{initials}</span>
          ) : (
            <FiUser size={12} />
          )}
        </div>
        <span className={styles.role}>You</span>
        {msg.timestamp && (
          <span className={styles.time}>{msg.timestamp}</span>
        )}
      </div>
      <div className={styles.bubble}>
        {imageUrls.length > 0 && (
          <div className={styles.imageStrip}>
            {imageUrls.map(img => (
              <div key={img.id} className={styles.imageThumb}>
                <img src={img.url} alt={img.name || 'Attached image'} className={styles.imageThumbImg} />
              </div>
            ))}
          </div>
        )}
        {msg.content && (
          <div
            ref={contentRef}
            className={`${styles.content} ${needsTruncation && !expanded ? styles.contentCollapsed : ''}`}
            style={needsTruncation && !expanded ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
          >
            {msg.content}
          </div>
        )}
        {needsTruncation && (
          <button
            className={styles.showMoreBtn}
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? <FiChevronUp size={12} /> : <FiChevronDown size={12} />}
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
        <div className={styles.tail} />
      </div>
    </div>
  );
}
