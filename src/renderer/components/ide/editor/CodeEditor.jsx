import React, { useRef, useEffect, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useAppTheme, getLanguageFromFilename, fadeInWrapper } from './editorUtils';
import styles from '../EditorArea.module.css';

export default function CodeEditor({ tab, tabs, onContentChange, onSave }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const wrapperRef = useRef(null);
  const modelsRef = useRef(new Map());
  const currentPathRef = useRef(null);
  const viewStatesRef = useRef(new Map());
  const suppressChangeRef = useRef(false);
  const mountedRef = useRef(false);
  const appTheme = useAppTheme();
  const monacoTheme = appTheme === 'light' ? 'foundry-light' : 'foundry-dark';
  const onSaveRef = useRef(onSave);
  const onContentChangeRef = useRef(onContentChange);

  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
  useEffect(() => { onContentChangeRef.current = onContentChange; }, [onContentChange]);

  /* ── Swap model when active tab changes (only runs after Monaco is mounted) ── */
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !tab) return;

    const prevPath = currentPathRef.current;

    // Save view state of previous file
    if (prevPath && prevPath !== tab.path) {
      viewStatesRef.current.set(prevPath, editor.saveViewState());
    }

    // Get or create model
    let model = modelsRef.current.get(tab.path);
    if (!model || model.isDisposed()) {
      const language = getLanguageFromFilename(tab.name);
      const uri = monaco.Uri.parse(`file://${tab.path}`);
      model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(tab.content || '', language, uri);
      }
      modelsRef.current.set(tab.path, model);
    }

    // Swap model
    suppressChangeRef.current = true;
    if (editor.getModel() !== model) {
      editor.setModel(model);
    }
    const savedState = viewStatesRef.current.get(tab.path);
    if (savedState) {
      editor.restoreViewState(savedState);
    }
    suppressChangeRef.current = false;
    currentPathRef.current = tab.path;
    editor.focus();

    // Fade in — works for both first open and tab switches
    fadeInWrapper(wrapperRef.current);
  }, [tab?.path]);

  /* ── Sync external content changes ── */
  useEffect(() => {
    const model = modelsRef.current.get(tab?.path);
    if (model && !model.isDisposed() && tab) {
      const currentValue = model.getValue();
      if (currentValue !== tab.content) {
        suppressChangeRef.current = true;
        model.setValue(tab.content || '');
        suppressChangeRef.current = false;
      }
    }
  }, [tab?.content, tab?.path]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(monacoTheme);
    }
  }, [monacoTheme]);

  const handleEditorChange = useCallback((value) => {
    if (suppressChangeRef.current) return;
    if (currentPathRef.current) {
      onContentChangeRef.current(currentPathRef.current, value || '');
    }
  }, []);

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    mountedRef.current = true;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (currentPathRef.current) {
        onSaveRef.current(currentPathRef.current);
      }
    });

    // First file: Monaco just mounted, useEffect already ran and early-returned.
    // We need to set the model here AND trigger the fade.
    if (tab && !currentPathRef.current) {
      const language = getLanguageFromFilename(tab.name);
      const uri = monaco.Uri.parse(`file://${tab.path}`);
      let model = monaco.editor.getModel(uri);
      if (!model) {
        model = monaco.editor.createModel(tab.content || '', language, uri);
      }
      modelsRef.current.set(tab.path, model);
      editor.setModel(model);
      currentPathRef.current = tab.path;
      editor.focus();
      fadeInWrapper(wrapperRef.current);
    }
  }, []);

  const handleBeforeMount = useCallback((monaco) => {
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

  /* ── Cleanup models for closed tabs ── */
  useEffect(() => {
    const openPaths = new Set(tabs.map(t => t.path));
    for (const [path, model] of modelsRef.current) {
      if (!openPaths.has(path)) {
        if (!model.isDisposed()) model.dispose();
        modelsRef.current.delete(path);
        viewStatesRef.current.delete(path);
      }
    }
  }, [tabs]);

  /* ── Full cleanup on unmount ── */
  useEffect(() => {
    return () => {
      modelsRef.current.forEach((model) => {
        if (!model.isDisposed()) model.dispose();
      });
      modelsRef.current.clear();
      viewStatesRef.current.clear();
    };
  }, []);

  return (
    <div className={styles.editorWrapper} ref={wrapperRef} style={{ opacity: 0 }}>
      <Editor
        height="100%"
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
