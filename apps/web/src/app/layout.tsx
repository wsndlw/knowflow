import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../components/app-shell";
import { TooltipProvider } from "../components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: "knowflow 企业知识库",
  description: "企业 AI 知识库管理平台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <TooltipProvider>
          <AppShell>{children}</AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
