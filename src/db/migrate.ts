import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

export async function migrate(): Promise<void> {
  const migrationPath = path.resolve(process.cwd(), "migrations/001_init.sql");
  const sql = await readFile(migrationPath, "utf8");
  await pool.query(sql);
}
