import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AntriCas EV Queue Planner',
    short_name: 'AntriCas',
    description: 'Manajemen antrian pengisian daya taksi listrik (EV).',
    start_url: '/',
    display: 'standalone',
    background_color: '#020617',
    theme_color: '#14b8a6',
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
