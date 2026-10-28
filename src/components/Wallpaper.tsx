import { memo } from 'react'

// The wallpaper behind all the glass. Four soft wave bands, a few fine lines
// and bubbles; every colour comes from the --w* tokens of the active wallpaper.
export const Wallpaper = memo(function Wallpaper() {
  const band = (id: string, a: string, b: string) => (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style={{ stopColor: `var(${a})` }} />
      <stop offset="1" style={{ stopColor: `var(${b})` }} />
    </linearGradient>
  )
  return (
    <div className="wall" aria-hidden="true">
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          {band('wa', '--wa1', '--wa2')}
          {band('wb', '--wb1', '--wb2')}
          {band('wc', '--wc1', '--wc2')}
          {band('wd', '--wd1', '--wd2')}
          <filter id="wsoft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="18" />
          </filter>
          <radialGradient id="wbub" cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0.08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0.25" />
          </radialGradient>
        </defs>
        <g filter="url(#wsoft)">
          <path d="M-100 140 C 240 40, 520 300, 860 210 S 1420 20, 1720 180 L 1720 -100 L -100 -100 Z" fill="url(#wd)" />
          <path d="M-100 520 C 220 360, 480 660, 820 520 S 1380 260, 1720 420 L 1720 120 C 1400 0, 1100 280, 800 260 S 200 120, -100 260 Z" fill="url(#wa)" />
          <path d="M-100 760 C 260 600, 600 900, 960 740 S 1460 520, 1720 660 L 1720 380 C 1380 260, 1120 560, 820 560 S 240 420, -100 560 Z" fill="url(#wb)" />
          <path d="M-100 1100 L -100 760 C 280 640, 560 960, 940 860 S 1480 620, 1720 760 L 1720 1100 Z" fill="url(#wc)" />
        </g>
        <g className="w-lines" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.2">
          <path d="M-60 420 C 260 300, 520 600, 860 470 S 1420 230, 1680 380" />
          <path d="M-60 650 C 300 520, 620 830, 980 690 S 1460 470, 1680 600" strokeOpacity="0.22" />
          <path d="M-60 880 C 280 760, 600 1020, 960 900" strokeOpacity="0.18" />
        </g>
        <g className="w-bubs" stroke="#fff" strokeOpacity="0.35" strokeWidth="1" fill="url(#wbub)">
          <circle cx="1180" cy="300" r="34" />
          <circle cx="1250" cy="370" r="14" />
          <circle cx="360" cy="610" r="22" />
          <circle cx="980" cy="820" r="40" />
          <circle cx="1460" cy="560" r="18" />
          <circle cx="160" cy="260" r="12" />
        </g>
      </svg>
    </div>
  )
})
