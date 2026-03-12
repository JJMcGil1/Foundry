import React from 'react';

export default function FoundryLogo({ size = 40, light = false }) {
  const textColor = light ? '#18181B' : '#E4E4E7';
  const gradId = light ? 'anvil-light' : 'anvil-dark';
  const stopTop = light ? '#27272A' : '#E4E4E7';
  const stopBot = light ? '#71717A' : '#52525B';

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
      <svg
        viewBox="0 0 56 43"
        width={size}
        height={size * (43 / 56)}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id={gradId} x1="28" y1="0" x2="28" y2="43" gradientUnits="userSpaceOnUse">
            <stop stopColor={stopTop} />
            <stop offset="1" stopColor={stopBot} />
          </linearGradient>
        </defs>
        <rect x="0"  y="0"  width="56" height="11" rx="2.5" fill={`url(#${gradId})`} />
        <rect x="14" y="11" width="28" height="17" rx="2"   fill={`url(#${gradId})`} />
        <rect x="7"  y="28" width="42" height="7"  rx="2"   fill={`url(#${gradId})`} />
        <rect x="4"  y="35" width="48" height="4"  rx="2"   fill={`url(#${gradId})`} />
      </svg>
      <span
        style={{
          fontFamily: "'Outfit', sans-serif",
          fontWeight: 600,
          fontSize: size * 0.85,
          color: textColor,
          letterSpacing: '-0.5px',
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        Foundry
      </span>
    </div>
  );
}
