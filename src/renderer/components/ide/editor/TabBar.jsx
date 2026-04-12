import React, { useState } from 'react';
import { FiX } from 'react-icons/fi';
import FileIcon from '../FileIcon';
import styles from '../EditorArea.module.css';

export default function TabBar({ tabs, activeTab, onSelectTab, onCloseTab, onReorderTabs, onPanelClose, panelDragProps }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e) => {
    if (e.currentTarget) {
      e.currentTarget.style.opacity = '1';
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (index !== dragOverIndex) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== dropIndex && onReorderTabs) {
      const reordered = [...tabs];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(dropIndex, 0, moved);
      onReorderTabs(reordered);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div
      className={`${styles.tabBar} ${panelDragProps?.isDragOver ? styles.tabBarDragOver : ''}`}
      onDragOver={(e) => {
        // Only handle panel drag when not dragging tabs
        if (dragIndex === null && panelDragProps) {
          e.preventDefault();
          panelDragProps.onDragOver?.();
        }
      }}
      onDrop={(e) => {
        if (dragIndex === null && panelDragProps) {
          panelDragProps.onDrop?.();
        }
      }}
    >
      {panelDragProps && (
        <div
          className={styles.panelDragGrip}
          draggable
          onDragStart={panelDragProps.onDragStart}
          onDragEnd={panelDragProps.onDragEnd}
        >
          <span /><span /><span /><span /><span /><span />
        </div>
      )}
      {tabs.map((tab, index) => (
        <div
          key={tab.path}
          className={`${styles.tab} ${activeTab === tab.path ? styles.tabActive : ''} ${dragOverIndex === index && dragIndex !== index ? styles.tabDragOver : ''} ${dragIndex === index ? styles.tabDragging : ''}`}
          onClick={() => onSelectTab(tab.path)}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragLeave={() => setDragOverIndex(null)}
        >
          <FileIcon name={tab.name} type="file" size={14} />
          <span className={styles.tabName}>{tab.name}</span>
          {tab.modified && <span className={styles.tabModified} />}
          <button
            className={styles.tabClose}
            onClick={(e) => { e.stopPropagation(); onCloseTab(tab.path); }}
          >
            <FiX size={12} />
          </button>
        </div>
      ))}
      {onPanelClose && (
        <button className={styles.panelCloseBtn} onClick={onPanelClose} title="Close panel">
          <FiX size={13} />
        </button>
      )}
    </div>
  );
}
