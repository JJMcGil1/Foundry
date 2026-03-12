import React from 'react';

export default function FoundryLogo({ size = 48 }) {
  const scale = size / 512;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="logoBg" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1A1A1E" />
          <stop offset="1" stopColor="#09090B" />
        </linearGradient>
        <linearGradient id="logoAnvil" x1="256" y1="126" x2="256" y2="386" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E4E4E7" />
          <stop offset="1" stopColor="#52525B" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#logoBg)" />
      <rect x="70"  y="126" width="372" height="72"  rx="12" fill="url(#logoAnvil)" />
      <rect x="148" y="198" width="216" height="112" rx="10" fill="url(#logoAnvil)" />
      <rect x="108" y="310" width="296" height="48"  rx="10" fill="url(#logoAnvil)" />
      <rect x="88"  y="358" width="336" height="28"  rx="12" fill="url(#logoAnvil)" />
    </svg>
  );
}
