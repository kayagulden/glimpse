import { useState, useMemo } from 'react';

interface Column {
  key: string;
  label: string;
  width?: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface StorageTableProps {
  columns: Column[];
  data: Record<string, unknown>[];
  emptyMessage?: string;
}

export function StorageTable({ columns, data, emptyMessage = 'No data' }: StorageTableProps) {
  const [sortKey, setSortKey] = useState('');
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      const cmp = av.localeCompare(bv);
      return sortAsc ? cmp : -cmp;
    });
  }, [data, sortKey, sortAsc]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[11px] text-white/20 font-mono">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto console-scroll">
      <table className="w-full text-[11px] font-mono border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-surface-2 border-b border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="text-left px-3 py-1.5 text-white/40 font-medium cursor-pointer
                           hover:text-white/60 select-none transition-colors"
                style={{ width: col.width }}
              >
                {col.label}
                {sortKey === col.key && (
                  <span className="ml-1 text-accent">{sortAsc ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border/30 hover:bg-white/[0.02] transition-colors"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="px-3 py-1 text-white/50 max-w-[300px] truncate"
                  title={String(row[col.key] ?? '')}
                >
                  {col.render
                    ? col.render(row[col.key], row)
                    : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
