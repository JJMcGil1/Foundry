import React from 'react';
import { FiGitBranch, FiCheck, FiAlertCircle } from 'react-icons/fi';
import styles from './StatusBar.module.css';

export default function StatusBar({ project, gitStatus, activeTab, tabs }) {
  const currentTab = tabs?.find(t => t.path === activeTab);

  const getLineInfo = () => {
    if (!currentTab?.content) return '';
    const lines = currentTab.content.split('\n').length;
    return `${lines} lines`;
  };

  return (
    <div className={styles.bar}>
      <div className={styles.left}>
        {gitStatus?.isRepo && (
          <div className={styles.item}>
            <FiGitBranch size={12} />
            <span>{gitStatus.branch || 'HEAD'}</span>
          </div>
        )}
        {gitStatus?.isRepo && gitStatus.files.length > 0 && (
          <div className={styles.item}>
            <FiAlertCircle size={12} />
            <span>{gitStatus.files.length} change{gitStatus.files.length !== 1 ? 's' : ''}</span>
          </div>
        )}
        {gitStatus?.isRepo && gitStatus.files.length === 0 && (
          <div className={styles.item}>
            <FiCheck size={12} />
            <span>Clean</span>
          </div>
        )}
      </div>
      <div className={styles.right}>
        {currentTab && (
          <>
            <div className={styles.item}>
              <span>{getLineInfo()}</span>
            </div>
            <div className={styles.item}>
              <span>{currentTab.language}</span>
            </div>
            <div className={styles.item}>
              <span>UTF-8</span>
            </div>
          </>
        )}
        <div className={styles.item}>
          <span>Foundry v{window.foundry?.version || '1.0.0'}</span>
        </div>
      </div>
    </div>
  );
}
