import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * GET /api/history/[endpointId]
 * Lists all kept snapshots (last 5) for a project, newest first.
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
        select: {
          id: true,
          version: true,
          fileCount: true,
          totalBytes: true,
          format: true,
          createdAt: true,
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }

  return NextResponse.json({
    endpointId,
    name: project.displayName,
    pushCount: project.pushCount,
    pullCount: project.pullCount,
    createdAt: project.createdAt,
    lastPushedAt: project.lastPushedAt,
    lastPulledAt: project.lastPulledAt,
    snapshots: project.snapshots.map((s) => ({
      id: s.id,
      version: s.version,
      fileCount: s.fileCount,
      totalBytes: s.totalBytes,
      format: s.format,
      createdAt: s.createdAt,
      pullUrl: `/api/pull/${endpointId}?version=${s.version}`,
      isLatest: s.version === project.snapshots[0]?.version,
    })),
    maxKept: 5,
  })
}
