import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./styles.css";

export const metadata: Metadata = {
  title: "Knowflow",
  description: "AI knowledge base management platform",
};

const navItems = [
  { href: "/", label: "工作台" },
  { href: "/login", label: "登录" },
  { href: "/knowledge-bases", label: "知识库" },
  { href: "/agents", label: "专家 Agent" },
  { href: "/models", label: "模型配置" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="shell">
          <aside className="sidebar" aria-label="主导航">
            <div className="brand">
              <span className="brand-mark">K</span>
              <span>Knowflow</span>
            </div>
            <nav className="nav-list">
              {navItems.map((item) => (
                <Link key={item.href} className="nav-link" href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="content">{children}</main>
        </div>
      </body>
    </html>
  );
}
