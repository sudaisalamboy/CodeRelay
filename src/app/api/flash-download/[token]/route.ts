import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { pullSnapshotFiles } from '@/lib/storage'

export const runtime = 'nodejs'

/**
 * GET /api/flash-download/[token]
 * One-time download of a project's LATEST snapshot zip.
 * After a successful download, the token is marked used and can never be used again.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'invalid flash token' }, { status: 400 })
  }

  const flash = await db.flashToken.findUnique({
    where: { token },
    include: { project: { include: { snapshots: { orderBy: { version: 'desc' }, take: 1 } } } },
  })
  if (!flash) {
    return NextResponse.json({ error: 'flash token not found' }, { status: 404 })
  }
  if (flash.used) {
    return NextResponse.json(
      { error: 'flash token already used', usedAt: flash.usedAt },
      { status: 410 },
    )
  }

  const latestSnapshot = flash.project.snapshots[0]
  if (!latestSnapshot) {
    return NextResponse.json(
      { error: 'no files pushed to this project yet' },
      { status: 404 },
    )
  }

  const result = await pullSnapshotFiles(flash.project.endpointId, latestSnapshot.id)
  if (!result || result.fileCount === 0) {
    return NextResponse.json(
      { error: 'snapshot folder is empty' },
      { status: 404 },
    )
  }

  // Mark token as used BEFORE returning the bytes (best-effort; even if the
  // client never completes the download, we err on the side of invalidating).
  await db.flashToken.update({
    where: { token },
    data: { used: true, usedAt: new Date() },
  })

  await db.project.update({
    where: { id: flash.project.id },
    data: { lastPulledAt: new Date(), pullCount: { increment: 1 } },
  })

  const filename = `${flash.project.displayName || flash.project.endpointId}-flash-v${latestSnapshot.version}.zip`

  return new NextResponse(result.buffer as any, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(result.buffer.length),
      'Cache-Control': 'no-store',
    },
  })
}
