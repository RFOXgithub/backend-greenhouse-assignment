import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pool } from "./pool.js";

export async function migrate(): Promise<void> {
  const migrationsDirectory = path.resolve(process.cwd(), "migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  for (const file of migrationFiles) {
    const sql = await readFile(path.join(migrationsDirectory, file), "utf8");
    await pool.query(sql);
  }
}
