const assert = require('assert/strict');
const initKnex = require('knex');
const { consolidate, OLD_NAMES, MERGED_NAME } = require('../../db/consolidate-column-migrations');
const migration = require('../../db/migrations/20260906000000_add_column_layout');

const originalRecords = () =>
  OLD_NAMES.map((name, index) => ({
    id: index + 1,
    name,
    batch: index + 2,
    migration_time: 'saved',
  }));

const createDatabase = (records, options = {}) => {
  const state = { records, writes: [] };
  const knex = {
    schema: { hasTable: async () => options.hasTable !== false },
    transaction: async (callback) => {
      const pending = state.records.map((record) => ({ ...record }));
      const writes = [];
      const trx = (table) => {
        let matches = () => true;
        const query = {
          whereIn: (key, values) => {
            matches = (record) => values.includes(record[key]);
            return query;
          },
          where: (key, value) => query.whereIn(key, [value]),
          orderBy: () => query,
          forUpdate: () => query,
          first: async () => ({ is_locked: options.locked ? 1 : 0 }),
          columnInfo: async () =>
            table === 'board'
              ? { column_id: { type: 'integer' } }
              : {
                  column_id: { type: options.listType || 'text' },
                  column_position: { type: 'double precision' },
                },
          update: async (values) => {
            assert.equal(table, 'migration');
            pending.filter(matches).forEach((record) => Object.assign(record, values));
            writes.push('update');
          },
          del: async () => {
            assert.equal(table, 'migration');
            if (options.deleteFails) throw new Error('delete failed');
            const deleted = pending.filter(matches);
            deleted.forEach((record) => pending.splice(pending.indexOf(record), 1));
            writes.push('delete');
          },
          then: (resolve, reject) => Promise.resolve(pending.filter(matches)).then(resolve, reject),
        };
        return query;
      };
      trx.raw = async () => {};
      const result = await callback(trx);
      state.records = pending;
      state.writes.push(...writes);
      return result;
    },
  };
  return { knex, state };
};

describe('column migration consolidation', () => {
  it('backs up all old records and preserves the latest batch/time and unrelated history', async () => {
    const old = originalRecords();
    const unrelated = { id: 0, name: 'unrelated.js', batch: 1 };
    const { knex, state } = createDatabase([unrelated, ...old]);
    const result = await consolidate(knex, async (records) => {
      assert.deepEqual(records, old);
      assert.deepEqual(state.writes, []);
      return 'backup.json';
    });
    assert.deepEqual(result, {
      status: 'consolidated',
      backupPath: 'backup.json',
    });
    assert.deepEqual(state.records, [unrelated, { ...old[3], name: MERGED_NAME }]);
  });

  it('is a no-op for fresh and already consolidated databases', async () => {
    const cases = [
      createDatabase([], { hasTable: false }),
      createDatabase([]),
      createDatabase([{ id: 1, name: MERGED_NAME, batch: 1 }]),
    ];
    const results = await Promise.all(cases.map(({ knex }) => consolidate(knex)));
    assert.deepEqual(
      results.map(({ status }) => status),
      ['fresh', 'fresh', 'already-consolidated'],
    );
    cases.forEach(({ state }) => assert.deepEqual(state.writes, []));
  });

  it('rejects partial, mixed, duplicate, locked and incompatible states without writes', async () => {
    const cases = [
      createDatabase(originalRecords().slice(0, 2)),
      createDatabase([...originalRecords(), { id: 5, name: MERGED_NAME }]),
      createDatabase([...originalRecords(), { ...originalRecords()[0], id: 5 }]),
      createDatabase(originalRecords(), { locked: true }),
      createDatabase(originalRecords(), { listType: 'integer' }),
    ];
    await Promise.all(
      cases.map(async ({ knex, state }) => {
        await assert.rejects(consolidate(knex));
        assert.deepEqual(state.writes, []);
      }),
    );
  });

  it('does not change history if backup fails', async () => {
    const { knex, state } = createDatabase(originalRecords());
    await assert.rejects(
      consolidate(knex, async () => {
        throw new Error('backup failed');
      }),
      /backup failed/,
    );
    assert.deepEqual(state.records, originalRecords());
    assert.deepEqual(state.writes, []);
  });

  it('rolls back metadata changes if deletion fails', async () => {
    const { knex, state } = createDatabase(originalRecords(), {
      deleteFails: true,
    });
    await assert.rejects(
      consolidate(knex, async () => 'backup.json'),
      /delete failed/,
    );
    assert.deepEqual(state.records, originalRecords());
    assert.deepEqual(state.writes, []);
  });
});

describe('combined column migration SQL', () => {
  const compiler = initKnex({ client: 'pg' });
  const capture = () => {
    const statements = [];
    const knex = (table) => ({
      update: async (values) => statements.push(compiler(table).update(values).toSQL().sql),
    });
    knex.ref = (name) => compiler.ref(name);
    knex.schema = {
      alterTable: async (table, callback) => {
        statements.push(
          ...compiler.schema
            .alterTable(table, callback)
            .toSQL()
            .map(({ sql }) => sql),
        );
      },
    };
    return { knex, statements };
  };

  after(() => compiler.destroy());

  it('creates final types and all three indexes, initializing positions once', async () => {
    const { knex, statements } = capture();
    await migration.up(knex);
    assert.deepEqual(statements, [
      'alter table "board" add column "column_id" integer',
      'create index "board_column_id_index" on "board" ("column_id")',
      'alter table "list" add column "column_id" text, add column "column_position" double precision',
      'create index "list_column_id_index" on "list" ("column_id")',
      'create index "list_column_position_index" on "list" ("column_position")',
      'update "list" set "column_position" = "position"',
    ]);
  });

  it('drops the three fields and indexes without converting text IDs to integers', async () => {
    const { knex, statements } = capture();
    await migration.down(knex);
    assert.deepEqual(statements, [
      'drop index "list_column_position_index"',
      'alter table "list" drop column "column_position"',
      'drop index "list_column_id_index"',
      'alter table "list" drop column "column_id"',
      'drop index "board_column_id_index"',
      'alter table "board" drop column "column_id"',
    ]);
  });
});
