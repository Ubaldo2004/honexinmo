// Iconos SVG del panel. Portados tal cual de honex-app (sin hooks → server-safe).
type P = { className?: string };
const S = ({ className = "h-5 w-5", d, fill = "none" }: P & { d: React.ReactNode; fill?: string }) => (
  <svg viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">{d}</svg>
);

export const Mark = ({ className = "h-7 w-7" }: P) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
    <defs><linearGradient id="hxg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe1a3" /><stop offset=".55" stopColor="#f6b53c" /><stop offset="1" stopColor="#c97f1e" /></linearGradient></defs>
    <path d="M16 1.6 28.6 8.8v14.4L16 30.4 3.4 23.2V8.8z" fill="url(#hxg)" />
    <path d="M16 8.4 22.4 12.1v7.8L16 23.6l-6.4-3.7v-7.8z" fill="#0a0a0c" />
    <path d="M16 12.2 19.1 14v3.6L16 19.4l-3.1-1.8V14z" fill="url(#hxg)" />
  </svg>
);

export const Grid = (p: P) => <S {...p} d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>} />;
export const Chat = (p: P) => <S {...p} d={<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.5 8.5 0 0 1 9 8.5Z" />} />;
export const Users = (p: P) => <S {...p} d={<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.3a3 3 0 0 1 0 5.4M21 20a6 6 0 0 0-3-5.2" /></>} />;
export const Building = (p: P) => <S {...p} d={<><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 22v-4h6v4M8 6h0M12 6h0M16 6h0M8 10h0M12 10h0M16 10h0" /></>} />;
export const Megaphone = (p: P) => <S {...p} d={<path d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1ZM14 8a4 4 0 0 1 0 8M14 4a8 8 0 0 1 0 16" />} />;
export const Coins = (p: P) => <S {...p} d={<><circle cx="8" cy="8" r="6" /><path d="M18.1 6.6a6 6 0 1 1-5.5 10.4M7 6h1v4M16.7 14H18v4" /></>} />;
export const Settings = (p: P) => <S {...p} d={<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 13.6H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" /></>} />;
export const Bot = (p: P) => <S {...p} d={<><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4M8 16h0M16 16h0" /></>} />;
export const Brain = (p: P) => <S {...p} d={<path d="M9.5 3a2.5 2.5 0 0 0-2.4 1.9A2.5 2.5 0 0 0 5 9.2 2.5 2.5 0 0 0 5 13a2.5 2.5 0 0 0 2.1 3.8A2.5 2.5 0 0 0 12 20V4a2.5 2.5 0 0 0-2.5-1ZM14.5 3a2.5 2.5 0 0 1 2.4 1.9A2.5 2.5 0 0 1 19 9.2 2.5 2.5 0 0 1 19 13a2.5 2.5 0 0 1-2.1 3.8A2.5 2.5 0 0 1 12 20" />} />;
export const Search = (p: P) => <S {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>} />;
export const Send = (p: P) => <S {...p} d={<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />} />;
export const Check = (p: P) => <S {...p} d={<path d="M20 6 9 17l-5-5" />} />;
export const ArrowRight = (p: P) => <S {...p} d={<path d="M5 12h14M13 6l6 6-6 6" />} />;
export const Alert = (p: P) => <S {...p} d={<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h0" /></>} />;
export const Phone = (p: P) => <S {...p} d={<path d="M5 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L17 14l5 2v3a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2Z" />} />;
export const Hand = (p: P) => <S {...p} d={<path d="M11 11V6a1.5 1.5 0 0 1 3 0v5M14 10V4.5a1.5 1.5 0 0 1 3 0V12M8 12V8a1.5 1.5 0 0 1 3 0v3M8 12l-1.5-1.5A1.5 1.5 0 0 0 4 12.6l3 4.4a6 6 0 0 0 11-3.3V8a1.5 1.5 0 0 0-3 0" />} />;
export const Edit = (p: P) => <S {...p} d={<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />} />;
export const Bell = (p: P) => <S {...p} d={<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />} />;
export const Filter = (p: P) => <S {...p} d={<path d="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />} />;
export const Trending = (p: P) => <S {...p} d={<path d="m3 17 6-6 4 4 7-7M17 8h4v4" />} />;
export const Mic = (p: P) => <S {...p} d={<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>} />;
export const Doc = (p: P) => <S {...p} d={<><path d="M14 3v5h5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-5Z" /><path d="M8 13h8M8 17h6" /></>} />;
export const Dot = ({ className = "h-2 w-2" }: P) => <svg viewBox="0 0 8 8" className={className}><circle cx="4" cy="4" r="4" fill="currentColor" /></svg>;
