/*!
 * Copyright (c) 2024 PLANKA Software GmbH
 * Licensed under the Fair Use License: https://github.com/plankanban/planka/blob/master/LICENSE.md
 */

// Existing installations must reconcile the four old records first:
// node db/consolidate-column-migrations.js
module.exports.up = async (knex) => {
  await knex.schema.alterTable('board', (table) => {
    table.integer('column_id');
    table.index('column_id');
  });

  await knex.schema.alterTable('list', (table) => {
    table.text('column_id');
    table.index('column_id');
    table.specificType('column_position', 'double precision');
    table.index('column_position');
  });

  return knex('list').update({ column_position: knex.ref('position') });
};

module.exports.down = async (knex) => {
  await knex.schema.alterTable('list', (table) => {
    table.dropIndex('column_position');
    table.dropColumn('column_position');
    table.dropIndex('column_id');
    table.dropColumn('column_id');
  });

  return knex.schema.alterTable('board', (table) => {
    table.dropIndex('column_id');
    table.dropColumn('column_id');
  });
};
