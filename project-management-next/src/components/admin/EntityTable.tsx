'use client'

import { useState } from 'react'
import { useAdminStore } from '@/stores/admin-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Edit2, Trash2 } from 'lucide-react'

interface FieldConfig {
  key: string
  label: string
  placeholder?: string
  type?: string
  options?: { label: string; value: string }[] | string[]
}

interface EntityTableProps {
  title: string
  description: string
  collectionName: string
  items: any[]
  fields: FieldConfig[]
}

export default function EntityTable({
  title,
  description,
  collectionName,
  items,
  fields
}: EntityTableProps) {
  const { addEntity, updateEntity, deleteEntity } = useAdminStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [currentItem, setCurrentItem] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setIsEditing(false)
    const initial: Record<string, string> = {}
    fields.forEach((f) => {
      if (f.type === 'select' && f.options && f.options.length > 0) {
        const firstOpt = f.options[0]
        initial[f.key] = typeof firstOpt === 'string' ? firstOpt : firstOpt.value
      } else {
        initial[f.key] = ''
      }
    })
    setCurrentItem(initial)
    setIsDialogOpen(true)
  }

  function openEdit(item: any) {
    setIsEditing(true)
    const data: Record<string, string> = {}
    fields.forEach((f) => {
      data[f.key] = item[f.key] || ''
    })
    // Preserve the id for updates
    data.id = item.id
    setCurrentItem(data)
    setIsDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { id, ...data } = currentItem
      if (isEditing && id) {
        await updateEntity(collectionName, id, data, title)
      } else {
        await addEntity(collectionName, data, title)
      }
      setIsDialogOpen(false)
      setCurrentItem({})
    } catch {
      // Error handled by store
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (window.confirm(`Are you sure you want to delete this ${title.toLowerCase()}?`)) {
      await deleteEntity(collectionName, id, title)
    }
  }

  function updateField(key: string, value: string) {
    setCurrentItem((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-2 size-4" />
          New {title}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((field) => (
                  <TableHead key={field.key}>{field.label}</TableHead>
                ))}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  {fields.map((field) => (
                    <TableCell key={field.key} className="font-medium">
                      {item[field.key] || 'N/A'}
                    </TableCell>
                  ))}
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEdit(item)}
                    >
                      <Edit2 className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleDelete(item.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={fields.length + 1}
                    className="h-24 text-center text-muted-foreground italic text-sm"
                  >
                    No {title.toLowerCase()} found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isEditing ? 'Edit' : 'Create'} {title}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {fields.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-4 items-center gap-4"
              >
                <Label htmlFor={field.key} className="text-right">
                  {field.label}
                </Label>
                {field.type === 'select' && field.options ? (
                  <select
                    id={field.key}
                    value={currentItem[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="col-span-3 h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {field.options.map((opt) => {
                      const val = typeof opt === 'string' ? opt : opt.value
                      const label = typeof opt === 'string' ? opt : opt.label
                      return (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      )
                    })}
                  </select>
                ) : (
                  <Input
                    id={field.key}
                    value={currentItem[field.key] || ''}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    type={field.type || 'text'}
                    className="col-span-3"
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}