# FowlrunCalculator — IncapttaPro Integration Guide

## File Structure

Drop these into your IncapttaPro project:

```
src/
├── types/
│   └── fowlrun.types.ts
├── composables/
│   └── useFowlrunCalculator.ts
└── components/
    └── agric-structures/
        └── calculator/
            ├── index.ts               ← barrel export
            ├── FowlrunCalculator.vue  ← main component
            ├── SizeButton.vue
            ├── MetricCard.vue
            ├── BOQTable.vue
            └── CostSummary.vue
```

## Dependencies

All already in your stack — zero new installs required:
- Vue 3 (Composition API) ✅
- TypeScript ✅
- Tailwind CSS v4 (component uses scoped CSS — compatible) ✅

Optional font imports (add to your main CSS or index.html):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

## Usage

### Basic (standalone page)
```vue
<script setup lang="ts">
import { FowlrunCalculator } from '@/components/agric-structures/calculator'
</script>

<template>
  <FowlrunCalculator />
</template>
```

### Inside a Quote Builder (emit calculated BOQ)
Extend FowlrunCalculator.vue to emit the calculation:

```vue
<!-- In FowlrunCalculator.vue -->
<script setup lang="ts">
const emit = defineEmits<{
  boqSelected: [calculation: FowlrunCalculation]
}>()

function handleUseInQuote() {
  emit('boqSelected', calculation.value)
}
</script>
```

Then in your QuoteBuilder.vue:
```vue
<FowlrunCalculator @boq-selected="populateQuoteBOQ" />
```

### Vue Router (add to your router/index.ts)
```ts
{
  path: '/agric-structures/calculator',
  name: 'FowlrunCalculator',
  component: () => import('@/components/agric-structures/calculator/FowlrunCalculator.vue'),
  meta: { title: 'Fowlrun Calculator', department: 'agric-structures' }
}
```

## Firestore Integration (save calculations)

```ts
// In useFowlrunCalculator.ts — add this function
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'

async function saveCalculation(name: string) {
  await addDoc(collection(db, 'agric-structures/calculations/records'), {
    name,
    size: activeSize.value,
    config: config.value,
    result: calculation.value,
    createdAt: serverTimestamp(),
  })
}
```

## Push to Quote (wire into QuoteDocument)

```ts
function pushToQuote(calc: FowlrunCalculation): QuoteSection {
  return {
    title: `${calc.size.label} Fowlrun (Brickwork & Flooring)`,
    items: calc.items.map(i => ({
      id: crypto.randomUUID(),
      unit: i.unit,
      qty: i.qty,
      description: i.description,
      unitPrice: i.unitPrice,
      total: i.total,
    })),
    sectionTotal: calc.grandTotal,
  }
}
```

## Color Token Override

The component uses #CC5500 (Incaptta orange) as its accent.
To override per-project, add to your CSS variables:

```css
:root {
  --incaptta-primary: #CC5500;
}
```

And replace all #CC5500 references in the components with var(--incaptta-primary).
