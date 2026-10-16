<script setup lang="ts">
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

defineProps<{
  commissions: any[]
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>Commission History</CardTitle>
      <CardDescription>Detailed list of earned commissions per job.</CardDescription>
    </CardHeader>
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Job ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="com in commissions" :key="com.id">
            <TableCell class="font-medium">{{ com.id }}</TableCell>
            <TableCell>{{ com.jobId }}</TableCell>
            <TableCell>{{ com.date }}</TableCell>
            <TableCell>
              <Badge :variant="com.status === 'PAID' ? 'default' : 'secondary'">
                {{ com.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-right font-semibold">
              ${{ com.amount?.toLocaleString() || '0' }}
            </TableCell>
          </TableRow>
          <TableRow v-if="commissions.length === 0">
            <TableCell colspan="5" class="h-24 text-center text-muted-foreground italic">
              No commission records found.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
