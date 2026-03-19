import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';
import styles from './Toast.module.css';
import notificationSoundUrl from '@/assets/sounds/notification.wav';

const ToastContext = createContext(null);

let toastId = 0;

// Notification sound — plays bundled audio file

const _notificationAudio = new Audio(notificationSoundUrl);
_notificationAudio.volume = 0.5;

function playNotificationSound() {
  try {
    _notificationAudio.currentTime = 0;
    _notificationAudio.play().catch(() => {});
  } catch {
    // Audio not available — silent fallback
  }
}

const ICONS = {
  success: <FiCheck size={14} />,
  error: <FiAlertCircle size={14} />,
  info: <FiInfo size={14} />,
};

const AUTO_DISMISS_MS = 4000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    delete timersRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback(({ message, type = 'info', duration = AUTO_DISMISS_MS, sound = true }) => {
    const id = ++toastId;
    setToasts(prev => [...prev, { id, message, type }]);

    if (sound) playNotificationSound();

    if (duration > 0) {
      timersRef.current[id] = setTimeout(() => dismiss(id), duration);
    }

    return id;
  }, [dismiss]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => Object.values(timersRef.current).forEach(clearTimeout);
  }, []);

  const portal = createPortal(
    <div className={styles.container}>
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.type] || ''}`}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            layout
          >
            <div className={styles.icon}>
              {ICONS[toast.type] || ICONS.info}
            </div>
            <div className={styles.message}>{toast.message}</div>
            <button className={styles.close} onClick={() => dismiss(toast.id)}>
              <FiX size={13} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      {portal}
    </ToastContext.Provider>
  );
}
