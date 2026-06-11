#!/usr/bin/env node
// validate-migrations.js
// Validates lib/db/migrations without requiring a live database.
//
// Checks:
//  1. All migration files are sequentially numbered (no gaps, no duplicates)
//  2. Every .sql file is non-empty (> 0 bytes after trimming)
//  3. Every .sql file starts with a recognisable DDL statement
//     (allows CREATE, ALTER, INSERT, UPDATE, DELETE, DROP, DO, -- comments, etc.)

"use strict";

const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "../lib/db/migrations");

let errors = 0;

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  errors++;
}

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

// ── 1. Read migration files ───────────────────────────────────────────────
const allFiles = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

if (allFiles.length === 0) {
  fail("No .sql files found in migrations directory");
  process.exit(1);
}

allFiles.sort();
console.log(`\nChecking ${allFiles.length} migration file(s) in ${MIGRATIONS_DIR}\n`);

// ── 2. Sequential numbering ───────────────────────────────────────────────
const seenNumbers = new Set();

for (const file of allFiles) {
  const match = file.match(/^(\d{4})_/);
  if (!match) {
    fail(`${file} — filename does not start with a 4-digit sequence number`);
    continue;
  }

  const num = parseInt(match[1], 10);
  if (seenNumbers.has(num)) {
    fail(`${file} — duplicate sequence number ${match[1]}`);
  } else {
    seenNumbers.add(num);
  }
}

const nums = [...seenNumbers].sort((a, b) => a - b);
for (let i = 0; i < nums.length; i++) {
  if (nums[i] !== i) {
    fail(`Gap in migration sequence: expected ${String(i).padStart(4, "0")}, found ${String(nums[i]).padStart(4, "0")}`);
  }
}

if (errors === 0) {
  pass(`Sequential numbering OK (0000–${String(nums[nums.length - 1]).padStart(4, "0")})`);
}

// ── 3. Non-empty + valid DDL start ────────────────────────────────────────
const VALID_START = /^\s*(--|\/\*|CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|DO|BEGIN|COMMIT|TRUNCATE|GRANT|REVOKE|SET|SELECT|WITH)/i;

for (const file of allFiles) {
  const filePath = path.join(MIGRATIONS_DIR, file);
  const stat = fs.statSync(filePath);

  if (stat.size === 0) {
    fail(`${file} — file is empty (0 bytes)`);
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8").trim();

  if (content.length === 0) {
    fail(`${file} — file contains only whitespace`);
    continue;
  }

  if (!VALID_START.test(content)) {
    fail(`${file} — does not start with a recognised SQL statement (first 60 chars: "${content.slice(0, 60)}")`);
    continue;
  }

  pass(`${file} — OK (${(stat.size / 1024).toFixed(1)} KB)`);
}

// ── Summary ───────────────────────────────────────────────────────────────
console.log();
if (errors > 0) {
  console.error(`Migration validation FAILED with ${errors} error(s).`);
  process.exit(1);
} else {
  console.log(`Migration validation passed — ${allFiles.length} file(s) are valid.`);
}
