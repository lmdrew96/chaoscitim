import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 100,
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
