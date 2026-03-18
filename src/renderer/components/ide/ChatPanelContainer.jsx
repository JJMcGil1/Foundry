import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ChatPanel from './ChatPanel';
import styles from './ChatPanelContainer.module.css';

let panelIdCounter = 0;

const easeOut = [0.25, 0.1, 0.25, 1];

export default function ChatPanelContainer({ visible, width, onWidthChange, onOpenSettings, projectPath }) {
  const [panels, setPanels] = useState(() => [{ id: `chat-panel-${++panelIdCounter}`, startFresh: false }]);
  const [isResizing, setIsResizing] = useState(false);

  const handleSplit = useCallback(() => {
    setPanels(prev => {
      if (prev.length >= 4) return prev;
      return [...prev, { id: `chat-panel-${++panelIdCounter}`, startFresh: true }];
    });
    if (panels.length === 1) {
      onWidthChange(Math.max(width, 640));
    } else if (panels.length === 2) {
      onWidthChange(Math.max(width, 900));
    }
  }, [panels.length, width, onWidthChange]);

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
      const newWidth = Math.max(400, Math.min(1200, startWidth - (ev.clientX - startX)));
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
  }, [width, onWidthChange]);

  const panelCount = panels.length;
  const isMultiPanel = panelCount > 1;

  // Always use the same container layout so panels never unmount when splitting.
  // This prevents active streams from being killed when a new panel is added.
  return (
    <motion.div
      className={isMultiPanel ? styles.container : undefined}
      style={{
        width: isResizing ? width : undefined,
        pointerEvents: visible ? 'auto' : 'none',
        display: isMultiPanel ? undefined : 'contents',
      }}
      initial={false}
      animate={isMultiPanel
        ? { width: visible ? width : 0, opacity: visible ? 1 : 0 }
        : {}
      }
      transition={isResizing
        ? { duration: 0 }
        : { duration: 0.25, ease: easeOut }
      }
    >
      {isMultiPanel && <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />}
      {panels.map((panel, idx) => (
        <React.Fragment key={panel.id}>
          {idx > 0 && <div className={styles.panelDivider} />}
          <ChatPanel
            visible={isMultiPanel ? true : visible}
            width={isMultiPanel ? null : width}
            onWidthChange={isMultiPanel ? () => {} : onWidthChange}
            onOpenSettings={onOpenSettings}
            projectPath={projectPath}
            onSplit={handleSplit}
            onClosePanel={isMultiPanel ? () => handleClosePanel(panel.id) : null}
            panelCount={panelCount}
            isMultiPanel={isMultiPanel}
            startFresh={panel.startFresh}
          />
        </React.Fragment>
      ))}
    </motion.div>
  );
}
