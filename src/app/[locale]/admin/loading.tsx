export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
