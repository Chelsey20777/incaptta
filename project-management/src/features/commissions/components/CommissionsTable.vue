<script setup lang="ts">
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

defineProps<{
  commissions: any[]
}>()
</script>

<template>
  <Card>
    <CardContent class="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sales Rep</TableHead>
            <TableHead>Job ID</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead class="text-right">Amount</TableHead>
            <TableHead class="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="com in commissions" :key="com.id">
            <TableCell class="font-medium">{{ com.salesRep }}</TableCell>
            <TableCell>{{ com.jobId }}</TableCell>
            <TableCell>{{ com.date }}</TableCell>
            <TableCell>
              <Badge :variant="com.status === 'PAID' ? 'default' : 'secondary'">
                {{ com.status }}
              </Badge>
            </TableCell>
            <TableCell class="text-right font-medium">
              ${{ com.amount?.toLocaleString() || '0' }}
            </TableCell>
            <TableCell class="text-right">
              <Button variant="ghost" size="sm" v-if="com.status === 'PENDING'">
                Approve Payout
              </Button>
            </TableCell>
          </TableRow>
          <TableRow v-if="commissions.length === 0">
            <TableCell colspan="6" class="h-24 text-center text-muted-foreground italic">
              No commission records found.
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </CardContent>
  </Card>
</template>
