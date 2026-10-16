'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Loader2, Plus, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useContainerAccessStore } from '@/stores/container-access-store'
import { useAuthStore } from '@/stores/auth-store'
import type { CAAStatus } from '@/features/container-access/types'

const STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  APPROVED: 'bg-green-100 text-green-800 border border-green-200',
  REJECTED: 'bg-red-100 text-red-800 border border-red-200',
  CANCELLED: 'bg-gray-100 text-gray-600 border border-gray-200',
}

const ACTION_CLASSES: Record<string, string> = {
  REQUEST_SUBMITTED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  CONTAINER_ACCESSED: 'bg-purple-100 text-purple-800',
}

function formatTs(ts: any): string {
  if (!ts) return '—'
  const d = ts?.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleString()
}

export default function ContainerAccessPage() {
  const router = useRouter()
  const store = useContainerAccessStore()
  const { user, hasAnyRole } = useAuthStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<CAAStatus | 'ALL'>('ALL')

  useEffect(() => {
    store.fetchRequests()
    store.fetchLogs()
    return () => {
      store.cleanup()
    }
  }, [])

  // ── Filtered requests ─────────────────────────────────────────────────────

  const filteredRequests = useMemo(() => {
    let list = store.requests

    // Non-managers only see their own requests
    if (!hasAnyRole(['MANAGER', 'ADMIN', 'SUPER_ADMIN', 'DIRECTOR'])) {
      list = list.filter((r) => r.requestedByUid === user?.uid)
    }

    if (statusFilter !== 'ALL') {
      list = list.filter((r) => r.status === statusFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (r) =>
          r.requestNumber.toLowerCase().includes(q) ||
          r.containerName.toLowerCase().includes(q) ||
          r.requestedByName.toLowerCase().includes(q)
      )
    }

    return list
  }, [store.requests, statusFilter, searchQuery, user, hasAnyRole])

  return (
    <div className="p-4 md:p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Container Access Authorization</h1>
            <p className="text-sm text-muted-foreground">Request and manage physical container access</p>
          </div>
        </div>
        <Button className="gap-1.5" onClick={() => router.push('/container-access/new')}>
          <Plus className="h-4 w-4" />
          New Request
        </Button>
      </div>

      <Tabs defaultValue="requests">
        <TabsList className="mb-4">
          <TabsTrigger value="requests">Access Requests</TabsTrigger>
          <TabsTrigger value="logs">Access Logs</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Requests ─────────────────────────────────────────── */}
        <TabsContent value="requests">
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by request #, container, or requestor..."
                  className="max-w-xs"
                />
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as CAAStatus | 'ALL')}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="APPROVED">Approved</SelectItem>
                    <SelectItem value="REJECTED">Rejected</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>

            <CardContent>
              {store.loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No access requests found.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Request #</th>
                        <th className="text-left py-2 pr-4 font-medium">Container</th>
                        <th className="text-left py-2 pr-4 font-medium">Requestor</th>
                        <th className="text-left py-2 pr-4 font-medium">Access Date</th>
                        <th className="text-left py-2 pr-4 font-medium">Status</th>
                        <th className="text-left py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequests.map((req) => (
                        <tr
                          key={req.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-2.5 pr-4 font-mono text-xs font-medium">
                            {req.requestNumber}
                          </td>
                          <td className="py-2.5 pr-4">
                            <p className="font-medium">{req.containerName}</p>
                            <p className="text-xs text-muted-foreground">
                              {req.containerLocation}
                            </p>
                          </td>
                          <td className="py-2.5 pr-4">
                            <p>{req.requestedByName}</p>
                            <p className="text-xs text-muted-foreground">{req.requestedByRole}</p>
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">{req.accessDate}</td>
                          <td className="py-2.5 pr-4">
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_CLASSES[req.status] || ''}`}
                            >
                              {req.status}
                            </Badge>
                          </td>
                          <td className="py-2.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => router.push(`/container-access/${req.id}`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Access Logs ──────────────────────────────────────── */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">All Container Access Logs</CardTitle>
            </CardHeader>
            <CardContent>
              {store.logsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : store.logs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No access log entries yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-left py-2 pr-4 font-medium">Date / Time</th>
                        <th className="text-left py-2 pr-4 font-medium">Request #</th>
                        <th className="text-left py-2 pr-4 font-medium">Container</th>
                        <th className="text-left py-2 pr-4 font-medium">User</th>
                        <th className="text-left py-2 pr-4 font-medium">Role</th>
                        <th className="text-left py-2 pr-4 font-medium">Action</th>
                        <th className="text-left py-2 font-medium">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {store.logs.map((log) => (
                        <tr
                          key={log.id}
                          className="border-b last:border-0 hover:bg-muted/30"
                        >
                          <td className="py-2.5 pr-4 whitespace-nowrap">{formatTs(log.loggedAt)}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">
                            {log.requestNumber}
                          </td>
                          <td className="py-2.5 pr-4">{log.containerName}</td>
                          <td className="py-2.5 pr-4">{log.loggedByName}</td>
                          <td className="py-2.5 pr-4">{log.loggedByRole}</td>
                          <td className="py-2.5 pr-4">
                            <Badge
                              variant="outline"
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_CLASSES[log.action] || ''}`}
                            >
                              {log.action.replace(/_/g, ' ')}
                            </Badge>
                          </td>
                          <td className="py-2.5 text-muted-foreground">{log.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}