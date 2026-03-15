import React, { useState, useEffect, useCallback } from 'react';
import AccountSetup from './components/AccountSetup';
import IDELayout from './components/ide/IDELayout';
import UpdateToast from './components/ide/UpdateToast';

function applyTheme(theme) {
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme || 'dark');
  }
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [profile, setProfile] = useState(null);

  const refreshProfile = useCallback(async () => {
    if (window.foundry?.getProfile) {
      const p = await window.foundry.getProfile();
      if (p) {
        setProfile(p);
        applyTheme(p.theme);
      }
      return p;
    }
    return null;
  }, []);

  useEffect(() => {
    async function checkProfile() {
      try {
        const p = await refreshProfile();
        setHasProfile(!!p);
      } catch (err) {
        console.error('Failed to check profile:', err);
      } finally {
        setLoading(false);
      }
    }
    checkProfile();
  }, [refreshProfile]);

  // Listen for system theme changes when using 'system' theme
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (profile?.theme === 'system') {
        applyTheme('system');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [profile?.theme]);

  if (loading) return null;

  if (!hasProfile) {
    return (
      <AccountSetup
        onComplete={(p) => {
          setProfile(p);
          setHasProfile(true);
          applyTheme(p.theme);
        }}
      />
    );
  }

  // Check for projectPath query param (new window opened with specific workspace)
  const urlParams = new URLSearchParams(window.location.search);
  const initialProjectPath = urlParams.get('projectPath') || undefined;

  return (
    <>
      <IDELayout profile={profile} onProfileChange={refreshProfile} initialProjectPath={initialProjectPath} />
      <UpdateToast />
    </>
  );
}
