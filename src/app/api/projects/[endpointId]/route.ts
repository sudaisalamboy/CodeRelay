import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteProjectFiles } from '@/lib/storage'

/**
 * GET /api/projects/[endpointId]
 * Returns metadata + flash tokens + latest snapshot stats for a single project.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params
  const project = await db.project.findUnique({
    where: { endpointId },
    include: {
      flashTokens: { orderBy: { createdAt: 'desc' } },
      snapshots: {
        orderBy: { version: 'desc' },
        take: 1, // just latest for summary
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }

  const latestSnapshot = project.snapshots[0] ?? null
  const snapshotCount = await db.pushSnapshot.count({
    where: { projectId: project.id },
  })

  return NextResponse.json({
    endpointId: project.endpointId,
    name: project.displayName,
    createdAt: project.createdAt,
    lastPushedAt: project.lastPushedAt,
    lastPulledAt: project.lastPulledAt,
    fileCount: latestSnapshot?.fileCount ?? 0,
    totalBytes: latestSnapshot?.totalBytes ?? 0,
    latestVersion: latestSnapshot?.version ?? 0,
    latestFormat: latestSnapshot?.format ?? null,
    snapshotCount,
    maxSnapshots: 5,
    pushCount: project.pushCount,
    pullCount: project.pullCount,
    flashTokens: project.flashTokens.map((t) => ({
      token: t.token,
      used: t.used,
      createdAt: t.createdAt,
      usedAt: t.usedAt,
      url: `/api/flash-download/${t.token}`,
    })),
  })
}

/**
 * DELETE /api/projects/[endpointId]
 * Permanently deletes a project and all its stored files (all snapshots).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ endpointId: string }> },
) {
  const { endpointId } = await params
  const project = await db.project.findUnique({ where: { endpointId } })
  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }
  await db.project.delete({ where: { endpointId } })
  await deleteProjectFiles(endpointId)
  return NextResponse.json({ ok: true, deleted: endpointId })
}
