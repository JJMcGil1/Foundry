import React, { useState, useRef, useCallback, useEffect } from 'react';
import { FiGithub, FiCheck, FiEye, FiEyeOff, FiExternalLink, FiAlertCircle, FiSearch, FiLock, FiGlobe, FiStar, FiDownload, FiX, FiLogOut } from 'react-icons/fi';
import { LANG_COLORS, timeAgo } from './settingsUtils';
import styles from '../SettingsPage.module.css';

export default function GitHubSection({ onCloneRepo }) {
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
  const reposFetchedRef = useRef(false);

  // Pre-load token + cached user on mount
  useEffect(() => {
    async function preload() {
      const [token, cachedUserJson] = await Promise.all([
        window.foundry?.getSetting('github_token'),
        window.foundry?.getSetting('github_user_cache'),
      ]);
      if (token) {
        setGithubToken(token);
        setInitialToken(token);
        if (cachedUserJson) {
          try {
            const cachedUser = JSON.parse(cachedUserJson);
            if (cachedUser?.login) setGithubUser(cachedUser);
          } catch { /* corrupted cache */ }
        }
      }
    }
    preload();
  }, []);

  const handleSaveToken = async () => {
    setGithubLoading(true);
    setGithubError('');
    const result = await window.foundry?.validateGithubToken(githubToken);
    if (result?.valid) {
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

  // Fetch repos lazily when user is connected
  useEffect(() => {
    if (githubUser && githubToken && !reposFetchedRef.current && repos.length === 0) {
      reposFetchedRef.current = true;
      fetchRepos(githubToken, 1);
    }
  }, [githubUser, githubToken, fetchRepos, repos.length]);

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

  return (
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

      {/* Loading state */}
      {githubLoading && (
        <div className={styles.card}>
          <div className={styles.ghLoadingState}>
            <div className={styles.ghSpinner} />
            <span>Verifying token…</span>
          </div>
        </div>
      )}

      {/* Disconnected / input state */}
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
  );
}
