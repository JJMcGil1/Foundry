import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import GitAvatar from './GitAvatar';
import { parseRefs, formatFullDate } from './gitUtils';
import styles from '../Sidebar.module.css';

export default function CommitHoverCard({ row, avatarUrl, style, onMouseEnter, onMouseLeave, laneColor, remoteUrl }) {
  const { branches, tags } = parseRefs(row.refs);
  const filesChanged = row.filesChanged || 0;
  const insertions = row.insertions || 0;
  const deletions = row.deletions || 0;
  const [copied, setCopied] = useState(false);

  const handleCopyHash = useCallback((e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(row.hash).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }, [row.hash]);

  const handleViewOnGitHub = useCallback((e) => {
    e.stopPropagation();
    if (remoteUrl) {
      window.foundry?.openExternal(`${remoteUrl}/commit/${row.hash}`);
    }
  }, [remoteUrl, row.hash]);

  return (
    <motion.div
      className={styles.commitCard}
      style={style}
      initial={{ opacity: 0, x: -8, scale: 0.98 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.commitCardHeader}>
        <span className={`${styles.commitCardHash} ${copied ? styles.commitCardHashCopied : ''}`} onClick={handleCopyHash} title="Click to copy full hash">
          {copied ? (
            <>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/></svg>
              Copied!
            </>
          ) : (
            <>
              {row.short}
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className={styles.commitCardCopyIcon}><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25ZM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
            </>
          )}
        </span>
        <span className={styles.commitCardDate}>{row.date}</span>
        {row.isoDate && <span className={styles.commitCardFullDate}>({formatFullDate(row.isoDate)})</span>}
      </div>
      {remoteUrl && (
        <button className={styles.commitCardGitHubLink} onClick={handleViewOnGitHub} title="View on GitHub">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>
          View on GitHub
        </button>
      )}
      {(branches.length > 0 || tags.length > 0) && (
        <div className={styles.commitCardRefs}>
          {branches.map(b => (
            <span key={b} className={`${styles.refBadge} ${styles.refBranch}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.492 2.492 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Z"/></svg>
              {b}
            </span>
          ))}
          {tags.map(t => (
            <span key={t} className={`${styles.refBadge} ${styles.refTag}`}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775ZM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z"/></svg>
              {t}
            </span>
          ))}
        </div>
      )}
      <div className={styles.commitCardMessage}>{row.message}</div>
      <div className={styles.commitCardFooter}>
        <div className={styles.commitCardAuthor}>
          <GitAvatar author={row.author} avatarUrl={avatarUrl} size={20} />
          <span className={styles.commitCardAuthorName}>{row.author}</span>
        </div>
        <div className={styles.commitCardStats}>
          <span className={styles.commitCardFiles}>{filesChanged} file{filesChanged !== 1 ? 's' : ''}</span>
          <span className={styles.commitCardIns}>+{insertions}</span>
          <span className={styles.commitCardDel}>-{deletions}</span>
        </div>
      </div>
    </motion.div>
  );
}
