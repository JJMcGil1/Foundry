import React, { useMemo } from 'react';
import { FiUser } from 'react-icons/fi';
import styles from './UserMessage.module.css';

export default function UserMessage({ msg }) {
  // Generate data URLs for stored images (base64 in DB) — memoize to avoid re-creation
  const imageUrls = useMemo(() => {
    if (!msg.images || msg.images.length === 0) return [];
    return msg.images.map(img => ({
      id: img.id,
      url: img.preview || `data:${img.mediaType};base64,${img.base64}`,
      name: img.name,
    }));
  }, [msg.images]);

  return (
    <div className={styles.message}>
      <div className={styles.header}>
        <div className={styles.avatar}>
          <FiUser size={12} />
        </div>
        <span className={styles.role}>You</span>
        {msg.timestamp && (
          <span className={styles.time}>{msg.timestamp}</span>
        )}
      </div>
      {imageUrls.length > 0 && (
        <div className={styles.imageStrip}>
          {imageUrls.map(img => (
            <div key={img.id} className={styles.imageThumb}>
              <img src={img.url} alt={img.name || 'Attached image'} className={styles.imageThumbImg} />
            </div>
          ))}
        </div>
      )}
      {msg.content && <div className={styles.content}>{msg.content}</div>}
    </div>
  );
}
