export default function AppLoading() {
  return (
    <div className="space-y-6 text-white">
      <div className="h-28 animate-pulse rounded-lg border border-white/10 bg-white/[0.045]" />
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-lg border border-white/10 bg-white/[0.045]" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="h-[560px] animate-pulse rounded-lg border border-white/10 bg-white/[0.045]" />
        <div className="h-[560px] animate-pulse rounded-lg border border-white/10 bg-white/[0.045]" />
      </div>
    </div>
  );
}
