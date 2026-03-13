import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiGithub, FiCheck, FiEye, FiEyeOff, FiUser, FiMoon, FiSun, FiMonitor, FiSave, FiExternalLink, FiCamera } from 'react-icons/fi';
import styles from './SettingsPage.module.css';

const SECTIONS = [
  { id: 'account', label: 'Account', icon: FiUser },
  { id: 'github', label: 'GitHub', icon: FiGithub },
  { id: 'appearance', label: 'Appearance', icon: FiMoon },
];

export default function SettingsPage({ profile, onClose, onProfileChange }) {
  const [activeSection, setActiveSection] = useState('account');
  const [githubToken, setGithubToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [tokenSaved, setTokenSaved] = useState(false);
  const [firstName, setFirstName] = useState(profile?.first_name || profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.last_name || profile?.lastName || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [password, setPassword] = useState(profile?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [photoData, setPhotoData] = useState(profile?.profile_photo_data || null);
  const [theme, setTheme] = useState(profile?.theme || 'dark');
  const [profileSaved, setProfileSaved] = useState(false);
  const fileInputRef = useRef(null);

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  useEffect(() => {
    async function loadSettings() {
      const token = await window.foundry?.getSetting('github_token');
      if (token) setGithubToken(token);
    }
    loadSettings();
  }, []);

  const handleSaveToken = async () => {
    await window.foundry?.setSetting('github_token', githubToken);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    if (newTheme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', newTheme);
    }
  };

  const handlePickPhoto = async () => {
    if (window.foundry?.pickPhoto) {
      const data = await window.foundry.pickPhoto();
      if (data) setPhotoData(data);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhotoData(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    const updates = { firstName, lastName, email, password, theme };
    if (photoData && photoData !== profile?.profile_photo_data) {
      updates.profilePhoto = photoData;
    }
    await window.foundry?.updateProfile(updates);
    if (onProfileChange) await onProfileChange();
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <h2 className={styles.title}>Settings</h2>
        <button className={styles.closeBtn} onClick={onClose}>
          <FiX size={18} />
        </button>
      </div>

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

              {/* Profile Photo */}
              <div className={styles.photoSection}>
                <button className={styles.photoButton} onClick={handlePickPhoto}>
                  {photoData ? (
                    <img src={photoData} alt="Profile" className={styles.photoImage} />
                  ) : (
                    <div className={styles.photoPlaceholder}>
                      {initials || <FiUser size={20} />}
                    </div>
                  )}
                  <div className={styles.photoOverlay}>
                    <FiCamera size={14} />
                  </div>
                </button>
                <div className={styles.photoInfo}>
                  <span className={styles.photoName}>{firstName} {lastName}</span>
                  <button className={styles.photoChangeBtn} onClick={handlePickPhoto}>
                    Change photo
                  </button>
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

              <button className={styles.saveBtn} onClick={handleSaveProfile}>
                {profileSaved ? <FiCheck size={14} /> : <FiSave size={14} />}
                {profileSaved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          )}

          {activeSection === 'github' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>GitHub Integration</h3>
              <p className={styles.sectionDesc}>
                Connect your GitHub account to clone repos, push changes, and more.
              </p>

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
                      className={styles.input}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      value={githubToken}
                      onChange={(e) => setGithubToken(e.target.value)}
                    />
                    <button
                      className={styles.toggleBtn}
                      onClick={() => setShowToken(!showToken)}
                    >
                      {showToken ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                    </button>
                  </div>
                </div>

                <div className={styles.tokenScopes}>
                  <span className={styles.scopeLabel}>Required scopes:</span>
                  <span className={styles.scope}>repo</span>
                  <span className={styles.scope}>read:user</span>
                  <span className={styles.scope}>read:org</span>
                </div>

                <button className={styles.saveBtn} onClick={handleSaveToken}>
                  {tokenSaved ? <FiCheck size={14} /> : <FiGithub size={14} />}
                  {tokenSaved ? 'Token Saved!' : 'Save Token'}
                </button>
              </div>
            </div>
          )}

          {activeSection === 'appearance' && (
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>Appearance</h3>
              <p className={styles.sectionDesc}>Customize how Foundry looks</p>

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

              <button className={styles.saveBtn} onClick={handleSaveProfile} style={{ marginTop: 16 }}>
                {profileSaved ? <FiCheck size={14} /> : <FiSave size={14} />}
                {profileSaved ? 'Saved!' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
