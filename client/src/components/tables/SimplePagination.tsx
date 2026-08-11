import { useState, useMemo } from 'react';

interface PaginationControls<T> {
  page: number;
  pageSize: number;
  pageCount: number;
  pageData: T[];
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  total: number;
  from: number;
  to: number;
}

export function usePagination<T>(data: T[], defaultPageSize = 20): PaginationControls<T> {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const pageCount = Math.max(1, Math.ceil(data.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);

  const pageData = useMemo(
    () => data.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [data, safePage, pageSize],
  );

  return {
    page: safePage,
    pageSize,
    pageCount,
    pageData,
    setPage: (p: number) => setPage(Math.max(0, Math.min(p, pageCount - 1))),
    setPageSize: (s: number) => { setPageSizeState(s); setPage(0); },
    total: data.length,
    from: data.length === 0 ? 0 : safePage * pageSize + 1,
    to: Math.min((safePage + 1) * pageSize, data.length),
  };
}

export function PaginationBar({ pg }: { pg: PaginationControls<unknown> }) {
  if (pg.total <= 20) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-card-border bg-surface/80 px-4 py-2.5">
      <span className="text-xs text-heading/60">
        Showing {pg.from}–{pg.to} of {pg.total}
      </span>
      <div className="flex items-center gap-2">
        <select
          className="rounded border border-card-border bg-card px-2 py-1 text-xs"
          value={pg.pageSize}
          onChange={(e) => pg.setPageSize(Number(e.target.value))}
        >
          {[20, 50, 100].map((n) => (
            <option key={n} value={n}>{n} rows</option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-heading/80 hover:bg-surface disabled:opacity-40"
          onClick={() => pg.setPage(pg.page - 1)}
          disabled={pg.page === 0}
        >
          Previous
        </button>
        <span className="text-xs text-heading/70">
          Page {pg.page + 1} of {pg.pageCount}
        </span>
        <button
          type="button"
          className="rounded-md border border-card-border bg-card px-3 py-1.5 text-xs font-medium text-heading/80 hover:bg-surface disabled:opacity-40"
          onClick={() => pg.setPage(pg.page + 1)}
          disabled={pg.page >= pg.pageCount - 1}
        >
          Next
        </button>
      </div>
    </div>
  );
}
