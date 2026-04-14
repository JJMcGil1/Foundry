import React, { useRef, useEffect } from 'react';
import { FiX } from 'react-icons/fi';
import styles from './PanelHeader.module.css';

export default function PanelHeader({
  title,
  icon: Icon,
  onClose,
  onMouseDown,
  children,
}) {
  const headerRef = useRef(null);
  useEffect(() => {
    if (headerRef.current) {
      const rect = headerRef.current.getBoundingClientRect();
      const computed = window.getComputedStyle(headerRef.current);
      console.log(`[PanelHeader] "${title}" — rect.height: ${rect.height}px, computed.height: ${computed.height}, computed.minHeight: ${computed.minHeight}, parent.className: ${headerRef.current.parentElement?.className?.slice(0, 60)}`);
    }
  });

  return (
    <div
      ref={headerRef}
      className={styles.header}
      onMouseDown={onMouseDown}
    >
      <div className={styles.left}>
        <div className={styles.dragGrip}>
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
          <span className={styles.gripDot} />
        </div>
        {Icon && <Icon size={13} className={styles.icon} />}
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.actions}>
        {children}
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} title="Close panel">
            <FiX size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
