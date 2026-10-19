/**
 * EvidenceScene — the specimen image used across the landing page.
 *
 * One geometry source rendered in two palette variants:
 *   - "photo": a night-harbour skyline that reads as a real photograph
 *   - "ela":   the same scene as an Error Level Analysis output (black field,
 *              glowing edges, warm reaction regions)
 *
 * Both variants are generated from the identical element list and seeded
 * window grid, so they align pixel-for-pixel in the hero comparison viewer.
 */

type Variant = "photo" | "ela";

export interface EvidenceSceneProps {
  variant: Variant;
  className?: string;
}

/** Deterministic PRNG so both variants draw the exact same windows. */
function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const FAR_SKYLINE: [number, number, number, number][] = [
  // [x, y, w, h] — baseline at y = 430
  [0, 358, 112, 72],
  [112, 330, 82, 100],
  [194, 376, 132, 54],
  [326, 342, 70, 88],
  [396, 302, 96, 128],
  [492, 356, 122, 74],
  [614, 322, 86, 108],
  [700, 366, 142, 64],
  [842, 336, 74, 94],
  [916, 360, 112, 70],
  [1028, 326, 92, 104],
  [1120, 352, 80, 78],
];

const TOWERS = [
  { x: 36, y: 206, w: 214, h: 554, cols: 5, rows: 14, seed: 7, hot: false },
  { x: 616, y: 300, w: 168, h: 460, cols: 4, rows: 11, seed: 23, hot: false },
  { x: 924, y: 172, w: 236, h: 588, cols: 6, rows: 16, seed: 41, hot: true },
] as const;

const REFLECTIONS: [number, number, number, number][] = [
  // [x, y, w, opacity-scale]
  [40, 452, 210, 0.5],
  [120, 486, 340, 0.35],
  [560, 462, 260, 0.4],
  [640, 512, 420, 0.3],
  [920, 448, 240, 0.55],
  [960, 500, 300, 0.4],
  [980, 566, 220, 0.25],
  [180, 604, 460, 0.22],
  [700, 640, 380, 0.2],
  [340, 690, 520, 0.16],
];

const STARS: [number, number, number][] = [
  [90, 70, 2], [180, 140, 1.4], [280, 60, 1.8], [360, 170, 1.2],
  [470, 90, 2.2], [560, 150, 1.3], [660, 66, 1.7], [740, 180, 1.2],
  [820, 110, 1.9], [1080, 70, 1.6], [1150, 160, 1.3], [60, 220, 1.4],
  [620, 230, 1.2], [860, 240, 1.5],
];

interface WindowCell {
  x: number;
  y: number;
  lit: number; // 0 = dark, 1 = warm, 2 = cool, 3 = bright
  hot: boolean;
}

function buildWindows(): WindowCell[] {
  const cells: WindowCell[] = [];
  for (const tower of TOWERS) {
    const rand = makeRandom(tower.seed);
    const pitchX = tower.w / tower.cols;
    const pitchY = tower.h / tower.rows;
    for (let row = 0; row < tower.rows; row++) {
      for (let col = 0; col < tower.cols; col++) {
        const roll = rand();
        // Cluster the hot tower's reaction toward its upper-left block.
        const hot =
          tower.hot && col < 3 && row < 7 && rand() > 0.35;
        const lit = roll > 0.62 ? (roll > 0.92 ? 3 : roll > 0.78 ? 2 : 1) : 0;
        if (lit === 0 && !hot) continue;
        cells.push({
          x: Math.round(tower.x + col * pitchX + pitchX * 0.24),
          y: Math.round(tower.y + row * pitchY + pitchY * 0.26),
          lit: lit === 0 ? 1 : lit,
          hot,
        });
      }
    }
  }
  return cells;
}

const WINDOWS = buildWindows();

export default function EvidenceScene({ variant, className }: EvidenceSceneProps) {
  const photo = variant === "photo";
  const p = (photoValue: string, elaValue: string) =>
    photo ? photoValue : elaValue;

  return (
    <svg
      viewBox="0 0 1200 760"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={
        photo
          ? "Sample evidence photograph: a city harbour at night"
          : "Error Level Analysis view of the same photograph"
      }
    >
      <defs>
        <linearGradient id={`sky-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={photo ? "#070d1c" : "#020409"} />
          <stop offset="55%" stopColor={photo ? "#0c1a33" : "#020409"} />
          <stop offset="100%" stopColor={photo ? "#1a4152" : "#03060d"} />
        </linearGradient>
        <linearGradient id={`water-${variant}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={photo ? "#0a1c2c" : "#02050b"} />
          <stop offset="100%" stopColor={photo ? "#050b16" : "#010307"} />
        </linearGradient>
        <radialGradient id={`moon-${variant}`}>
          <stop offset="0%" stopColor="#fff7df" stopOpacity={photo ? 0.5 : 0.12} />
          <stop offset="100%" stopColor="#fff7df" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`vignette-${variant}`}>
          <stop offset="55%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity={photo ? 0.5 : 0.7} />
        </radialGradient>
      </defs>

      {/* Sky */}
      <rect x="0" y="0" width="1200" height="470" fill={`url(#sky-${variant})`} />

      {/* Stars */}
      {STARS.map(([x, y, r], i) => (
        <circle
          key={`star-${i}`}
          cx={x}
          cy={y}
          r={r}
          fill="#eaf2ff"
          opacity={photo ? 0.35 + (i % 4) * 0.14 : 0.08}
        />
      ))}

      {/* Moon — filled disc in photo, edge ring in ELA */}
      <circle cx="960" cy="118" r="112" fill={`url(#moon-${variant})`} />
      <circle
        cx="960"
        cy="118"
        r="44"
        fill={photo ? "#f4efe0" : "none"}
        stroke={photo ? "none" : "rgba(160,190,255,0.55)"}
        strokeWidth={photo ? 0 : 2}
      />

      {/* Far skyline */}
      {FAR_SKYLINE.map(([x, y, w, h], i) => (
        <rect
          key={`far-${i}`}
          x={x}
          y={y}
          width={w}
          height={h}
          fill={photo ? "#0a1326" : "#04070e"}
          stroke={photo ? "none" : "rgba(77,141,255,0.38)"}
          strokeWidth={photo ? 0 : 1.25}
        />
      ))}
      {/* Antenna beacon */}
      <line
        x1="444"
        y1="302"
        x2="444"
        y2="262"
        stroke={photo ? "#0a1326" : "rgba(77,141,255,0.5)"}
        strokeWidth="3"
      />
      <circle
        cx="444"
        cy="258"
        r="4"
        fill={photo ? "#ff5b5b" : "#ffb454"}
        opacity={photo ? 1 : 0.8}
      />

      {/* Water */}
      <rect x="0" y="430" width="1200" height="330" fill={`url(#water-${variant})`} />
      {REFLECTIONS.map(([x, y, w, scale], i) => (
        <rect
          key={`refl-${i}`}
          x={x}
          y={y}
          width={w}
          height={photo ? 6 : 2}
          rx="3"
          fill={
            photo
              ? i % 3 === 0
                ? "#ffb454"
                : "#3f7fa6"
              : "rgba(77,141,255,0.5)"
          }
          opacity={(photo ? 0.16 : 0.3) * scale * 2}
        />
      ))}

      {/* Foreground towers with identical window grids */}
      {TOWERS.map((tower, ti) => (
        <g key={`tower-${ti}`}>
          <rect
            x={tower.x}
            y={tower.y}
            width={tower.w}
            height={tower.h}
            fill={photo ? "#060b16" : "#02040a"}
            stroke={
              !photo && tower.hot
                ? "rgba(255,180,84,0.75)"
                : photo
                  ? "none"
                  : "rgba(77,141,255,0.45)"
            }
            strokeWidth={photo || !tower.hot ? 1.25 : 2}
          />
          {!photo && tower.hot && (
            <rect
              x={tower.x + 6}
              y={tower.y + 6}
              width={tower.w / 2 - 6}
              height={(tower.h / tower.rows) * 7 - 6}
              fill="rgba(255,157,60,0.14)"
            />
          )}
        </g>
      ))}
      {WINDOWS.map((cell, i) => {
        const color = photo
          ? cell.lit === 3
            ? "#9fdcff"
            : cell.lit === 2
              ? "#ffd9a0"
              : "#ffb454"
          : cell.hot
            ? "#ff9d3c"
            : cell.lit === 3
              ? "#cfe0ff"
              : cell.lit === 2
                ? "#8fb2ff"
                : "#5f86e0";
        return (
          <rect
            key={`win-${i}`}
            x={cell.x}
            y={cell.y}
            width="16"
            height="10"
            rx="2"
            fill={color}
            opacity={
              photo
                ? cell.lit === 3
                  ? 0.95
                  : 0.8
                : cell.hot
                  ? 0.95
                  : cell.lit === 3
                    ? 0.9
                    : 0.62
            }
          />
        );
      })}

      {/* Atmospheric vignette */}
      <rect x="0" y="0" width="1200" height="760" fill={`url(#vignette-${variant})`} />

      {/* Frame furniture: corner ticks so it reads as an examined specimen */}
      <g stroke={p("rgba(255,255,255,0.35)", "rgba(77,141,255,0.6)")} strokeWidth="2" fill="none">
        <path d="M24 56 V24 H56" />
        <path d="M1144 24 H1176 V56" />
        <path d="M1176 704 V736 H1144" />
        <path d="M56 736 H24 V704" />
      </g>
      <text
        x="36"
        y="726"
        fill={p("rgba(255,255,255,0.5)", "rgba(143,178,255,0.7)")}
        fontSize="18"
        fontFamily="ui-monospace, monospace"
        letterSpacing="2"
      >
        {photo ? "SPECIMEN · 1200×760" : "ELA · Q90 ×15"}
      </text>
    </svg>
  );
}
