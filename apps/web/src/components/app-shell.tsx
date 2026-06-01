"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AuthProvider, useAuth } from "./auth-provider";

const navItems = [
  { href: "/", label: "Workspace" },
  { href: "/knowledge-bases", label: "Knowledge" },
  { href: "/agents", label: "Agents" },
  { href: "/models", label: "Models" },
];

function ShellContent({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAuth();
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (status === "loading" && !isLogin) {
    return (
      <div className="auth-loading" role="status">
        Loading...
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
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
        {user !== null && (
          <div className="session-box">
            <div>
              <strong>{user.name}</strong>
              <span>{user.platformRole}</span>
            </div>
            <button type="button" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        )}
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <ShellContent>{children}</ShellContent>
    </AuthProvider>
  );
}
