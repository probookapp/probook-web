import { useState, useCallback, useMemo } from "react";

interface HasId {
  id: string;
}

export function useSelection<T extends HasId>(items: T[] | undefined) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleAll = useCallback(
    (selectableItems?: T[]) => {
      const itemsToUse = selectableItems ?? items ?? [];
      setSelectedIds((prev) => {
        const allSelected =
          itemsToUse.length > 0 &&
          itemsToUse.every((item) => prev.has(item.id));
        if (allSelected) {
          return new Set();
        } else {
          return new Set(itemsToUse.map((item) => item.id));
        }
      });
    },
    [items]
  );

  const clear = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback(
    (id: string) => selectedIds.has(id),
    [selectedIds]
  );

  const isAllSelected = useMemo(() => {
    if (!items || items.length === 0) return false;
    return items.every((item) => selectedIds.has(item.id));
  }, [items, selectedIds]);

  const isIndeterminate = useMemo(() => {
    if (!items || items.length === 0) return false;
    const someSelected = items.some((item) => selectedIds.has(item.id));
    return someSelected && !isAllSelected;
  }, [items, selectedIds, isAllSelected]);

  const selectedCount = selectedIds.size;

  return {
    selectedIds,
    toggle,
    toggleAll,
    clear,
    isSelected,
    isAllSelected,
    isIndeterminate,
    selectedCount,
  };
}
