<script setup lang="ts">
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tag } from 'lucide-vue-next'

defineProps<{
  categories: any[]
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-lg font-medium">Product Categories</h3>
        <p class="text-sm text-muted-foreground">Manage service and product categories for catalog organization.</p>
      </div>
      <Button size="sm">
        <Tag class="mr-2 size-4" /> 
        Add Category
      </Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Category Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="cat in categories" :key="cat.id">
              <TableCell class="font-medium">
                {{ cat.name || 'N/A' }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="capitalize">
                  {{ cat.type || 'Standard' }}
                </Badge>
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm">Edit</Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="categories.length === 0">
              <TableCell colspan="3" class="h-24 text-center text-muted-foreground italic text-[10px]">
                No categories found.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
