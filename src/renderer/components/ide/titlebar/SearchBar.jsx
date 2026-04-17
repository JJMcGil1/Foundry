import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import {
  FiSearch, FiFile, FiChevronRight, FiChevronDown,
  FiX, FiFilter, FiMinimize2, FiMaximize2,
} from 'react-icons/fi';
import styles from '../SearchBar.module.css';

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
  const [preserveCase, setPreserveCase] = useState(false);

  // Include/exclude filters
  const [showFilters, setShowFilters] = useState(false);
  const [includePattern, setIncludePattern] = useState('');
  const [excludePattern, setExcludePattern] = useState('');

  const [fileResults, setFileResults] = useState([]);
  const [contentResults, setContentResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedFiles, setExpandedFiles] = useState(new Set());
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [replaceResult, setReplaceResult] = useState(null);
  const [dismissedFiles, setDismissedFiles] = useState(new Set());
  const [closing, setClosing] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 52, right: 16 });

  const inputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);
  const closingTimerRef = useRef(null);

  const close = useCallback(() => {
    if (!open || closing) return;
    setClosing(true);
    closingTimerRef.current = setTimeout(() => {
      setOpen(false);
      setClosing(false);
      setQuery('');
      setReplaceText('');
      setFileResults([]);
      setContentResults([]);
      setActiveIndex(0);
      setExpandedFiles(new Set());
      setReplaceConfirm(false);
      setReplaceResult(null);
      setDismissedFiles(new Set());
    }, 180);
  }, [open, closing]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
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

  // Position dropdown under the search input (anchored to its right edge)
  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const updatePos = () => {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 6,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updatePos();
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleMouseDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        close();
      }
    }
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => document.removeEventListener('mousedown', handleMouseDown, true);
  }, [open, close]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.trim() && !open) setOpen(true);
    if (!val.trim()) {
      setFileResults([]);
      setContentResults([]);
    }
  };

  const handleInputFocus = () => {
    setOpen(true);
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
      setDismissedFiles(new Set());
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
            includePattern: includePattern.trim() || undefined,
            excludePattern: excludePattern.trim() || undefined,
          });
          setContentResults(results || []);
          const expanded = new Set();
          (results || []).slice(0, 5).forEach(r => expanded.add(r.path));
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
  }, [query, activeTabId, projectPath, caseSensitive, wholeWord, isRegex, includePattern, excludePattern]);

  // Reset results when switching tabs (keep query)
  useEffect(() => {
    setFileResults([]);
    setContentResults([]);
    setActiveIndex(0);
    setExpandedFiles(new Set());
    setReplaceConfirm(false);
    setReplaceResult(null);
    setDismissedFiles(new Set());
  }, [activeTabId]);

  // Filter out dismissed files — must be before callbacks that reference it
  const visibleContentResults = useMemo(() => {
    return contentResults.filter(f => !dismissedFiles.has(f.path));
  }, [contentResults, dismissedFiles]);

  const totalMatches = useMemo(() => {
    return visibleContentResults.reduce((sum, file) => sum + file.matches.length, 0);
  }, [visibleContentResults]);

  const handleSelectFile = useCallback((filePath, lineNumber) => {
    if (onOpenFile) onOpenFile(filePath, lineNumber);
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
      const visible = visibleContentResults;
      if (visible.length > 0) {
        const first = visible[0];
        const line = first.matches?.[0]?.line;
        handleSelectFile(first.path, line);
      }
    }
  }, [activeTabId, fileResults, contentResults, visibleContentResults, activeIndex, handleSelectFile, close]);

  const toggleFileExpanded = (filePath) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath);
      else next.add(filePath);
      return next;
    });
  };

  const collapseAll = () => setExpandedFiles(new Set());

  const expandAll = () => {
    const all = new Set();
    visibleContentResults.forEach(r => all.add(r.path));
    setExpandedFiles(all);
  };

  const dismissFile = (filePath, e) => {
    e.stopPropagation();
    setDismissedFiles(prev => {
      const next = new Set(prev);
      next.add(filePath);
      return next;
    });
  };

  const handleReplaceInFile = async (filePath, e) => {
    e.stopPropagation();
    if (!projectPath || !query.trim()) return;
    setLoading(true);
    try {
      await window.foundry?.replaceInFiles(projectPath, query, getReplacementText(), {
        caseSensitive,
        wholeWord,
        isRegex,
        filePaths: [filePath],
      });
      // Re-search to update results
      const results = await window.foundry?.searchInFiles(projectPath, query, {
        caseSensitive, wholeWord, isRegex,
        includePattern: includePattern.trim() || undefined,
        excludePattern: excludePattern.trim() || undefined,
      });
      setContentResults(results || []);
    } catch (err) {
      console.error('Replace in file error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceAll = async () => {
    if (!projectPath || !query.trim()) return;
    setReplaceConfirm(true);
  };

  const getReplacementText = useCallback(() => {
    if (!preserveCase || !replaceText) return replaceText;
    // Preserve case is handled per-match in the main process,
    // for now just return the raw replacement text
    return replaceText;
  }, [preserveCase, replaceText]);

  const confirmReplace = async () => {
    setReplaceConfirm(false);
    setLoading(true);
    try {
      // Only replace in non-dismissed files
      const filePaths = visibleContentResults.map(r => r.path);
      const result = await window.foundry?.replaceInFiles(projectPath, query, getReplacementText(), {
        caseSensitive,
        wholeWord,
        isRegex,
        filePaths: filePaths.length > 0 ? filePaths : undefined,
      });
      setReplaceResult(result);
      if (result?.success) {
        const results = await window.foundry?.searchInFiles(projectPath, query, {
          caseSensitive, wholeWord, isRegex,
          includePattern: includePattern.trim() || undefined,
          excludePattern: excludePattern.trim() || undefined,
        });
        setContentResults(results || []);
      }
    } catch (err) {
      console.error('Replace error:', err);
    } finally {
      setLoading(false);
    }
  };

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
  const modKey = isMac ? '\u2318' : 'Ctrl';

  const showDropdown = open || closing;
  const isContentTab = activeTabId === 'content' || activeTabId === 'replace';

  return (
    <div className={styles.searchBarWrapper} ref={containerRef}>
      {/* The titlebar input */}
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
        {isContentTab && open && (
          <div className={styles.optionsRow}>
            <button
              className={`${styles.optionBtn} ${caseSensitive ? styles.optionBtnActive : ''}`}
              onClick={() => setCaseSensitive(v => !v)}
              title="Match Case (Alt+C)"
            >
              Aa
            </button>
            <button
              className={`${styles.optionBtn} ${wholeWord ? styles.optionBtnActive : ''}`}
              onClick={() => setWholeWord(v => !v)}
              title="Match Whole Word (Alt+W)"
            >
              ab
            </button>
            <button
              className={`${styles.optionBtn} ${isRegex ? styles.optionBtnActive : ''}`}
              onClick={() => setIsRegex(v => !v)}
              title="Use Regular Expression (Alt+R)"
            >
              .*
            </button>
          </div>
        )}
        {!open && (
          <span className={styles.searchShortcut}>{modKey} P</span>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <>
          <div className={styles.overlay} onClick={close} />
          <div
            className={`${styles.dropdown} ${closing ? styles.dropdownClosing : ''}`}
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
            onClick={(e) => e.stopPropagation()}
          >
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

            {/* Replace input row */}
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
                    className={`${styles.preserveCaseBtn} ${preserveCase ? styles.preserveCaseBtnActive : ''}`}
                    onClick={() => setPreserveCase(v => !v)}
                    title="Preserve Case"
                  >
                    AB
                  </button>
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

            {/* Toolbar for content search */}
            {isContentTab && query.trim() && !loading && visibleContentResults.length > 0 && (
              <div className={styles.toolbar}>
                <div className={styles.toolbarLeft}>
                  <button
                    className={styles.toolbarBtn}
                    onClick={expandAll}
                    title="Expand All"
                  >
                    <FiMaximize2 size={12} />
                  </button>
                  <button
                    className={styles.toolbarBtn}
                    onClick={collapseAll}
                    title="Collapse All"
                  >
                    <FiMinimize2 size={12} />
                  </button>
                  <button
                    className={`${styles.toggleFiltersBtn} ${showFilters ? styles.toggleFiltersBtnActive : ''}`}
                    onClick={() => setShowFilters(v => !v)}
                    title="Toggle File Filters"
                  >
                    <FiFilter size={12} />
                  </button>
                </div>
                <span className={styles.toolbarInfo}>
                  {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {visibleContentResults.length} file{visibleContentResults.length !== 1 ? 's' : ''}
                </span>
              </div>
            )}

            {/* Include/Exclude filters */}
            {isContentTab && showFilters && (
              <div className={styles.filtersRow}>
                <input
                  className={styles.filterField}
                  type="text"
                  value={includePattern}
                  onChange={(e) => setIncludePattern(e.target.value)}
                  placeholder="files to include (e.g. *.js, src/**)"
                />
                <input
                  className={styles.filterField}
                  type="text"
                  value={excludePattern}
                  onChange={(e) => setExcludePattern(e.target.value)}
                  placeholder="files to exclude (e.g. *.min.js)"
                />
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
              {!loading && isContentTab && query.trim() && visibleContentResults.length === 0 && (
                <div className={styles.emptyState}>
                  <span>No matches found</span>
                </div>
              )}

              {!loading && isContentTab && visibleContentResults.map((file) => (
                <div key={file.path} className={styles.fileGroup}>
                  <div
                    className={styles.fileGroupHeader}
                    onClick={() => toggleFileExpanded(file.path)}
                  >
                    {expandedFiles.has(file.path)
                      ? <FiChevronDown size={12} />
                      : <FiChevronRight size={12} />
                    }
                    <FiFile size={13} className={styles.resultIcon} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.relativePath}
                    </span>
                    <div className={styles.fileGroupActions}>
                      {activeTabId === 'replace' && (
                        <button
                          className={styles.fileGroupBtn}
                          onClick={(e) => handleReplaceInFile(file.path, e)}
                          title="Replace all in this file"
                        >
                          <FiChevronRight size={12} />
                        </button>
                      )}
                      <button
                        className={styles.fileGroupBtn}
                        onClick={(e) => dismissFile(file.path, e)}
                        title="Dismiss"
                      >
                        <FiX size={12} />
                      </button>
                    </div>
                    <span className={styles.resultMatchCount}>
                      {file.matches.length}
                    </span>
                  </div>
                  {expandedFiles.has(file.path) && file.matches.map((match, mi) => (
                    <div
                      key={mi}
                      className={styles.matchLine}
                      onClick={() => handleSelectFile(file.path, match.line)}
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
                  Replace <strong>{totalMatches}</strong> occurrence{totalMatches !== 1 ? 's' : ''} across <strong>{visibleContentResults.length}</strong> file{visibleContentResults.length !== 1 ? 's' : ''}?
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
                  <span>{totalMatches} match{totalMatches !== 1 ? 'es' : ''} in {visibleContentResults.length} file{visibleContentResults.length !== 1 ? 's' : ''}</span>
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
