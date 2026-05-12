import { ImageResponse } from 'next/og';

export const size = { width: 192, height: 192 };
export const contentType = 'image/png';

// Generated at build/request time — no static PNG required. Brand colors:
// Deep Teal background (#244952), Off-White text (#F7F5FA). Glyph: "Ci"
// from chaosCitim (a citim = "we read" in Romanian).
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 110,
          background: '#244952',
          color: '#F7F5FA',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Iowan Old Style, Georgia, serif',
          fontWeight: 700,
          letterSpacing: '-0.05em',
        }}
      >
        Ci
      </div>
    ),
    { ...size },
  );
}
