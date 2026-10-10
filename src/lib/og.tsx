// Shared pieces for the generated Open Graph images (next/og ImageResponse).
// Colours mirror the light palette in globals.css.

export const OG_SIZE = { width: 1200, height: 630 };

export const OG_COLORS = {
  background: "#fbf7ee",
  ink: "#1f1b14",
  muted: "#6b6355",
  gold: "#7a5c00",
  brand: "#f4cf3a",
  brandSoft: "#fbefc2",
};

// The lemon slice from app/icon.svg, inlined so Satori can draw it.
export function OgLemonMark({ size }: { size: number }) {
  const spokes = [
    [52.4, 32],
    [46.42, 46.42],
    [32, 52.4],
    [17.58, 46.42],
    [11.6, 32],
    [17.58, 17.58],
    [32, 11.6],
    [46.42, 17.58],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="30" fill="#D4A208" />
      <circle cx="32" cy="32" r="27" fill="#F4CF3A" />
      <circle cx="32" cy="32" r="24" fill="#FFF3C9" />
      <circle cx="32" cy="32" r="20.4" fill="#F7DA5E" />
      {spokes.map(([x, y]) => (
        <line
          key={`${x}-${y}`}
          x1="32"
          y1="32"
          x2={x}
          y2={y}
          stroke="#FFF3C9"
          strokeWidth="3.3"
          strokeLinecap="round"
        />
      ))}
      <circle cx="32" cy="32" r="4.8" fill="#FFF3C9" />
    </svg>
  );
}

export function OgBrand({ size = 56, fontSize = 34 }: { size?: number; fontSize?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <OgLemonMark size={size} />
      <div style={{ fontSize, fontWeight: 700, color: OG_COLORS.ink }}>My Lemon Kitchen</div>
    </div>
  );
}
