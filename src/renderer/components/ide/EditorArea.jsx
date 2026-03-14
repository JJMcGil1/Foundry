import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { FiX, FiFolder, FiFile } from 'react-icons/fi';
import Editor from '@monaco-editor/react';
import FileIcon from './FileIcon';
import styles from './EditorArea.module.css';
import foundryIconDark from '../../assets/foundry-icon-dark.svg';
import foundryIconLight from '../../assets/foundry-icon-light.svg';

/* ── Theme detection hook ───────────────────────────────── */
function useAppTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute('data-theme') || 'dark'
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(t);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  return theme;
}

const EXT_TO_LANGUAGE = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript', mts: 'typescript',
  json: 'json', jsonc: 'json',
  html: 'html', htm: 'html',
  css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', mdx: 'markdown',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c', h: 'c',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin', kts: 'kotlin',
  sh: 'shell', bash: 'shell', zsh: 'shell',
  sql: 'sql',
  xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  lua: 'lua',
  r: 'r',
  dart: 'dart',
  dockerfile: 'dockerfile',
  graphql: 'graphql', gql: 'graphql',
  vue: 'html',
  makefile: 'shell',
};

function getLanguageFromFilename(filename) {
  if (!filename) return 'plaintext';
  const lower = filename.toLowerCase();
  // Handle special filenames
  if (lower === 'dockerfile') return 'dockerfile';
  if (lower === 'makefile' || lower === 'gnumakefile') return 'shell';
  const ext = lower.split('.').pop();
  return EXT_TO_LANGUAGE[ext] || 'plaintext';
}

function TabBar({ tabs, activeTab, onSelectTab, onCloseTab, onReorderTabs }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
    // Make the drag image slightly transparent
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
    <div className={styles.tabBar}>
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
    </div>
  );
}

function CodeEditor({ tab, onContentChange, onSave }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const appTheme = useAppTheme();
  const language = useMemo(() => getLanguageFromFilename(tab?.name), [tab?.name]);
  const monacoTheme = appTheme === 'light' ? 'foundry-light' : 'foundry-dark';

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Cmd/Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave(tab.path);
    });
  }, [tab?.path, onSave]);

  // Reactively switch Monaco theme when app theme changes
  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  const handleEditorChange = useCallback((value) => {
    onContentChange(tab.path, value || '');
  }, [tab?.path, onContentChange]);

  const handleBeforeMount = useCallback((monaco) => {
    // Dark theme
    monaco.editor.defineTheme('foundry-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'C678DD' },
        { token: 'string', foreground: '98C379' },
        { token: 'number', foreground: 'D19A66' },
        { token: 'type', foreground: 'E5C07B' },
        { token: 'function', foreground: '61AFEF' },
        { token: 'variable', foreground: 'E06C75' },
        { token: 'constant', foreground: 'D19A66' },
        { token: 'tag', foreground: 'E06C75' },
        { token: 'attribute.name', foreground: 'D19A66' },
        { token: 'attribute.value', foreground: '98C379' },
        { token: 'delimiter', foreground: 'ABB2BF' },
        { token: 'operator', foreground: '56B6C2' },
      ],
      colors: {
        'editor.background': '#18181B',
        'editor.foreground': '#D4D4D8',
        'editor.lineHighlightBackground': '#27272A',
        'editor.selectionBackground': '#A78BFA33',
        'editor.inactiveSelectionBackground': '#A78BFA1A',
        'editorLineNumber.foreground': '#3F3F46',
        'editorLineNumber.activeForeground': '#A1A1AA',
        'editorCursor.foreground': '#A78BFA',
        'editor.selectionHighlightBackground': '#A78BFA1A',
        'editorIndentGuide.background': '#27272A',
        'editorIndentGuide.activeBackground': '#3F3F46',
        'editorWidget.background': '#18181B',
        'editorWidget.border': '#27272A',
        'editorSuggestWidget.background': '#18181B',
        'editorSuggestWidget.border': '#27272A',
        'editorSuggestWidget.selectedBackground': '#27272A',
        'scrollbarSlider.background': '#3F3F4666',
        'scrollbarSlider.hoverBackground': '#52525B88',
        'scrollbarSlider.activeBackground': '#71717AAA',
      },
    });

    // Light theme
    monaco.editor.defineTheme('foundry-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7C3AED' },
        { token: 'string', foreground: '16A34A' },
        { token: 'number', foreground: 'C2410C' },
        { token: 'type', foreground: 'B45309' },
        { token: 'function', foreground: '2563EB' },
        { token: 'variable', foreground: 'DC2626' },
        { token: 'constant', foreground: 'C2410C' },
        { token: 'tag', foreground: 'DC2626' },
        { token: 'attribute.name', foreground: 'B45309' },
        { token: 'attribute.value', foreground: '16A34A' },
        { token: 'delimiter', foreground: '3F3F46' },
        { token: 'operator', foreground: '0891B2' },
      ],
      colors: {
        'editor.background': '#FAFAFA',
        'editor.foreground': '#27272A',
        'editor.lineHighlightBackground': '#F4F4F5',
        'editor.selectionBackground': '#7C3AED22',
        'editor.inactiveSelectionBackground': '#7C3AED11',
        'editorLineNumber.foreground': '#D4D4D8',
        'editorLineNumber.activeForeground': '#71717A',
        'editorCursor.foreground': '#7C3AED',
        'editor.selectionHighlightBackground': '#7C3AED11',
        'editorIndentGuide.background': '#E4E4E7',
        'editorIndentGuide.activeBackground': '#D4D4D8',
        'editorWidget.background': '#FAFAFA',
        'editorWidget.border': '#E4E4E7',
        'editorSuggestWidget.background': '#FAFAFA',
        'editorSuggestWidget.border': '#E4E4E7',
        'editorSuggestWidget.selectedBackground': '#F4F4F5',
        'scrollbarSlider.background': '#D4D4D844',
        'scrollbarSlider.hoverBackground': '#A1A1AA66',
        'scrollbarSlider.activeBackground': '#71717A88',
      },
    });
  }, []);

  return (
    <div className={styles.editorWrapper}>
      <Editor
        key={tab?.path}
        height="100%"
        language={language}
        value={tab?.content || ''}
        theme={monacoTheme}
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        onChange={handleEditorChange}
        options={{
          fontSize: 13,
          fontFamily: '"SF Mono", "Fira Code", "JetBrains Mono", Menlo, Monaco, "Courier New", monospace',
          lineHeight: 20,
          tabSize: 2,
          insertSpaces: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'line',
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          smoothScrolling: true,
          padding: { top: 12 },
          automaticLayout: true,
          wordWrap: 'off',
          bracketPairColorization: { enabled: true },
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8,
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          contextmenu: true,
          formatOnPaste: false,
          formatOnType: false,
        }}
        loading={
          <div className={styles.editorLoading}>Loading editor...</div>
        }
      />
    </div>
  );
}

function WelcomePane({ onOpenFolder, project }) {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const iconSrc = isDark ? foundryIconDark : foundryIconLight;
  const hasProject = !!project;

  return (
    <div className={styles.welcome}>
      <div className={styles.welcomeGlow} />
      <div className={styles.welcomeContent}>
        <img src={iconSrc} alt="Foundry" className={styles.welcomeLogo} draggable={false} />
        {hasProject ? (
          <>
            <h2 className={styles.welcomeTitle}>{project.name || 'Project'}</h2>
            <p className={styles.welcomeDesc}>Open a file from the sidebar to get started</p>
            <div className={styles.welcomeShortcuts}>
              <div className={styles.shortcutRow}>
                <kbd className={styles.kbd}>&#8984; P</kbd>
                <span className={styles.shortcutLabel}>Quick open file</span>
              </div>
              <div className={styles.shortcutRow}>
                <kbd className={styles.kbd}>&#8984; B</kbd>
                <span className={styles.shortcutLabel}>Toggle sidebar</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.welcomeTitle}>Foundry</h2>
            <p className={styles.welcomeDesc}>Start building something great</p>
            <button className={styles.welcomeBtn} onClick={onOpenFolder}>
              <FiFolder size={15} />
              Open Project
            </button>
          </>
        )}
      </div>
    </div>
  );
}

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
