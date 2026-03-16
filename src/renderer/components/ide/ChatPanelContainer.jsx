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

  // Single panel — delegate entirely to ChatPanel (it has its own motion.div)
  if (panelCount === 1) {
    return (
      <ChatPanel
        key={panels[0].id}
        visible={visible}
        width={width}
        onWidthChange={onWidthChange}
        onOpenSettings={onOpenSettings}
        projectPath={projectPath}
        onSplit={handleSplit}
        onClosePanel={null}
        panelCount={1}
        startFresh={panels[0].startFresh}
      />
    );
  }

  // Multiple panels — animated container with flex children
  return (
    <motion.div
      className={styles.container}
      style={{
        width: isResizing ? width : undefined,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      initial={false}
      animate={{
        width: visible ? width : 0,
        opacity: visible ? 1 : 0,
      }}
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
            visible={true}
            width={null}
            onWidthChange={() => {}}
            onOpenSettings={onOpenSettings}
            projectPath={projectPath}
            onSplit={handleSplit}
            onClosePanel={() => handleClosePanel(panel.id)}
            panelCount={panelCount}
            isMultiPanel={true}
            startFresh={panel.startFresh}
          />
        </React.Fragment>
      ))}
    </motion.div>
  );
}
