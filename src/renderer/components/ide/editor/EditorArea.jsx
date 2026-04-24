import React, { memo } from 'react';
import TabBar from './TabBar';
import CodeEditor from './CodeEditor';
import styles from '../EditorArea.module.css';

function EditorArea({ tabs, activeTab, onSelectTab, onCloseTab, onContentChange, onSaveFile, onOpenFolder, project, onReorderTabs, onPanelClose, panelDragProps }) {
  const currentTab = tabs.find(t => t.path === activeTab);

  return (
    <div className={styles.root}>
      {tabs.length > 0 && (
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onReorderTabs={onReorderTabs}
          onPanelClose={onPanelClose}
          panelDragProps={panelDragProps}
        />
      )}
      <div className={styles.editorContent}>
        {currentTab ? (
          <CodeEditor
            tab={currentTab}
            tabs={tabs}
            onContentChange={onContentChange}
            onSave={onSaveFile}
          />
        ) : (
          <div className={styles.editorEmpty}>
            <span className={styles.editorEmptyText}>No file open</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(EditorArea);
