import { useMemo, useRef, useState } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  className?: string;
}

export function VirtualizedList<T>({
  items,
  itemHeight,
  height,
  overscan = 4,
  renderItem,
  className,
}: VirtualizedListProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;

  const { startIndex, endIndex } = useMemo(() => {
    const visibleStart = Math.floor(scrollTop / itemHeight);
    const visibleCount = Math.ceil(height / itemHeight);

    return {
      startIndex: Math.max(0, visibleStart - overscan),
      endIndex: Math.min(items.length, visibleStart + visibleCount + overscan),
    };
  }, [scrollTop, itemHeight, height, overscan, items.length]);

  const visibleItems = items.slice(startIndex, endIndex);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, overflowY: 'auto', overflowX: 'hidden' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {visibleItems.map((item, index) => {
          const absoluteIndex = startIndex + index;
          return (
            <div
              key={absoluteIndex}
              style={{
                position: 'absolute',
                top: absoluteIndex * itemHeight,
                left: 0,
                right: 0,
                height: itemHeight,
              }}
            >
              {renderItem(item, absoluteIndex)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
