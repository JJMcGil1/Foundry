import React, { useState, useEffect, useRef } from 'react';
import { FiCheck, FiEye, FiEyeOff, FiExternalLink, FiAlertCircle, FiCpu, FiKey, FiRefreshCw, FiLogOut, FiLock, FiChevronDown, FiDownload, FiLogIn, FiX, FiCopy } from 'react-icons/fi';
import { CLAUDE_MODELS_DEFAULT, LEGACY_ALIAS_MAP } from './settingsUtils';
import styles from '../SettingsPage.module.css';

export default function ProvidersSection({ isActive }) {
  const [claudeCliStatus, setClaudeCliStatus] = useState({ installed: false, authenticated: false, version: null });
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeApiKeyInitial, setClaudeApiKeyInitial] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [claudeKeyValidating, setClaudeKeyValidating] = useState(false);
  const [claudeKeyValid, setClaudeKeyValid] = useState(null); // null | true | false
  const [claudeKeyError, setClaudeKeyError] = useState('');
  const [claudeKeySaved, setClaudeKeySaved] = useState(false);
  const [claudeDetecting, setClaudeDetecting] = useState(false);
  const [autoApprovePermissions, setAutoApprovePermissions] = useState(true);
  const [enable1MContext, setEnable1MContext] = useState(true);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [claudeModels, setClaudeModels] = useState(CLAUDE_MODELS_DEFAULT);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsRequireApiKey, setModelsRequireApiKey] = useState(false);

  // In-app login (PTY) state
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginOutput, setLoginOutput] = useState('');
  const [loginActive, setLoginActive] = useState(false);
  const [loginResult, setLoginResult] = useState(null); // { success, error?, tokenPreview? }
  const [loginInput, setLoginInput] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const loginTermRef = useRef(null);

  // Install / update state
  const [installOpen, setInstallOpen] = useState(false);
  const [installOutput, setInstallOutput] = useState('');
  const [installActive, setInstallActive] = useState(false);
  const [installResult, setInstallResult] = useState(null); // { success, error? }
  const installTermRef = useRef(null);

  const providersLoadedRef = useRef(false);

  // Pre-load local settings on mount
  useEffect(() => {
    async function preload() {
      const [apiKey, model, autoApproveRaw, disable1MRaw] = await Promise.all([
        window.foundry?.claudeGetApiKey(),
        window.foundry?.claudeGetModel(),
        window.foundry?.getSetting('claude_auto_approve_permissions'),
        window.foundry?.getSetting('claude_disable_1m'),
      ]);
      if (apiKey) {
        setClaudeApiKey(apiKey);
        setClaudeApiKeyInitial(apiKey);
        setClaudeKeyValid(true);
      }
      if (model) setSelectedModel(LEGACY_ALIAS_MAP[model] || model);
      setAutoApprovePermissions(autoApproveRaw === null || autoApproveRaw === undefined || autoApproveRaw === 'true');
      // Default ON (1M context enabled) unless explicitly disabled.
      setEnable1MContext(disable1MRaw !== 'true');
    }
    preload();
  }, []);

  // Heavy detection (auth status) runs once after tab is first visible
  useEffect(() => {
    if (!isActive || providersLoadedRef.current) return;
    providersLoadedRef.current = true;

    setClaudeDetecting(true);
    window.foundry?.claudeDetectAuth().then(result => {
      if (result) setClaudeCliStatus(result);
    }).catch(() => {}).finally(() => setClaudeDetecting(false));
  }, [isActive]);

  // Model discovery re-runs every time the tab becomes active so new models are picked up
  useEffect(() => {
    if (!isActive) return;
    setModelsLoading(true);
    setModelsRequireApiKey(false);
    window.foundry?.claudeFetchModels().then(result => {
      if (result?.models?.length) {
        setClaudeModels(result.models);
        setModelsRequireApiKey(false);
        try { localStorage.setItem('claude_models_cache', JSON.stringify(result.models)); } catch { /* ignore */ }
      } else if (result?.requiresApiKey) {
        setModelsRequireApiKey(true);
      }
    }).catch(() => {}).finally(() => setModelsLoading(false));
  }, [isActive]);

  const handleAutoApproveToggle = async (val) => {
    setAutoApprovePermissions(val);
    await window.foundry?.setSetting('claude_auto_approve_permissions', String(val));
  };

  const handle1MContextToggle = async (val) => {
    setEnable1MContext(val);
    // Storage is inverted — we store the disable flag so "unset" defaults to enabled.
    await window.foundry?.setSetting('claude_disable_1m', val ? 'false' : 'true');
  };

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

  // ---- In-app Login (PTY) ---- //

  // Strip ANSI escape sequences for readable display.
  const stripAnsi = (s) => s.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').replace(/\x1B\][^\x07]*\x07/g, '');

  useEffect(() => {
    if (!loginOpen) return;
    const offOut = window.foundry?.onClaudeLoginOutput?.((data) => {
      setLoginOutput(prev => {
        const next = prev + data;
        // Auto-extract OAuth URL if present so user can click it
        const urlMatch = stripAnsi(next).match(/https:\/\/(?:claude\.ai|console\.anthropic\.com)\/[^\s"']+/);
        if (urlMatch) setAuthUrl(urlMatch[0]);
        return next;
      });
    });
    const offRes = window.foundry?.onClaudeLoginResult?.((result) => {
      setLoginActive(false);
      setLoginResult(result);
      if (result?.success) {
        handleRefreshCliStatus();
      }
    });
    return () => { offOut?.(); offRes?.(); };
  }, [loginOpen]);

  useEffect(() => {
    if (loginTermRef.current) {
      loginTermRef.current.scrollTop = loginTermRef.current.scrollHeight;
    }
  }, [loginOutput]);

  const startLogin = async () => {
    setLoginOutput('');
    setLoginResult(null);
    setAuthUrl('');
    setLoginInput('');
    setLoginOpen(true);
    setLoginActive(true);
    const res = await window.foundry?.claudeStartLogin();
    if (!res?.success) {
      setLoginActive(false);
      setLoginResult({ success: false, error: res?.error || 'Failed to start login' });
    }
  };

  const cancelLogin = async () => {
    await window.foundry?.claudeCancelLogin?.();
    setLoginActive(false);
  };

  const closeLogin = async () => {
    if (loginActive) await cancelLogin();
    setLoginOpen(false);
  };

  const submitLoginInput = () => {
    if (!loginInput || !loginActive) return;
    // Send trimmed code + newline to the PTY
    window.foundry?.claudeLoginInput?.(loginInput.trim() + '\r');
    setLoginInput('');
  };

  const handleDisconnectSubscription = async () => {
    await window.foundry?.claudeLogout?.();
    await handleRefreshCliStatus();
  };

  // ---- Install / Update CLI ---- //

  useEffect(() => {
    if (!installOpen) return;
    const off = window.foundry?.onClaudeCliInstallOutput?.((data) => {
      setInstallOutput(prev => prev + data);
    });
    return () => { off?.(); };
  }, [installOpen]);

  useEffect(() => {
    if (installTermRef.current) {
      installTermRef.current.scrollTop = installTermRef.current.scrollHeight;
    }
  }, [installOutput]);

  const startInstallOrUpdate = async () => {
    setInstallOutput('');
    setInstallResult(null);
    setInstallActive(true);
    setInstallOpen(true);
    const res = await window.foundry?.claudeInstallOrUpdateCli?.();
    setInstallActive(false);
    setInstallResult(res);
    if (res?.success) handleRefreshCliStatus();
  };

  const closeInstall = () => {
    if (installActive) return; // wait for it to finish
    setInstallOpen(false);
  };

  const handleModelChange = async (modelId) => {
    setSelectedModel(modelId);
    setShowModelDropdown(false);
    await window.foundry?.claudeSetModel(modelId);
  };

  const claudeConnected = claudeKeyValid === true || (claudeCliStatus.authenticated && !claudeCliStatus.expired);
  const currentModelInfo = claudeModels.find(m => m.id === selectedModel) || claudeModels[0];

  return (
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
              {claudeCliStatus.installed
                ? `Claude Code detected${claudeCliStatus.version ? ` (v${claudeCliStatus.version})` : ''}`
                : 'Claude Code not found'}
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
                    ? 'Session expired — sign in again'
                    : 'Not authenticated'}
              </span>
            </div>
          )}

          {/* Action row: Install/Update + Sign In / Sign Out */}
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button
              className={`${styles.saveBtn} ${styles.saveBtnActive}`}
              onClick={startInstallOrUpdate}
              disabled={installActive}
              style={{ flex: '0 0 auto' }}
            >
              <FiDownload size={14} />
              {claudeCliStatus.installed ? 'Update CLI' : 'Install CLI'}
            </button>
            {claudeCliStatus.installed && !claudeCliStatus.authenticated && (
              <button
                className={`${styles.saveBtn} ${styles.saveBtnActive}`}
                onClick={startLogin}
                style={{ flex: '0 0 auto' }}
              >
                <FiLogIn size={14} />
                Sign In with Claude Code
              </button>
            )}
            {claudeCliStatus.authenticated && claudeCliStatus.authSource === 'oauth_token' && (
              <button
                className={styles.ghDisconnectBtn}
                onClick={handleDisconnectSubscription}
                style={{ flex: '0 0 auto' }}
              >
                <FiLogOut size={12} />
                Sign Out
              </button>
            )}
            {claudeCliStatus.installed && claudeCliStatus.authenticated && claudeCliStatus.expired && (
              <button
                className={`${styles.saveBtn} ${styles.saveBtnActive}`}
                onClick={startLogin}
                style={{ flex: '0 0 auto' }}
              >
                <FiRefreshCw size={14} />
                Re-authenticate
              </button>
            )}
          </div>

          {!claudeCliStatus.installed && (
            <p className={styles.providerHint} style={{ marginTop: 8 }}>
              Claude Code is installed via npm (requires Node.js).{' '}
              <button
                className={styles.link}
                onClick={() => window.foundry?.openExternal('https://docs.anthropic.com/en/docs/claude-code/getting-started')}
              >
                Learn more <FiExternalLink size={10} />
              </button>
            </p>
          )}

          {/* Auto-approve permissions toggle */}
          {claudeCliStatus.installed && (
            <div className={styles.autoApproveRow}>
              <div className={styles.autoApproveInfo}>
                <span className={styles.autoApproveLabel}>Auto-approve all permissions</span>
                <span className={styles.providerHint}>
                  Never pause for tool approvals — Claude runs uninterrupted without asking for permission.
                </span>
              </div>
              <button
                className={`${styles.toggleSwitch} ${autoApprovePermissions ? styles.toggleSwitchOn : ''}`}
                onClick={() => handleAutoApproveToggle(!autoApprovePermissions)}
                aria-pressed={autoApprovePermissions}
                title={autoApprovePermissions ? 'Disable auto-approve' : 'Enable auto-approve'}
              >
                <span className={styles.toggleThumb} />
              </button>
            </div>
          )}

          {/* 1M context window toggle */}
          <div className={styles.autoApproveRow}>
            <div className={styles.autoApproveInfo}>
              <span className={styles.autoApproveLabel}>1M context window</span>
              <span className={styles.providerHint}>
                Use the 1M-token context window on Opus 4.7 / 4.6 and Sonnet 4.6.
                Via the CLI, the <code>[1m]</code> alias suffix is appended automatically
                (Max / Team / Enterprise plans include it; Pro needs extra usage).
                Via direct API key, the <code>context-1m-2025-08-07</code> beta header is sent.
                Haiku stays at 200K.
              </span>
            </div>
            <button
              className={`${styles.toggleSwitch} ${enable1MContext ? styles.toggleSwitchOn : ''}`}
              onClick={() => handle1MContextToggle(!enable1MContext)}
              aria-pressed={enable1MContext}
              title={enable1MContext ? 'Disable 1M context' : 'Enable 1M context'}
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
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
            {!modelsLoading && modelsRequireApiKey && (
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                Add an API key above to enable live model discovery. Subscription-only accounts use a built-in model list.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ---- Sign-In Modal (PTY) ---- */}
      {loginOpen && (
        <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget) closeLogin(); }}>
          <div className={styles.modal} style={{ width: 640, maxHeight: '80vh' }}>
            <div className={styles.modalHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={styles.modalTitle}>Sign in with Claude Code</span>
              <button className={styles.providerRefreshBtn} onClick={closeLogin} title="Close">
                <FiX size={13} />
              </button>
            </div>

            <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {authUrl ? (
                <>
                  1. Click the link below to authorize in your browser.<br />
                  2. Copy the code you receive and paste it below.
                </>
              ) : (
                'Starting authentication…'
              )}
            </div>

            {authUrl && (
              <div style={{ padding: '0 20px 12px', display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className={styles.link}
                  onClick={() => window.foundry?.openExternal(authUrl)}
                  style={{ fontSize: 12, textAlign: 'left', wordBreak: 'break-all' }}
                >
                  {authUrl} <FiExternalLink size={10} />
                </button>
                <button
                  className={styles.providerRefreshBtn}
                  onClick={() => navigator.clipboard?.writeText(authUrl)}
                  title="Copy URL"
                >
                  <FiCopy size={11} />
                </button>
              </div>
            )}

            <div
              ref={loginTermRef}
              style={{
                margin: '0 20px',
                padding: 12,
                background: '#0a0a0c',
                border: '1px solid #2a2a2e',
                borderRadius: 6,
                fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
                fontSize: 11,
                color: '#d0d0d0',
                maxHeight: 220,
                minHeight: 120,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {loginOutput ? stripAnsi(loginOutput) : 'Waiting for claude setup-token…\n'}
            </div>

            {loginActive && (
              <div style={{ display: 'flex', gap: 8, padding: '12px 20px' }}>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="Paste authorization code here…"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && loginInput.trim()) submitLoginInput(); }}
                  autoFocus
                />
                <button
                  className={`${styles.saveBtn} ${loginInput.trim() ? styles.saveBtnActive : ''}`}
                  onClick={submitLoginInput}
                  disabled={!loginInput.trim()}
                >
                  Submit
                </button>
              </div>
            )}

            {loginResult && (
              <div style={{ padding: '0 20px 12px' }}>
                {loginResult.success ? (
                  <div className={styles.ghBadge} style={{ padding: '6px 10px', fontSize: 12 }}>
                    <FiCheck size={12} />
                    Authenticated — token {loginResult.tokenPreview}
                  </div>
                ) : (
                  <div className={styles.ghError}>
                    <FiAlertCircle size={13} />
                    <span>{loginResult.error}</span>
                  </div>
                )}
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={closeLogin}>
                {loginActive ? 'Cancel' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- Install / Update CLI Modal ---- */}
      {installOpen && (
        <div className={styles.modalBackdrop} onClick={(e) => { if (e.target === e.currentTarget && !installActive) closeInstall(); }}>
          <div className={styles.modal} style={{ width: 640, maxHeight: '80vh' }}>
            <div className={styles.modalHeader} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className={styles.modalTitle}>
                {claudeCliStatus.installed ? 'Update Claude Code CLI' : 'Install Claude Code CLI'}
              </span>
              <button
                className={styles.providerRefreshBtn}
                onClick={closeInstall}
                disabled={installActive}
                title={installActive ? 'Running…' : 'Close'}
              >
                <FiX size={13} />
              </button>
            </div>

            <div
              ref={installTermRef}
              style={{
                margin: '16px 20px',
                padding: 12,
                background: '#0a0a0c',
                border: '1px solid #2a2a2e',
                borderRadius: 6,
                fontFamily: 'var(--font-mono, ui-monospace, Menlo, monospace)',
                fontSize: 11,
                color: '#d0d0d0',
                maxHeight: 320,
                minHeight: 200,
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {installOutput || 'Starting…'}
            </div>

            {installResult && !installResult.success && (
              <div style={{ padding: '0 20px 12px' }}>
                <div className={styles.ghError}>
                  <FiAlertCircle size={13} />
                  <span>{installResult.error}</span>
                </div>
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.modalCancelBtn} onClick={closeInstall} disabled={installActive}>
                {installActive ? 'Running…' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
