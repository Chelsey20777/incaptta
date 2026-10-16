'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useFinanceStore } from '@/stores/finance-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowDownLeft, ArrowUpRight, Landmark, Plus, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

const money = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
const today = () => new Date().toISOString().slice(0, 10);
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export default function BusinessLoansPage() {
  const auth = useAuthStore();
  const finance = useFinanceStore();
  const roles = auth.getRoles();
  const isAccountant = roles.some((r) => ['ACCOUNTANT', 'ADMIN', 'SUPER_ADMIN'].includes(r));
  const isManager = roles.some((r) => ['MANAGER', 'DIRECTOR', 'ADMIN', 'SUPER_ADMIN'].includes(r));
  const actor = {
    name: auth.profile?.name || auth.user?.displayName || '',
    email: auth.user?.email || '',
  };
  const [lenderOpen, setLenderOpen] = useState(false);
  const [transactionOpen, setTransactionOpen] = useState(false);
  const [selectedLender, setSelectedLender] = useState('ALL');
  const [busy, setBusy] = useState<string | null>(null);
  const [lenderForm, setLenderForm] = useState({ name: '', email: '', phone: '', notes: '' });
  const [form, setForm] = useState({
    transactionType: 'RECEIPT',
    lenderId: '',
    account: 'BANK',
    amount: '',
    effectiveDate: today(),
    reference: '',
    purpose: '',
    notes: '',
  });

  useEffect(() => {
    const unsubs = [
      finance.fetchLoanLenders(),
      finance.subscribeLedger(),
    ];
    return () => unsubs.forEach((unsub) => unsub());
    // Store actions are stable Zustand functions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const transactions = useMemo(
    () =>
      finance.loanTransactions.filter(
        (t) => selectedLender === 'ALL' || t.lenderId === selectedLender,
      ),
    [finance.loanTransactions, selectedLender],
  );
  const totals = useMemo(
    () =>
      finance.loanTransactions
        .filter((t) => t.status === 'COMPLETED')
        .reduce(
          (acc, t) => {
            if (t.transactionType === 'REPAYMENT') acc.repaid += Number(t.amount || 0);
            else acc.received += Number(t.amount || 0);
            return acc;
          },
          { received: 0, repaid: 0 },
        ),
    [finance.loanTransactions],
  );

  async function createLender() {
    setBusy('lender');
    try {
      await finance.createLoanLender(lenderForm, actor);
      setLenderOpen(false);
      setLenderForm({ name: '', email: '', phone: '', notes: '' });
      toast.success('Lender created');
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Could not create lender'));
    } finally {
      setBusy(null);
    }
  }

  async function submitTransaction() {
    setBusy('transaction');
    try {
      await finance.recordLoanTransaction({ ...form, amount: Number(form.amount) }, actor);
      setTransactionOpen(false);
      setForm({
        transactionType: 'RECEIPT',
        lenderId: '',
        account: 'BANK',
        amount: '',
        effectiveDate: today(),
        reference: '',
        purpose: '',
        notes: '',
      });
      toast.success('Loan transaction submitted for accountant review');
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Could not submit transaction'));
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, action: 'initial' | 'approve' | 'reject') {
    setBusy(id);
    try {
      if (action === 'initial') await finance.accountantInitialLoanTransaction(id, actor);
      if (action === 'approve') await finance.approveLoanTransaction(id, actor);
      if (action === 'reject') await finance.rejectLoanTransaction(id, actor);
      toast.success(
        action === 'approve'
          ? 'Loan transaction posted'
          : action === 'initial'
            ? 'Sent for manager approval'
            : 'Transaction rejected',
      );
    } catch (error: unknown) {
      toast.error(errorMessage(error, 'Action failed'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Business Loans</h1>
          <p className="text-sm text-muted-foreground">
            Owner/director funding and repayments. Loan receipts are liabilities, not income.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLenderOpen(true)}>
            <UserPlus className="mr-2 size-4" />
            Add lender
          </Button>
          <Button
            onClick={() => setTransactionOpen(true)}
            disabled={!finance.loanLenders.some((l) => l.status === 'ACTIVE')}
          >
            <Plus className="mr-2 size-4" />
            New transaction
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Outstanding liability</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black text-orange-600">
            {money(finance.loanLiability)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total received</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black text-emerald-600">
            {money(totals.received)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total repaid</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black text-blue-600">
            {money(totals.repaid)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Lenders</CardTitle>
          <Select value={selectedLender} onValueChange={(value) => value && setSelectedLender(value)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All lenders</SelectItem>
              {finance.loanLenders.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {finance.loanLenders.map((l) => (
            <button
              key={l.id}
              onClick={() => setSelectedLender(l.id)}
              className="rounded-xl border p-4 text-left hover:bg-muted/40"
            >
              <div className="flex justify-between gap-3">
                <span className="font-bold">{l.name}</span>
                <Badge variant="outline">{l.status}</Badge>
              </div>
              <div className="mt-3 text-2xl font-black">{money(l.outstandingPrincipal)}</div>
              <div className="text-xs text-muted-foreground">Outstanding principal</div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loan statement</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-3">Date</th>
                <th className="p-3">Lender</th>
                <th className="p-3">Type</th>
                <th className="p-3">Account</th>
                <th className="p-3 text-right">Amount</th>
                <th className="p-3">Reference</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="p-3">{t.effectiveDate || '—'}</td>
                  <td className="p-3 font-medium">{t.lenderName}</td>
                  <td className="p-3">
                    <span className="flex items-center gap-1">
                      {t.transactionType === 'REPAYMENT' ? (
                        <ArrowUpRight className="size-4 text-blue-500" />
                      ) : (
                        <ArrowDownLeft className="size-4 text-emerald-500" />
                      )}
                      {t.transactionType}
                    </span>
                  </td>
                  <td className="p-3">{t.account}</td>
                  <td className="p-3 text-right font-bold">{money(t.amount)}</td>
                  <td className="p-3">{t.reference || '—'}</td>
                  <td className="p-3">
                    <Badge variant="outline">{t.status}</Badge>
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {t.status === 'PENDING_ACCOUNTANT' && isAccountant && (
                        <Button
                          size="sm"
                          onClick={() => act(t.id, 'initial')}
                          disabled={busy === t.id}
                        >
                          Initial
                        </Button>
                      )}
                      {t.status === 'PENDING_MANAGER' && isManager && (
                        <Button
                          size="sm"
                          onClick={() => act(t.id, 'approve')}
                          disabled={busy === t.id}
                        >
                          Approve
                        </Button>
                      )}
                      {['PENDING_ACCOUNTANT', 'PENDING_MANAGER'].includes(t.status) &&
                        (isAccountant || isManager) && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => act(t.id, 'reject')}
                            disabled={busy === t.id}
                          >
                            Reject
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-muted-foreground">
                    No loan transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={lenderOpen} onOpenChange={setLenderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add owner/director lender</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div>
              <Label>Name *</Label>
              <Input
                value={lenderForm.name}
                onChange={(e) => setLenderForm({ ...lenderForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={lenderForm.email}
                  onChange={(e) => setLenderForm({ ...lenderForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={lenderForm.phone}
                  onChange={(e) => setLenderForm({ ...lenderForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={lenderForm.notes}
                onChange={(e) => setLenderForm({ ...lenderForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLenderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createLender} disabled={!lenderForm.name.trim() || busy === 'lender'}>
              Create lender
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={transactionOpen} onOpenChange={setTransactionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New loan transaction</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Transaction *</Label>
                <Select
                  value={form.transactionType}
                  onValueChange={(v) => v && setForm({ ...form, transactionType: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEIPT">Receive loan funds</SelectItem>
                    <SelectItem value="REPAYMENT">Repay lender</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Account *</Label>
                <Select
                  value={form.account}
                  onValueChange={(v) => v && setForm({ ...form, account: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['BANK', 'CASH', 'ECOCASH', 'RESERVE'].map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Lender *</Label>
              <Select
                value={form.lenderId}
                onValueChange={(v) => v && setForm({ ...form, lenderId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select lender" />
                </SelectTrigger>
                <SelectContent>
                  {finance.loanLenders
                    .filter((l) => l.status === 'ACTIVE')
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} — {money(l.outstandingPrincipal)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Amount (USD) *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div>
                <Label>Date *</Label>
                <Input
                  type="date"
                  value={form.effectiveDate}
                  onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Transaction reference</Label>
              <Input
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </div>
            <div>
              <Label>Purpose</Label>
              <Input
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            {form.account === 'RESERVE' && (
              <p className="flex items-center gap-2 rounded-lg bg-sky-500/10 p-3 text-sm">
                <Landmark className="size-4" />
                This transaction will map to the Reserve account after final approval.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransactionOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitTransaction}
              disabled={!form.lenderId || !Number(form.amount) || busy === 'transaction'}
            >
              Submit for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
