import React, { useState } from 'react';
import { SECTIONS } from './settingsUtils';
import AccountSection from './AccountSection';
import ProvidersSection from './ProvidersSection';
import GitHubSection from './GitHubSection';
import AppearanceSection from './AppearanceSection';
import AboutSection from './AboutSection';
import styles from '../SettingsPage.module.css';

export default function SettingsPage({ profile, onClose, onProfileChange, onCloneRepo }) {
  const [activeSection, setActiveSection] = useState('account');
  const [theme, setTheme] = useState(profile?.theme || 'dark');

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    await window.foundry?.updateProfile({ theme: newTheme });
    if (onProfileChange) await onProfileChange();
  };

  return (
    <div className={styles.root}>
      <div className={styles.layout}>
        <div className={styles.nav}>
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <Icon size={16} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.content}>
          {activeSection === 'account' && (
            <AccountSection profile={profile} onProfileChange={onProfileChange} />
          )}

          {activeSection === 'providers' && (
            <ProvidersSection isActive={activeSection === 'providers'} />
          )}

          {activeSection === 'github' && (
            <GitHubSection onCloneRepo={onCloneRepo} />
          )}

          {activeSection === 'appearance' && (
            <AppearanceSection theme={theme} onThemeChange={handleThemeChange} />
          )}

          {activeSection === 'about' && (
            <AboutSection />
          )}
        </div>
      </div>
    </div>
  );
}
