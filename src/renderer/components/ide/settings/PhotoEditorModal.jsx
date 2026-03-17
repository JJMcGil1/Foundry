import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FiZoomIn, FiZoomOut } from 'react-icons/fi';
import styles from '../SettingsPage.module.css';

export default function PhotoEditorModal({ photoData, initialZoom, initialPos, onSave, onCancel }) {
  const CROP_SIZE = 240;
  const [zoom, setZoom] = useState(initialZoom || 1);
  const [pos, setPos] = useState(initialPos || { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPos({ x: posStart.current.x + dx, y: posStart.current.y + dy });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.003)));
  }, []);

  // Background-size: at zoom=1 the image covers the circle. zoom>1 makes it bigger.
  const bgSize = `${zoom * 100}%`;
  // Background-position: center + offset. Convert px offset to % relative to the overflow area.
  const bgPosX = `calc(50% + ${pos.x}px)`;
  const bgPosY = `calc(50% + ${pos.y}px)`;

  return (
    <div className={styles.modalBackdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Edit photo</span>
        </div>

        <div className={styles.cropArea} onWheel={handleWheel}>
          <div
            className={styles.cropCircle}
            style={{
              width: CROP_SIZE,
              height: CROP_SIZE,
              backgroundImage: `url(${photoData})`,
              backgroundSize: bgSize,
              backgroundPosition: `${bgPosX} ${bgPosY}`,
              backgroundRepeat: 'no-repeat',
              cursor: dragging ? 'grabbing' : 'grab',
            }}
            onMouseDown={handleMouseDown}
          />
        </div>

        <div className={styles.cropControls}>
          <FiZoomOut size={14} className={styles.zoomIcon} />
          <input
            type="range"
            min="1"
            max="4"
            step="0.02"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className={styles.zoomSlider}
          />
          <FiZoomIn size={14} className={styles.zoomIcon} />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.applyBtn} onClick={() => onSave(zoom, pos)}>Apply</button>
        </div>
      </div>
    </div>
  );
}
