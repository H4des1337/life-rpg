import type { Db } from '../db.js';
import type { inventoryItemCreateSchema, inventoryItemUpdateSchema } from '@liferpg/shared';
import type { z } from 'zod';
import { nowIso, uuid } from '../util.js';

export type InventoryCreate = z.infer<typeof inventoryItemCreateSchema>;
export type InventoryUpdate = z.infer<typeof inventoryItemUpdateSchema>;

export function listCategories(db: Db) {
  return db
    .prepare(
      `SELECT c.id, c.name, c.sort_order AS sortOrder,
              (SELECT COUNT(*) FROM inventory_items i WHERE i.category_id = c.id AND i.deleted_at IS NULL) AS itemCount
       FROM inventory_categories c ORDER BY c.sort_order, c.name`,
    )
    .all();
}

export function createCategory(db: Db, name: string) {
  const normalized = name.trim().slice(0, 80);
  const existing = db.prepare('SELECT id FROM inventory_categories WHERE name = ? COLLATE NOCASE').get(normalized);
  if (existing) throw httpError(409, 'A category with that name already exists.');
  const id = uuid();
  const sort = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM inventory_categories').get() as { next: number }).next;
  db.prepare('INSERT INTO inventory_categories (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)').run(id, normalized, sort, nowIso());
  return db.prepare('SELECT id, name, sort_order AS sortOrder FROM inventory_categories WHERE id = ?').get(id);
}

export function updateCategory(db: Db, id: string, name: string) {
  const row = db.prepare('SELECT id FROM inventory_categories WHERE id = ?').get(id);
  if (!row) throw httpError(404, 'Category not found.');
  try {
    db.prepare('UPDATE inventory_categories SET name = ? WHERE id = ?').run(name.trim().slice(0, 80), id);
  } catch {
    throw httpError(409, 'A category with that name already exists.');
  }
  return db.prepare('SELECT id, name, sort_order AS sortOrder FROM inventory_categories WHERE id = ?').get(id);
}

export function deleteCategory(db: Db, id: string): void {
  const count = (
    db.prepare('SELECT COUNT(*) AS c FROM inventory_items WHERE category_id = ? AND deleted_at IS NULL').get(id) as { c: number }
  ).c;
  if (count > 0) throw httpError(409, 'Move or remove the items in this category first.');
  db.prepare('DELETE FROM inventory_categories WHERE id = ?').run(id);
}

export function listItems(
  db: Db,
  options: { search?: string; categoryId?: string; includeDeleted?: boolean } = {},
) {
  const where: string[] = [];
  const values: unknown[] = [];
  if (!options.includeDeleted) where.push('i.deleted_at IS NULL');
  if (options.search) {
    where.push('(i.name LIKE ? OR i.description LIKE ?)');
    const pattern = `%${options.search.replace(/[%_]/g, '')}%`;
    values.push(pattern, pattern);
  }
  if (options.categoryId) {
    where.push('i.category_id = ?');
    values.push(options.categoryId);
  }
  const rows = db
    .prepare(
      `SELECT i.*, c.name AS category_name,
        (SELECT COUNT(*) FROM file_links l JOIN stored_files f ON f.id = l.file_id WHERE l.owner_type = 'inventory' AND l.owner_id = i.id AND f.deleted_at IS NULL) AS file_count
       FROM inventory_items i LEFT JOIN inventory_categories c ON c.id = i.category_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY i.created_at DESC`,
    )
    .all(...values) as Array<Record<string, unknown> & { id: string }>;
  return rows.map((row) => mapItem(db, row));
}

export function getItem(db: Db, id: string) {
  const row = db
    .prepare(
      `SELECT i.*, c.name AS category_name,
        (SELECT COUNT(*) FROM file_links l JOIN stored_files f ON f.id = l.file_id WHERE l.owner_type = 'inventory' AND l.owner_id = i.id AND f.deleted_at IS NULL) AS file_count
       FROM inventory_items i LEFT JOIN inventory_categories c ON c.id = i.category_id WHERE i.id = ?`,
    )
    .get(id) as (Record<string, unknown> & { id: string }) | undefined;
  if (!row) throw httpError(404, 'Inventory item not found.');
  return mapItem(db, row);
}

function mapItem(db: Db, row: Record<string, unknown> & { id: string }) {
  const links = db
    .prepare('SELECT target_type AS targetType, target_id AS targetId FROM inventory_links WHERE item_id = ?')
    .all(row.id) as Array<{ targetType: string; targetId: string }>;
  const resolved = links.map((link) => ({ ...link, label: labelFor(db, link.targetType, link.targetId) }));
  const files = db
    .prepare(
      `SELECT f.id, f.original_name AS originalName, f.mime_type AS mimeType, f.size, f.sha256, link.created_at AS linkedAt
       FROM file_links link JOIN stored_files f ON f.id = link.file_id
       WHERE link.owner_type = 'inventory' AND link.owner_id = ? AND f.deleted_at IS NULL ORDER BY link.created_at`,
    )
    .all(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    categoryId: row.category_id,
    categoryName: row.category_name ?? 'Uncategorised',
    acquiredAt: row.acquired_at,
    expiresAt: row.expires_at,
    externalRef: row.external_ref,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    expired: row.expires_at ? new Date(String(row.expires_at)).getTime() < Date.now() : false,
    links: resolved,
    attributes: resolved.filter((l) => l.targetType === 'attribute'),
    skills: resolved.filter((l) => l.targetType === 'skill'),
    achievements: resolved.filter((l) => l.targetType === 'achievement'),
    files,
    fileCount: Number(row.file_count ?? files.length),
  };
}

export function createItem(db: Db, input: InventoryCreate) {
  if (input.categoryId) {
    const exists = db.prepare('SELECT id FROM inventory_categories WHERE id = ?').get(input.categoryId);
    if (!exists) throw httpError(400, 'Inventory category not found.');
  }
  const id = uuid();
  const now = nowIso();
  const run = db.transaction(() => {
    db.prepare(
      `INSERT INTO inventory_items (id, name, description, category_id, acquired_at, expires_at, external_ref, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.name.trim(),
      input.description ?? '',
      input.categoryId ?? null,
      input.acquiredAt ?? null,
      input.expiresAt ?? null,
      input.externalRef ?? '',
      now,
      now,
    );
    linkItem(db, id, input);
  });
  run();
  return getItem(db, id);
}

export function updateItem(db: Db, id: string, input: InventoryUpdate) {
  const exists = db.prepare('SELECT id FROM inventory_items WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!exists) throw httpError(404, 'Inventory item not found.');
  const run = db.transaction(() => {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (input.name !== undefined) { updates.push('name = ?'); values.push(input.name.trim()); }
    if (input.description !== undefined) { updates.push('description = ?'); values.push(input.description); }
    if (input.categoryId !== undefined) { updates.push('category_id = ?'); values.push(input.categoryId); }
    if (input.acquiredAt !== undefined) { updates.push('acquired_at = ?'); values.push(input.acquiredAt); }
    if (input.expiresAt !== undefined) { updates.push('expires_at = ?'); values.push(input.expiresAt); }
    if (input.externalRef !== undefined) { updates.push('external_ref = ?'); values.push(input.externalRef); }
    updates.push('updated_at = ?');
    values.push(nowIso(), id);
    db.prepare(`UPDATE inventory_items SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    if (input.attributeIds || input.skillIds || input.achievementIds) {
      db.prepare('DELETE FROM inventory_links WHERE item_id = ?').run(id);
      linkItem(db, id, input);
    }
  });
  run();
  return getItem(db, id);
}

/** Soft delete: attachments stay intact and can be relinked. */
export function deleteItem(db: Db, id: string): void {
  db.prepare('UPDATE inventory_items SET deleted_at = ?, updated_at = ? WHERE id = ?').run(nowIso(), nowIso(), id);
}

function linkItem(db: Db, itemId: string, input: Partial<InventoryCreate>): void {
  const pairs: Array<[string, string[] | undefined]> = [
    ['attribute', input.attributeIds],
    ['skill', input.skillIds],
    ['achievement', input.achievementIds],
  ];
  for (const [type, ids] of pairs) {
    for (const targetId of ids ?? []) {
      db.prepare('INSERT OR IGNORE INTO inventory_links (id, item_id, target_type, target_id) VALUES (?, ?, ?, ?)').run(
        uuid(),
        itemId,
        type,
        targetId,
      );
    }
  }
}

function labelFor(db: Db, type: string, id: string): string {
  if (type === 'attribute') {
    return (db.prepare('SELECT name FROM attributes WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Attribute';
  }
  if (type === 'skill') {
    return (db.prepare('SELECT name FROM skills WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Skill';
  }
  if (type === 'achievement') {
    return (db.prepare('SELECT name FROM achievement_definitions WHERE id = ?').get(id) as { name: string } | undefined)?.name ?? 'Achievement';
  }
  return 'Record';
}

function httpError(statusCode: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { statusCode?: number }).statusCode = statusCode;
  return error;
}
