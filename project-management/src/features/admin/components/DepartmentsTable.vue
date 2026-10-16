<script setup lang="ts">
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-vue-next'

defineProps<{
  departments: any[]
}>()
</script>

<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center">
      <div>
        <h3 class="text-lg font-medium">Departments</h3>
        <p class="text-sm text-muted-foreground">Manage organization structure and department heads.</p>
      </div>
      <Button size="sm">
        <Building2 class="mr-2 size-4" /> 
        New Department
      </Button>
    </div>

    <Card>
      <CardContent class="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department Name</TableHead>
              <TableHead>Department Head</TableHead>
              <TableHead class="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="dept in departments" :key="dept.id">
              <TableCell class="font-medium">
                {{ dept.name || 'N/A' }}
              </TableCell>
              <TableCell>
                {{ dept.head || 'Not Assigned' }}
              </TableCell>
              <TableCell class="text-right">
                <Button variant="ghost" size="sm">Manage</Button>
              </TableCell>
            </TableRow>
            <TableRow v-if="departments.length === 0">
              <TableCell colspan="3" class="h-24 text-center text-muted-foreground italic text-[10px]">
                No departments found.
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
</template>
