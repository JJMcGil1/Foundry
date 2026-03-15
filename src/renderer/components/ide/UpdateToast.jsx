import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './UpdateToast.module.css';
import { FiDownload, FiX, FiCheck, FiAlertCircle, FiRefreshCw, FiLoader } from 'react-icons/fi';

const DEV_PREVIEW = false; // Set true to force-show in dev

export default function UpdateToast() {
  const [state, setState] = useState('idle');
  // idle | available | downloading | downloaded | installing | error
  const [updateInfo, setUpdateInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!window.foundry?.updater) {
      if (DEV_PREVIEW) {
        // Mock for dev preview
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
      setState('downloaded');
    }));

    unsubs.push(window.foundry.updater.onUpdateError(({ message }) => {
      setErrorMsg(message || 'Update failed');
      setState('error');
    }));

    return () => unsubs.forEach(fn => fn && fn());
  }, []);

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

  const handleInstall = useCallback(async () => {
    setState('installing');
    try {
      await window.foundry.updater.installUpdate();
    } catch {
      setState('error');
      setErrorMsg('Install failed');
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
    if (state === 'idle') return;
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
            {state === 'error' ? <FiAlertCircle /> :
             state === 'installing' ? <FiLoader className={styles.spin} /> :
             state === 'downloaded' ? <FiCheck /> :
             <FiDownload />}
          </div>
          <div className={styles.title}>
            {state === 'available' && `Update Available — v${updateInfo?.version}`}
            {state === 'downloading' && `Downloading v${updateInfo?.version}...`}
            {state === 'downloaded' && `Ready to Install v${updateInfo?.version}`}
            {state === 'installing' && 'Installing...'}
            {state === 'error' && 'Update Error'}
          </div>
          {state !== 'installing' && (
            <button className={styles.close} onClick={handleDismiss} title="Later">
              <FiX />
            </button>
          )}
        </div>

        {/* Progress bar */}
        {state === 'downloading' && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            <span className={styles.progressText}>{progress}%</span>
          </div>
        )}

        {/* Body */}
        {state === 'error' && (
          <div className={styles.errorBody}>{errorMsg}</div>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {state === 'available' && (
            <>
              <button className={styles.btnSecondary} onClick={handleDismiss}>Later</button>
              <button className={styles.btnPrimary} onClick={handleDownload}>
                <FiDownload size={14} /> Download
              </button>
            </>
          )}
          {state === 'downloaded' && (
            <>
              <button className={styles.btnSecondary} onClick={handleDismiss}>Later</button>
              <button className={styles.btnPrimary} onClick={handleInstall}>
                <FiCheck size={14} /> Install & Restart
              </button>
            </>
          )}
          {state === 'error' && (
            <>
              <button className={styles.btnSecondary} onClick={handleDismiss}>Later</button>
              <button className={styles.btnPrimary} onClick={handleRetry}>
                <FiRefreshCw size={14} /> Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(toast, document.body);
}
