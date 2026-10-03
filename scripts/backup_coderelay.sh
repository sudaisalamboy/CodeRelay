#!/usr/bin/env bash
# backup_coderelay.sh — Create a clean backup zip of the CodeRelay project.
#
# Excludes: node_modules, .next, storage data, db, .git, dev logs, archives
# Includes: all source code, configs, prisma schema, scripts, CLI, etc.
#
# Output: /home/z/my-project/download/coderelay-backup-<timestamp>.zip

set -euo pipefail

PROJECT_DIR="/home/z/my-project"
DOWNLOAD_DIR="${PROJECT_DIR}/download"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_NAME="coderelay-backup-${TIMESTAMP}.zip"
BACKUP_PATH="${DOWNLOAD_DIR}/${BACKUP_NAME}"

mkdir -p "${DOWNLOAD_DIR}"

echo "============================================================="
echo "  CodeRelay Project Backup"
echo "============================================================="
echo ""
echo "Source:      ${PROJECT_DIR}"
echo "Destination: ${BACKUP_PATH}"
echo ""

cd "${PROJECT_DIR}"

zip -r "${BACKUP_PATH}" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x "storage/*" \
  -x "db/*.db" \
  -x "db/*.db-journal" \
  -x ".git/*" \
  -x ".zscripts/*" \
  -x "skills/*" \
  -x "dev.log" \
  -x "dev.log.*" \
  -x "server.log" \
  -x "download/archives/*" \
  -x "download/recovered/*" \
  -x "download/screenshots/*" \
  -x "download/coderelay-backup-*.zip" \
  -x "tests/python-runtime-container.sh" \
  -x "upload/*" \
  -x "bun.lock" \
  -q

# Show result
echo ""
echo "============================================================="
echo "  ✅ BACKUP COMPLETE"
echo "============================================================="
echo ""
echo "File: ${BACKUP_PATH}"
ls -la "${BACKUP_PATH}"
echo ""
echo "Size: $(du -h "${BACKUP_PATH}" | cut -f1)"
echo ""
echo "Contents summary:"
unzip -l "${BACKUP_PATH}" | tail -5
echo ""
echo "Top-level entries:"
unzip -l "${BACKUP_PATH}" | head -25
echo ""
echo "============================================================="
echo "  To restore / deploy this backup:"
echo "============================================================="
echo "  1. unzip coderelay-backup-${TIMESTAMP}.zip -d coderelay"
echo "  2. cd coderelay"
echo "  3. bun install"
echo "  4. bun run db:push"
echo "  5. bun run dev"
echo "============================================================="
