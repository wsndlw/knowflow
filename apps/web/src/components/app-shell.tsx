"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import type { PlatformRole } from "@knowflow/shared";

import { cn } from "../lib/cn";
import { AuthProvider, useAuth } from "./auth-provider";
import { Button } from "./ui/button";

type NavItem = {
  href: string;
  label: string;
  /** 可见所需角色;不填 = 所有登录用户可见 */
  roles?: PlatformRole[];
};

type NavGroup = {
  title: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    title: null,
    items: [
      { href: "/", label: "工作台" },
      { href: "/knowledge-bases", label: "知识库" },
      { href: "/agents", label: "AI 对话" },
    ],
  },
  {
    title: "管理",
    items: [
      // 模型配置仅超级管理员可见
      { href: "/models", label: "模型配置", roles: ["super_admin"] },
      { href: "/admin/analytics", label: "系统统计", roles: ["super_admin"] },
    ],
  },
];

const roleLabels: Record<PlatformRole, string> = {
  super_admin: "超级管理员",
  department_admin: "部门管理员",
  user: "普通用户",
};

function canSee(item: NavItem, role: PlatformRole | undefined): boolean {
  if (item.roles === undefined) {
    return true;
  }
  return role !== undefined && item.roles.includes(role);
}

function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const role = user?.platformRole;

  return (
    <aside
      className="flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-ink"
      aria-label="主导航"
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-500 text-base font-bold text-white">
          K
        </span>
        <span className="text-md font-semibold tracking-tight">knowflow</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        {navGroups.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) => canSee(item, role));
          if (visibleItems.length === 0) {
            return null;
          }
          return (
            <div key={group.title ?? `group-${String(groupIndex)}`} className="mb-1">
              {group.title !== null ? (
                <p className="px-3 pt-4 pb-1.5 text-xs font-medium tracking-wide text-sidebar-muted">
                  {group.title}
                </p>
              ) : null}
              {visibleItems.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "mb-0.5 flex items-center rounded-md px-3 py-2 text-base transition-colors duration-150",
                      active
                        ? "bg-sidebar-active font-medium text-white"
                        : "text-sidebar-ink/85 hover:bg-sidebar-hover hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {user !== null ? (
        <div className="border-t border-white/8 px-4 py-4">
          <div className="mb-3 min-w-0">
            <p className="truncate text-base font-medium text-sidebar-ink">{user.name}</p>
            <p className="truncate text-xs text-sidebar-muted">{roleLabels[user.platformRole]}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full border-white/12 bg-white/8 text-sidebar-ink hover:bg-white/14 hover:text-white"
            onClick={() => void logout()}
          >
            退出登录
          </Button>
        </div>
      ) : null}
    </aside>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  // 登录页:独立全屏,不套侧边栏
  if (isLogin) {
    return <>{children}</>;
  }

  if (status === "loading") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background" role="status">
        <div className="flex flex-col items-center gap-3 text-ink-muted">
          <span className="size-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
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
