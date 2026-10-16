'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  BookOpen,
  HardHat,
  FileText,
  Link2,
  Wallet,
  CheckCircle2,
  ShieldCheck,
  Download,
  Paperclip,
  Users,
} from 'lucide-react'

const STEPS = [
  {
    n: '1',
    title: 'Register a vendor',
    icon: Users,
    href: '/subcontractors',
    body: 'Open Subcontractors → Add Subcontractor. Enter name, trade, contact, phone, and payment terms. Needs write permission.',
  },
  {
    n: '2',
    title: 'Create an SCN contract',
    icon: FileText,
    href: '/subcontractors/jobs',
    body: 'SCN Contracts → New SCN. Choose vendor, description, and full contract value. Optionally attach the signed contract (PDF/images). Number like SCN-0001 is assigned automatically and a CHARGE for the full value posts to the vendor ledger.',
  },
  {
    n: '3',
    title: 'Link to a job card',
    icon: Link2,
    href: '/subcontractors/jobs',
    body: 'From the SCN: Link to Job Card. Or from the job card → Subcontract Works → Link SCN. The job shows contract value / paid / status; the SCN shows the linked job number.',
  },
  {
    n: '4',
    title: 'Record & approve payments',
    icon: Wallet,
    href: '/subcontractors/jobs',
    body: 'Record partial payments on the SCN detail or on the job card (expand the linked SCN). Same panel, both stay in sync. Each payment starts as Pending, then Accountant → Manager approve. Manager approve posts OPEX and a ledger PAYMENT for that amount only.',
  },
  {
    n: '5',
    title: 'Check the vendor statement',
    icon: Download,
    href: '/subcontractors',
    body: 'Open the vendor profile (not only the SCN). Statement shows charges, payments, and balance owed. Download PDF for a branded statement with logo and generated date/time.',
  },
]

export default function SubcontractorsGuidePage() {
  const router = useRouter()

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8 space-y-6 pb-16">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 -ml-2 text-muted-foreground gap-1.5 mb-1"
              onClick={() => router.push('/subcontractors')}
            >
              <ArrowLeft className="size-3.5" /> Back to Subcontractors
            </Button>
            <div className="flex items-center gap-2">
              <div className="size-9 rounded-xl bg-[#ff8903]/15 text-[#ff8903] flex items-center justify-center">
                <BookOpen className="size-4.5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black tracking-tight">
                  Subcontractors guideline
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Contract-first SCN flow — how vendors, contracts, job cards, and OPEX fit together.
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl gap-1.5 font-bold text-xs"
              onClick={() => router.push('/subcontractors')}
            >
              <HardHat className="size-3.5" /> Vendors
            </Button>
            <Button
              size="sm"
              className="h-9 rounded-xl gap-1.5 font-bold text-xs bg-green-600 hover:bg-green-600/90 text-white border-0"
              onClick={() => router.push('/subcontractors/jobs')}
            >
              <FileText className="size-3.5" /> SCN Contracts
            </Button>
          </div>
        </div>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground">
              What this module is for
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              Use Subcontractors to register vendors, create <strong className="text-foreground">SCN contracts</strong> first
              (e.g. SCN-0001 for $1,000), link them to job cards, record partial payments with approval, and view the
              vendor statement.
            </p>
            <p className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[13px] text-foreground/90">
              <strong>OPEX posts only when a payment is manager-approved.</strong> Every subcontractor payment
              requires accountant then manager approval, regardless of amount. Creating or linking a contract does not post OPEX.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <h2 className="text-xs font-black uppercase tracking-wider text-muted-foreground px-0.5">
            Step-by-step
          </h2>
          {STEPS.map((step) => {
            const Icon = step.icon
            return (
              <Card key={step.n} className="border-border/40 shadow-sm overflow-hidden">
                <CardContent className="p-4 sm:p-5 flex gap-3 sm:gap-4">
                  <div className="shrink-0 size-9 rounded-full bg-[#ff8903] text-white flex items-center justify-center text-sm font-black">
                    {step.n}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="size-4 text-[#ff8903] shrink-0" />
                      <h3 className="font-bold text-sm sm:text-base">{step.title}</h3>
                    </div>
                    <p className="text-[13px] text-muted-foreground leading-relaxed">{step.body}</p>
                    <Link
                      href={step.href}
                      className="inline-flex text-xs font-bold text-[#ff8903] hover:underline pt-0.5"
                    >
                      Open related screen →
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <ShieldCheck className="size-4" /> Payment approvals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto rounded-xl border border-border/40">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-bold">Role</th>
                    <th className="px-3 py-2 font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">Accountant</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      Approves pending → Accountant ✓. All amounts require a separate manager approval before OPEX posts.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 font-semibold whitespace-nowrap">Manager / Admin</td>
                    <td className="px-3 py-2.5 text-muted-foreground">
                      Approves → Manager ✓, posts <strong className="text-foreground">OPEX</strong> and ledger{' '}
                      <strong className="text-foreground">PAYMENT</strong> for that amount.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Approve from the <strong className="text-foreground">SCN page</strong> or the{' '}
              <strong className="text-foreground">job card</strong> payment list. When approved payments cover the
              contract value, the SCN becomes <Badge variant="secondary" className="align-middle text-[10px]">Completed</Badge>.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground">
              Statement example
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-[13px] text-muted-foreground leading-relaxed">
            <p>
              SCN worth <strong className="text-foreground">$1,000</strong> with manager-approved payments of $300 then $400:
            </p>
            <ul className="grid sm:grid-cols-3 gap-2">
              <li className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Charges</div>
                <div className="text-base font-bold text-foreground">$1,000</div>
              </li>
              <li className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Payments</div>
                <div className="text-base font-bold text-foreground">$700</div>
              </li>
              <li className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Balance owed</div>
                <div className="text-base font-bold text-foreground">$300</div>
              </li>
            </ul>
            <p>
              OPEX shows separate Subcontractor Expense lines for each approved payment ($300, $400, …), not one lump sum.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="size-4" /> Quick checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-[13px] text-muted-foreground list-decimal list-inside">
              <li>Add vendor</li>
              <li>
                Create SCN + value{' '}
                <span className="inline-flex items-center gap-1 align-middle text-[11px]">
                  (<Paperclip className="size-3" /> attach contract if needed)
                </span>
              </li>
              <li>Link SCN ↔ job card</li>
              <li>Record payment(s) from SCN or job card</li>
              <li>Accountant → Manager approve each payment → OPEX updates</li>
              <li>Check vendor statement / PDF for running balance</li>
            </ol>
          </CardContent>
        </Card>

        <Card className="border-border/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-wider text-muted-foreground">
              Permissions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-xl border border-border/40">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-bold">Action</th>
                    <th className="px-3 py-2 font-bold">Who</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">View vendors / SCNs / statements</td>
                    <td className="px-3 py-2.5 font-semibold">Subcontractors access</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">Add vendor, create SCN, pay, link</td>
                    <td className="px-3 py-2.5 font-semibold">Subcontractors Write (or Super Admin)</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">Approve payments</td>
                    <td className="px-3 py-2.5 font-semibold">Accountant / Manager</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">Unlink approved SCN from job card</td>
                    <td className="px-3 py-2.5 font-semibold">Admin / Manager / Super Admin</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2.5 text-muted-foreground">Delete vendor</td>
                    <td className="px-3 py-2.5 font-semibold">Admin only</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground leading-relaxed">
              Writers can unlink if nothing is manager-approved yet. Once any payment is approved (or the SCN is
              Completed), unlink is restricted to Admin / Manager / Super Admin.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
