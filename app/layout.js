import './globals.css';
import PwaManager from '../components/PwaManager';
import CallProvider from '../components/CallProvider';

export const metadata = {
  title: 'rzchat',
  description: 'Aplikasi chat realtime cepat dan simpel',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'rzchat',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="m-0 p-0 w-full min-h-[100dvh] overflow-x-hidden antialiased">
        <CallProvider>{children}</CallProvider>
        <PwaManager />
      </body>
    </html>
  );
}
