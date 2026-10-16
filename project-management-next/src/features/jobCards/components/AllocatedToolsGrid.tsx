import React, { useState, useEffect, useMemo } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Wrench, Plus, Trash2, CheckCircle2, AlertTriangle, Loader2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useToolsStore, type AllocatedTool } from '@/stores/tools-store'
import { useAuthStore } from '@/stores/auth-store'

interface AllocatedToolsGridProps {
  modelValue: AllocatedTool[]
  jobId: string
  onUpdate?: (value: AllocatedTool[]) => void
}

export default function AllocatedToolsGrid({
  modelValue = [],
  jobId,
  onUpdate,
}: AllocatedToolsGridProps) {
  const tools = useToolsStore((state) => state.tools)
  const fetchTools = useToolsStore((state) => state.fetchTools)
  const allocateToolToJobCard = useToolsStore((state) => state.allocateToolToJobCard)
  const updateJobCardToolState = useToolsStore((state) => state.updateJobCardToolState)
  const removeToolFromJobCard = useToolsStore((state) => state.removeToolFromJobCard)
  const authUser = useAuthStore((state) => state.user)

  useEffect(() => {
    const unsubscribe = fetchTools()
    return unsubscribe
  }, [fetchTools])

  const [selectedToolId, setSelectedToolId] = useState('')
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const availableTools = useMemo(() => {
    const allocatedToolIds = new Set(
      (modelValue || []).filter((item) => !item.state || item.state === 'Allocated').map((item) => item.toolId)
    )
    return tools.filter((tool) => tool.status === 'ACTIVE' && !allocatedToolIds.has(tool.id))
  }, [tools, modelValue])

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const list = modelValue || []
    if (!q) return list
    return list.filter(
      (tool) =>
        (tool.name || '').toLowerCase().includes(q) ||
        (tool.serialNumber || '').toLowerCase().includes(q) ||
        (tool.state || '').toLowerCase().includes(q)
    )
  }, [modelValue, searchQuery])

  const addTool = async () => {
    if (!selectedToolId) return
    const tool = tools.find((item) => item.id === selectedToolId)
    if (!tool) return
    setLoadingAction('add')
    try {
      await allocateToolToJobCard(jobId, tool.id, {
        uid: authUser?.uid,
        name: authUser?.displayName || authUser?.email || undefined,
      })
      setSelectedToolId('')
      toast.success(`${tool.name} allocated successfully`)
    } catch (err: unknown) {
      toast.error('Operation failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setLoadingAction(null)
    }
  }

  const removeTool = async (id: string) => {
    setLoadingAction(`remove-${id}`)
    try {
      await removeToolFromJobCard(jobId, id, {
        uid: authUser?.uid,
        name: authUser?.displayName || authUser?.email || undefined,
      })
      onUpdate?.((modelValue || []).filter((item) => item.id !== id))
      toast.success('Tool allocation removed')
    } catch (err: unknown) {
      toast.error('Operation failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setLoadingAction(null)
    }
  }

  const updateToolState = async (id: string, newState: 'Allocated' | 'Returned' | 'Damaged') => {
    if (newState === 'Allocated') return
    setLoadingAction(`state-${id}-${newState}`)
    try {
      await updateJobCardToolState(jobId, id, newState)
      onUpdate?.((modelValue || []).map((item) =>
        item.id === id ? { ...item, state: newState, returnedAt: new Date().toISOString() } : item
      ))
      toast.success(`Tool marked as ${newState}`)
    } catch (err: unknown) {
      toast.error('Operation failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setLoadingAction(null)
    }
  }

  return (
    <Card className="bg-card backdrop-blur-md border border-border shadow-lg overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border py-4 px-6">
        <div className="flex items-center gap-2">
          <Wrench className="size-5 text-primary" />
          <CardTitle className="text-lg font-bold">Allocated Tools Tracker</CardTitle>
        </div>

        {/* Quick Add Tool Form */}
        <div className="flex items-center gap-2 w-full sm:max-w-sm">
          <Select value={selectedToolId} onValueChange={(val) => setSelectedToolId(val || '')}>
            <SelectTrigger className="w-full sm:w-[220px] h-9 text-xs">
              <SelectValue placeholder="Select tool to allocate..." />
            </SelectTrigger>
            <SelectContent>
              {availableTools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id} className="text-xs">
                  {tool.name} — {tool.toolId || tool.id.slice(0, 8)}
                  {tool.serialNumber ? ` · SN: ${tool.serialNumber}` : ''}
                </SelectItem>
              ))}
              {availableTools.length === 0 && (
                <SelectItem value="none" disabled className="text-xs">
                  No available tools
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-9 px-4 gap-1 text-xs whitespace-nowrap shrink-0"
            disabled={!selectedToolId || loadingAction === 'add'}
            onClick={addTool}
          >
            {loadingAction === 'add' ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            Allocate
          </Button>
        </div>
      </CardHeader>
      <div className="relative max-w-sm px-6 py-2 border-b">
        <Search className="absolute left-8 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tools, serial, state…"
          className="pl-8 h-8"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <CardContent className="p-0 overflow-x-auto">
        <Table className="w-full min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/10 border-b border-border">
              <TableHead className="text-xs font-bold text-foreground py-3 pl-6">Tool Name</TableHead>
              <TableHead className="text-xs font-bold text-foreground py-3">Serial / Tag No.</TableHead>
              <TableHead className="text-xs font-bold text-foreground py-3">Allocated At</TableHead>
              <TableHead className="text-xs font-bold text-foreground py-3">Tracking State</TableHead>
              <TableHead className="text-xs font-bold text-foreground py-3 text-right pr-6">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTools.map((tool) => (
              <TableRow key={tool.id} className="border-b border-border hover:bg-muted/5">
                <TableCell className="font-medium text-sm py-3.5 pl-6">{tool.name}</TableCell>
                <TableCell className="text-sm py-3.5 text-muted-foreground">{tool.serialNumber}</TableCell>
                <TableCell className="text-xs py-3.5 text-muted-foreground">
                  {tool.allocatedAt ? new Date(tool.allocatedAt).toLocaleString('en-ZW') : 'N/A'}
                </TableCell>
                <TableCell className="py-3.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => updateToolState(tool.id, 'Allocated')}
                      disabled={tool.state !== 'Allocated' || loadingAction?.startsWith(`state-${tool.id}`)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                        tool.state === 'Allocated' || !tool.state
                          ? 'bg-primary/20 text-primary border-primary'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Allocated
                    </button>
                    <button
                      onClick={() => updateToolState(tool.id, 'Returned')}
                      disabled={loadingAction?.startsWith(`state-${tool.id}`)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        tool.state === 'Returned'
                          ? 'bg-green-500/20 text-green-500 border-green-500'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {tool.state === 'Returned' && <CheckCircle2 className="size-3" />}
                      Returned
                    </button>
                    <button
                      onClick={() => updateToolState(tool.id, 'Damaged')}
                      disabled={loadingAction?.startsWith(`state-${tool.id}`)}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        tool.state === 'Damaged'
                          ? 'bg-destructive/20 text-destructive border-destructive'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      {tool.state === 'Damaged' && <AlertTriangle className="size-3" />}
                      Damaged
                    </button>
                  </div>
                </TableCell>
                <TableCell className="py-3.5 text-right pr-6">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive h-8 w-8 hover:bg-destructive/10"
                    disabled={loadingAction === `remove-${tool.id}`}
                    onClick={() => removeTool(tool.id)}
                  >
                    {loadingAction === `remove-${tool.id}` ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filteredTools.length === 0 && searchQuery.trim() && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground text-xs">
                  No matching tools
                </TableCell>
              </TableRow>
            )}
            {(!modelValue || modelValue.length === 0) && !searchQuery.trim() && (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground italic text-xs">
                  No tools currently allocated to this job card. Use the quick-add selector above.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
