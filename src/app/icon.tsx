import { ImageResponse } from 'next/og'
 
export const runtime = 'edge'
export const size = { width: 512, height: 512 }
export const contentType = 'image/png'
 
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 240,
          background: 'linear-gradient(to bottom right, #0d9488, #10b981)',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 900,
          borderRadius: '120px',
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.2)'
        }}
      >
        EV
      </div>
    ),
    { ...size }
  )
}
