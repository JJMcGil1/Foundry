import React, { useState, useCallback } from 'react';
import ChatPanel from './ChatPanel';
import styles from './ChatPanelContainer.module.css';

let panelIdCounter = 0;

export default function ChatPanelContainer({ onOpenSettings, projectPath, onPanelClose, panelDragProps }) {
  const [panels, setPanels] = useState(() => [{ id: `chat-panel-${++panelIdCounter}`, startFresh: false }]);

  const panelCount = panels.length;
  const isMultiPanel = panelCount > 1;

  const handleSplit = useCallback(() => {
    setPanels(prev => {
      if (prev.length >= 4) return prev;
      return [...prev, { id: `chat-panel-${++panelIdCounter}`, startFresh: true }];
    });
  }, []);

  const handleClosePanel = useCallback((panelId) => {
    setPanels(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(p => p.id !== panelId);
    });
  }, []);

  return (
    <div className={styles.container}>
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
            panelDragProps={idx === 0 ? panelDragProps : undefined}
            onPanelClose={idx === 0 ? onPanelClose : undefined}
          />
        </React.Fragment>
      ))}
    </div>
  );
}
