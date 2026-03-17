import React from 'react';
import TabBar from './TabBar';
import CodeEditor from './CodeEditor';
import WelcomePane from './WelcomePane';
import styles from '../EditorArea.module.css';

export default function EditorArea({ tabs, activeTab, onSelectTab, onCloseTab, onContentChange, onSaveFile, onOpenFolder, project, onReorderTabs }) {
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
          <WelcomePane onOpenFolder={onOpenFolder} project={project} />
        )}
      </div>
    </div>
  );
}
