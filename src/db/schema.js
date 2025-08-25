import { timestamp } from "drizzle-orm/gel-core";
import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const todosTable = pgTable("todos", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  todo: varchar({ length: 255 }).notNull(),
  created_at:timestamp("created_at").default_now(),
  updated_at: timestamp("updated_at").$onUpdate(() => new Date())
});
