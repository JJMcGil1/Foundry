import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import styles from './MediaPreview.module.css';

export default function MediaPreview({ images, currentIndex, onClose, onNavigate }) {
  const current = images?.[currentIndex];

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowLeft' && currentIndex > 0) onNavigate(currentIndex - 1);
    if (e.key === 'ArrowRight' && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
  }, [onClose, onNavigate, currentIndex, images?.length]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!current) return null;

  const src = current.preview || current.url || `data:${current.mediaType};base64,${current.base64}`;

  return createPortal(
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onClose}
      >
        <button className={styles.closeBtn} onClick={onClose}>
          <FiX size={20} />
        </button>

        {images.length > 1 && currentIndex > 0 && (
          <button
            className={`${styles.navBtn} ${styles.navPrev}`}
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex - 1); }}
          >
            <FiChevronLeft size={24} />
          </button>
        )}

        <img
          src={src}
          alt={current.name || 'Preview'}
          className={styles.image}
          onClick={(e) => e.stopPropagation()}
          draggable={false}
        />

        {images.length > 1 && currentIndex < images.length - 1 && (
          <button
            className={`${styles.navBtn} ${styles.navNext}`}
            onClick={(e) => { e.stopPropagation(); onNavigate(currentIndex + 1); }}
          >
            <FiChevronRight size={24} />
          </button>
        )}

        {images.length > 1 && (
          <div className={styles.counter}>
            {currentIndex + 1} / {images.length}
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
