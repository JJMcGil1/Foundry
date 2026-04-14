import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiClock, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import PanelHeader from '../PanelHeader';
import styles from './ChatHeader.module.css';

export default function ChatHeader({
  threads,
  currentThreadId,
  currentThreadTitle,
  showThreadList,
  setShowThreadList,
  switchToThread,
  handleDeleteThread,
  onNewChat,
  threadListRef,
  panelDragProps,
  onPanelClose,
}) {
  const historyBtnRef = useRef(null);

  // Calculate dropdown position anchored to history button
  const getDropdownPosition = () => {
    if (!historyBtnRef.current) return { top: 0, left: 0 };
    const rect = historyBtnRef.current.getBoundingClientRect();
    return {
      top: rect.bottom + 6,
      left: Math.max(8, rect.left - 100),
    };
  };

  const dropdownPos = getDropdownPosition();

  return (
    <>
      <PanelHeader
        title={currentThreadTitle}
        icon={FiMessageSquare}
        onClose={onPanelClose}
        onMouseDown={panelDragProps?.onMouseDown}
      >
        <div ref={threadListRef} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            ref={historyBtnRef}
            className={`${styles.actionBtn} ${showThreadList ? styles.actionBtnActive : ''}`}
            onClick={() => setShowThreadList(v => !v)}
            title="Chat history"
          >
            <FiClock size={13} />
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => onNewChat(false)}
            title="New chat"
          >
            <FiPlus size={13} />
          </button>
        </div>
      </PanelHeader>

      {createPortal(
        <AnimatePresence>
          {showThreadList && (
            <motion.div
              className={styles.threadDropdown}
              data-thread-dropdown="true"
              style={{ top: dropdownPos.top, left: dropdownPos.left }}
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={styles.dropdownHeader}>
                <span className={styles.dropdownTitle}>Chat History</span>
                <button
                  className={styles.dropdownNewBtn}
                  onClick={() => onNewChat(true)}
                >
                  <FiPlus size={12} />
                  <span>New</span>
                </button>
              </div>
              <div className={styles.threadDivider} />
              <div className={styles.threadListScroll}>
                {threads.length === 0 && (
                  <div className={styles.emptyState}>No conversations yet</div>
                )}
                {threads.map(thread => (
                  <button
                    key={thread.id}
                    className={`${styles.threadItem} ${thread.id === currentThreadId ? styles.threadItemActive : ''}`}
                    onClick={() => switchToThread(thread.id)}
                  >
                    <FiMessageSquare size={11} className={styles.threadItemIcon} />
                    <span className={styles.threadItemTitle}>
                      {thread.title || 'Untitled'}
                    </span>
                    <span className={styles.threadItemCount}>
                      {thread.message_count || 0}
                    </span>
                    <button
                      className={styles.threadDeleteBtn}
                      onClick={(e) => handleDeleteThread(thread.id, e)}
                      title="Delete thread"
                    >
                      <FiTrash2 size={10} />
                    </button>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
