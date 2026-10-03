import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pullSnapshotFiles } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * GET /api/pull/[endpointId]
 *
 * Downloads the LATEST pushed snapshot as a single zip.
 * Permanent — can be called as many times as you like.
 * Always serves the most recent push (use /api/history/:id to see older versions).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params
  if (!endpointId) {
    return NextResponse.json({ error: 'missing endpointId' }, { status: 400 })
  }

  const project = await db.project.findUnique({
    where: { endpointId },
    include: {
      snapshots: {
        orderBy: { version: 'desc' },
        take: 1, // latest only
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }

  const latestSnapshot = project.snapshots[0]
  if (!latestSnapshot) {
    return NextResponse.json(
      { error: 'no files pushed yet for this endpoint' },
      { status: 404 },
    )
  }

  const result = await pullSnapshotFiles(endpointId, latestSnapshot.id)
  if (!result || result.fileCount === 0) {
    return NextResponse.json(
      { error: 'snapshot folder is empty' },
      { status: 404 },
    )
  }

  // Best-effort: bump pull counter
  await db.project.update({
    where: { endpointId },
    data: { lastPulledAt: new Date(), pullCount: { increment: 1 } },
  })

  const filename = `${project.displayName || endpointId}-${endpointId}-v${latestSnapshot.version}.zip`

  return new NextResponse(result.buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-store',
      'X-Snapshot-Version': String(latestSnapshot.version),
      'X-Snapshot-Created': latestSnapshot.createdAt.toISOString(),
    },
  })
}
