import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FiGithub, FiCheck, FiEye, FiEyeOff, FiUser, FiMoon, FiSun, FiMonitor, FiSave, FiExternalLink, FiCamera, FiZoomIn, FiZoomOut, FiEdit2, FiLogOut, FiAlertCircle, FiLoader, FiSearch, FiLock, FiGlobe, FiStar, FiDownload, FiX, FiCpu, FiKey, FiRefreshCw, FiChevronDown } from 'react-icons/fi';
import styles from './SettingsPage.module.css';

const SECTIONS = [
  { id: 'account', label: 'Account', icon: FiUser },
  { id: 'providers', label: 'Providers', icon: FiCpu },
  { id: 'github', label: 'GitHub', icon: FiGithub },
  { id: 'appearance', label: 'Appearance', icon: FiMoon },
  { id: 'about', label: 'About', icon: FiGlobe },
];

// Model aliases — the CLI always resolves these to the latest version
const CLAUDE_MODELS_DEFAULT = [
  { id: 'sonnet', label: 'Claude Sonnet', desc: 'Best balance of speed & quality', resolvedId: null },
  { id: 'opus', label: 'Claude Opus', desc: 'Most capable, slower', resolvedId: null },
  { id: 'haiku', label: 'Claude Haiku', desc: 'Fastest, most affordable', resolvedId: null },
];

/* ── Photo Editor Modal ── */
function PhotoEditorModal({ photoData, initialZoom, initialPos, onSave, onCancel }) {
  const CROP_SIZE = 240;
  const [zoom, setZoom] = useState(initialZoom || 1);
  const [pos, setPos] = useState(initialPos || { x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...pos };
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPos({ x: posStart.current.x + dx, y: posStart.current.y + dy });
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom(z => Math.min(4, Math.max(1, z - e.deltaY * 0.003)));
  }, []);

  // Background-size: at zoom=1 the image covers the circle. zoom>1 makes it bigger.
  const bgSize = `${zoom * 100}%`;
  // Background-position: center + offset. Convert px offset to % relative to the overflow area.
  const bgPosX = `calc(50% + ${pos.x}px)`;
  const bgPosY = `calc(50% + ${pos.y}px)`;

  return (
    <div className={styles.modalBackdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Edit photo</span>
        </div>

        <div className={styles.cropArea} onWheel={handleWheel}>
          <div
            className={styles.cropCircle}
            style={{
              width: CROP_SIZE,
              height: CROP_SIZE,
              backgroundImage: `url(${photoData})`,
              backgroundSize: bgSize,
              backgroundPosition: `${bgPosX} ${bgPosY}`,
              backgroundRepeat: 'no-repeat',
              cursor: dragging ? 'grabbing' : 'grab',
            }}
            onMouseDown={handleMouseDown}
          />
        </div>

        <div className={styles.cropControls}>
          <FiZoomOut size={14} className={styles.zoomIcon} />
          <input
            type="range"
            min="1"
            max="4"
            step="0.02"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className={styles.zoomSlider}
          />
          <FiZoomIn size={14} className={styles.zoomIcon} />
        </div>

        <div className={styles.modalActions}>
          <button className={styles.modalCancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.applyBtn} onClick={() => onSave(zoom, pos)}>Apply</button>
        </div>
      </div>
    </div>
  );
}

/* ── Relative time helper ── */
function timeAgo(dateStr) {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

/* ── Language color map ── */
const LANG_COLORS = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Ruby: '#701516',
  Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', 'C++': '#f34b7d', C: '#555555',
  'C#': '#178600', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  HTML: '#e34c26', CSS: '#563d7c', Shell: '#89e051', Vue: '#41b883', Svelte: '#ff3e00',
  Lua: '#000080', Zig: '#ec915c', Elixir: '#6e4a7e', Haskell: '#5e5086', Scala: '#c22d40',
};

/* ── About Section with Update Check ── */
function AboutSection() {
  const [updateStatus, setUpdateStatus] = useState('idle');
  // idle | checking | upToDate | updateAvailable
  const appVersion = window.foundry?.version || '1.0.0';

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    try {
      if (window.foundry?.updater?.checkForUpdates) {
        // Race against a 15s timeout so the UI never gets stuck
        const result = await Promise.race([
          window.foundry.updater.checkForUpdates(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
        ]);
        if (result?.update) {
          setUpdateStatus('updateAvailable');
        } else if (result?.error) {
          console.warn('[updater] Check error:', result.error);
          setUpdateStatus('upToDate');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        } else {
          setUpdateStatus('upToDate');
          setTimeout(() => setUpdateStatus('idle'), 3000);
        }
      } else {
        setUpdateStatus('upToDate');
        setTimeout(() => setUpdateStatus('idle'), 3000);
      }
    } catch (err) {
      console.warn('[updater] Check failed:', err);
      setUpdateStatus('idle');
    }
  };

  return (
    <div className={styles.section}>
      <h3 className={styles.sectionTitle}>About Foundry</h3>
      <p className={styles.sectionDesc}>Version and update information</p>

      <div className={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <label className={styles.fieldLabel}>Version</label>
            <p style={{ color: 'var(--zinc-400)', fontSize: 13, marginTop: 4 }}>
              Foundry v{appVersion}
            </p>
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking'}
            style={{ minWidth: 140, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            {updateStatus === 'checking' && <><FiLoader className={styles.spin} size={14} /> Checking...</>}
            {updateStatus === 'upToDate' && <><FiCheck size={14} /> Up to date</>}
            {updateStatus === 'updateAvailable' && <><FiDownload size={14} /> Update found!</>}
            {updateStatus === 'idle' && <><FiRefreshCw size={14} /> Check for updates</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Settings Page ── */
export default function SettingsPage({ profile, onClose, onProfileChange, onCloneRepo }) {
  const [activeSection, setActiveSection] = useState('account');
  const [githubToken, setGithubToken] = useState('');
  const [initialToken, setInitialToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [githubUser, setGithubUser] = useState(null);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState('');
  const [repos, setRepos] = useState([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposPage, setReposPage] = useState(1);
  const [reposHasMore, setReposHasMore] = useState(false);
  const [repoSearch, setRepoSearch] = useState('');
  const [cloningRepo, setCloningRepo] = useState(null);
  const [cloneError, setCloneError] = useState('');
  const [firstName, setFirstName] = useState(profile?.first_name || profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.last_name || profile?.lastName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [password, setPassword] = useState(profile?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [photoData, setPhotoData] = useState(profile?.profile_photo_data || null);
  const [photoZoom, setPhotoZoom] = useState(profile?.photo_zoom || 1);
  const [photoPos, setPhotoPos] = useState(profile?.photo_pos || { x: 0, y: 0 });
  const [theme, setTheme] = useState(profile?.theme || 'dark');
  const [profileSaved, setProfileSaved] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef(null);
  const reposFetchedRef = useRef(false);

  // Provider state
  const [claudeCliStatus, setClaudeCliStatus] = useState({ installed: false, authenticated: false });
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeApiKeyInitial, setClaudeApiKeyInitial] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [claudeKeyValidating, setClaudeKeyValidating] = useState(false);
  const [claudeKeyValid, setClaudeKeyValid] = useState(null); // null | true | false
  const [claudeKeyError, setClaudeKeyError] = useState('');
  const [claudeKeySaved, setClaudeKeySaved] = useState(false);
  const [claudeDetecting, setClaudeDetecting] = useState(false);
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [claudeModels, setClaudeModels] = useState(CLAUDE_MODELS_DEFAULT);
  const [modelsLoading, setModelsLoading] = useState(false);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  // Dirty state — has anything changed from the saved profile?
  const profileDirty =
    firstName !== (profile?.first_name || profile?.firstName || '') ||
    lastName !== (profile?.last_name || profile?.lastName || '') ||
    email !== (profile?.email || '') ||
    password !== (profile?.password || '') ||
    photoData !== (profile?.profile_photo_data || null);

  const tokenDirty = githubToken !== initialToken;

  // ── Pre-load ALL local settings at component mount ──
  // SettingsPage is ALWAYS mounted (display:none/contents toggle in IDELayout),
  // so this fires once at app startup. By the time the user clicks ANY tab,
  // all local DB data is already in React state — zero async delay on navigation.
  // Only fast local DB reads here. No network calls, no CLI spawns.
  useEffect(() => {
    async function preloadSettings() {
      const [token, cachedUserJson, apiKey, model] = await Promise.all([
        window.foundry?.getSetting('github_token'),
        window.foundry?.getSetting('github_user_cache'),
        window.foundry?.claudeGetApiKey(),
        window.foundry?.claudeGetModel(),
      ]);
      // GitHub
      if (token) {
        setGithubToken(token);
        setInitialToken(token);
        if (cachedUserJson) {
          try {
            const cachedUser = JSON.parse(cachedUserJson);
            if (cachedUser?.login) setGithubUser(cachedUser);
          } catch { /* corrupted cache — user can re-connect */ }
        }
      }
      // Providers — fast local values only
      if (apiKey) {
        setClaudeApiKey(apiKey);
        setClaudeApiKeyInitial(apiKey);
        setClaudeKeyValid(true);
      }
      if (model) {
        setSelectedModel(model);
      }
    }
    preloadSettings();
  }, []);

  // ── Providers: heavy detection runs AFTER the tab is already visible ──
  // claudeDetectAuth spawns processes (which claude, reads keychain) — slow.
  // claudeFetchModels runs CLI 3x with 30s timeouts — very slow.
  // These fire AFTER the providers page is rendered, updating in-place.
  const providersLoadedRef = useRef(false);
  useEffect(() => {
    if (activeSection !== 'providers' || providersLoadedRef.current) return;
    providersLoadedRef.current = true;

    // Detect CLI in background — page is already visible with API key + model
    setClaudeDetecting(true);
    window.foundry?.claudeDetectAuth().then(result => {
      if (result) setClaudeCliStatus(result);
    }).catch(() => {}).finally(() => setClaudeDetecting(false));

    // Fetch real model IDs in background — page already shows default labels
    setModelsLoading(true);
    window.foundry?.claudeFetchModels().then(result => {
      if (result?.models?.length) {
        setClaudeModels(prev => prev.map(m => {
          const match = result.models.find(r => r.alias === m.id);
          if (match) {
            const parts = match.resolvedId.replace('claude-', '').split('-');
            const name = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
            const version = parts.slice(1).filter(p => !p.match(/^\d{8}$/)).join('.');
            return { ...m, resolvedId: match.resolvedId, label: `Claude ${name} ${version}`.trim() };
          }
          return m;
        }));
      }
    }).catch(() => {}).finally(() => setModelsLoading(false));
  }, [activeSection]);

  const handleSaveToken = async () => {
    setGithubLoading(true);
    setGithubError('');
    const result = await window.foundry?.validateGithubToken(githubToken);
    if (result?.valid) {
      // Save token and cache user info locally so next page load is instant (no network)
      await Promise.all([
        window.foundry?.setSetting('github_token', githubToken),
        window.foundry?.setSetting('github_user_cache', JSON.stringify({
          login: result.login,
          name: result.name,
          avatar_url: result.avatar_url,
          html_url: result.html_url,
          bio: result.bio,
        })),
      ]);
      setInitialToken(githubToken);
      setGithubUser(result);
      setTokenSaved(true);
      setGithubError('');
      setTimeout(() => setTokenSaved(false), 2000);
    } else {
      setGithubError('Invalid token. Make sure it has repo, read:user, and read:org scopes.');
      setGithubUser(null);
    }
    setGithubLoading(false);
  };

  const handleDisconnectGithub = async () => {
    await Promise.all([
      window.foundry?.setSetting('github_token', ''),
      window.foundry?.setSetting('github_user_cache', ''),
    ]);
    setGithubToken('');
    setInitialToken('');
    setGithubUser(null);
    setGithubError('');
    setShowToken(false);
    setRepos([]);
    setReposPage(1);
    setReposHasMore(false);
    reposFetchedRef.current = false;
  };

  const fetchRepos = useCallback(async (token, page = 1, append = false) => {
    if (!token) return;
    setReposLoading(true);
    try {
      const result = await window.foundry?.listGithubRepos(token, page, 50);
      if (result) {
        setRepos(prev => append ? [...prev, ...result.repos] : result.repos);
        setReposHasMore(result.hasMore);
        setReposPage(page);
      }
    } catch {
      // silent
    } finally {
      setReposLoading(false);
    }
  }, []);

  // Fetch repos only when user navigates to GitHub section (lazy)
  useEffect(() => {
    if (activeSection === 'github' && githubUser && githubToken && !reposFetchedRef.current && repos.length === 0) {
      reposFetchedRef.current = true;
      fetchRepos(githubToken, 1);
    }
  }, [activeSection, githubUser, githubToken, fetchRepos, repos.length]);

  const handleLoadMore = () => {
    fetchRepos(githubToken, reposPage + 1, true);
  };

  const handleCloneRepo = async (repo) => {
    setCloningRepo(repo.id);
    setCloneError('');
    try {
      const result = await window.foundry?.cloneGithubRepo(githubToken, repo.clone_url, repo.name);
      if (result?.cancelled) {
        // User cancelled the folder picker
      } else if (result?.success) {
        // Tell the IDE to open this project
        if (onCloneRepo) onCloneRepo(result);
      } else if (result?.error) {
        setCloneError(`Failed to clone ${repo.name}: ${result.error}`);
      }
    } catch (err) {
      setCloneError(`Failed to clone ${repo.name}`);
    } finally {
      setCloningRepo(null);
    }
  };

  const filteredRepos = repoSearch.trim()
    ? repos.filter(r =>
        r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
        r.full_name.toLowerCase().includes(repoSearch.toLowerCase()) ||
        (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()))
      )
    : repos;

  const handleSaveClaudeKey = async () => {
    if (!claudeApiKey.trim()) return;
    setClaudeKeyValidating(true);
    setClaudeKeyError('');
    try {
      const result = await window.foundry?.claudeValidateKey(claudeApiKey.trim());
      if (result?.valid) {
        await window.foundry?.claudeSaveApiKey(claudeApiKey.trim());
        setClaudeApiKeyInitial(claudeApiKey.trim());
        setClaudeKeyValid(true);
        setClaudeKeySaved(true);
        setClaudeKeyError('');
        setTimeout(() => setClaudeKeySaved(false), 2000);
      } else {
        setClaudeKeyValid(false);
        setClaudeKeyError(result?.error || 'Invalid API key');
      }
    } catch (err) {
      setClaudeKeyValid(false);
      setClaudeKeyError('Failed to validate key');
    }
    setClaudeKeyValidating(false);
  };

  const handleDisconnectClaude = async () => {
    await window.foundry?.claudeSaveApiKey('');
    setClaudeApiKey('');
    setClaudeApiKeyInitial('');
    setClaudeKeyValid(null);
    setClaudeKeyError('');
    setShowClaudeKey(false);
  };

  const handleRefreshCliStatus = async () => {
    setClaudeDetecting(true);
    try {
      const cliStatus = await window.foundry?.claudeDetectAuth();
      if (cliStatus) setClaudeCliStatus(cliStatus);
    } catch { /* ignore */ }
    setClaudeDetecting(false);
  };

  const handleModelChange = async (modelId) => {
    setSelectedModel(modelId);
    setShowModelDropdown(false);
    await window.foundry?.claudeSetModel(modelId);
  };

  const claudeConnected = claudeKeyValid === true || (claudeCliStatus.authenticated && !claudeCliStatus.expired);
  const currentModelInfo = claudeModels.find(m => m.id === selectedModel) || claudeModels[0];

  const handleThemeChange = async (newTheme) => {
    setTheme(newTheme);
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
    await window.foundry?.updateProfile({ theme: newTheme });
    if (onProfileChange) await onProfileChange();
  };

  const handlePickPhoto = async () => {
    if (window.foundry?.pickPhoto) {
      const data = await window.foundry.pickPhoto();
      if (data) {
        setPhotoData(data);
        setPhotoZoom(1);
        setPhotoPos({ x: 0, y: 0 });
        setShowEditor(true);
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoData(reader.result);
      setPhotoZoom(1);
      setPhotoPos({ x: 0, y: 0 });
      setShowEditor(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditorSave = (zoom, pos) => {
    setPhotoZoom(zoom);
    setPhotoPos(pos);
    setShowEditor(false);
  };

  const handleSaveProfile = async () => {
    const updates = { firstName, lastName, email, password, theme, photoZoom, photoPos };
    if (photoData && photoData !== profile?.profile_photo_data) {
      updates.profilePhoto = photoData;
    }
    await window.foundry?.updateProfile(updates);
    if (onProfileChange) await onProfileChange();
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  // Compute avatar background styles — same math as the modal
  const avatarBgStyle = photoData ? {
    backgroundImage: `url(${photoData})`,
    backgroundSize: `${photoZoom * 100}%`,
    backgroundPosition: `calc(50% + ${photoPos.x * (72 / 240)}px) calc(50% + ${photoPos.y * (72 / 240)}px)`,
    backgroundRepeat: 'no-repeat',
  } : {};

  return (
    <div className={styles.root}>
      {showEditor && photoData && (
        <PhotoEditorModal
          photoData={photoData}
          initialZoom={photoZoom}
          initialPos={photoPos}
          onSave={handleEditorSave}
          onCancel={() => setShowEditor(false)}
        />
      )}

      <div className={styles.layout}>
        <div className={styles.nav}>
          {SECTIONS.map(s => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`${styles.navItem} ${activeSection === s.id ? styles.navItemActive : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                <Icon size={16} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.content}>
          {activeSection === 'account' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Account</h3>
              <p className={styles.sectionDesc}>Manage your profile information</p>

              <div className={styles.card}>
                {/* Profile Photo */}
                <div className={styles.photoSection}>
                  <div className={styles.photoAvatarWrap}>
                    <button
                      className={styles.photoButton}
                      onClick={handlePickPhoto}
                      style={avatarBgStyle}
                    >
                      {!photoData && (
                        <div className={styles.photoPlaceholder}>
                          {initials || <FiUser size={20} />}
                        </div>
                      )}
                      <div className={styles.photoOverlay}>
                        <FiCamera size={14} />
                      </div>
                    </button>
                    {photoData && (
                      <button
                        className={styles.photoEditBtn}
                        onClick={() => setShowEditor(true)}
                        title="Edit photo"
                      >
                        <FiEdit2 size={10} />
                      </button>
                    )}
                  </div>
                  <div className={styles.photoInfo}>
                    <span className={styles.photoName}>{firstName} {lastName}</span>
                    <button className={styles.photoChangeBtn} onClick={handlePickPhoto}>
                      Change photo
                    </button>
                    {photoData && (
                      <button
                        className={styles.photoChangeBtn}
                        onClick={() => setShowEditor(true)}
                      >
                        Edit crop
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileSelect}
                  />
                </div>

                <div className={styles.fieldRow}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>First name</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel}>Last name</label>
                    <input
                      type="text"
                      className={styles.input}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.field} style={{ marginBottom: 20 }}>
                  <label className={styles.fieldLabel}>Email</label>
                  <input
                    type="email"
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <div className={styles.field} style={{ marginBottom: 20 }}>
                  <label className={styles.fieldLabel}>Password</label>
                  <div className={styles.tokenInputWrapper}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={styles.input}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                    />
                    <button
                      className={styles.toggleBtn}
                      onClick={() => setShowPassword(v => !v)}
                    >
                      {showPassword ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                    </button>
                  </div>
                </div>

                <button className={`${styles.saveBtn} ${profileDirty ? styles.saveBtnActive : ''}`} disabled={!profileDirty && !profileSaved} onClick={handleSaveProfile}>
                  {profileSaved ? <FiCheck size={14} /> : <FiSave size={14} />}
                  {profileSaved ? 'Saved!' : 'Save Changes'}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'providers' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>AI Providers</h3>
              <p className={styles.sectionDesc}>
                Connect your AI provider to power the chat assistant. Currently supports Claude by Anthropic.
              </p>

              {/* Claude Provider Card */}
              <div className={styles.providerCard}>
                <div className={styles.providerHeader}>
                  <div className={styles.providerLogo}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path d="M16.604 3.294L21.705 20.706H17.646L12.545 3.294H16.604ZM6.354 3.294L11.455 20.706H7.396L2.295 3.294H6.354Z" fill="currentColor"/>
                    </svg>
                  </div>
                  <div className={styles.providerInfo}>
                    <span className={styles.providerName}>Claude</span>
                    <span className={styles.providerDesc}>by Anthropic</span>
                  </div>
                  {claudeConnected && (
                    <div className={styles.ghBadge}>
                      <FiCheck size={10} />
                      Connected
                    </div>
                  )}
                </div>

                {/* Subscription Detection Status */}
                <div className={styles.providerSection}>
                  <div className={styles.providerSectionHeader}>
                    <FiCpu size={13} />
                    <span>Claude Code Subscription</span>
                    {claudeDetecting && <div className={styles.ghSpinner} style={{ width: 12, height: 12 }} />}
                    <button className={styles.providerRefreshBtn} onClick={handleRefreshCliStatus} title="Re-detect">
                      <FiRefreshCw size={11} />
                    </button>
                  </div>
                  <p className={styles.providerHint} style={{ marginBottom: 8, marginTop: 0 }}>
                    Uses your existing Claude Code subscription (Pro, Max, Team) — no separate API key needed.
                  </p>
                  <div className={styles.providerStatusRow}>
                    <div className={`${styles.statusDot} ${claudeCliStatus.installed ? styles.statusDotGreen : styles.statusDotGray}`} />
                    <span className={styles.providerStatusText}>
                      {claudeCliStatus.installed ? 'Claude Code detected' : 'Claude Code not found'}
                    </span>
                  </div>
                  {claudeCliStatus.installed && (
                    <div className={styles.providerStatusRow}>
                      <div className={`${styles.statusDot} ${
                        claudeCliStatus.authenticated && !claudeCliStatus.expired
                          ? styles.statusDotGreen
                          : claudeCliStatus.authenticated && claudeCliStatus.expired
                            ? styles.statusDotYellow
                            : styles.statusDotGray
                      }`} />
                      <span className={styles.providerStatusText}>
                        {claudeCliStatus.authenticated && !claudeCliStatus.expired
                          ? `Authenticated${claudeCliStatus.subscriptionType ? ` — ${claudeCliStatus.subscriptionType.charAt(0).toUpperCase() + claudeCliStatus.subscriptionType.slice(1)} plan` : ''}`
                          : claudeCliStatus.authenticated && claudeCliStatus.expired
                            ? 'Session expired — run `claude login` to refresh'
                            : 'Not authenticated — run `claude login` in terminal'}
                      </span>
                    </div>
                  )}
                  {!claudeCliStatus.installed && (
                    <p className={styles.providerHint}>
                      Install Claude Code to use your existing subscription.{' '}
                      <button
                        className={styles.link}
                        onClick={() => window.foundry?.openExternal('https://docs.anthropic.com/en/docs/claude-code/getting-started')}
                      >
                        Get Claude Code <FiExternalLink size={10} />
                      </button>
                    </p>
                  )}
                </div>

                {/* Divider */}
                <div className={styles.providerDivider}>
                  <span>or</span>
                </div>

                {/* API Key Input */}
                <div className={styles.providerSection}>
                  <div className={styles.providerSectionHeader}>
                    <FiKey size={13} />
                    <span>API Key</span>
                  </div>

                  {/* Connected state with API key */}
                  {claudeKeyValid === true && claudeApiKeyInitial && (
                    <div className={styles.providerConnectedRow}>
                      <div className={styles.providerKeyPreview}>
                        <FiLock size={11} />
                        <span>{claudeApiKeyInitial.substring(0, 12)}...{claudeApiKeyInitial.substring(claudeApiKeyInitial.length - 4)}</span>
                      </div>
                      <button className={styles.ghDisconnectBtn} onClick={handleDisconnectClaude}>
                        <FiLogOut size={12} />
                        Remove
                      </button>
                    </div>
                  )}

                  {/* Input state */}
                  {(claudeKeyValid !== true || !claudeApiKeyInitial) && (
                    <>
                      <p className={styles.fieldHint} style={{ marginBottom: 8, marginTop: 4 }}>
                        Get your API key from{' '}
                        <button
                          className={styles.link}
                          onClick={() => window.foundry?.openExternal('https://console.anthropic.com/settings/keys')}
                        >
                          console.anthropic.com <FiExternalLink size={10} />
                        </button>
                      </p>
                      <div className={styles.tokenInputRow}>
                        <div className={styles.tokenInputWrapper}>
                          <input
                            type={showClaudeKey ? 'text' : 'password'}
                            className={`${styles.input} ${claudeKeyError ? styles.inputError : ''}`}
                            placeholder="sk-ant-api03-..."
                            value={claudeApiKey}
                            onChange={(e) => { setClaudeApiKey(e.target.value); setClaudeKeyError(''); setClaudeKeyValid(null); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' && claudeApiKey.trim()) handleSaveClaudeKey(); }}
                          />
                          <button className={styles.toggleBtn} onClick={() => setShowClaudeKey(v => !v)}>
                            {showClaudeKey ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                          </button>
                        </div>
                      </div>

                      {claudeKeyError && (
                        <div className={styles.ghError}>
                          <FiAlertCircle size={13} />
                          <span>{claudeKeyError}</span>
                        </div>
                      )}

                      <button
                        className={`${styles.saveBtn} ${claudeApiKey.trim() ? styles.saveBtnActive : ''}`}
                        disabled={!claudeApiKey.trim() || claudeKeyValidating}
                        onClick={handleSaveClaudeKey}
                      >
                        {claudeKeyValidating ? (
                          <>
                            <div className={styles.ghSpinner} style={{ width: 14, height: 14 }} />
                            Validating...
                          </>
                        ) : claudeKeySaved ? (
                          <>
                            <FiCheck size={14} />
                            Connected!
                          </>
                        ) : (
                          <>
                            <FiKey size={14} />
                            Connect
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>

                {/* Model Selection */}
                {claudeConnected && (
                  <div className={styles.providerSection} style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 8 }}>
                    <div className={styles.providerSectionHeader}>
                      <FiCpu size={13} />
                      <span>Default Model</span>
                    </div>
                    <div className={styles.modelSelector} style={{ position: 'relative' }}>
                      <button
                        className={styles.modelSelectorBtn}
                        onClick={() => setShowModelDropdown(v => !v)}
                      >
                        <span className={styles.modelSelectorLabel}>{currentModelInfo.label}</span>
                        <span className={styles.modelSelectorDesc}>{currentModelInfo.desc}</span>
                        <FiChevronDown size={14} className={styles.modelSelectorChevron} />
                      </button>
                      {showModelDropdown && (
                        <div className={styles.modelDropdown}>
                          {claudeModels.map(m => (
                            <button
                              key={m.id}
                              className={`${styles.modelDropdownItem} ${selectedModel === m.id ? styles.modelDropdownItemActive : ''}`}
                              onClick={() => handleModelChange(m.id)}
                            >
                              <span className={styles.modelDropdownLabel}>{m.label}</span>
                              <span className={styles.modelDropdownDesc}>{m.desc}</span>
                              {selectedModel === m.id && <FiCheck size={12} className={styles.modelDropdownCheck} />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'github' && (
            <div className={styles.section} style={{ maxWidth: 600 }}>
              <h3 className={styles.sectionTitle}>GitHub Integration</h3>
              <p className={styles.sectionDesc}>
                Connect your GitHub account to clone repos, push changes, and more.
              </p>

              {/* Connected state */}
              {githubUser && !githubLoading && (
                <>
                  <div className={styles.card} style={{ padding: '14px 16px' }}>
                    <div className={styles.ghConnected}>
                      <img
                        src={githubUser.avatar_url}
                        alt={githubUser.login}
                        className={styles.ghAvatar}
                      />
                      <div className={styles.ghInfo}>
                        <span className={styles.ghName}>{githubUser.name}</span>
                        <button
                          className={styles.ghUsername}
                          onClick={() => window.foundry?.openExternal(githubUser.html_url)}
                        >
                          @{githubUser.login}
                          <FiExternalLink size={9} />
                        </button>
                      </div>
                      <div className={styles.ghBadge}>
                        <FiCheck size={10} />
                        Connected
                      </div>
                      <button
                        className={styles.ghDisconnectBtn}
                        onClick={handleDisconnectGithub}
                      >
                        <FiLogOut size={12} />
                        Disconnect
                      </button>
                    </div>
                  </div>

                  {/* Repositories */}
                  <div className={styles.reposSection}>
                    <div className={styles.reposHeader}>
                      <h4 className={styles.reposTitle}>Repositories</h4>
                      <span className={styles.reposCount}>{repos.length}{reposHasMore ? '+' : ''}</span>
                    </div>

                    <div className={styles.reposSearchWrap}>
                      <FiSearch size={13} className={styles.reposSearchIcon} />
                      <input
                        type="text"
                        className={styles.reposSearchInput}
                        placeholder="Search repositories…"
                        value={repoSearch}
                        onChange={(e) => setRepoSearch(e.target.value)}
                      />
                      {repoSearch && (
                        <button className={styles.reposSearchClear} onClick={() => setRepoSearch('')}>
                          <FiX size={12} />
                        </button>
                      )}
                    </div>

                    {cloneError && (
                      <div className={styles.ghError} style={{ marginTop: 8, marginBottom: 0 }}>
                        <FiAlertCircle size={13} />
                        <span>{cloneError}</span>
                      </div>
                    )}

                    <div className={styles.reposGrid}>
                      {filteredRepos.map(repo => (
                        <div key={repo.id} className={styles.repoCard}>
                          <div className={styles.repoCardTop}>
                            <div className={styles.repoCardHeader}>
                              {repo.owner.login !== githubUser.login && (
                                <img src={repo.owner.avatar_url} alt="" className={styles.repoOwnerAvatar} />
                              )}
                              <button
                                className={styles.repoName}
                                onClick={() => window.foundry?.openExternal(repo.html_url)}
                              >
                                {repo.owner.login !== githubUser.login && (
                                  <span className={styles.repoOwnerPrefix}>{repo.owner.login}/</span>
                                )}
                                {repo.name}
                              </button>
                              {repo.private ? (
                                <FiLock size={10} className={styles.repoVisIcon} title="Private" />
                              ) : (
                                <FiGlobe size={10} className={styles.repoVisIcon} title="Public" />
                              )}
                            </div>
                            {repo.description && (
                              <p className={styles.repoDesc}>{repo.description}</p>
                            )}
                          </div>
                          <div className={styles.repoCardBottom}>
                            <div className={styles.repoMeta}>
                              {repo.language && (
                                <span className={styles.repoLang}>
                                  <span
                                    className={styles.repoLangDot}
                                    style={{ background: LANG_COLORS[repo.language] || '#8b8b8b' }}
                                  />
                                  {repo.language}
                                </span>
                              )}
                              {repo.stargazers_count > 0 && (
                                <span className={styles.repoStars}>
                                  <FiStar size={10} />
                                  {repo.stargazers_count.toLocaleString()}
                                </span>
                              )}
                              <span className={styles.repoUpdated}>
                                {timeAgo(repo.updated_at)}
                              </span>
                            </div>
                            <button
                              className={styles.repoCloneBtn}
                              onClick={() => handleCloneRepo(repo)}
                              disabled={cloningRepo === repo.id}
                              title="Clone repository"
                            >
                              {cloningRepo === repo.id ? (
                                <div className={styles.ghSpinner} style={{ width: 12, height: 12 }} />
                              ) : (
                                <>
                                  <FiDownload size={11} />
                                  <span>Clone</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {filteredRepos.length === 0 && !reposLoading && repos.length > 0 && (
                      <div className={styles.reposEmpty}>
                        No repositories match "{repoSearch}"
                      </div>
                    )}

                    {filteredRepos.length === 0 && !reposLoading && repos.length === 0 && !repoSearch && (
                      <div className={styles.reposEmpty}>
                        No repositories found
                      </div>
                    )}

                    {reposLoading && (
                      <div className={styles.reposLoadingRow}>
                        <div className={styles.ghSpinner} />
                        <span>Loading repositories…</span>
                      </div>
                    )}

                    {reposHasMore && !reposLoading && !repoSearch && (
                      <button className={styles.reposLoadMore} onClick={handleLoadMore}>
                        Load more
                      </button>
                    )}
                  </div>
                </>
              )}

              {/* Loading state — only show when user explicitly clicks Connect/Save */}
              {githubLoading && (
                <div className={styles.card}>
                  <div className={styles.ghLoadingState}>
                    <div className={styles.ghSpinner} />
                    <span>Verifying token…</span>
                  </div>
                </div>
              )}

              {/* Disconnected / input state — show immediately, even during background validation */}
              {!githubUser && !githubLoading && (
                <div className={styles.card}>
                  <div className={styles.tokenSection}>
                    <label className={styles.fieldLabel}>Personal Access Token</label>
                    <p className={styles.fieldHint}>
                      Generate a token at{' '}
                      <button
                        className={styles.link}
                        onClick={() => window.foundry?.openExternal('https://github.com/settings/tokens')}
                      >
                        github.com/settings/tokens
                        <FiExternalLink size={11} />
                      </button>
                    </p>
                    <div className={styles.tokenInputRow}>
                      <div className={styles.tokenInputWrapper}>
                        <input
                          type={showToken ? 'text' : 'password'}
                          className={`${styles.input} ${githubError ? styles.inputError : ''}`}
                          placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                          value={githubToken}
                          onChange={(e) => { setGithubToken(e.target.value); setGithubError(''); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' && githubToken.trim()) handleSaveToken(); }}
                        />
                        <button
                          className={styles.toggleBtn}
                          onClick={() => setShowToken(!showToken)}
                        >
                          {showToken ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                        </button>
                      </div>
                    </div>

                    {githubError && (
                      <div className={styles.ghError}>
                        <FiAlertCircle size={13} />
                        <span>{githubError}</span>
                      </div>
                    )}

                    <div className={styles.tokenScopes}>
                      <span className={styles.scopeLabel}>Required scopes:</span>
                      <span className={styles.scope}>repo</span>
                      <span className={styles.scope}>read:user</span>
                      <span className={styles.scope}>read:org</span>
                    </div>

                    <button
                      className={`${styles.saveBtn} ${githubToken.trim() ? styles.saveBtnActive : ''}`}
                      disabled={!githubToken.trim()}
                      onClick={handleSaveToken}
                    >
                      <FiGithub size={14} />
                      Connect GitHub
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Appearance</h3>
              <p className={styles.sectionDesc}>Customize how Foundry looks</p>

              <div className={styles.card}>
                <label className={styles.fieldLabel}>Theme</label>
                <div className={styles.themeGrid}>
                  {[
                    { id: 'dark', label: 'Dark', icon: FiMoon, bg: '#09090B', fg: '#E4E4E7' },
                    { id: 'light', label: 'Light', icon: FiSun, bg: '#FAFAFA', fg: '#18181B' },
                    { id: 'system', label: 'System', icon: FiMonitor, bg: '#09090B', fg: '#E4E4E7' },
                  ].map(t => {
                    const Icon = t.icon;
                    const selected = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        className={`${styles.themeCard} ${selected ? styles.themeCardSelected : ''}`}
                        onClick={() => handleThemeChange(t.id)}
                      >
                        <div className={styles.themePreview} style={{ background: t.bg }}>
                          <div className={styles.themePreviewBar} style={{ background: t.fg, opacity: 0.15 }} />
                          <div className={styles.themePreviewLine} style={{ background: t.fg, opacity: 0.1 }} />
                        </div>
                        <div className={styles.themeLabel}>
                          <Icon size={14} />
                          <span>{t.label}</span>
                        </div>
                        {selected && (
                          <div className={styles.themeCheck}>
                            <FiCheck size={12} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>
          )}

          {activeSection === 'about' && (
            <AboutSection />
          )}
        </div>
      </div>
    </div>
  );
}
