import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
});

export const Chevron = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} className="chev" strokeWidth={2} {...p}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const ChevronDown = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);
export const ArrowLeft = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const ArrowRight = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const Phone = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2" />
    <path d="M15 3a6 6 0 016 6M15 7a2 2 0 012 2" />
  </svg>
);
export const CheckCircle = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 12.5l2.3 2.3 4.7-5" />
  </svg>
);
export const Plus = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Close = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const Menu = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </svg>
);
export const Calendar = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const Pin = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 21s-7-6.2-7-11.5A7 7 0 0112 2.5a7 7 0 017 7C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);
export const Star = ({ size = 14, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...p}>
    <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z" />
  </svg>
);
export const Quote = ({ size = 28, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden {...p}>
    <path d="M13 8c-4.4 1.2-7.5 5-7.5 10.2V24h8v-8H9.7c.3-3 1.9-5 4.3-5.9L13 8zm13 0c-4.4 1.2-7.5 5-7.5 10.2V24h8v-8h-3.8c.3-3 1.9-5 4.3-5.9L26 8z" />
  </svg>
);
export const Chat = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);
export const Send = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12l16-8-6 16-2.5-6.5L4 12z" />
  </svg>
);
export const Mic = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" />
  </svg>
);
export const Facebook = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 00-1.6 19.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0012 2z" />
  </svg>
);
export const Instagram = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);
export const XLogo = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.7 3h3.1l-6.8 7.8L22 21h-6.3l-4.9-6.4L5.2 21H2.1l7.3-8.3L1.8 3h6.4l4.4 5.8L17.7 3zm-1.1 16.2h1.7L7.5 4.7H5.7l10.9 14.5z" />
  </svg>
);
export const WhatsApp = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.6.1a6.7 6.7 0 01-3.3-2.9c-.3-.4.3-.4.8-1.3.1-.2 0-.3 0-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 001.8-1.2 2.2 2.2 0 00.1-1.2c0-.1-.2-.2-.5-.3z" />
  </svg>
);

/* Service / mega-menu glyphs */
export const IconHome = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9.5z" />
  </svg>
);
export const IconKey = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <circle cx="8" cy="15" r="4.5" />
    <path d="M11.2 11.8L20 3M16.5 6.5l2.5 2.5M14 9l2 2" />
  </svg>
);
export const IconChart = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M3 20h18M6 16v-4M10.5 16V9M15 16v-6M19.5 16V5" />
  </svg>
);
export const IconBuilding = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <rect x="4" y="3" width="10" height="18" rx="1" />
    <path d="M14 9h5a1 1 0 011 1v11H14M7.5 7h3M7.5 11h3M7.5 15h3M17 13h0M17 17h0" />
  </svg>
);
export const IconCrane = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M6 21V4l12 3M6 7h14M17 7v5M15.5 12h3v2h-3zM3 21h8" />
  </svg>
);
export const IconLand = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M3 17l5-4 4 3 4-5 5 4v5H3v-3z" />
    <path d="M12 3v5M12 3l3 1.5L12 6" />
  </svg>
);
export const IconAgent = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0116 0M18 4.5a3 3 0 012 2.5" />
  </svg>
);
export const IconSpark = ({ size = 32, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.5} {...p}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
  </svg>
);
export const IconClipboard = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1M8.5 10l1.5 1.5 3-3M8.5 16h7" />
  </svg>
);
export const IconUsers = ({ size = 22, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M18 14a6 6 0 013.5 6" />
  </svg>
);
export const Leaf = ({ flip = false }: { flip?: boolean }) => (
  <svg width="22" height="40" viewBox="0 0 22 40" fill="none" aria-hidden style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <g stroke="rgba(255,255,255,.55)" strokeWidth="1.3" strokeLinecap="round">
      <path d="M17 38C8 32 4 22 7 6" />
      <path d="M7 10c-3-1-4-4-3-6 3 0 4 3 3 6zM6.3 16c-3.2-.5-4.6-3.2-4-5.6 3 .2 4.4 3 4 5.6zM6.5 22c-3.2 0-5-2.4-4.8-5 3 0 4.8 2.5 4.8 5zM8 28c-3 .6-5.4-1.4-5.8-4 3-.6 5.2 1.4 5.8 4zM10.5 33c-2.8 1.2-5.6-.2-6.5-2.6 2.8-1.2 5.4.2 6.5 2.6z" />
    </g>
  </svg>
);
