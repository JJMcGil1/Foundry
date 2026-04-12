import React from 'react';
import { FiX } from 'react-icons/fi';
import styles from './PanelHeader.module.css';

export default function PanelHeader({
  title,
  icon: Icon,
  onClose,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  isDragOver,
  children,
}) {
  return (
    <div
      className={`${styles.header} ${isDragOver ? styles.headerDragOver : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={onDrop}
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
