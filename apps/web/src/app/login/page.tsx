"use client";

import { loginRequestSchema } from "@knowflow/shared";
import { useRouter } from "next/navigation";
import { useState, type SyntheticEvent } from "react";

import { useAuth } from "../../components/auth-provider";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      const input = loginRequestSchema.parse({
        username: formData.get("username"),
        password: formData.get("password"),
      });
      await login(input);
      router.replace("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "登录失败，请重试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-background md:grid-cols-[1.1fr_1fr]">
      {/* 左侧品牌区(桌面) */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-800 to-brand-900 p-12 text-white md:flex">
        <div
          className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-brand-400/20 blur-3xl"
          aria-hidden
        />
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-brand-500 text-md font-bold text-white">
            K
          </span>
          <span className="text-lg font-semibold tracking-tight">knowflow</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-2xl leading-snug font-semibold text-white">
            企业 AI 知识库管理平台
          </h2>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            让知识的生产、管理与消费形成闭环。上传文档、智能检索、基于知识库的专家
            Agent 问答，答案可追溯来源。
          </p>
        </div>
        <p className="relative text-xs text-white/55">
          内部系统 · 账号由管理员创建
        </p>
      </section>

      {/* 右侧登录表单 */}
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <span className="grid size-10 place-items-center rounded-lg bg-brand-500 text-lg font-bold text-white">
              K
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-ink">登录</h1>
          <p className="mt-1.5 text-base text-ink-muted">使用管理员分配的账号登录</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={(event) => void handleSubmit(event)}>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-ink">
                用户名
              </label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                placeholder="请输入用户名"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-ink">
                密码
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                required
              />
            </div>

            {error !== null ? (
              <p
                className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button type="submit" size="lg" loading={isSubmitting} className="mt-1 w-full">
              {isSubmitting ? "登录中…" : "登录"}
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
