import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageSquare, FiChevronDown, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { TbLayoutColumns } from 'react-icons/tb';
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
  onSplit,
  onClosePanel,
  panelCount = 1,
}) {
  return (
    <div className={styles.header}>
      <FiMessageSquare size={13} />
      <div className={styles.threadSelector} ref={threadListRef}>
        <button
          className={styles.threadSelectorBtn}
          onClick={() => setShowThreadList(v => !v)}
          title="Switch chat thread"
        >
          <span className={styles.threadTitle}>{currentThreadTitle}</span>
          <FiChevronDown
            size={10}
            className={`${styles.threadChevron} ${showThreadList ? styles.threadChevronOpen : ''}`}
          />
        </button>
        <AnimatePresence>
          {showThreadList && (
            <motion.div
              className={styles.threadDropdown}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              <button
                className={styles.threadNewBtn}
                onClick={() => onNewChat(true)}
              >
                <FiPlus size={12} />
                <span>New Chat</span>
              </button>
              {threads.length > 0 && <div className={styles.threadDivider} />}
              <div className={styles.threadListScroll}>
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
        </AnimatePresence>
      </div>
      <button
        className={styles.newChatBtn}
        onClick={() => onNewChat(false)}
        title="New chat"
      >
        <FiPlus size={14} />
      </button>
      {onSplit && panelCount < 4 && (
        <button
          className={styles.newChatBtn}
          onClick={onSplit}
          title="Split chat panel"
        >
          <TbLayoutColumns size={14} />
        </button>
      )}
      {onClosePanel && panelCount > 1 && (
        <button
          className={`${styles.newChatBtn} ${styles.closePanelBtn}`}
          onClick={onClosePanel}
          title="Close this panel"
        >
          <FiX size={14} />
        </button>
      )}
    </div>
  );
}
