import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Users, User, Calendar, Wallet, ClipboardList, Briefcase, Landmark, AlertTriangle, Plus, Trash2, Check, X, FileText, Percent, DollarSign, Phone, Mail, Building2, ShieldCheck, ShieldAlert, Clock, CheckCircle2, XCircle, Edit3, Search } from 'lucide-react'
import { toast } from 'sonner'

// ─── RECRUITMENT TAB ────────────────────────────────────────────────────────
export function RecruitmentTab({ store, fmt, getEmpName }: any) {
  const [showAddJob, setShowAddJob] = useState(false)
  const [showAddApplicant, setShowAddApplicant] = useState('')
  const [expandedJob, setExpandedJob] = useState('')
  const [jobForm, setJobForm] = useState({ jobTitle: '', department: '', description: '', status: 'Open' })
  const [appForm, setAppForm] = useState({ name: '', email: '', phone: '', notes: '' })

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-xs font-black uppercase text-muted-foreground">Job Postings</h3>
        <Button size="sm" className="bg-[#ff8903] text-white font-bold text-xs" onClick={() => setShowAddJob(true)}><Plus className="size-3" /> New Job</Button>
      </div>
      {store.jobPostings.map((j: any) => (
        <Card key={j.id} className="border shadow-sm"><CardContent className="p-3">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedJob(expandedJob === j.id ? '' : j.id)}>
            <div>
              <h4 className="text-sm font-bold">{j.jobTitle}</h4>
              <p className="text-[10px] text-muted-foreground">{j.department} | {j.applicants?.length || 0} applicants</p>
            </div>
            <Badge variant="outline" className={`text-[9px] font-bold ${j.status === 'Open' ? 'text-green-600 border-green-500/30' : j.status === 'On Hold' ? 'text-amber-600' : 'text-gray-600'}`}>{j.status}</Badge>
          </div>

          {expandedJob === j.id && (
            <div className="mt-3 pt-3 border-t space-y-2">
              {j.applicants?.map((a: any) => (
                <div key={a.id} className="p-2 bg-muted/20 rounded-xl text-xs flex items-center justify-between">
                  <div><p className="font-bold">{a.name}</p><p className="text-muted-foreground">{a.email}</p></div>
                  <div className="flex items-center gap-1">
                    <select value={a.status} onChange={e => store.updateApplicantStatus(j.id, a.id, e.target.value)}
                      className="h-7 text-[9px] px-1 rounded-lg border bg-background font-bold">
                      <option>Applied</option><option>Interviewed</option><option>Offered</option><option>Hired</option><option>Rejected</option>
                    </select>
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="w-full text-[10px] font-bold mt-1" onClick={() => { setShowAddApplicant(j.id); setAppForm({ name: '', email: '', phone: '', notes: '' }) }}>
                <Plus className="size-3" /> Add Applicant
              </Button>
            </div>
          )}
        </CardContent></Card>
      ))}

      {showAddJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">New Job Posting</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase">Job Title</Label><Input value={jobForm.jobTitle} onChange={e => setJobForm({...jobForm, jobTitle: e.target.value})} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase">Department</Label><Input value={jobForm.department} onChange={e => setJobForm({...jobForm, department: e.target.value})} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase">Description</Label><Input value={jobForm.description} onChange={e => setJobForm({...jobForm, description: e.target.value})} className="h-10" /></div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowAddJob(false)}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={async () => { await store.addJobPosting(jobForm); setShowAddJob(false) }}>Post</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {showAddApplicant && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="w-full max-w-md bg-card border shadow-2xl rounded-3xl">
            <CardHeader className="pb-3"><CardTitle className="text-lg font-black">Add Applicant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs font-black uppercase">Name</Label><Input value={appForm.name} onChange={e => setAppForm({...appForm, name: e.target.value})} className="h-10" /></div>
              <div className="space-y-1"><Label className="text-xs font-black uppercase">Email</Label><Input value={appForm.email} onChange={e => setAppForm({...appForm, email: e.target.value})} className="h-10" /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1"><Label className="text-xs font-black uppercase">Phone</Label><Input value={appForm.phone} onChange={e => setAppForm({...appForm, phone: e.target.value})} className="h-10" /></div>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1 rounded-xl font-bold" onClick={() => setShowAddApplicant('')}>Cancel</Button>
                <Button className="flex-1 rounded-xl font-bold bg-[#ff8903] text-white" onClick={async () => { await store.addApplicant(showAddApplicant, appForm); setShowAddApplicant('') }}>Add</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

