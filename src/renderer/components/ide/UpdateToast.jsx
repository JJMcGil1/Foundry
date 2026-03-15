import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './UpdateToast.module.css';
import { FiDownload, FiX, FiAlertCircle, FiRefreshCw, FiLoader } from 'react-icons/fi';

const DEV_PREVIEW = false; // Set true to force-show in dev

export default function UpdateToast() {
  const [state, setState] = useState('idle');
  // idle | available | downloading | installing | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-install once download completes
  const autoInstall = useCallback(async () => {
    setState('installing');
    try {
      await window.foundry.updater.installUpdate();
    } catch {
      setState('error');
      setErrorMsg('Install failed');
    }
  }, []);

  useEffect(() => {
    if (!window.foundry?.updater) {
      if (DEV_PREVIEW) {
        setTimeout(() => {
          setUpdateInfo({ version: '1.1.0', releaseNotes: 'Bug fixes and improvements.' });
          setState('available');
        }, 2000);
      }
      return;
    }

    const unsubs = [];

    unsubs.push(window.foundry.updater.onUpdateAvailable((info) => {
      setUpdateInfo(info);
      setState('available');
    }));

    unsubs.push(window.foundry.updater.onDownloadProgress(({ percent }) => {
      setProgress(percent || 0);
    }));

    unsubs.push(window.foundry.updater.onUpdateDownloaded(() => {
      // Auto-install immediately — no user action needed
      autoInstall();
    }));

    unsubs.push(window.foundry.updater.onUpdateError(({ message }) => {
      setErrorMsg(message || 'Update failed');
      setState('error');
    }));

    return () => unsubs.forEach(fn => fn && fn());
  }, [autoInstall]);

  const handleDownload = useCallback(async () => {
    setState('downloading');
    setProgress(0);
    try {
      await window.foundry.updater.downloadUpdate();
    } catch {
      setState('error');
      setErrorMsg('Download failed');
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setState('idle');
    if (window.foundry?.updater?.dismissUpdate) {
      window.foundry.updater.dismissUpdate();
    }
  }, []);

  const handleRetry = useCallback(() => {
    setErrorMsg('');
    setState('available');
  }, []);

  // Escape key dismissal
  useEffect(() => {
    if (state === 'idle' || state === 'installing') return;
    const handler = (e) => {
      if (e.key === 'Escape') handleDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state, handleDismiss]);

  if (state === 'idle') return null;

  const toast = (
    <div className={styles.overlay}>
      <div className={`${styles.toast} ${state === 'error' ? styles.toastError : ''}`}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.icon}>
            {state === 'error' ? <FiAlertCircle size={14} /> :
             state === 'installing' ? <FiLoader size={14} className={styles.spin} /> :
             state === 'downloading' ? <FiLoader size={14} className={styles.spin} /> :
             <FiDownload size={14} />}
          </div>
          <div className={styles.title}>
            {state === 'available' && `Update Available — v${updateInfo?.version}`}
            {state === 'downloading' && `Downloading v${updateInfo?.version}...`}
            {state === 'installing' && `Installing v${updateInfo?.version}...`}
            {state === 'error' && 'Update Error'}
          </div>
          {state !== 'installing' && state !== 'downloading' && (
            <button className={styles.close} onClick={handleDismiss} title="Dismiss">
              <FiX size={14} />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {state === 'downloading' && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            </div>
            <div className={styles.progressMeta}>
              <span className={styles.progressText}>{progress}%</span>
            </div>
          </div>
        )}

        {/* Installing state — just a subtle message */}
        {state === 'installing' && (
          <div className={styles.progressWrap}>
            <span className={styles.progressText}>Restarting Foundry...</span>
          </div>
        )}

        {/* Error body */}
        {state === 'error' && (
          <div className={styles.errorBody}>{errorMsg}</div>
        )}

        {/* Actions */}
        {(state === 'available' || state === 'error') && (
          <div className={styles.actions}>
            {state === 'available' && (
              <>
                <button className={styles.btnSecondary} onClick={handleDismiss}>Later</button>
                <button className={styles.btnPrimary} onClick={handleDownload}>
                  <FiDownload size={13} /> Download
                </button>
              </>
            )}
            {state === 'error' && (
              <>
                <button className={styles.btnSecondary} onClick={handleDismiss}>Dismiss</button>
                <button className={styles.btnPrimary} onClick={handleRetry}>
                  <FiRefreshCw size={13} /> Retry
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(toast, document.body);
}
