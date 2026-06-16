import './globals.css';

import type { Metadata } from 'next';

import { AppProviders } from './providers';

export const metadata: Metadata = {
  title: '词跃学习',
  description: '词汇与语法学习工具'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
