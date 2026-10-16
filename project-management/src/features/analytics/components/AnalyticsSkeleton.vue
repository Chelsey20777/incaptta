<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
</script>

<template>
  <div class="space-y-8 pb-12">

    <!-- Header row skeleton -->
    <div class="flex items-center justify-between">
      <div class="space-y-2">
        <Skeleton class="h-8 w-52" />
        <Skeleton class="h-4 w-36" />
      </div>
      <div class="flex gap-2">
        <Skeleton class="h-9 w-12 rounded-md" />
        <Skeleton class="h-9 w-12 rounded-md" />
        <Skeleton class="h-9 w-12 rounded-md" />
      </div>
    </div>

    <!-- KPI cards row -->
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card v-for="i in 4" :key="i" class="border bg-card/50">
        <CardHeader class="pb-2">
          <Skeleton class="h-3 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton class="h-8 w-20 mb-2" />
          <Skeleton class="h-3 w-32" />
        </CardContent>
      </Card>
    </div>

    <!-- Charts row -->
    <div class="grid gap-6 lg:grid-cols-3">
      <!-- Trend chart (2/3) -->
      <Card class="lg:col-span-2 border bg-card/50">
        <CardHeader class="pb-3 border-b">
          <Skeleton class="h-4 w-40" />
        </CardHeader>
        <CardContent class="pt-6">
          <Skeleton class="h-[220px] w-full rounded-md" />
        </CardContent>
      </Card>

      <!-- Status chart (1/3) -->
      <Card class="border bg-card/50">
        <CardHeader class="pb-3 border-b">
          <Skeleton class="h-4 w-36" />
        </CardHeader>
        <CardContent class="pt-6 space-y-3">
          <div v-for="i in 5" :key="i" class="space-y-1.5">
            <div class="flex justify-between">
              <Skeleton class="h-3 w-28" />
              <Skeleton class="h-3 w-8" />
            </div>
            <Skeleton :class="`h-2 w-${['4/5','3/5','2/5','1/2','1/3'][i-1]} rounded-full`" />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Department chart -->
    <Card class="border bg-card/50">
      <CardHeader class="pb-3 border-b">
        <Skeleton class="h-4 w-48" />
      </CardHeader>
      <CardContent class="pt-6">
        <Skeleton class="h-[200px] w-full rounded-md" />
      </CardContent>
    </Card>

    <!-- Account balances -->
    <div class="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card v-for="i in 4" :key="i" class="border bg-card/50">
        <CardHeader class="pb-2">
          <Skeleton class="h-3 w-24" />
        </CardHeader>
        <CardContent>
          <Skeleton class="h-7 w-24 mb-1" />
          <Skeleton class="h-3 w-16" />
        </CardContent>
      </Card>
    </div>

  </div>
</template>
