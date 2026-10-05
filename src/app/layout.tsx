import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PlayerProvider } from "@/components/PlayerProvider";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "테트리스 교실",
  description: "중학교 정보 수업용 테트리스 웹 게임",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f1021",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <PlayerProvider>
          <SiteNav />
          <main className="app-main">{children}</main>
        </PlayerProvider>
      </body>
    </html>
  );
}
