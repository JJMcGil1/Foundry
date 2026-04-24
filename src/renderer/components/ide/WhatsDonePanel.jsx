import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { LuSquareCheckBig } from 'react-icons/lu';
import { FiPlus, FiX, FiTrash2, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import PanelHeader from './PanelHeader';
import styles from './WhatsDonePanel.module.css';

/* ── Default labels ── */
const DEFAULT_LABELS = {
  feature:     { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80',  border: 'rgba(34,197,94,0.3)' },
  bugfix:      { bg: 'rgba(239,68,68,0.15)',  color: '#f87171',  border: 'rgba(239,68,68,0.3)' },
  refactor:    { bg: 'rgba(168,85,247,0.15)', color: '#c084fc',  border: 'rgba(168,85,247,0.3)' },
  docs:        { bg: 'rgba(59,130,246,0.15)', color: '#60a5fa',  border: 'rgba(59,130,246,0.3)' },
  chore:       { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24',  border: 'rgba(245,158,11,0.3)' },
  improvement: { bg: 'rgba(6,182,212,0.15)',  color: '#22d3ee',  border: 'rgba(6,182,212,0.3)' },
  shipped:     { bg: 'rgba(249,115,22,0.15)', color: '#fb923c',  border: 'rgba(249,115,22,0.3)' },
};

/* palette for custom labels - cycles through these */
const CUSTOM_PALETTE = [
  { bg: 'rgba(236,72,153,0.15)',  color: '#f472b6',  border: 'rgba(236,72,153,0.3)' },
  { bg: 'rgba(99,102,241,0.15)',  color: '#818cf8',  border: 'rgba(99,102,241,0.3)' },
  { bg: 'rgba(20,184,166,0.15)',  color: '#2dd4bf',  border: 'rgba(20,184,166,0.3)' },
  { bg: 'rgba(234,179,8,0.15)',   color: '#facc15',  border: 'rgba(234,179,8,0.3)' },
  { bg: 'rgba(244,63,94,0.15)',   color: '#fb7185',  border: 'rgba(244,63,94,0.3)' },
  { bg: 'rgba(14,165,233,0.15)',  color: '#38bdf8',  border: 'rgba(14,165,233,0.3)' },
  { bg: 'rgba(132,204,22,0.15)',  color: '#a3e635',  border: 'rgba(132,204,22,0.3)' },
  { bg: 'rgba(217,70,239,0.15)',  color: '#e879f9',  border: 'rgba(217,70,239,0.3)' },
];

/* ── Date helpers ── */
function toDateKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayKey() {
  return toDateKey(new Date().toISOString());
}

function shiftDate(dateKey, delta) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + delta);
  return toDateKey(dt.toISOString());
}

function formatDayLabel(dateKey) {
  const today = todayKey();
  if (dateKey === today) return 'Today';
  const yesterday = shiftDate(today, -1);
  if (dateKey === yesterday) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
}

function WhatsDonePanel({ projectPath, onClose, panelDragProps }) {
  const [entries, setEntries] = useState([]);
  const [customLabels, setCustomLabels] = useState({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [label, setLabel] = useState('feature');
  const [showForm, setShowForm] = useState(false);
  const [viewDate, setViewDate] = useState(todayKey());
  const [addingLabel, setAddingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const titleRef = useRef(null);
  const labelInputRef = useRef(null);
  const saveTimer = useRef(null);

  const storageKey = projectPath ? `whats_done_${projectPath}` : 'whats_done_global';
  const labelsKey = projectPath ? `whats_done_labels_${projectPath}` : 'whats_done_labels_global';

  /* ── All labels merged ── */
  const allLabels = useMemo(() => ({ ...DEFAULT_LABELS, ...customLabels }), [customLabels]);

  /* ── Load entries + custom labels ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawEntries, rawLabels] = await Promise.all([
          window.foundry?.getSetting(storageKey),
          window.foundry?.getSetting(labelsKey),
        ]);
        if (cancelled) return;
        if (rawEntries) {
          const parsed = JSON.parse(rawEntries);
          if (Array.isArray(parsed)) setEntries(parsed);
        }
        if (rawLabels) {
          const parsed = JSON.parse(rawLabels);
          if (parsed && typeof parsed === 'object') setCustomLabels(parsed);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [storageKey, labelsKey]);

  /* ── Save entries (debounced) ── */
  const saveEntries = useCallback((items) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.foundry?.setSetting(storageKey, JSON.stringify(items));
    }, 500);
  }, [storageKey]);

  const saveCustomLabels = useCallback((labels) => {
    window.foundry?.setSetting(labelsKey, JSON.stringify(labels));
  }, [labelsKey]);

  /* ── Entries for viewed day ── */
  const dayEntries = useMemo(() => {
    return entries.filter(e => toDateKey(e.createdAt) === viewDate);
  }, [entries, viewDate]);

  /* ── All unique day keys (sorted desc) ── */
  const allDays = useMemo(() => {
    const set = new Set(entries.map(e => toDateKey(e.createdAt)));
    set.add(todayKey());
    return [...set].sort().reverse();
  }, [entries]);

  /* ── Day navigation ── */
  const currentDayIdx = allDays.indexOf(viewDate);
  const canGoNewer = currentDayIdx > 0;
  const canGoOlder = currentDayIdx < allDays.length - 1;

  const goNewer = () => {
    if (canGoNewer) setViewDate(allDays[currentDayIdx - 1]);
  };
  const goOlder = () => {
    if (canGoOlder) setViewDate(allDays[currentDayIdx + 1]);
  };

  /* ── Add entry ── */
  const handleAdd = useCallback(() => {
    if (!title.trim()) return;
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title.trim(),
      description: description.trim(),
      label,
      createdAt: new Date().toISOString(),
    };
    const next = [entry, ...entries];
    setEntries(next);
    saveEntries(next);
    setTitle('');
    setDescription('');
    setShowForm(false);
    setViewDate(todayKey());
  }, [title, description, label, entries, saveEntries]);

  /* ── Remove entry ── */
  const handleRemove = useCallback((id) => {
    const next = entries.filter(e => e.id !== id);
    setEntries(next);
    saveEntries(next);
  }, [entries, saveEntries]);

  /* ── Add custom label ── */
  const handleAddLabel = useCallback(() => {
    const name = newLabelName.trim().toLowerCase().replace(/\s+/g, '-');
    if (!name || allLabels[name]) {
      setAddingLabel(false);
      setNewLabelName('');
      return;
    }
    const colorIdx = Object.keys(customLabels).length % CUSTOM_PALETTE.length;
    const newLabels = { ...customLabels, [name]: CUSTOM_PALETTE[colorIdx] };
    setCustomLabels(newLabels);
    saveCustomLabels(newLabels);
    setLabel(name);
    setAddingLabel(false);
    setNewLabelName('');
  }, [newLabelName, allLabels, customLabels, saveCustomLabels]);

  /* ── Remove custom label ── */
  const handleRemoveLabel = useCallback((labelName) => {
    const next = { ...customLabels };
    delete next[labelName];
    setCustomLabels(next);
    saveCustomLabels(next);
    if (label === labelName) setLabel('feature');
  }, [customLabels, saveCustomLabels, label]);

  /* ── Key handlers ── */
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    }
    if (e.key === 'Escape') setShowForm(false);
  }, [handleAdd]);

  const handleLabelKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddLabel();
    }
    if (e.key === 'Escape') {
      setAddingLabel(false);
      setNewLabelName('');
    }
  }, [handleAddLabel]);

  useEffect(() => {
    if (showForm && titleRef.current) titleRef.current.focus();
  }, [showForm]);

  useEffect(() => {
    if (addingLabel && labelInputRef.current) labelInputRef.current.focus();
  }, [addingLabel]);

  const labelKeys = Object.keys(allLabels);

  return (
    <div className={styles.root}>
      <PanelHeader
        title="What's Done"
        icon={LuSquareCheckBig}
        onClose={onClose}
        onMouseDown={panelDragProps?.onMouseDown}
      >
        <button
          className={styles.addBtn}
          onClick={() => setShowForm(v => !v)}
          title="Add entry"
        >
          <FiPlus size={14} />
        </button>
      </PanelHeader>

      {/* ── Day nav ── */}
      <div className={styles.dayNav}>
        <button
          className={styles.dayArrow}
          onClick={goOlder}
          disabled={!canGoOlder}
          title="Older"
        >
          <FiChevronLeft size={14} />
        </button>
        <span className={styles.dayLabel}>{formatDayLabel(viewDate)}</span>
        <button
          className={styles.dayArrow}
          onClick={goNewer}
          disabled={!canGoNewer}
          title="Newer"
        >
          <FiChevronRight size={14} />
        </button>
      </div>

      <div className={styles.body}>
        {/* ── Add form ── */}
        {showForm && (
          <div className={styles.form} onKeyDown={handleKeyDown}>
            <input
              ref={titleRef}
              className={styles.input}
              placeholder="What did you finish?"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <textarea
              className={styles.textarea}
              placeholder="Details (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
            <div className={styles.labelSection}>
              <div className={styles.labelPicker}>
                {labelKeys.map(l => {
                  const c = allLabels[l];
                  const isCustom = !!customLabels[l];
                  return (
                    <button
                      key={l}
                      className={`${styles.labelOption} ${label === l ? styles.labelOptionActive : ''}`}
                      style={{
                        background: label === l ? c.bg : 'transparent',
                        color: label === l ? c.color : 'var(--zinc-500)',
                        borderColor: label === l ? c.border : 'transparent',
                      }}
                      onClick={() => setLabel(l)}
                      onContextMenu={(e) => {
                        if (isCustom) {
                          e.preventDefault();
                          handleRemoveLabel(l);
                        }
                      }}
                    >
                      {l}
                    </button>
                  );
                })}
                {/* Add label button / input */}
                {addingLabel ? (
                  <div className={styles.newLabelWrap}>
                    <input
                      ref={labelInputRef}
                      className={styles.newLabelInput}
                      placeholder="label"
                      value={newLabelName}
                      onChange={e => setNewLabelName(e.target.value)}
                      onKeyDown={handleLabelKeyDown}
                      onBlur={handleAddLabel}
                      maxLength={20}
                    />
                  </div>
                ) : (
                  <button
                    className={styles.addLabelBtn}
                    onClick={() => setAddingLabel(true)}
                    title="Add custom label"
                  >
                    <FiPlus size={10} />
                  </button>
                )}
              </div>
            </div>
            <div className={styles.formActions}>
              <div className={styles.formHint}>
                <kbd className={styles.kbd}>⌘</kbd>+<kbd className={styles.kbd}>Enter</kbd>
              </div>
              <button
                className={styles.submitBtn}
                onClick={handleAdd}
                disabled={!title.trim()}
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* ── Entries for day ── */}
        <div className={styles.list}>
          {dayEntries.length === 0 && !showForm && (
            <div className={styles.empty}>
              <LuSquareCheckBig size={24} className={styles.emptyIcon} />
              <span className={styles.emptyText}>
                {viewDate === todayKey()
                  ? 'Nothing logged today'
                  : `Nothing logged on ${formatDayLabel(viewDate)}`}
              </span>
              {viewDate === todayKey() && (
                <span className={styles.emptyHint}>Click + to log what you've done</span>
              )}
            </div>
          )}
          {dayEntries.map(entry => {
            const c = allLabels[entry.label] || DEFAULT_LABELS.feature;
            return (
              <div key={entry.id} className={styles.entry}>
                <div className={styles.entryTop}>
                  <span className={styles.entryTitle}>{entry.title}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(entry.id)}
                    title="Remove"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
                {entry.description && (
                  <div className={styles.entryDesc}>{entry.description}</div>
                )}
                <div className={styles.entryMeta}>
                  <span
                    className={styles.labelBadge}
                    style={{ background: c.bg, color: c.color, borderColor: c.border }}
                  >
                    {entry.label}
                  </span>
                  <span className={styles.entryTime}>{formatTime(entry.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Day count ── */}
        {dayEntries.length > 0 && (
          <div className={styles.dayCount}>
            {dayEntries.length} item{dayEntries.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(WhatsDonePanel);
