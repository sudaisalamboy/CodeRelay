import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  createSnapshot,
  deleteSnapshot,
  cleanBackups,
  detectArchiveFormat,
} from '@/lib/storage'

export const runtime = 'nodejs'

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
const MAX_SNAPSHOTS = 5 // keep last N pushes per project

/**
 * POST /api/push/[endpointId]
 *
 * Body:
 *   - multipart/form-data with field "file" = .zip OR .tar.gz
 *   - OR raw body with Content-Type application/zip, application/gzip,
 *     application/x-gzip, application/x-tar, application/octet-stream
 *
 * Creates a NEW snapshot for the project (does NOT touch existing ones).
 * If project now has more than MAX_SNAPSHOTS snapshots, the oldest ones
 * are deleted (DB + filesystem).
 *
 * Max upload size: 100 MB.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params
  if (!endpointId) {
    return NextResponse.json({ error: 'missing endpointId' }, { status: 400 })
  }

  const project = await db.project.findUnique({ where: { endpointId } })
  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }

  let buffer: Buffer | null = null
  const ct = req.headers.get('content-type') || ''

  if (ct.startsWith('multipart/form-data')) {
    const form = await req.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: 'missing "file" field (.zip or .tar.gz)' },
        { status: 400 },
      )
    }
    buffer = Buffer.from(await file.arrayBuffer())
  } else if (
    ct.includes('zip') ||
    ct.includes('gzip') ||
    ct.includes('x-tar') ||
    ct.includes('octet-stream')
  ) {
    buffer = Buffer.from(await req.arrayBuffer())
  } else {
    return NextResponse.json(
      {
        error:
          'unsupported content-type. Use multipart/form-data with field "file", or one of: application/zip, application/gzip, application/x-tar, application/octet-stream',
      },
      { status: 415 },
    )
  }

  if (!buffer || buffer.length === 0) {
    return NextResponse.json({ error: 'empty upload' }, { status: 400 })
  }

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `upload too large (max ${MAX_UPLOAD_BYTES} bytes / 100 MB, got ${buffer.length})`,
      },
      { status: 413 },
    )
  }

  const format = detectArchiveFormat(buffer)
  if (!format) {
    return NextResponse.json(
      {
        error:
          'unsupported archive format. Upload a .zip or .tar.gz file. ' +
          '(Detected first 4 bytes: ' + buffer.slice(0, 4).toString('hex') + ')',
      },
      { status: 415 },
    )
  }

  try {
    await cleanBackups(endpointId)

    const lastSnap = await db.pushSnapshot.findFirst({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
    })
    const nextVersion = (lastSnap?.version ?? 0) + 1

    const snapshot = await db.pushSnapshot.create({
      data: {
        projectId: project.id,
        version: nextVersion,
        format,
        fileCount: 0,
        totalBytes: 0,
      },
    })

    let stats: { fileCount: number; totalBytes: number }
    try {
      stats = await createSnapshot(endpointId, snapshot.id, buffer)
      await db.pushSnapshot.update({
        where: { id: snapshot.id },
        data: { fileCount: stats.fileCount, totalBytes: stats.totalBytes },
      })
    } catch (extractErr) {
      await db.pushSnapshot.delete({ where: { id: snapshot.id } }).catch(() => {})
      throw extractErr
    }

    await db.project.update({
      where: { endpointId },
      data: {
        lastPushedAt: new Date(),
        pushCount: { increment: 1 },
      },
    })

    // Trim old snapshots (keep only last MAX_SNAPSHOTS).
    const allSnaps = await db.pushSnapshot.findMany({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
      select: { id: true },
    })
    const toDelete = allSnaps.slice(MAX_SNAPSHOTS)
    if (toDelete.length > 0) {
      await Promise.all(
        toDelete.map(async (s) => {
          await deleteSnapshot(endpointId, s.id)
          await db.pushSnapshot.delete({ where: { id: s.id } })
        }),
      )
    }

    return NextResponse.json({
      ok: true,
      endpointId,
      snapshotId: snapshot.id,
      version: nextVersion,
      format,
      fileCount: stats.fileCount,
      totalBytes: stats.totalBytes,
      pushedAt: new Date().toISOString(),
      keptSnapshots: Math.min(allSnaps.length, MAX_SNAPSHOTS),
      maxSnapshots: MAX_SNAPSHOTS,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: 'push failed', detail: err?.message || String(err) },
      { status: 500 },
    )
  }
}
