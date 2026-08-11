import { useState } from 'react';
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, any>[];
  emptyMessage?: string;
  initialSorting?: SortingState;
  maxHeight?: string;
}

export function DataTable<T>({ data, columns, emptyMessage = 'No data', initialSorting = [], maxHeight = '65vh' }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="overflow-hidden rounded-xl border border-card-border bg-card">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="table-clean w-full text-sm">
          <thead className="sticky top-0 z-10 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const align = (h.column.columnDef.meta as { align?: 'left' | 'right' } | undefined)?.align;
                  const sortable = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      onClick={h.column.getToggleSortingHandler()}
                      className={`${sortable ? 'cursor-pointer select-none hover:text-heading/70' : ''} ${align === 'right' ? '!text-right' : ''}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {sortable && (
                          sorted === 'asc' ? <ArrowUp className="h-3 w-3 text-brand-500" />
                          : sorted === 'desc' ? <ArrowDown className="h-3 w-3 text-brand-500" />
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-card-border">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef.meta as { align?: 'left' | 'right' } | undefined)?.align;
                  return (
                    <td key={cell.id} className={align === 'right' ? 'text-right tabular-nums' : ''}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-heading/40">{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
