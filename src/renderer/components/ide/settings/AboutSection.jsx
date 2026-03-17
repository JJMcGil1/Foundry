import React, { useState } from 'react';
import { FiCheck, FiLoader, FiRefreshCw, FiDownload } from 'react-icons/fi';
import styles from '../SettingsPage.module.css';

export default function AboutSection() {
  const [updateStatus, setUpdateStatus] = useState('idle');
  // idle | checking | upToDate | updateAvailable
  const appVersion = window.foundry?.version || '1.0.0';

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    try {
      if (window.foundry?.updater?.checkForUpdates) {
        // Race against a 15s timeout so the UI never gets stuck
        const result = await Promise.race([
          window.foundry.updater.checkForUpdates(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ]);
        if (result?.update) {
          setUpdateStatus('updateAvailable');
        } else if (result?.error) {
          console.warn('[updater] Check error:', result.error);
          setUpdateStatus('upToDate');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        } else {
          setUpdateStatus('upToDate');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        }
      } else {
        setUpdateStatus('upToDate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }
    } catch (err) {
      console.warn('[updater] Check failed:', err);
      setUpdateStatus('idle');
    }
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>About Foundry</h3>
      <p className={styles.sectionDesc}>Version and update information</p>

      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <label className={styles.fieldLabel}>Version</label>
            <p style={{ color: 'var(--zinc-400)', fontSize: 13, marginTop: 4 }}>
              Foundry v{appVersion}
            </p>
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking'}
            style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {updateStatus === 'checking' && <><FiLoader className={styles.spin} size={14} /> Checking...</>}
            {updateStatus === 'upToDate' && <><FiCheck size={14} /> Up to date</>}
            {updateStatus === 'updateAvailable' && <><FiDownload size={14} /> Update found!</>}
            {updateStatus === 'idle' && <><FiRefreshCw size={14} /> Check for updates</>}
          </button>
        </div>
      </div>
    </div>
  );
}
