function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-card-border/70 ${className}`} />
  );
}

export function SkeletonRow({ className = '' }: { className?: string }) {
  return <SkeletonBlock className={`h-4 w-full ${className}`} />;
}

export function SkeletonCard() {
  return (
    <div className="card space-y-4">
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-10 w-2/3" />
      <SkeletonBlock className="h-3 w-full" />
      <SkeletonBlock className="h-3 w-4/5" />
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="flex gap-3 border-b border-card-border bg-surface/50 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <SkeletonBlock key={`h-${i}`} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-card-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={`r-${r}`} className="flex gap-3 px-4 py-3">
            {Array.from({ length: columns }).map((_, c) => (
              <SkeletonBlock key={`c-${r}-${c}`} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Skeleton = {
  Row: SkeletonRow,
  Card: SkeletonCard,
  Table: TableSkeleton,
};
