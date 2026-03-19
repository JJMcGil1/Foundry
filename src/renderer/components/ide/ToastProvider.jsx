import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck, FiAlertCircle, FiInfo, FiX } from 'react-icons/fi';
import styles from './Toast.module.css';
import notificationSoundUrl from '@/assets/sounds/notification.wav';

const ToastContext = createContext(null);

let toastId = 0;

// Notification sound — singleton Audio instance
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
  success: <FiCheck size={12} strokeWidth={2.5} />,
  error: <FiAlertCircle size={12} strokeWidth={2.5} />,
  info: <FiInfo size={12} strokeWidth={2.5} />,
};

const AUTO_DISMISS_MS = 4000;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ── Individual toast with progress bar ──
function Toast({ toast, dismiss, index, total }) {
  const progressRef = useRef(null);

  useEffect(() => {
    const el = progressRef.current;
    if (!el) return;

    // Force a reflow so the browser registers the initial state
    el.getBoundingClientRect();

    // Animate from full width to zero over the dismiss duration
    requestAnimationFrame(() => {
      el.style.transition = `transform ${toast.duration}ms linear`;
      el.style.transform = 'scaleX(0)';
    });
  }, [toast.duration]);

  // Stacking depth — older toasts get slightly smaller and pushed down
  const depth = total - 1 - index;
  const scale = depth > 0 ? 1 - depth * 0.03 : 1;
  const translateY = depth > 0 ? depth * 4 : 0;

  return (
    <motion.div
      className={`${styles.toast} ${styles[toast.type] || ''}`}
      initial={{ opacity: 0, x: 80, scale: 0.96, filter: 'blur(4px)' }}
      animate={{
        opacity: 1,
        x: 0,
        y: translateY,
        scale,
        filter: 'blur(0px)',
      }}
      exit={{ opacity: 0, x: 80, scale: 0.96, filter: 'blur(4px)' }}
      transition={{
        duration: 0.4,
        ease: [0.16, 1, 0.3, 1],
      }}
      layout
      style={{ zIndex: 1000 - depth }}
    >
      <div className={styles.icon}>
        {ICONS[toast.type] || ICONS.info}
      </div>
      <div className={styles.message}>{toast.message}</div>
      <button className={styles.close} onClick={() => dismiss(toast.id)}>
        <FiX size={12} />
      </button>

      {/* Auto-dismiss progress bar */}
      {toast.duration > 0 && (
        <div className={styles.progressTrack}>
          <div
            ref={progressRef}
            className={styles.progressBar}
            style={{ transform: 'scaleX(1)' }}
          />
        </div>
      )}
    </motion.div>
  );
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
    setToasts(prev => [...prev, { id, message, type, duration }]);

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
      <AnimatePresence mode="popLayout">
        {toasts.map((toast, i) => (
          <Toast
            key={toast.id}
            toast={toast}
            dismiss={dismiss}
            index={i}
            total={toasts.length}
          />
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
