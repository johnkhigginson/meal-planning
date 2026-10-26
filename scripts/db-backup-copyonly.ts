// Shows backup history, or takes one COPY_ONLY full backup of the app's
// database and verifies it. It never changes data or the backup chain:
// COPY_ONLY leaves differential and log backups as they were.
//
// Meant to run on the server from a temp copy, from the app folder, so the
// app's .env and node_modules are used:
//   cd /var/www/mylemonkitchen.com
//   npx tsx <T>/scripts/db-backup-copyonly.ts --history
//   npx tsx <T>/scripts/db-backup-copyonly.ts --backup mealplanning_pre_cleanup_20261026.bak
//
// Prints the server host and database name only. Connection strings,
// passwords and other secrets are never printed.

import { createRequire } from "node:module";
import { join } from "node:path";

// Packages resolve from this file's folder, then from the app it is run
// from (the current directory), so a copy outside the app still finds them.
function appRequire(name: string): unknown {
  try {
    return createRequire(import.meta.url)(name);
  } catch {
    return createRequire(join(process.cwd(), "package.json"))(name);
  }
}
// The app's .env, as `import "dotenv/config"` loads it.
appRequire("dotenv/config");

// The parts of the mssql package this script uses. It ships no types.
interface SqlMessage { message: string }
interface SqlRequest {
  input(name: string, type: unknown, value: unknown): SqlRequest;
  on(event: "info", listener: (info: SqlMessage) => void): SqlRequest;
  query<T>(command: string): Promise<{ recordset: T[] }>;
}
interface SqlPool { connect(): Promise<SqlPool>; close(): Promise<void>; request(): SqlRequest }
interface MssqlModule {
  ConnectionPool: new (config: object) => SqlPool;
  NVarChar: (length: number) => unknown;
}

const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

// Same settings as src/lib/prisma.ts, with a long request timeout for BACKUP.
function connectionConfig(): object {
  return {
    server: process.env.DB_HOST!,
    port: parseInt(process.env.DB_PORT || "1433", 10),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    requestTimeout: REQUEST_TIMEOUT_MS,
    options: { encrypt: true, trustServerCertificate: true },
  };
}

interface HistoryRow {
  backup_start_date: Date;
  backup_finish_date: Date;
  type: string;
  is_copy_only: boolean;
  backup_size: number;
  compressed_backup_size: number | null;
  has_backup_checksums: boolean;
  physical_device_name: string;
}

const HISTORY_SQL = `
  SELECT TOP (10) b.backup_start_date, b.backup_finish_date, b.type, b.is_copy_only,
    b.backup_size, b.compressed_backup_size, b.has_backup_checksums, m.physical_device_name
  FROM msdb.dbo.backupset b
  JOIN msdb.dbo.backupmediafamily m ON m.media_set_id = b.media_set_id
  WHERE b.database_name = DB_NAME()
  ORDER BY b.backup_finish_date DESC`;

const BACKUP_SQL = `
  DECLARE @sql nvarchar(max) = N'BACKUP DATABASE ' + QUOTENAME(DB_NAME())
    + N' TO DISK = @path WITH COPY_ONLY, CHECKSUM, INIT, STATS = 10';
  EXEC sp_executesql @sql, N'@path nvarchar(4000)', @path = @path;`;

const VERIFY_SQL = "RESTORE VERIFYONLY FROM DISK = @path WITH CHECKSUM";

function mb(bytes: number | null): string {
  return bytes == null ? "-" : `${(Number(bytes) / 1024 / 1024).toFixed(1)} MB`;
}

function printRow(r: HistoryRow): void {
  console.log(
    `  ${r.backup_start_date.toISOString()} -> ${r.backup_finish_date.toISOString()}` +
      `  type=${r.type} copy_only=${r.is_copy_only ? 1 : 0} checksums=${r.has_backup_checksums ? 1 : 0}` +
      `  size=${mb(r.backup_size)} compressed=${mb(r.compressed_backup_size)}  ${r.physical_device_name}`,
  );
}

// The file name part of a Windows or Linux path.
function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// The folder part of a path, with the separator it uses.
function folderOf(path: string): string | null {
  const cut = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return cut > 0 ? path.slice(0, cut) : null;
}

function joinServerPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  return dir.endsWith(sep) ? dir + name : dir + sep + name;
}

// The SQL Server message, plus any earlier ones (BACKUP often reports the
// real cause first, then "BACKUP DATABASE is terminating abnormally").
function sqlErrorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const earlier = (err as { precedingErrors?: SqlMessage[] }).precedingErrors ?? [];
  return [...earlier.map((e) => e.message), err.message].join("\n  ");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const backupIndex = args.indexOf("--backup");
  const target = backupIndex >= 0 ? args[backupIndex + 1] : undefined;
  if (!args.includes("--history") && !target) {
    console.error("Usage: npx tsx scripts/db-backup-copyonly.ts --history | --backup <file name>");
    return 2;
  }
  if (target !== undefined && (!target.trim() || /[\\/]/.test(target))) {
    console.error(`Refusing: "${target}" must be a file name only, with no path separator.`);
    return 2;
  }
  for (const name of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[name]) throw new Error(`${name} is not set`);
  }

  const mssql = appRequire("mssql") as MssqlModule;
  const pool = new mssql.ConnectionPool(connectionConfig());
  await pool.connect();
  try {
    const [info] = (
      await pool.request().query<{ db: string; defaultPath: string | null; version: string }>(
        "SELECT DB_NAME() AS db, CAST(SERVERPROPERTY('InstanceDefaultBackupPath') AS nvarchar(4000)) AS defaultPath, @@VERSION AS version",
      )
    ).recordset;
    console.log(`Server host: ${process.env.DB_HOST}`);
    console.log(`Database: ${info.db}`);
    console.log(`Version: ${info.version.split("\n")[0].trim()}`);
    console.log(`InstanceDefaultBackupPath: ${info.defaultPath ?? "(not set)"}`);

    let history: HistoryRow[] | null = null;
    try {
      history = (await pool.request().query<HistoryRow>(HISTORY_SQL)).recordset;
    } catch (err) {
      console.log(`\nmsdb backup history is NOT readable with this login: ${sqlErrorText(err)}`);
    }
    if (history) {
      console.log(`\nLast ${history.length} backup(s) of ${info.db}:`);
      history.forEach(printRow);
    }
    if (!target) return 0;

    // Without history there is no way to check the target is not an earlier
    // backup that INIT would overwrite.
    if (!history) {
      console.error("\nRefusing to back up: msdb history is needed to check the target is new.");
      return 1;
    }
    if (history.some((r) => fileName(r.physical_device_name).toLowerCase() === target.toLowerCase())) {
      console.error(`\nRefusing: ${target} already appears in backup history.`);
      return 1;
    }
    const dir = info.defaultPath || (history[0] ? folderOf(history[0].physical_device_name) : null);
    if (!dir) {
      console.error("\nRefusing: no InstanceDefaultBackupPath and no earlier backup folder to use.");
      return 1;
    }
    const path = joinServerPath(dir, target);

    // Plain requests: autocommit, no transaction. BACKUP cannot run in one.
    console.log(`\nBacking up ${info.db} to ${path} (COPY_ONLY, CHECKSUM, INIT)`);
    await pool
      .request()
      .input("path", mssql.NVarChar(4000), path)
      .on("info", (m) => console.log(`  ${m.message}`))
      .query(BACKUP_SQL);

    console.log("\nRESTORE VERIFYONLY WITH CHECKSUM");
    await pool
      .request()
      .input("path", mssql.NVarChar(4000), path)
      .on("info", (m) => console.log(`  ${m.message}`))
      .query(VERIFY_SQL);

    const after = (await pool.request().query<HistoryRow>(HISTORY_SQL)).recordset;
    const row = after.find((r) => r.physical_device_name.toLowerCase() === path.toLowerCase());
    if (!row) {
      console.error("\nThe new backup is not in msdb history.");
      return 1;
    }
    console.log("\nHistory row for the new backup:");
    printRow(row);
    return 0;
  } finally {
    await pool.close();
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    // The SQL Server message only; the config holding the password is never printed.
    console.error(`Failed: ${sqlErrorText(err)}`);
    process.exitCode = 1;
  },
);
