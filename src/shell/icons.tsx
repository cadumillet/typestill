// Small stroke icons for the app bar. 18px, 1.5px strokes, currentColor.

import type { SVGProps } from "react";

const base: SVGProps<SVGSVGElement> = {
  width: 18,
  height: 18,
  viewBox: "0 0 18 18",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export const ChevronLeft = () => (
  <svg {...base}>
    <path d="M11 4l-5 5 5 5" />
  </svg>
);

export const ChevronRight = () => (
  <svg {...base}>
    <path d="M7 4l5 5-5 5" />
  </svg>
);

export const NewPage = () => (
  <svg {...base}>
    <path d="M10 2.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 15.5h8a1.5 1.5 0 0 0 1.5-1.5V7z" />
    <path d="M10 2.5V7h4.5" />
    <path d="M9 9.5v4M7 11.5h4" />
  </svg>
);

export const PageSettings = () => (
  <svg {...base}>
    <path d="M10 2.5H5a1.5 1.5 0 0 0-1.5 1.5v10A1.5 1.5 0 0 0 5 15.5h8a1.5 1.5 0 0 0 1.5-1.5V7z" />
    <path d="M10 2.5V7h4.5" />
    <path d="M6.5 10.5h5M6.5 13h3" />
  </svg>
);

export const Dots = () => (
  <svg {...base} strokeWidth={0} fill="currentColor">
    <circle cx="4" cy="9" r="1.5" />
    <circle cx="9" cy="9" r="1.5" />
    <circle cx="14" cy="9" r="1.5" />
  </svg>
);

export const Eye = () => (
  <svg {...base}>
    <path d="M1.5 9s2.5-5 7.5-5 7.5 5 7.5 5-2.5 5-7.5 5-7.5-5-7.5-5z" />
    <circle cx="9" cy="9" r="2.5" />
  </svg>
);

export const SidePanel = () => (
  <svg {...base}>
    <rect x="2" y="3.5" width="14" height="11" rx="2.5" />
    <rect
      x="10.5"
      y="3.5"
      width="5.5"
      height="11"
      rx="2.5"
      fill="currentColor"
      opacity="0.35"
      stroke="none"
    />
    <path d="M10.5 3.5v11" />
  </svg>
);

export const ChevronDown = () => (
  <svg {...base} width={14} height={14}>
    <path d="M4.5 7l4.5 4.5L13.5 7" />
  </svg>
);

export const Bold = () => (
  <svg {...base} strokeWidth={1.75}>
    <path d="M5.5 3.5h4.25a2.75 2.75 0 0 1 0 5.5H5.5zM5.5 9h5a2.75 2.75 0 0 1 0 5.5h-5z" />
  </svg>
);

export const Italic = () => (
  <svg {...base}>
    <path d="M7.5 3.5h6M4.5 14.5h6M11 3.5l-4 11" />
  </svg>
);

export const AlignLeft = () => (
  <svg {...base}>
    <path d="M3 4.5h12M3 9h7M3 13.5h12" />
  </svg>
);

export const AlignCenter = () => (
  <svg {...base}>
    <path d="M3 4.5h12M5.5 9h7M3 13.5h12" />
  </svg>
);

export const AlignRight = () => (
  <svg {...base}>
    <path d="M3 4.5h12M8 9h7M3 13.5h12" />
  </svg>
);
