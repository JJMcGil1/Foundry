import React from 'react';
import { FiPlus, FiMinus, FiRotateCcw } from 'react-icons/fi';
import { motion } from 'framer-motion';
import FileIcon from '../FileIcon';
import styles from '../Sidebar.module.css';

export default function ChangeItem({ f, index = 0, onOpen, onStage, onUnstage, onDiscard, staged, statusColor, isActive }) {
  const fileName = f.path.split('/').pop();
  const dirPath = f.path.split('/').slice(0, -1).join('/');
  // Stagger enter only — exits fire together so multi-file ops feel unified
  const enterDelay = Math.min(index, 6) * 0.035;
  return (
    <motion.div
      key={f.path}
      initial={{ opacity: 0, y: -7 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1], delay: enterDelay } }}
      exit={{ opacity: 0, y: 5, transition: { duration: 0.22, ease: [0.4, 0, 0.8, 1] } }}
      className={`${styles.changeItem} ${isActive ? styles.changeItemActive : ''}`}
      onClick={() => onOpen(f.path)}
    >
      <FileIcon name={fileName} type="file" size={14} />
      <span className={styles.changeFileName}>{fileName}</span>
      {dirPath && <span className={styles.changeDirPath}>{dirPath}</span>}
      <div className={styles.changeActions}>
        {staged ? (
          <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onUnstage(f.path); }} title="Unstage">
            <FiMinus size={13} />
          </button>
        ) : (
          <>
            <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onDiscard(f.path); }} title="Discard Changes">
              <FiRotateCcw size={13} />
            </button>
            <button className={styles.changeActionBtn} onClick={(e) => { e.stopPropagation(); onStage(f.path); }} title="Stage">
              <FiPlus size={13} />
            </button>
          </>
        )}
      </div>
      <span className={styles.changeLabel} style={{ color: statusColor(f.status) }}>{f.status}</span>
    </motion.div>
  );
}
