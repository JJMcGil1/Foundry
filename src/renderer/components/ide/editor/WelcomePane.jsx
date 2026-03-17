import React from 'react';
import { FiFolder } from 'react-icons/fi';
import styles from '../EditorArea.module.css';
import foundryIconDark from '../../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../../assets/foundry-icon-light.svg';

export default function WelcomePane({ onOpenFolder, project }) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const iconSrc = isDark ? foundryIconDark : foundryIconLight;
  const hasProject = !!project;

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeGlow} />
      <div className={styles.welcomeContent}>
        <img src={iconSrc} alt="Foundry" className={styles.welcomeLogo} draggable={false} />
        {hasProject ? (
          <>
            <h2 className={styles.welcomeTitle}>{project.name || 'Project'}</h2>
            <p className={styles.welcomeDesc}>Open a file from the sidebar to get started</p>
            <div className={styles.welcomeShortcuts}>
              <div className={styles.shortcutRow}>
                <kbd className={styles.kbd}>&#8984; P</kbd>
                <span className={styles.shortcutLabel}>Quick open file</span>
              </div>
              <div className={styles.shortcutRow}>
                <kbd className={styles.kbd}>&#8984; B</kbd>
                <span className={styles.shortcutLabel}>Toggle sidebar</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.welcomeTitle}>Foundry</h2>
            <p className={styles.welcomeDesc}>Start building something great</p>
            <button className={styles.welcomeBtn} onClick={onOpenFolder}>
              <FiFolder size={15} />
              Open Project
            </button>
          </>
        )}
      </div>
    </div>
  );
}
