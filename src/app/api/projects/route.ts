import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newEndpointId } from '@/lib/id'

/**
 * POST /api/projects
 * Body: { "name": "grocery" }
 * Creates a new project and returns the permanent 8-char endpoint ID.
 * No auth. Name is just a label — endpointId is the only identity.
 */
export async function POST(req: NextRequest) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (name.length > 100) {
    return NextResponse.json({ error: 'name too long (max 100 chars)' }, { status: 400 })
  }

  // Generate a unique 8-char endpoint id (collision check, very unlikely)
  let endpointId = newEndpointId()
  for (let i = 0; i < 5; i++) {
    const existing = await db.project.findUnique({ where: { endpointId } })
    if (!existing) break
    endpointId = newEndpointId()
  }

  const project = await db.project.create({
    data: {
      endpointId,
      displayName: name,
    },
  })

  return NextResponse.json({
    endpointId: project.endpointId,
    name: project.displayName,
    createdAt: project.createdAt,
    pushUrl: `/api/push/${project.endpointId}`,
    pullUrl: `/api/pull/${project.endpointId}`,
  })
}

/**
 * GET /api/projects
 * Lists all projects (no auth — anyone can browse).
 */
export async function GET() {
  const projects = await db.project.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      endpointId: true,
      displayName: true,
      createdAt: true,
      lastPushedAt: true,
      lastPulledAt: true,
      pushCount: true,
      pullCount: true,
      snapshots: {
        orderBy: { version: 'desc' },
        take: 1,
        select: { fileCount: true, totalBytes: true, version: true, format: true },
      },
      _count: { select: { flashTokens: true, snapshots: true } },
    },
  })

  return NextResponse.json({
    projects: projects.map((p) => ({
      endpointId: p.endpointId,
      displayName: p.displayName,
      createdAt: p.createdAt,
      lastPushedAt: p.lastPushedAt,
      lastPulledAt: p.lastPulledAt,
      pushCount: p.pushCount,
      pullCount: p.pullCount,
      fileCount: p.snapshots[0]?.fileCount ?? 0,
      totalBytes: p.snapshots[0]?.totalBytes ?? 0,
      latestVersion: p.snapshots[0]?.version ?? 0,
      latestFormat: p.snapshots[0]?.format ?? null,
      snapshotCount: p._count.snapshots,
      maxSnapshots: 5,
      flashTokenCount: p._count.flashTokens,
    })),
  })
}
