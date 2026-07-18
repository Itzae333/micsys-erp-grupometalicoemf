import * as React from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  onRowDoubleClick?: (row: T, index: number) => void;
  isRowSelected?: (row: T, index: number) => boolean;
  rowRef?: (el: HTMLTableRowElement | null, index: number) => void;
  footer?: React.ReactNode;
  className?: string;
}

const ALIGN_CLASS: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  onRowDoubleClick,
  isRowSelected,
  rowRef,
  footer,
  className,
}: DataTableProps<T>) {
  return (
    <table className={cn('w-full text-body-sm', className)}>
      <thead className="sticky top-0 bg-steel-50 border-b border-steel-200 z-10">
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              className={cn(
                'px-3 py-2.5 font-medium text-steel-600',
                ALIGN_CLASS[col.align ?? 'left'],
                col.className,
              )}
            >
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-steel-100">
        {rows.map((row, idx) => (
          <tr
            key={rowKey(row, idx)}
            ref={rowRef ? (el) => rowRef(el, idx) : undefined}
            className={cn(
              (onRowClick || onRowDoubleClick) && 'cursor-pointer transition-colors',
              isRowSelected?.(row, idx)
                ? 'bg-brand-50 border-l-2 border-l-brand-600'
                : (onRowClick || onRowDoubleClick) && 'hover:bg-steel-50',
            )}
            onClick={onRowClick ? () => onRowClick(row, idx) : undefined}
            onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row, idx) : undefined}
          >
            {columns.map((col) => (
              <td
                key={col.key}
                className={cn('px-3 py-2.5', ALIGN_CLASS[col.align ?? 'left'], col.className)}
              >
                {col.render(row, idx)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {footer}
    </table>
  );
}
