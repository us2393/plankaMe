// Geometry is captured before any preview movement, in document coordinates.
export const resolveDrop = (columns, sourceId, point, previous = null) => {
  const slots = [];
  columns.forEach((column, index) => {
    slots.push({ mode: 'insert', index, x: column.left - 8 });
    slots.push({
      mode: 'merge',
      columnId: column.id,
      x: column.left + column.width / 2,
    });
  });
  const last = columns[columns.length - 1];
  if (!last) return null;
  slots.push({
    mode: 'insert',
    index: columns.length,
    x: last.left + last.width + 8,
  });

  let slot = slots.reduce((best, candidate) =>
    Math.abs(point.x - candidate.x) < Math.abs(point.x - best.x) ? candidate : best,
  );
  const oldSlot =
    previous &&
    slots.find(
      (candidate) =>
        candidate.mode === previous.mode &&
        (candidate.mode === 'merge'
          ? candidate.columnId === previous.columnId
          : candidate.index === previous.index),
    );
  if (oldSlot && Math.abs(point.x - oldSlot.x) <= Math.abs(point.x - slot.x) + 12) slot = oldSlot;

  if (slot.mode === 'insert') return slot;
  const column = columns.find((item) => item.id === slot.columnId);
  const items = column.lists.filter((item) => item.id !== sourceId);
  const index = items.findIndex((item) => point.y < item.top + item.height / 2);
  return { ...slot, listIndex: index < 0 ? items.length : index };
};

export const projectLayout = (columns, sourceId, intent) => {
  const source = columns.find((column) => column.lists.some((list) => list.id === sourceId));
  if (!source || !intent) return columns;
  const dragged = source.lists.find((list) => list.id === sourceId);
  const remaining = columns
    .map((column) => ({
      ...column,
      lists: column.lists.filter((list) => list.id !== sourceId),
    }))
    .filter((column) => column.lists.length);
  if (intent.mode === 'merge') {
    const target = remaining.find((column) => column.id === intent.columnId);
    if (!target) return columns; // A singleton dropped back onto its original column.
    target.lists.splice(intent.listIndex, 0, dragged);
  } else {
    const precedingIds = new Set(columns.slice(0, intent.index).map((column) => column.id));
    const index = remaining.filter((column) => precedingIds.has(column.id)).length;
    remaining.splice(index, 0, {
      ...source,
      id: '__preview__',
      lists: [dragged],
    });
  }
  return remaining;
};
