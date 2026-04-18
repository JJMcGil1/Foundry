import React from 'react';
import { LuLayoutDashboard } from 'react-icons/lu';
import PanelHeader from './PanelHeader';
import styles from './DashboardPanel.module.css';

export default function DashboardPanel({ onClose, panelDragProps }) {
  return (
    <div className={styles.root}>
      <PanelHeader
        title="Dashboard"
        icon={LuLayoutDashboard}
        onClose={onClose}
        onMouseDown={panelDragProps?.onMouseDown}
      />
      <div className={styles.content}>
        <LuLayoutDashboard size={48} className={styles.heroIcon} />
        <h2 className={styles.title}>Dashboard</h2>
        <p className={styles.subtitle}>Your dashboard page will live here.</p>
      </div>
    </div>
  );
}
