import { resolveDrop, projectLayout } from './drag-layout';

const columns = [
  {
    id: 'a',
    left: 20,
    width: 272,
    lists: [
      { id: 'one', top: 200, height: 100 },
      { id: 'two', top: 308, height: 200 },
    ],
  },
  {
    id: 'b',
    left: 308,
    width: 272,
    lists: [{ id: 'three', top: 200, height: 100 }],
  },
];

test('top edge selects before/after the target midpoint, regardless of dragged height', () => {
  expect(resolveDrop(columns, 'three', { x: 156, y: 240 }).listIndex).toBe(0);
  expect(resolveDrop(columns, 'three', { x: 156, y: 260 }).listIndex).toBe(1);
  expect(resolveDrop(columns, 'three', { x: 156, y: 500 }).listIndex).toBe(2);
});

test('split between columns and to the right preserves the remaining column order', () => {
  const middle = resolveDrop(columns, 'two', { x: 300, y: 300 });
  expect(projectLayout(columns, 'two', middle).map((column) => column.id)).toEqual([
    'a',
    '__preview__',
    'b',
  ]);
  const right = resolveDrop(columns, 'two', { x: 700, y: 300 });
  expect(projectLayout(columns, 'two', right).map((column) => column.id)).toEqual([
    'a',
    'b',
    '__preview__',
  ]);
});

test('moving a singleton into its original slot does not add space', () => {
  const result = projectLayout(columns, 'three', { mode: 'insert', index: 2 });
  expect(result.length).toBe(2);
  expect(result[1].lists[0].id).toBe('three');
});

test('hysteresis retains the previous mode near its boundary', () => {
  const previous = resolveDrop(columns, 'two', { x: 220, y: 300 });
  expect(previous.mode).toBe('merge');
  expect(resolveDrop(columns, 'two', { x: 230, y: 300 }, previous).mode).toBe('merge');
  expect(resolveDrop(columns, 'two', { x: 250, y: 300 }, previous).mode).toBe('insert');
});

test('layout projection never changes the captured geometry', () => {
  const before = JSON.stringify(columns);
  projectLayout(columns, 'two', { mode: 'merge', columnId: 'b', listIndex: 0 });
  expect(JSON.stringify(columns)).toBe(before);
});
