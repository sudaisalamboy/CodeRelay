'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Copy,
  FileArchive,
  Hash,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Zap,
  FolderGit2,
  Terminal,
  Eye,
  EyeOff,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// ----- types -----
type FlashToken = {
  token: string
  used: boolean
  createdAt: string
  usedAt: string | null
  url: string
}

type ProjectMeta = {
  endpointId: string
  name: string
  createdAt: string
  lastPushedAt: string | null
  lastPulledAt: string | null
  fileCount: number
  totalBytes: number
  pushCount: number
  pullCount: number
  flashTokens: FlashToken[]
}

// ----- helpers -----
function fmtBytes(n: number): string {
  if (!n) return '0 B'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return s
  }
}

function origin(): string {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

async function copy(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} to clipboard`)
  } catch {
    toast.error('Copy failed — select and copy manually')
  }
}

// LocalStorage key for project endpoint IDs created in this browser.
const LS_KEY = 'coderelay:endpoints'

function loadSavedEndpoints(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveEndpoint(id: string) {
  const cur = loadSavedEndpoints()
  if (!cur.includes(id)) {
    cur.unshift(id)
    localStorage.setItem(LS_KEY, JSON.stringify(cur))
  }
}

function removeSavedEndpoint(id: string) {
  const cur = loadSavedEndpoints().filter((x) => x !== id)
  localStorage.setItem(LS_KEY, JSON.stringify(cur))
}

// ----- main component -----
export default function Home() {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [endpoints, setEndpoints] = useState<string[]>([])
  const [projects, setProjects] = useState<ProjectMeta[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [pullIdInput, setPullIdInput] = useState('')
  const [addIdInput, setAddIdInput] = useState('')
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const refreshAll = useCallback(async () => {
    setLoadingList(true)
    const ids = loadSavedEndpoints()
    setEndpoints(ids)
    if (ids.length === 0) {
      setProjects([])
      setLoadingList(false)
      return
    }
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/projects/${id}`).then((r) =>
            r.ok ? (r.json() as Promise<ProjectMeta>) : null,
          ),
        ),
      )
      setProjects(results.filter(Boolean) as ProjectMeta[])
    } catch (e) {
      toast.error('Failed to load projects')
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const handleCreate = useCallback(async () => {
    const n = name.trim()
    if (!n) {
      toast.error('Give your project a name')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'create failed')
      }
      const data = await res.json()
      saveEndpoint(data.endpointId)
      setName('')
      toast.success(`Project created — endpoint ${data.endpointId}`)
      await refreshAll()
    } catch (e: any) {
      toast.error(e?.message || 'Create failed')
    } finally {
      setCreating(false)
    }
  }, [name, refreshAll])

  const handleAddExisting = useCallback(async () => {
    const id = addIdInput.trim()
    if (!id) {
      toast.error('Enter an endpoint ID')
      return
    }
    // Verify it exists
    try {
      const r = await fetch(`/api/projects/${id}`)
      if (!r.ok) {
        toast.error('Endpoint not found')
        return
      }
      saveEndpoint(id)
      setAddIdInput('')
      setAddDialogOpen(false)
      toast.success(`Added endpoint ${id}`)
      await refreshAll()
    } catch {
      toast.error('Failed to verify endpoint')
    }
  }, [addIdInput, refreshAll])

  const handleDelete = useCallback(
    async (endpointId: string) => {
      try {
        const r = await fetch(`/api/projects/${endpointId}`, {
          method: 'DELETE',
        })
        if (!r.ok) throw new Error()
        removeSavedEndpoint(endpointId)
        toast.success(`Deleted ${endpointId}`)
        await refreshAll()
      } catch {
        toast.error('Delete failed')
      }
    },
    [refreshAll],
  )

  const handleGenerateFlash = useCallback(
    async (endpointId: string) => {
      try {
        const r = await fetch(`/api/flash/${endpointId}`, { method: 'POST' })
        if (!r.ok) {
          const e = await r.json().catch(() => ({}))
          throw new Error(e.error || 'failed')
        }
        toast.success('Flash token generated (one-time use)')
        await refreshAll()
      } catch (e: any) {
        toast.error(e?.message || 'Flash generation failed')
      }
    },
    [refreshAll],
  )

  const handlePullBrowser = useCallback(async (endpointId: string) => {
    try {
      window.open(`/api/pull/${endpointId}`, '_blank')
    } catch {
      toast.error('Open failed')
    }
  }, [])

  // ----- render -----
  return (
    <div className="min-h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-stone-900 text-stone-50 grid place-items-center">
              <FolderGit2 className="size-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-stone-900 tracking-tight">
                CodeRelay
              </h1>
              <p className="text-xs text-stone-500 -mt-0.5">
                No-auth push/pull for code projects
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* How it works */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-5 bg-white">
            <div className="flex items-center gap-2 text-stone-900">
              <Plus className="size-4" />
              <span className="text-sm font-semibold">1. Create endpoint</span>
            </div>
            <p className="mt-2 text-xs text-stone-500 leading-relaxed">
              Give a project name. You get a permanent 8-char endpoint ID
              (e.g. <code className="font-mono">gb73h83h</code>) — that&apos;s the identity.
            </p>
          </Card>
          <Card className="p-5 bg-white">
            <div className="flex items-center gap-2 text-stone-900">
              <ArrowUpFromLine className="size-4" />
              <span className="text-sm font-semibold">2. Push your code</span>
            </div>
            <p className="mt-2 text-xs text-stone-500 leading-relaxed">
              Zip your project folder and POST it to <code>/api/push/&lt;id&gt;</code>.
              Replaces whatever was there before — no merges.
            </p>
          </Card>
          <Card className="p-5 bg-white">
            <div className="flex items-center gap-2 text-stone-900">
              <ArrowDownToLine className="size-4" />
              <span className="text-sm font-semibold">3. Pull / flash-pull</span>
            </div>
            <p className="mt-2 text-xs text-stone-500 leading-relaxed">
              Use the permanent ID to pull anytime, or generate a one-time
              24-char flash link to share with someone.
            </p>
          </Card>
        </section>

        {/* Create new project */}
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-4">
            Create new endpoint
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder="project name (e.g. grocery-app)"
              className="flex-1 font-mono"
              disabled={creating}
            />
            <Button
              onClick={handleCreate}
              disabled={creating || !name.trim()}
              className="bg-stone-900 hover:bg-stone-800 text-stone-50"
            >
              {creating ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <Plus className="size-4 mr-2" />
              )}
              Generate endpoint
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-500">
            Name is just a label — the 8-char ID is the real identity.
          </p>
        </section>

        {/* Projects list */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider">
              Your endpoints ({projects.length})
            </h2>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-stone-600" onClick={() => setAddDialogOpen(true)}>
                  <Hash className="size-3.5 mr-1" /> Add existing by ID
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add an existing endpoint</DialogTitle>
                  <DialogDescription>
                    Paste an 8-char endpoint ID you already have to track it here.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex gap-2">
                  <Input
                    value={addIdInput}
                    onChange={(e) => setAddIdInput(e.target.value)}
                    placeholder="gb73h83h"
                    className="font-mono"
                  />
                  <Button onClick={handleAddExisting}>Add</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {loadingList ? (
            <div className="text-center py-12 text-stone-500">
              <Loader2 className="size-5 animate-spin mx-auto mb-2" />
              Loading endpoints…
            </div>
          ) : projects.length === 0 ? (
            <Card className="p-10 text-center bg-white border-dashed">
              <p className="text-sm text-stone-500 mb-4">
                No endpoints yet. Create one above to get started.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {projects.map((p) => (
                <ProjectCard
                  key={p.endpointId}
                  project={p}
                  onDelete={() => handleDelete(p.endpointId)}
                  onFlash={() => handleGenerateFlash(p.endpointId)}
                  onPull={() => handlePullBrowser(p.endpointId)}
                  onChanged={refreshAll}
                />
              ))}
            </div>
          )}
        </section>

        {/* Quick pull box */}
        <section className="bg-stone-900 text-stone-50 rounded-xl p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3 text-stone-300">
            Quick pull by endpoint ID
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              value={pullIdInput}
              onChange={(e) => setPullIdInput(e.target.value)}
              placeholder="8-char endpoint ID"
              className="flex-1 bg-stone-800 border-stone-700 text-stone-50 font-mono placeholder:text-stone-500"
            />
            <Button
              variant="secondary"
              disabled={pullIdInput.trim().length < 4}
              onClick={() => {
                if (pullIdInput.trim()) {
                  window.open(`/api/pull/${pullIdInput.trim()}`, '_blank')
                }
              }}
            >
              <ArrowDownToLine className="size-4 mr-2" />
              Download zip
            </Button>
          </div>
          <p className="mt-2 text-xs text-stone-400">
            Anyone with the ID can pull. Share carefully.
          </p>
        </section>

        {/* API reference */}
        <section className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-900 uppercase tracking-wider mb-4">
            API reference
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <CodeLine method="POST" path="/api/projects" desc="create endpoint" body='{ "name": "grocery" }' />
            <CodeLine method="GET" path="/api/projects/:id" desc="project metadata" />
            <CodeLine method="DELETE" path="/api/projects/:id" desc="delete project + files" />
            <CodeLine method="POST" path="/api/push/:id" desc="upload zip (replace)" body='multipart file=project.zip' />
            <CodeLine method="GET" path="/api/pull/:id" desc="download zip (permanent)" />
            <CodeLine method="POST" path="/api/flash/:id" desc="create 1-time flash link" />
            <CodeLine method="GET" path="/api/flash/:id" desc="list flash tokens" />
            <CodeLine method="GET" path="/api/flash-download/:token" desc="1-time zip download" />
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 text-xs text-stone-500 flex flex-col sm:flex-row justify-between gap-2">
          <span>CodeRelay — endpoint-based code push/pull, no auth.</span>
          <span>Push replaces; pull serves the latest snapshot.</span>
        </div>
      </footer>
    </div>
  )
}

// ----- project card -----
function ProjectCard({
  project,
  onDelete,
  onFlash,
  onPull,
  onChanged,
}: {
  project: ProjectMeta
  onDelete: () => void
  onFlash: () => void
  onPull: () => void
  onChanged: () => void
}) {
  const [showCli, setShowCli] = useState(false)
  const [showFlash, setShowFlash] = useState(false)
  const origin_ = origin()

  const cli = useMemo(() => {
    const id = project.endpointId
    // Use $HOME/Downloads so files land in the user's real Downloads folder
    // (works on Linux, macOS, and Windows Git Bash).
    return {
      push:
        `# zip and push (saves temp zip to ~/Downloads)
cd /your/project && \
  zip -r "$HOME/Downloads/${id}-upload.zip" . && \
  curl -X POST -F "file=@$HOME/Downloads/${id}-upload.zip" \\
    ${origin_}/api/push/${id}`,
      pull:
        `# pull latest zip into ~/Downloads and extract there
curl -L ${origin_}/api/pull/${id} \\
  -o "$HOME/Downloads/${id}.zip" && \\
  unzip -o "$HOME/Downloads/${id}.zip" -d "$HOME/Downloads/${id}"`,
    }
  }, [project.endpointId, origin_])

  return (
    <Card className="bg-white border border-stone-200 p-5 flex flex-col gap-3">
      {/* header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-stone-900 truncate">
              {project.name}
            </h3>
            <Badge variant="secondary" className="font-mono text-xs">
              {project.endpointId}
            </Badge>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-stone-500 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <FileArchive className="size-3" />
              {project.fileCount} files
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="size-3" />
              {fmtBytes(project.totalBytes)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowUpFromLine className="size-3" />
              {project.pushCount} push
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowDownToLine className="size-3" />
              {project.pullCount} pull
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <CopyBtn text={project.endpointId} label={`endpoint ID ${project.endpointId}`} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-stone-500 hover:text-red-600">
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete endpoint {project.endpointId}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the project, all stored files, and all
                  flash tokens. Cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={onDelete}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* timestamp */}
      <div className="text-xs text-stone-500 grid grid-cols-2 gap-1">
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> pushed: {fmtDate(project.lastPushedAt)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Clock className="size-3" /> pulled: {fmtDate(project.lastPulledAt)}
        </span>
      </div>

      {/* action buttons */}
      <div className="flex flex-wrap gap-2 mt-1">
        <Button size="sm" variant="default" onClick={onPull} className="bg-stone-900 hover:bg-stone-800 text-stone-50">
          <ArrowDownToLine className="size-3.5 mr-1.5" />
          Pull zip
        </Button>
        <Button size="sm" variant="outline" onClick={onFlash}>
          <Zap className="size-3.5 mr-1.5" />
          Flash link
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowCli((s) => !s)}>
          {showCli ? <EyeOff className="size-3.5 mr-1.5" /> : <Terminal className="size-3.5 mr-1.5" />}
          CLI
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowFlash((s) => !s)}>
          {showFlash ? <EyeOff className="size-3.5 mr-1.5" /> : <Eye className="size-3.5 mr-1.5" />}
          Flash ({project.flashTokens.length})
        </Button>
      </div>

      {/* CLI block */}
      {showCli && (
        <div className="space-y-2 mt-1">
          <CliBlock title="Push (replace)" body={cli.push} />
          <CliBlock title="Pull" body={cli.pull} />
        </div>
      )}

      {/* Flash tokens list */}
      {showFlash && (
        <div className="mt-1 space-y-2">
          {project.flashTokens.length === 0 ? (
            <p className="text-xs text-stone-500">
              No flash tokens yet. Click <b>Flash link</b> to create one.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {project.flashTokens.map((t) => (
                <FlashRow key={t.token} token={t} onChanged={onChanged} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function FlashRow({ token, onChanged }: { token: FlashToken; onChanged: () => void }) {
  const fullUrl = `${origin()}${token.url}`
  return (
    <div className="flex items-center justify-between gap-2 p-2 rounded-md bg-stone-50 border border-stone-200">
      <div className="min-w-0 flex-1">
        <code className="text-xs font-mono text-stone-700 break-all block">
          {token.token}
        </code>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant={token.used ? 'destructive' : 'default'} className="text-[10px] h-4 px-1.5">
            {token.used ? 'USED' : 'active'}
          </Badge>
          <span className="text-[10px] text-stone-500">
            {token.used
              ? `used ${fmtDate(token.usedAt)}`
              : `created ${fmtDate(token.createdAt)}`}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {!token.used && (
          <>
            <CopyBtn text={fullUrl} label="flash URL" />
            <a href={fullUrl} target="_blank" rel="noreferrer">
              <Button size="icon" variant="ghost" className="size-8">
                <ArrowDownToLine className="size-4" />
              </Button>
            </a>
          </>
        )}
      </div>
    </div>
  )
}

// ----- small components -----
function CopyBtn({ text, label }: { text: string; label: string }) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8 text-stone-500 hover:text-stone-900"
      onClick={() => copy(text, label)}
      title={`Copy ${label}`}
    >
      <Copy className="size-4" />
    </Button>
  )
}

function CliBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md bg-stone-900 text-stone-50 p-3 relative group">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-stone-400">{title}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-stone-400 hover:text-stone-50"
          onClick={() => copy(body, 'command')}
        >
          <Copy className="size-3" />
        </Button>
      </div>
      <pre className="text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed">
        {body}
      </pre>
    </div>
  )
}

function CodeLine({
  method,
  path,
  desc,
  body,
}: {
  method: string
  path: string
  desc: string
  body?: string
}) {
  const methodColor: Record<string, string> = {
    GET: 'text-emerald-600',
    POST: 'text-amber-600',
    DELETE: 'text-red-600',
  }
  return (
    <div className="p-2 rounded bg-stone-50 border border-stone-200">
      <div className="flex items-center gap-2">
        <span className={`font-bold ${methodColor[method]}`}>{method}</span>
        <span className="text-stone-800">{path}</span>
      </div>
      <div className="text-[10px] text-stone-500 mt-0.5">{desc}</div>
      {body && (
        <div className="text-[10px] text-stone-600 mt-1 font-mono break-all">
          body: {body}
        </div>
      )}
    </div>
  )
}
