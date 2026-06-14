import Link from "next/link";
import { ArrowLeft, Radar } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-cip-deep text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-4xl flex-col justify-center px-6 py-16">
        <div className="inline-flex w-fit items-center gap-2 rounded-md border border-white/10 bg-white/6 px-3 py-2 text-sm text-white/64">
          <Radar className="h-4 w-4 text-cyan-100" />
          Signal not found
        </div>
        <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-normal md:text-6xl">
          这条认知路径不存在，或已经被合并到新的审计工作台。
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-white/58">
          CIP 已将旧入口收敛到新的 AI 认知审计路径。返回工作台，继续查看项目、星图、机会和证据。
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="bg-amber-100 text-slate-950 hover:bg-amber-50">
            <Link href="/zh-CN/app/projects">
              <ArrowLeft className="h-4 w-4" />
              回到审计工作台
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-white/15 bg-white/6 text-white hover:bg-white/12 hover:text-white">
            <Link href="/zh-CN">查看产品首页</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
