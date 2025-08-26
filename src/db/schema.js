
import { pgTable, text, timestamp, boolean, serial } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const todosTable = pgTable('todos', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  completed: boolean('completed').default(false),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
});