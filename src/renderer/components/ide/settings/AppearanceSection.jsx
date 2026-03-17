import React from 'react';
import { FiMoon, FiSun, FiMonitor, FiCheck } from 'react-icons/fi';
import styles from '../SettingsPage.module.css';

export default function AppearanceSection({ theme, onThemeChange }) {
  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>Appearance</h3>
      <p className={styles.sectionDesc}>Customize how Foundry looks</p>

      <div className={styles.card}>
        <label className={styles.fieldLabel}>Theme</label>
        <div className={styles.themeGrid}>
          {[
            { id: 'dark', label: 'Dark', icon: FiMoon, bg: '#09090B', fg: '#E4E4E7' },
            { id: 'light', label: 'Light', icon: FiSun, bg: '#FAFAFA', fg: '#18181B' },
            { id: 'system', label: 'System', icon: FiMonitor, bg: '#09090B', fg: '#E4E4E7' },
          ].map(t => {
            const Icon = t.icon;
            const selected = theme === t.id;
            return (
              <button
                key={t.id}
                className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ''}`}
                onClick={() => onThemeChange(t.id)}
              >
                <div className={styles.themePreview} style={{ background: t.bg }}>
                  <div className={styles.themePreviewBar} style={{ background: t.fg, opacity: 0.15 }} />
                  <div className={styles.themePreviewLine} style={{ background: t.fg, opacity: 0.1 }} />
                </div>
                <div className={styles.themeLabel}>
                  <Icon size={14} />
                  <span>{t.label}</span>
                </div>
                {selected && (
                  <div className={styles.themeCheck}>
                    <FiCheck size={12} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
