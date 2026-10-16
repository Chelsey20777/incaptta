<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
    <div class="h-full flex flex-col bg-muted/10">
        <div class="flex-1 overflow-auto p-4 md:p-8">
            <div class="w-full space-y-8">
                <RouterView />
            </div>
        </div>
    </div>
</template>
