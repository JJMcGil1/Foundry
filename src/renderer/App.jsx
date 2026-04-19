import React, { useState, useEffect, useCallback } from 'react';
import AccountSetup from './components/AccountSetup';
import IDELayout from './components/ide/IDELayout';
import UpdateToast from './components/ide/UpdateToast';
import ToastProvider from './components/ide/ToastProvider';

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

  // Flag `html.app-idle` whenever the window isn't the user's focus.
  // Downstream CSS pauses infinite animations, xterm pauses cursor blink,
  // and timers pause their polls — so CPU/GPU wind down when Foundry is
  // in the background and the user can't see the animations anyway.
  useEffect(() => {
    const html = document.documentElement;
    let osFocused = true;
    let osVisible = true;
    const apply = () => {
      const idle =
        document.visibilityState === 'hidden' ||
        !osFocused ||
        !osVisible;
      html.classList.toggle('app-idle', idle);
    };
    const onVisibility = () => apply();
    const onWinBlur = () => { osFocused = false; apply(); };
    const onWinFocus = () => { osFocused = true; apply(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onWinBlur);
    window.addEventListener('focus', onWinFocus);
    const offActive = window.foundry?.onAppActiveChanged?.((state) => {
      if (state && typeof state === 'object') {
        osFocused = !!state.focused;
        osVisible = state.visible !== false;
        apply();
      }
    });
    apply();
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onWinBlur);
      window.removeEventListener('focus', onWinFocus);
      offActive?.();
    };
  }, []);

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
    <ToastProvider>
      <IDELayout profile={profile} onProfileChange={refreshProfile} initialProjectPath={initialProjectPath} />
      <UpdateToast />
    </ToastProvider>
  );
}
