import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AppShell } from "../components/app-shell";
import "./globals.css";
// 过渡期:阶段二/三尚未迁移的页面(工作台/知识库/对话/模型)仍依赖旧样式,迁完后删除
import "./styles.css";

export const metadata: Metadata = {
  title: "knowflow 企业知识库",
  description: "企业 AI 知识库管理平台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
