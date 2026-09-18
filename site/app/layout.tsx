import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Alex Harbour | A fictional creative portfolio',
  description:
    'A demonstration portfolio exploring thoughtful digital experiences. Alex Harbour and all three projects are fictional concepts.',
  metadataBase: new URL(
    'https://alex-harbour-portfolio.divine-apple-6939.chatgpt.site',
  ),
  alternates: { canonical: '/' },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
