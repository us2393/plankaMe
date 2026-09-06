/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const initKnex = require('knex');

const MERGED_NAME = '20260906000000_add_column_layout.js';
const OLD_NAMES = [
  '20260906000000_add_column_id_to_board.js',
  '20260906010000_add_column_id_to_list.js',
  '20260906020000_change_list_column_id_to_text.js',
  '20260906030000_add_column_position_to_list.js',
];

const backupRecords = (records) => {
  const directory = path.resolve(__dirname, '../.tmp/migration-backups');
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, `column-layout-${randomUUID()}.json`);
  fs.writeFileSync(filename, JSON.stringify(records, null, 2), {
    mode: 0o600,
    flag: 'wx',
  });
  return filename;
};

const consolidate = async (knex, backup = backupRecords) => {
  if (!(await knex.schema.hasTable('migration'))) return { status: 'fresh' };

  return knex.transaction(async (trx) => {
    await trx.raw("SET LOCAL lock_timeout = '5s'");
    // Serialize with Knex's migration lock acquisition; never force-unlock it.
    const lock = await trx('migration_lock').forUpdate().first();
    if (!lock || Number(lock.is_locked) !== 0) {
      throw new Error('Migration lock is active or missing. Stop migrating processes and retry.');
    }

    const records = await trx('migration')
      .whereIn('name', [...OLD_NAMES, MERGED_NAME])
      .orderBy('batch')
      .orderBy('id');
    const oldRecords = records.filter((record) => OLD_NAMES.includes(record.name));
    const merged = records.find((record) => record.name === MERGED_NAME);
    if (!oldRecords.length) return { status: merged ? 'already-consolidated' : 'fresh' };
    if (merged || new Set(oldRecords.map((record) => record.name)).size !== OLD_NAMES.length) {
      throw new Error(
        'Partial or mixed migration history. Restore the original files and inspect.',
      );
    }
    if (oldRecords.length !== OLD_NAMES.length) {
      throw new Error('Duplicate migration records. Inspect before consolidating.');
    }

    const board = await trx('board').columnInfo();
    const list = await trx('list').columnInfo();
    if (
      !board.column_id ||
      board.column_id.type !== 'integer' ||
      !list.column_id ||
      list.column_id.type !== 'text' ||
      !list.column_position ||
      list.column_position.type !== 'double precision'
    ) {
      throw new Error('Schema does not match the completed migrations. No records were changed.');
    }

    // Back up before modifying metadata. Never run up/down or touch application rows.
    const backupPath = await backup(oldRecords);
    const retained = oldRecords[oldRecords.length - 1];
    await trx('migration').where('id', retained.id).update({ name: MERGED_NAME });
    await trx('migration')
      .whereIn(
        'id',
        oldRecords.filter((record) => record.id !== retained.id).map((record) => record.id),
      )
      .del();
    return { status: 'consolidated', backupPath };
  });
};

if (require.main === module) {
  // Load environment/connection only for the CLI, not when importing tests.
  const config = require('./knexfile'); // eslint-disable-line global-require
  const knex = initKnex({
    ...config,
    connection: { ...config.connection, connectionTimeoutMillis: 5000 },
  });
  consolidate(knex)
    .then((result) => console.log(JSON.stringify(result, null, 2))) // eslint-disable-line no-console
    .catch((error) => {
      console.error('Migration consolidation failed:', error.code || error.message); // eslint-disable-line no-console
      process.exitCode = 1;
    })
    .finally(() => knex.destroy());
}

module.exports = { consolidate, OLD_NAMES, MERGED_NAME };
