import './globals.css';

export const metadata = {
  title: 'rzchat',
  description: 'Aplikasi chat realtime cepat dan simpel',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body className="m-0 p-0 w-full min-h-[100dvh] overflow-x-hidden antialiased">
        {children}
      </body>
    </html>
  );
}
