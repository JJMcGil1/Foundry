import React, { useState } from 'react';
import { TbX, TbChartBar, TbList } from 'react-icons/tb';
import DoneZoPanel from './sidebar/DoneZoPanel';
import styles from './DoneZoPage.module.css';

export default function DoneZoPage({ projectPath, onClose }) {
  const [view, setView] = useState('dashboard');

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.title}>DoneZo</span>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${view === 'dashboard' ? styles.tabActive : ''}`}
            onClick={() => setView('dashboard')}
          >
            <TbChartBar size={13} />
            Dashboard
          </button>
          <button
            className={`${styles.tab} ${view === 'log' ? styles.tabActive : ''}`}
            onClick={() => setView('log')}
          >
            <TbList size={13} />
            Log
          </button>
        </div>

        <button className={styles.closeBtn} onClick={onClose} title="Close DoneZo">
          <TbX size={16} />
        </button>
      </div>

      <div className={styles.body}>
        <DoneZoPanel projectPath={projectPath} fullPage view={view} onViewChange={setView} />
      </div>
    </div>
  );
}
