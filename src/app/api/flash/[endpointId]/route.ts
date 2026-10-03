import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newFlashToken } from '@/lib/id'

/**
 * POST /api/flash/[endpointId]
 * Generate a new 24-char one-time download token for this project.
 * The token can be used to download the project zip ONCE.
 */
export async function POST(
  _req: NextRequest,
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

  // Generate unique 24-char flash token
  let token = newFlashToken()
  for (let i = 0; i < 5; i++) {
    const existing = await db.flashToken.findUnique({ where: { token } })
    if (!existing) break
    token = newFlashToken()
  }

  const flash = await db.flashToken.create({
    data: {
      token,
      projectId: project.id,
    },
  })

  return NextResponse.json({
    token: flash.token,
    endpointId,
    url: `/api/flash-download/${flash.token}`,
    createdAt: flash.createdAt,
    note: 'One-time use only. After a successful download, the token is invalidated.',
  })
}

/**
 * GET /api/flash/[endpointId]
 * Lists all flash tokens for this endpoint (with used status).
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
      flashTokens: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!project) {
    return NextResponse.json({ error: 'endpoint not found' }, { status: 404 })
  }
  return NextResponse.json({
    endpointId,
    tokens: project.flashTokens.map((t) => ({
      token: t.token,
      used: t.used,
      createdAt: t.createdAt,
      usedAt: t.usedAt,
      url: `/api/flash-download/${t.token}`,
    })),
  })
}
