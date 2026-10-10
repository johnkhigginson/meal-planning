import { ImageResponse } from "next/og";
import { OG_COLORS, OG_SIZE, OgLemonMark } from "@/lib/og";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const alt = SITE_NAME;
export const size = OG_SIZE;
export const contentType = "image/png";

// Default share image for the landing page (and any page without its own).
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 64,
          padding: "0 96px",
          background: OG_COLORS.background,
          borderBottom: `24px solid ${OG_COLORS.brand}`,
        }}
      >
        <OgLemonMark size={300} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: OG_COLORS.ink, lineHeight: 1.05 }}>
            {SITE_NAME}
          </div>
          <div style={{ marginTop: 24, fontSize: 38, color: OG_COLORS.muted, lineHeight: 1.3 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
