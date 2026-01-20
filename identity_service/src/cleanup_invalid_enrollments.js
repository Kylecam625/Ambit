const { db_path } = require("./config");
const { open_db } = require("./db/connection");

const FACE_DESCRIPTOR_LENGTH = 128;

const is_valid_descriptor = (value) => {
  if (!Array.isArray(value)) return false;
  if (value.length !== FACE_DESCRIPTOR_LENGTH) return false;
  for (const raw of value) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return false;
  }
  return true;
};

const parse_args = () => {
  const args = process.argv.slice(2);
  const is_dry_run = args.includes("--dry-run") || args.includes("-n");
  const should_quiet = args.includes("--quiet") || args.includes("-q");
  return { is_dry_run, should_quiet };
};

const main = () => {
  const { is_dry_run, should_quiet } = parse_args();

  const db = open_db({ db_path });

  const rows = db
    .prepare(
      `
      SELECT enrollment_id, profile_id, descriptor_json, created_at
      FROM enrollments
      ORDER BY created_at ASC
    `
    )
    .all();

  const del = db.prepare(`DELETE FROM enrollments WHERE enrollment_id = ?`);

  let invalid_count = 0;
  let deleted_count = 0;
  for (const row of rows) {
    let parsed = null;
    try {
      parsed = JSON.parse(typeof row.descriptor_json === "string" ? row.descriptor_json : "");
    } catch {
      parsed = null;
    }

    const ok = is_valid_descriptor(parsed);
    if (ok) continue;

    invalid_count += 1;
    if (!should_quiet) {
      const length = Array.isArray(parsed) ? parsed.length : null;
      console.log(
        `[invalid] enrollment_id=${row.enrollment_id} profile_id=${row.profile_id} length=${length}`
      );
    }

    if (is_dry_run) continue;
    del.run(row.enrollment_id);
    deleted_count += 1;
  }

  console.log(
    `Done. invalid=${invalid_count} ${is_dry_run ? "(dry-run)" : `deleted=${deleted_count}`}`
  );
};

main();

