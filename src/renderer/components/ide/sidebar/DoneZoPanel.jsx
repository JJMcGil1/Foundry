import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TbFlag, TbBolt, TbTrophy, TbBarrierBlock, TbNote, TbTag,
  TbFlame, TbChevronLeft, TbChevronRight, TbPlus, TbTrash,
  TbEdit, TbCheck, TbX, TbChartBar, TbList, TbChevronDown,
} from 'react-icons/tb';
import styles from '../DoneZo.module.css';

// ── Icon map for tags ──
const ICON_MAP = {
  TbFlag, TbBolt, TbTrophy, TbBarrierBlock, TbNote, TbTag,
  TbFlame, TbChartBar, TbList, TbCheck, TbPlus, TbEdit,
};

const TAG_COLORS = [
  '#4ADE80', '#22D3EE', '#FACC15', '#F87171', '#A1A1AA',
  '#A78BFA', '#F97316', '#EC4899', '#14B8A6', '#6366F1',
  '#84CC16', '#EAB308', '#06B6D4', '#E879F9',
];

function getTagIcon(iconName) {
  return ICON_MAP[iconName] || TbTag;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  if (dateStr === todayStr) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (dateStr === yesterday.toISOString().split('T')[0]) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

// ── Dashboard View ──
function DashboardView({ stats, entries, tags, onAddEntry, onNavigateToLog, projectPath, fullPage }) {
  const [inputValue, setInputValue] = useState('');
  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const maxWeekCount = Math.max(1, ...stats.weekData.map(d => d.count));

  const handleSubmit = () => {
    const text = inputValue.trim();
    if (!text) return;
    onAddEntry(text);
    setInputValue('');
  };

  const todayEntries = entries.filter(e => e.date === getToday()).slice(0, 5);

  return (
    <div className={fullPage ? styles.dashboardViewFull : styles.dashboardView}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <span className={styles.greetingText}>{getGreeting()}</span>
        <span className={styles.greetingDate}>{todayStr}</span>
      </div>

      {/* Streak */}
      {stats.streak > 0 && (
        <div className={styles.streakBanner}>
          <TbFlame size={18} className={styles.streakIcon} />
          <span className={styles.streakCount}>{stats.streak} day streak</span>
        </div>
      )}

      {/* Quick capture */}
      <div className={styles.quickCapture}>
        <input
          type="text"
          className={styles.captureInput}
          placeholder="What did you finish?"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }}}
        />
        <button className={styles.captureBtn} onClick={handleSubmit} disabled={!inputValue.trim()}>
          <TbPlus size={14} />
        </button>
      </div>

      {/* Stats grid */}
      <div className={fullPage ? styles.statsGridFull : styles.statsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.today}</span>
          <span className={styles.statLabel}>Today</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{stats.allTime}</span>
          <span className={styles.statLabel}>All Time</span>
        </div>
        <div className={styles.statCard}>
          <div className={styles.streakStatIcon}><TbFlame size={14} /></div>
          <span className={styles.statValue}>{stats.streak}</span>
          <span className={styles.statLabel}>Streak</span>
        </div>
        <div className={`${styles.statCard} ${fullPage ? styles.statCardWideFull : styles.statCardWide}`}>
          <span className={styles.statLabel} style={{ marginBottom: 6 }}>This Week</span>
          <div className={fullPage ? styles.weekChartFull : styles.weekChart}>
            {stats.weekData.map((d, i) => (
              <div key={i} className={styles.weekBar}>
                <div
                  className={`${styles.weekBarFill} ${d.date === getToday() ? styles.weekBarToday : ''}`}
                  style={{ height: `${Math.max(4, (d.count / maxWeekCount) * 100)}%` }}
                />
                <span className={styles.weekBarLabel}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      {todayEntries.length > 0 && (
        <div className={styles.recentSection}>
          <div className={styles.recentHeader}>
            <span className={styles.recentTitle}>Recent</span>
            <button className={styles.viewAllBtn} onClick={onNavigateToLog}>View all</button>
          </div>
          {todayEntries.map(entry => {
            const tag = tags.find(t => t.id === entry.tag);
            return (
              <div key={entry.id} className={styles.recentEntry} style={{ borderLeftColor: tag?.color || '#A1A1AA' }}>
                <span className={styles.recentEntryText}>{entry.text}</span>
                <span className={styles.recentEntryTime}>{formatTime(entry.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Log View ──
function LogView({ entries, tags, selectedDate, onDateChange, onAddEntry, onUpdateEntry, onDeleteEntry, projectPath, fullPage }) {
  const [inputValue, setInputValue] = useState('');
  const [selectedTag, setSelectedTag] = useState('note');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTag, setEditTag] = useState('note');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [showTagDropdown, setShowTagDropdown] = useState(null);
  const isToday = selectedDate === getToday();

  const navigateDate = (dir) => {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + dir);
    onDateChange(d.toISOString().split('T')[0]);
  };

  const handleSubmit = () => {
    const text = inputValue.trim();
    if (!text) return;
    onAddEntry(text, selectedTag);
    setInputValue('');
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditText(entry.text);
    setEditDesc(entry.description || '');
    setEditTag(entry.tag);
  };

  const saveEdit = () => {
    if (!editText.trim()) return;
    onUpdateEntry(editingId, { text: editText.trim(), description: editDesc.trim() || null, tag: editTag });
    setEditingId(null);
  };

  const dateEntries = entries.filter(e => e.date === selectedDate);

  return (
    <div className={fullPage ? styles.logViewFull : styles.logView}>
      {/* Date nav */}
      <div className={styles.dateNav}>
        <button className={styles.dateNavBtn} onClick={() => navigateDate(-1)}><TbChevronLeft size={16} /></button>
        <span className={styles.dateNavLabel}>{formatDateHeader(selectedDate)}</span>
        <button className={styles.dateNavBtn} onClick={() => navigateDate(1)} disabled={selectedDate >= getToday()}><TbChevronRight size={16} /></button>
      </div>

      {/* New entry input (only on today) */}
      {isToday && (
        <div className={styles.logInput}>
          <div className={styles.logInputRow}>
            <input
              type="text"
              className={styles.captureInput}
              placeholder="What did you finish?"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }}}
            />
            <button className={styles.captureBtn} onClick={handleSubmit} disabled={!inputValue.trim()}>
              <TbPlus size={14} />
            </button>
          </div>
          <div className={styles.tagPicker}>
            {tags.map(tag => {
              const Icon = getTagIcon(tag.icon);
              return (
                <button
                  key={tag.id}
                  className={`${styles.tagChip} ${selectedTag === tag.id ? styles.tagChipActive : ''}`}
                  style={{ '--tag-color': tag.color }}
                  onClick={() => setSelectedTag(tag.id)}
                >
                  <Icon size={11} />
                  <span>{tag.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Entries */}
      <div className={styles.entriesList}>
        {dateEntries.length === 0 ? (
          <div className={styles.emptyLog}>
            <TbNote size={24} style={{ color: 'var(--zinc-600)' }} />
            <span>No entries for this day</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {dateEntries.map(entry => {
              const tag = tags.find(t => t.id === entry.tag);
              const TagIcon = getTagIcon(tag?.icon);
              const isEditing = editingId === entry.id;

              return (
                <motion.div
                  key={entry.id}
                  className={styles.logEntry}
                  style={{ '--entry-color': tag?.color || '#A1A1AA' }}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {isEditing ? (
                    <div className={styles.editForm}>
                      <input
                        className={styles.editInput}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <textarea
                        className={styles.editTextarea}
                        placeholder="Description (optional)"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        rows={2}
                      />
                      <div className={styles.tagPicker}>
                        {tags.map(t => {
                          const TIcon = getTagIcon(t.icon);
                          return (
                            <button
                              key={t.id}
                              className={`${styles.tagChip} ${editTag === t.id ? styles.tagChipActive : ''}`}
                              style={{ '--tag-color': t.color }}
                              onClick={() => setEditTag(t.id)}
                            >
                              <TIcon size={11} />
                              <span>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className={styles.editActions}>
                        <button className={styles.editSaveBtn} onClick={saveEdit}><TbCheck size={14} /> Save</button>
                        <button className={styles.editCancelBtn} onClick={() => setEditingId(null)}><TbX size={14} /> Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={styles.entryAccent} />
                      <div className={styles.entryBody}>
                        <div className={styles.entryTop}>
                          <span className={styles.entryTitle}>{entry.text}</span>
                          <span className={styles.entryTime}>{formatTime(entry.timestamp)}</span>
                        </div>
                        {entry.description && <span className={styles.entryDesc}>{entry.description}</span>}
                        <div className={styles.entryBottom}>
                          <span className={styles.entryTag} style={{ color: tag?.color || '#A1A1AA' }}>
                            <TagIcon size={11} />
                            {tag?.label || 'Note'}
                          </span>
                          <div className={styles.entryActions}>
                            <button className={styles.entryActionBtn} onClick={() => startEdit(entry)}><TbEdit size={13} /></button>
                            <button className={styles.entryActionBtn} onClick={() => setShowDeleteConfirm(entry.id)}><TbTrash size={13} /></button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Delete confirm */}
                  {showDeleteConfirm === entry.id && (
                    <div className={styles.deleteConfirm}>
                      <span>Delete this entry?</span>
                      <div className={styles.deleteConfirmActions}>
                        <button className={styles.deleteConfirmYes} onClick={() => { onDeleteEntry(entry.id); setShowDeleteConfirm(null); }}>Delete</button>
                        <button className={styles.deleteConfirmNo} onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

// ── Main DoneZo Panel ──
export default function DoneZoPanel({ projectPath, fullPage = false, view: externalView, onViewChange }) {
  const [internalView, setInternalView] = useState('dashboard');
  const view = externalView !== undefined ? externalView : internalView;
  const setView = onViewChange !== undefined ? onViewChange : setInternalView;
  const [entries, setEntries] = useState([]);
  const [tags, setTags] = useState([]);
  const [stats, setStats] = useState({ today: 0, allTime: 0, streak: 0, weekData: [] });
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [loaded, setLoaded] = useState(false);

  const loadData = useCallback(async () => {
    if (!projectPath) return;
    const [entriesData, tagsData, statsData] = await Promise.all([
      window.foundry?.donezoGetEntries(projectPath),
      window.foundry?.donezoSeedTags(projectPath),
      window.foundry?.donezoGetStats(projectPath),
    ]);
    setEntries(entriesData || []);
    setTags(tagsData || []);
    setStats(statsData || { today: 0, allTime: 0, streak: 0, weekData: [] });
    setLoaded(true);
  }, [projectPath]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddEntry = useCallback(async (text, tag = 'note') => {
    if (!projectPath) return;
    const entry = await window.foundry?.donezoAddEntry({
      workspacePath: projectPath,
      text,
      tag,
      date: getToday(),
      timestamp: new Date().toISOString(),
    });
    if (entry) {
      setEntries(prev => [entry, ...prev]);
      // Refresh stats
      const statsData = await window.foundry?.donezoGetStats(projectPath);
      if (statsData) setStats(statsData);
    }
  }, [projectPath]);

  const handleUpdateEntry = useCallback(async (id, updates) => {
    const updated = await window.foundry?.donezoUpdateEntry(id, updates);
    if (updated) {
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    }
  }, []);

  const handleDeleteEntry = useCallback(async (id) => {
    const ok = await window.foundry?.donezoDeleteEntry(id);
    if (ok) {
      setEntries(prev => prev.filter(e => e.id !== id));
      const statsData = await window.foundry?.donezoGetStats(projectPath);
      if (statsData) setStats(statsData);
    }
  }, [projectPath]);

  if (!loaded) return null;

  return (
    <div className={fullPage ? styles.panelFull : styles.panel}>
      {/* Tab nav — hidden in full-page mode (tabs live in DoneZoPage header) */}
      {!(fullPage && externalView !== undefined) && (
        <div className={fullPage ? styles.tabBarFull : styles.tabBar}>
          <button
            className={`${styles.tab} ${view === 'dashboard' ? styles.tabActive : ''}`}
            onClick={() => setView('dashboard')}
          >
            <TbChartBar size={13} />
            <span>Dashboard</span>
          </button>
          <button
            className={`${styles.tab} ${view === 'log' ? styles.tabActive : ''}`}
            onClick={() => setView('log')}
          >
            <TbList size={13} />
            <span>Log</span>
          </button>
        </div>
      )}

      {/* Content */}
      <div className={fullPage ? styles.contentFull : styles.content}>
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
          >
            {view === 'dashboard' && (
              <DashboardView
                stats={stats}
                entries={entries}
                tags={tags}
                onAddEntry={handleAddEntry}
                onNavigateToLog={() => setView('log')}
                projectPath={projectPath}
                fullPage={fullPage}
              />
            )}
            {view === 'log' && (
              <LogView
                entries={entries}
                tags={tags}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                onAddEntry={handleAddEntry}
                onUpdateEntry={handleUpdateEntry}
                onDeleteEntry={handleDeleteEntry}
                projectPath={projectPath}
                fullPage={fullPage}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
