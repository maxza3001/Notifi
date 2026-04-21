import type { Metadata } from "next";
import { IBM_Plex_Mono, Noto_Sans_Thai } from "next/font/google";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-sans",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "ระบบแจ้งเตือนคำขอหนังสือบำเหน็จค้ำประกัน",
  description: "ระบบบันทึกคำขอ พร้อม Telegram notification และปุ่มอัปเดตสถานะผ่านแชท",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
