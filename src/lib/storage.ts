import { promises as fs } from 'node:fs'
import path from 'node:path'
import AdmZip from 'adm-zip'
import * as tar from 'tar'

const STORAGE_ROOT = path.resolve(process.cwd(), 'storage', 'projects')

function projectDir(endpointId: string): string {
  return path.join(STORAGE_ROOT, endpointId)
}

function snapshotDir(endpointId: string, snapshotId: string): string {
  return path.join(projectDir(endpointId), 'snapshots', snapshotId)
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
}

/**
 * Detect archive format by inspecting magic bytes at the start of the buffer.
 *   ZIP    → starts with PK\x03\x04 (0x50 0x4b 0x03 0x04)
 *   tar.gz → starts with 0x1f 0x8b (gzip magic)
 * Returns 'zip' | 'tar.gz' | null
 */
export function detectArchiveFormat(buffer: Buffer): 'zip' | 'tar.gz' | null {
  if (!buffer || buffer.length < 4) return null
  if (
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'zip'
  }
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return 'tar.gz'
  }
  return null
}

/**
 * Extract an archive (zip OR tar.gz) into the given directory.
 * Replaces anything currently in that directory.
 */
async function extractArchive(buffer: Buffer, dir: string): Promise<void> {
  await ensureDir(dir)

  const format = detectArchiveFormat(buffer)
  if (format === 'zip') {
    const zip = new AdmZip(buffer)
    zip.extractAllTo(dir, true)
  } else if (format === 'tar.gz') {
    const { tmpdir } = await import('node:os')
    const tmpFile = path.join(
      tmpdir(),
      `coderelay-${Date.now()}-${Math.random().toString(36).slice(2)}.tar.gz`,
    )
    await fs.writeFile(tmpFile, buffer)
    try {
      await tar.x({
        file: tmpFile,
        C: dir,
        strip: 0,
        preservePaths: false,
        noChmod: true,
        noMtime: true,
      })
    } finally {
      await fs.rm(tmpFile, { force: true })
    }
  } else {
    throw new Error(
      'Unsupported archive format. Upload a .zip or .tar.gz file. ' +
      '(Detected magic bytes: ' + buffer.slice(0, 4).toString('hex') + ')',
    )
  }
}

async function walk(root: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0
  let totalBytes = 0
  const entries = await fs.readdir(root, { withFileTypes: true, recursive: true })
  for (const e of entries) {
    if (e.isFile()) {
      try {
        const stat = await fs.stat(path.join(e.parentPath, e.name))
        fileCount++
        totalBytes += stat.size
      } catch {
        // skip
      }
    }
  }
  return { fileCount, totalBytes }
}

/**
 * Create a NEW snapshot for this project (does NOT touch existing snapshots).
 * The caller is responsible for trimming old snapshots afterwards.
 *
 * Returns the snapshot directory + stats + detected format.
 */
export async function createSnapshot(
  endpointId: string,
  snapshotId: string,
  buffer: Buffer,
): Promise<{ fileCount: number; totalBytes: number; format: 'zip' | 'tar.gz' }> {
  const dir = snapshotDir(endpointId, snapshotId)
  await ensureDir(dir)
  await extractArchive(buffer, dir)
  const stats = await walk(dir)
  const format = detectArchiveFormat(buffer) || 'zip'
  return { ...stats, format }
}

/**
 * Read a snapshot's files into an in-memory zip.
 */
export async function pullSnapshotFiles(
  endpointId: string,
  snapshotId: string,
): Promise<{ buffer: Buffer; fileCount: number; totalBytes: number } | null> {
  const dir = snapshotDir(endpointId, snapshotId)
  try {
    await fs.access(dir)
  } catch {
    return null
  }

  const zip = new AdmZip()
  const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true })
  let fileCount = 0
  let totalBytes = 0

  for (const e of entries) {
    if (e.isFile()) {
      const full = path.join(e.parentPath, e.name)
      const rel = path.relative(dir, full)
      const data = await fs.readFile(full)
      zip.addFile(rel, data)
      fileCount++
      totalBytes += data.length
    }
  }

  return { buffer: zip.toBuffer(), fileCount, totalBytes }
}

/**
 * Delete a single snapshot's files from disk.
 */
export async function deleteSnapshot(
  endpointId: string,
  snapshotId: string,
): Promise<void> {
  const dir = snapshotDir(endpointId, snapshotId)
  await fs.rm(dir, { recursive: true, force: true })
}

/**
 * Completely remove all stored files for a project (all snapshots).
 */
export async function deleteProjectFiles(endpointId: string): Promise<void> {
  const dir = projectDir(endpointId)
  await fs.rm(dir, { recursive: true, force: true })
}

/**
 * Defensive cleanup: remove any leftover `files.old-*` backups from
 * older versions of the storage code. No-op if none exist.
 */
export async function cleanBackups(endpointId: string): Promise<void> {
  const parent = projectDir(endpointId)
  try {
    const entries = await fs.readdir(parent, { withFileTypes: true })
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && e.name.startsWith('files.old-'))
        .map((e) => fs.rm(path.join(parent, e.name), { recursive: true, force: true })),
    )
  } catch {
    // parent dir may not exist — nothing to clean
  }
}
