import React, { useState, useEffect, useRef } from 'react';
import { FiCheck, FiEye, FiEyeOff, FiExternalLink, FiAlertCircle, FiCpu, FiKey, FiRefreshCw, FiLogOut, FiLock, FiChevronDown } from 'react-icons/fi';
import { CLAUDE_MODELS_DEFAULT } from './settingsUtils';
import styles from '../SettingsPage.module.css';

export default function ProvidersSection({ isActive }) {
  const [claudeCliStatus, setClaudeCliStatus] = useState({ installed: false, authenticated: false });
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [claudeApiKeyInitial, setClaudeApiKeyInitial] = useState('');
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [claudeKeyValidating, setClaudeKeyValidating] = useState(false);
  const [claudeKeyValid, setClaudeKeyValid] = useState(null); // null | true | false
  const [claudeKeyError, setClaudeKeyError] = useState('');
  const [claudeKeySaved, setClaudeKeySaved] = useState(false);
  const [claudeDetecting, setClaudeDetecting] = useState(false);
  const [autoApprovePermissions, setAutoApprovePermissions] = useState(true);
  const [selectedModel, setSelectedModel] = useState('sonnet');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [claudeModels, setClaudeModels] = useState(CLAUDE_MODELS_DEFAULT);
  const [modelsLoading, setModelsLoading] = useState(false);

  const providersLoadedRef = useRef(false);

  // Pre-load local settings on mount
  useEffect(() => {
    async function preload() {
      const [apiKey, model, autoApproveRaw] = await Promise.all([
        window.foundry?.claudeGetApiKey(),
        window.foundry?.claudeGetModel(),
        window.foundry?.getSetting('claude_auto_approve_permissions'),
      ]);
      if (apiKey) {
        setClaudeApiKey(apiKey);
        setClaudeApiKeyInitial(apiKey);
        setClaudeKeyValid(true);
      }
      if (model) setSelectedModel(model);
      setAutoApprovePermissions(autoApproveRaw === null || autoApproveRaw === undefined || autoApproveRaw === 'true');
    }
    preload();
  }, []);

  // Heavy detection runs AFTER the tab is visible
  useEffect(() => {
    if (!isActive || providersLoadedRef.current) return;
    providersLoadedRef.current = true;

    setClaudeDetecting(true);
    window.foundry?.claudeDetectAuth().then(result => {
      if (result) setClaudeCliStatus(result);
    }).catch(() => {}).finally(() => setClaudeDetecting(false));

    setModelsLoading(true);
    window.foundry?.claudeFetchModels().then(result => {
      if (result?.models?.length) {
        setClaudeModels(prev => prev.map(m => {
          const match = result.models.find(r => r.alias === m.id);
          if (match) {
            return { ...m, resolvedId: match.resolvedId };
          }
          return m;
        }));
      }
    }).catch(() => {}).finally(() => setModelsLoading(false));
  }, [isActive]);

  const handleAutoApproveToggle = async (val) => {
    setAutoApprovePermissions(val);
    await window.foundry?.setSetting('claude_auto_approve_permissions', String(val));
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
  );
}
