'use client'

import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AlertCircle, Trash2 } from 'lucide-react'

interface AdminDeleteDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    description: string
    targetId: string // The ID the user must type to confirm
    loading?: boolean
    onConfirm: () => void
}

export default function AdminDeleteDialog({
    open,
    onOpenChange,
    title,
    description,
    targetId,
    loading = false,
    onConfirm
}: AdminDeleteDialogProps) {
    const [confirmValue, setConfirmValue] = useState('')
    const isMatch = confirmValue.trim() === targetId

    function handleConfirm() {
        if (isMatch) {
            onConfirm()
            setConfirmValue('')
        }
    }

    function handleClose() {
        onOpenChange(false)
        setConfirmValue('')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px] bg-card border border-border">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="size-5" />
                        {title}
                    </DialogTitle>
                    <DialogDescription className="pt-2 text-muted-foreground">
                        {description}
                        <span className="block mt-2 font-bold text-foreground">
                            This action cannot be undone. Are you absolutely sure?
                        </span>
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    <div className="space-y-2 text-sm">
                        <Label htmlFor="confirm-id" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            To confirm, type <span className="text-foreground font-mono font-bold select-all">{targetId}</span> below:
                        </Label>
                        <Input
                            id="confirm-id"
                            value={confirmValue}
                            onChange={(e) => setConfirmValue(e.target.value)}
                            placeholder="Enter ID here..."
                            className="h-9 font-mono"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleConfirm()
                                }
                            }}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={handleClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={!isMatch || loading}
                        className="gap-2"
                        onClick={handleConfirm}
                    >
                        {!loading ? (
                            <Trash2 className="size-4" />
                        ) : (
                            <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        )}
                        Delete Permanently
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
