import React from 'react';

export default function SageIcon({ size = 24, glyphOnly = false }) {
  if (glyphOnly) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="58 40 102 102"
        width={size}
        height={size}
        role="img"
        aria-label="Sage"
        style={{ display: 'block', flexShrink: 0 }}
      >
        <defs>
          <linearGradient id="sageGlyphFill" x1="0" y1="0" x2="0.6" y2="1">
            <stop offset="0%" stopColor="#FFB347"/>
            <stop offset="100%" stopColor="#E5651A"/>
          </linearGradient>
        </defs>
        {/* Glyph shadow */}
        <path
          d="M 138 52 C 118 52, 96 60, 82 78 C 68 96, 62 118, 74 138 C 78 130, 86 124, 96 122 C 82 116, 78 104, 86 92 C 96 78, 116 72, 134 78 C 128 86, 118 90, 106 92 C 124 96, 138 88, 146 74 C 150 66, 148 58, 138 52 Z M 96 128 C 104 136, 118 138, 132 132 C 148 124, 156 108, 152 92 C 146 100, 138 104, 128 104 C 140 112, 138 124, 126 130 C 116 134, 104 134, 96 128 Z"
          fill="#B84410"
          fillOpacity="0.2"
          transform="translate(1.5, 2.5)"
        />
        {/* Main glyph */}
        <path
          d="M 138 52 C 118 52, 96 60, 82 78 C 68 96, 62 118, 74 138 C 78 130, 86 124, 96 122 C 82 116, 78 104, 86 92 C 96 78, 116 72, 134 78 C 128 86, 118 90, 106 92 C 124 96, 138 88, 146 74 C 150 66, 148 58, 138 52 Z M 96 128 C 104 136, 118 138, 132 132 C 148 124, 156 108, 152 92 C 146 100, 138 104, 128 104 C 140 112, 138 124, 126 130 C 116 134, 104 134, 96 128 Z"
          fill="url(#sageGlyphFill)"
        />
        {/* Spark dot */}
        <circle cx="150" cy="48" r="5.5" fill="#FFD580" fillOpacity="0.9"/>
        <circle cx="150" cy="48" r="2.5" fill="#FF8A2B"/>
      </svg>
    );
  }

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label="Sage"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="sageBase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB347"/>
          <stop offset="55%" stopColor="#FF8A2B"/>
          <stop offset="100%" stopColor="#E5651A"/>
        </linearGradient>
        <linearGradient id="sageGlyph" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFF4E0"/>
          <stop offset="100%" stopColor="#FFE0B0"/>
        </linearGradient>
        <linearGradient id="sageSheen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45"/>
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="sageGlow" cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#FFE8B8" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#FFE8B8" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Squircle base */}
      <path d="M100 4 C 36 4, 4 36, 4 100 C 4 164, 36 196, 100 196 C 164 196, 196 164, 196 100 C 196 36, 164 4, 100 4 Z" fill="url(#sageBase)"/>

      {/* Hairline bezel */}
      <path d="M100 10 C 40 10, 10 40, 10 100 C 10 160, 40 190, 100 190 C 160 190, 190 160, 190 100 C 190 40, 160 10, 100 10 Z" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5"/>

      {/* Top sheen */}
      <path d="M100 8 C 40 8, 8 40, 8 100 L 8 92 C 8 38, 40 8, 100 8 C 160 8, 192 38, 192 92 L 192 100 C 192 40, 160 8, 100 8 Z" fill="url(#sageSheen)"/>

      {/* Inner glow */}
      <circle cx="80" cy="75" r="85" fill="url(#sageGlow)"/>

      {/* Glyph shadow */}
      <path d="M 138 52 C 118 52, 96 60, 82 78 C 68 96, 62 118, 74 138 C 78 130, 86 124, 96 122 C 82 116, 78 104, 86 92 C 96 78, 116 72, 134 78 C 128 86, 118 90, 106 92 C 124 96, 138 88, 146 74 C 150 66, 148 58, 138 52 Z M 96 128 C 104 136, 118 138, 132 132 C 148 124, 156 108, 152 92 C 146 100, 138 104, 128 104 C 140 112, 138 124, 126 130 C 116 134, 104 134, 96 128 Z" fill="#B84410" fillOpacity="0.35" transform="translate(2,3)"/>

      {/* Main glyph */}
      <path d="M 138 52 C 118 52, 96 60, 82 78 C 68 96, 62 118, 74 138 C 78 130, 86 124, 96 122 C 82 116, 78 104, 86 92 C 96 78, 116 72, 134 78 C 128 86, 118 90, 106 92 C 124 96, 138 88, 146 74 C 150 66, 148 58, 138 52 Z M 96 128 C 104 136, 118 138, 132 132 C 148 124, 156 108, 152 92 C 146 100, 138 104, 128 104 C 140 112, 138 124, 126 130 C 116 134, 104 134, 96 128 Z" fill="url(#sageGlyph)"/>

      {/* Spark dot */}
      <circle cx="150" cy="48" r="6" fill="#FFF4E0"/>
      <circle cx="150" cy="48" r="3" fill="#FFB347"/>
    </svg>
  );
}
