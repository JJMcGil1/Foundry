import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FiSearch, FiFile, FiChevronRight } from 'react-icons/fi';
import styles from './SearchBar.module.css';

const TABS = [
  { id: 'files', label: 'File Name' },
  { id: 'content', label: 'Search in Files' },
  { id: 'replace', label: 'Search & Replace' },
];

export default function SearchBar({ projectPath, onOpenFile }) {
  const [open, setOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState('files');
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);

  const [fileResults, setFileResults] = useState([]);
  const [contentResults, setContentResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [replaceResult, setReplaceResult] = useState(null);

  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const debounceRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setReplaceText('');
    setFileResults([]);
    setContentResults([]);
    setActiveIndex(0);
    setExpandedFiles(new Set());
    setReplaceConfirm(false);
    setReplaceResult(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        e.preventDefault();
        setActiveTabId('files');
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 20);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        setActiveTabId('content');
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 20);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        setActiveTabId('replace');
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 20);
      }
      if (e.key === 'Escape') {
        close();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [close]);

  // When input gets typed into and dropdown isn't open, open it
  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.trim() && !open) setOpen(true);
    if (!val.trim()) {
      setFileResults([]);
      setContentResults([]);
    }
  };

  // When input is focused, open dropdown
  const handleInputFocus = () => {
    if (query.trim()) setOpen(true);
  };

  // Debounced search
  useEffect(() => {
    if (!query.trim() || !projectPath) {
      setFileResults([]);
      setContentResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        if (activeTabId === 'files') {
          const results = await window.foundry?.searchFiles(projectPath, query);
          setFileResults(results || []);
          setActiveIndex(0);
        } else {
          const results = await window.foundry?.searchInFiles(projectPath, query, {
            caseSensitive,
            wholeWord,
            isRegex,
          });
          setContentResults(results || []);
          const expanded = new Set();
          (results || []).slice(0, 3).forEach(r => expanded.add(r.path));
          setExpandedFiles(expanded);
          setActiveIndex(0);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    }, activeTabId === 'files' ? 150 : 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, activeTabId, projectPath, caseSensitive, wholeWord, isRegex]);

  // Reset results when switching tabs (keep query)
  useEffect(() => {
    setFileResults([]);
    setContentResults([]);
    setActiveIndex(0);
    setExpandedFiles(new Set());
    setReplaceConfirm(false);
    setReplaceResult(null);
  }, [activeTabId]);

  const handleSelectFile = useCallback((filePath) => {
    if (onOpenFile) onOpenFile(filePath);
    close();
  }, [onOpenFile, close]);

  const handleKeyNavigation = useCallback((e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (activeTabId === 'files') {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, fileResults.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && fileResults[activeIndex]) {
        e.preventDefault();
        handleSelectFile(fileResults[activeIndex].path);
      }
    } else if (e.key === 'Enter' && contentResults.length > 0) {
      handleSelectFile(contentResults[0].path);
    }
  }, [activeTabId, fileResults, contentResults, activeIndex, handleSelectFile, close]);

  const toggleFileExpanded = (filePath) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const handleReplaceAll = async () => {
    if (!projectPath || !query.trim()) return;
    setReplaceConfirm(true);
  };

  const confirmReplace = async () => {
    setReplaceConfirm(false);
    setLoading(true);
    try {
      const result = await window.foundry?.replaceInFiles(projectPath, query, replaceText, {
        caseSensitive,
        wholeWord,
        isRegex,
      });
      setReplaceResult(result);
      if (result?.success) {
        const results = await window.foundry?.searchInFiles(projectPath, query, {
          caseSensitive,
          wholeWord,
          isRegex,
        });
        setContentResults(results || []);
      }
    } catch (err) {
      console.error('Replace error:', err);
    } finally {
      setLoading(false);
    }
  };

  const totalMatches = useMemo(() => {
    return contentResults.reduce((sum, file) => sum + file.matches.length, 0);
  }, [contentResults]);

  const highlightMatch = (text, searchQuery) => {
    if (!searchQuery.trim()) return text;
    try {
      let src = isRegex ? searchQuery : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (wholeWord) src = `\\b${src}\\b`;
      const regex = new RegExp(`(${src})`, caseSensitive ? 'g' : 'gi');
      const parts = text.split(regex);
      return parts.map((part, i) =>
        regex.test(part) ? <span key={i} className={styles.highlight}>{part}</span> : part
      );
    } catch {
      return text;
    }
  };

  const isMac = navigator.platform?.includes('Mac');
  const modKey = isMac ? '⌘' : 'Ctrl';

  const hasResults = activeTabId === 'files' ? fileResults.length > 0 : contentResults.length > 0;
  const showDropdown = open && (query.trim() || true); // always show when open

  return (
    <div className={styles.searchBarWrapper}>
      {/* The titlebar input — this IS the search bar */}
      <div className={`${styles.searchInput} titlebar-no-drag`}>
        <FiSearch size={14} className={styles.searchInputIcon} />
        <input
          ref={inputRef}
          className={styles.searchField}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyNavigation}
          placeholder="Search workspace..."
        />
        {(activeTabId === 'content' || activeTabId === 'replace') && open && (
          <div className={styles.optionsRow}>
            <button
              className={`${styles.optionBtn} ${caseSensitive ? styles.optionBtnActive : ''}`}
              onClick={() => setCaseSensitive(v => !v)}
              title="Match Case"
            >
              Aa
            </button>
            <button
              className={`${styles.optionBtn} ${wholeWord ? styles.optionBtnActive : ''}`}
              onClick={() => setWholeWord(v => !v)}
              title="Match Whole Word"
            >
              ab
            </button>
            <button
              className={`${styles.optionBtn} ${isRegex ? styles.optionBtnActive : ''}`}
              onClick={() => setIsRegex(v => !v)}
              title="Use Regular Expression"
            >
              .*
            </button>
          </div>
        )}
        {!open && (
          <span className={styles.searchShortcut}>{modKey} P</span>
        )}
      </div>

      {/* Dropdown — results only, no input */}
      {showDropdown && (
        <>
          <div className={styles.overlay} onClick={close} />
          <div className={styles.dropdown} onClick={(e) => e.stopPropagation()}>
            {/* Tabs */}
            <div className={styles.tabs}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  className={`${styles.tab} ${activeTabId === tab.id ? styles.tabActive : ''}`}
                  onClick={() => { setActiveTabId(tab.id); inputRef.current?.focus(); }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Replace input row — only in replace tab */}
            {activeTabId === 'replace' && (
              <div className={styles.replaceArea}>
                <div className={styles.replaceRow}>
                  <FiChevronRight size={14} className={styles.replaceIcon} />
                  <input
                    ref={replaceInputRef}
                    className={styles.replaceField}
                    type="text"
                    value={replaceText}
                    onChange={(e) => setReplaceText(e.target.value)}
                    placeholder="Replace with..."
                  />
                  <button
                    className={styles.replaceBtn}
                    onClick={handleReplaceAll}
                    disabled={!query.trim() || !projectPath || loading}
                  >
                    Replace All
                  </button>
                </div>
              </div>
            )}

            {/* Results */}
            <div className={styles.results}>
              {loading && (
                <div className={styles.emptyState}>
                  <div className={styles.spinner} />
                  <span>Searching...</span>
                </div>
              )}

              {!loading && !query.trim() && (
                <div className={styles.emptyState}>
                  <FiSearch size={20} className={styles.emptyIcon} />
                  <span>
                    {!projectPath
                      ? 'Open a folder to search'
                      : activeTabId === 'files'
                      ? 'Type to search files by name'
                      : 'Type to search in file contents'}
                  </span>
                </div>
              )}

              {/* File name results */}
              {!loading && activeTabId === 'files' && query.trim() && fileResults.length === 0 && (
                <div className={styles.emptyState}>
                  <span>No files found</span>
                </div>
              )}

              {!loading && activeTabId === 'files' && fileResults.map((file, i) => (
                <div
                  key={file.path}
                  className={`${styles.resultItem} ${i === activeIndex ? styles.resultItemActive : ''}`}
                  onClick={() => handleSelectFile(file.path)}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <FiFile size={14} className={styles.resultIcon} />
                  <div className={styles.resultInfo}>
                    <span className={styles.resultName}>
                      {highlightMatch(file.name, query)}
                    </span>
                    <span className={styles.resultPath}>{file.relativePath}</span>
                  </div>
                </div>
              ))}

              {/* Content search results */}
              {!loading && (activeTabId === 'content' || activeTabId === 'replace') && query.trim() && contentResults.length === 0 && (
                <div className={styles.emptyState}>
                  <span>No matches found</span>
                </div>
              )}

              {!loading && (activeTabId === 'content' || activeTabId === 'replace') && contentResults.map((file) => (
                <div key={file.path} className={styles.fileGroup}>
                  <div
                    className={styles.fileGroupHeader}
                    onClick={() => toggleFileExpanded(file.path)}
                  >
                    <FiChevronRight
                      size={12}
                      style={{
                        transform: expandedFiles.has(file.path) ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                    <FiFile size={13} className={styles.resultIcon} />
                    <span style={{ flex: 1 }}>{file.relativePath}</span>
                    <span className={styles.resultMatchCount}>
                      {file.matches.length} match{file.matches.length !== 1 ? 'es' : ''}
                    </span>
                  </div>
                  {expandedFiles.has(file.path) && file.matches.map((match, mi) => (
                    <div
                      key={mi}
                      className={styles.matchLine}
                      onClick={() => handleSelectFile(file.path)}
                    >
                      <span className={styles.matchLineNumber}>{match.line}</span>
                      <span className={styles.matchLineText}>
                        {highlightMatch(match.text.trim(), query)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Replace confirmation */}
            {replaceConfirm && (
              <div className={styles.replaceConfirm}>
                <span className={styles.replaceConfirmText}>
                  Replace <strong>{totalMatches}</strong> occurrence{totalMatches !== 1 ? 's' : ''} across <strong>{contentResults.length}</strong> file{contentResults.length !== 1 ? 's' : ''}?
                </span>
                <button className={styles.replaceConfirmBtnCancel} onClick={() => setReplaceConfirm(false)}>
                  Cancel
                </button>
                <button className={styles.replaceConfirmBtnDanger} onClick={confirmReplace}>
                  Replace All
                </button>
              </div>
            )}

            {/* Replace result */}
            {replaceResult && (
              <div className={styles.statusBar}>
                {replaceResult.success ? (
                  <span>
                    Replaced {replaceResult.totalReplacements} occurrence{replaceResult.totalReplacements !== 1 ? 's' : ''} in {replaceResult.filesModified} file{replaceResult.filesModified !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span style={{ color: '#EF4444' }}>Error: {replaceResult.error}</span>
                )}
              </div>
            )}

            {/* Status bar */}
            {!replaceResult && query.trim() && !loading && (
              <div className={styles.statusBar}>
                {activeTabId === 'files' ? (
                  <span>{fileResults.length} file{fileResults.length !== 1 ? 's' : ''} found</span>
                ) : (
                  <span>{totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {contentResults.length} file{contentResults.length !== 1 ? 's' : ''}</span>
                )}
                <span style={{ fontSize: 10, color: 'var(--zinc-600)' }}>
                  Esc to close
                </span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
