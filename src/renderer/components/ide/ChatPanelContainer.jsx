import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ChatPanel from './ChatPanel';
import styles from './ChatPanelContainer.module.css';

let panelIdCounter = 0;

const easeOut = [0.25, 0.1, 0.25, 1];

// Width constraints
const SINGLE_MIN = 280;
const SINGLE_MAX = 600;
const MULTI_MIN = 400;
const MULTI_MAX_VW = 0.65; // never exceed 65% of viewport

export default function ChatPanelContainer({ visible, width, onWidthChange, onOpenSettings, projectPath }) {
  const [panels, setPanels] = useState(() => [{ id: `chat-panel-${++panelIdCounter}`, startFresh: false }]);
  const [isResizing, setIsResizing] = useState(false);

  const panelCount = panels.length;
  const isMultiPanel = panelCount > 1;

  // Clamp width whenever panel count changes
  useEffect(() => {
    if (isMultiPanel) {
      const maxPx = Math.floor(window.innerWidth * MULTI_MAX_VW);
      const minPx = Math.max(MULTI_MIN, panelCount * SINGLE_MIN);
      const clamped = Math.max(minPx, Math.min(maxPx, width));
      if (clamped !== width) onWidthChange(clamped);
    } else {
      const clamped = Math.max(SINGLE_MIN, Math.min(SINGLE_MAX, width));
      if (clamped !== width) onWidthChange(clamped);
    }
  }, [panelCount]);

  const handleSplit = useCallback(() => {
    setPanels(prev => {
      if (prev.length >= 4) return prev;
      const next = [...prev, { id: `chat-panel-${++panelIdCounter}`, startFresh: true }];
      // Widen to give new panel room
      const minForNew = next.length * SINGLE_MIN;
      onWidthChange(Math.max(width, minForNew));
      return next;
    });
  }, [width, onWidthChange]);

  const handleClosePanel = useCallback((panelId) => {
    setPanels(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(p => p.id !== panelId);
    });
  }, []);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = width;
    const handleMouseMove = (ev) => {
      const maxPx = Math.floor(window.innerWidth * MULTI_MAX_VW);
      const min = isMultiPanel ? Math.max(MULTI_MIN, panelCount * SINGLE_MIN) : SINGLE_MIN;
      const max = isMultiPanel ? maxPx : SINGLE_MAX;
      const newWidth = Math.max(min, Math.min(max, startWidth - (ev.clientX - startX)));
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, onWidthChange, isMultiPanel, panelCount]);

  // Container always renders as a real DOM element — no display:contents hack.
  // ChatPanel fills its parent; the container owns all width control.
  return (
    <motion.div
      className={styles.container}
      style={{
        width: isResizing ? width : undefined,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      initial={false}
      animate={{ width: visible ? width : 0, opacity: visible ? 1 : 0 }}
      transition={isResizing
        ? { duration: 0 }
        : { duration: 0.25, ease: easeOut }
      }
    >
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
      {panels.map((panel, idx) => (
        <React.Fragment key={panel.id}>
          {idx > 0 && <div className={styles.panelDivider} />}
          <ChatPanel
            onOpenSettings={onOpenSettings}
            projectPath={projectPath}
            onSplit={handleSplit}
            onClosePanel={isMultiPanel ? () => handleClosePanel(panel.id) : null}
            panelCount={panelCount}
            startFresh={panel.startFresh}
          />
        </React.Fragment>
      ))}
    </motion.div>
  );
}
