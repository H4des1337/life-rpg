import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { parse } from '../http.js';
import {
  inventoryCategoryCreateSchema,
  inventoryItemCreateSchema,
  inventoryItemUpdateSchema,
} from '@liferpg/shared';
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  getItem,
  listCategories,
  listItems,
  updateCategory,
  updateItem,
} from '../services/inventory.js';

export function registerInventoryRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/inventory/categories', async () => ({ categories: listCategories(ctx.db) }));

  app.post('/api/inventory/categories', async (request, reply) => {
    const input = parse(inventoryCategoryCreateSchema, request.body);
    reply.code(201);
    return { category: createCategory(ctx.db, input.name), categories: listCategories(ctx.db) };
  });

  app.patch('/api/inventory/categories/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(inventoryCategoryCreateSchema, request.body);
    return { category: updateCategory(ctx.db, id, input.name), categories: listCategories(ctx.db) };
  });

  app.delete('/api/inventory/categories/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteCategory(ctx.db, id);
    return { categories: listCategories(ctx.db) };
  });

  app.get('/api/inventory', async (request) => {
    const query = request.query as { search?: string; categoryId?: string };
    return { items: listItems(ctx.db, query), categories: listCategories(ctx.db) };
  });

  app.get('/api/inventory/:id', async (request) => {
    const { id } = request.params as { id: string };
    return { item: getItem(ctx.db, id) };
  });

  app.post('/api/inventory', async (request, reply) => {
    const input = parse(inventoryItemCreateSchema, request.body);
    reply.code(201);
    return { item: createItem(ctx.db, input), categories: listCategories(ctx.db) };
  });

  app.patch('/api/inventory/:id', async (request) => {
    const { id } = request.params as { id: string };
    const input = parse(inventoryItemUpdateSchema, request.body);
    return { item: updateItem(ctx.db, id, input), categories: listCategories(ctx.db) };
  });

  app.delete('/api/inventory/:id', async (request) => {
    const { id } = request.params as { id: string };
    deleteItem(ctx.db, id);
    return { ok: true, attachmentsPreserved: true };
  });
}
