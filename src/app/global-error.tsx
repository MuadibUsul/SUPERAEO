"use client";

import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="min-h-screen bg-background text-foreground">
          <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
            <div className="inline-flex w-fit items-center gap-2 rounded-md border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">
              <TriangleAlert className="h-4 w-4" />
              Runtime interruption
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-normal md:text-6xl">
              应用暂时没有完成这次渲染。
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
              这通常来自数据库、队列、Provider 或页面数据边界的临时错误。你可以重试；如果问题持续，后台 Trace 会保留诊断线索。
            </p>
            {error.digest ? <p className="mt-3 font-mono text-xs text-faint">Digest: {error.digest}</p> : null}
            <button
              type="button"
              onClick={reset}
              className="mt-8 inline-flex h-9 w-fit items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <RefreshCw className="h-4 w-4" />
              重新加载
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
