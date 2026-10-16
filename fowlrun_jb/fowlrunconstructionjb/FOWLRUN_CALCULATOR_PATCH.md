<!--
  FowlrunCalculator.vue — ACTIONS ROW PATCH
  ─────────────────────────────────────────────────────────────────────────
  Add these changes to the existing FowlrunCalculator.vue.
  DO NOT restructure the component — only add what is marked below.
  ─────────────────────────────────────────────────────────────────────────

  CHANGE 1 — Import CreateJobCardPanel at top of <script setup>:

    import { ref } from 'vue'                          // already exists
    import CreateJobCardPanel from './CreateJobCardPanel.vue'   // ADD THIS

  CHANGE 2 — Add ref for panel state inside <script setup>:

    const showJobCardPanel = ref(false)                // ADD THIS

  CHANGE 3 — In the existing <template> actions div, ADD the button:
  
    Find the existing actions div (the one with Export BOQ and Use in Quote).
    Add "Create Job Card" as the FIRST button:

    <div class="actions">

      <!-- ADD THIS BUTTON — first in actions row -->
      <button class="btn btn--jobcard" @click="showJobCardPanel = true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14,2 14,8 20,8"/>
          <line x1="12" y1="18" x2="12" y2="12"/>
          <line x1="9" y1="15" x2="15" y2="15"/>
        </svg>
        Create Job Card
      </button>

      <!-- existing buttons unchanged below -->
      <button class="btn btn--secondary" @click="$emit('exportBoq', calc)">
        ...existing Export BOQ button...
      </button>
      <button class="btn btn--primary" @click="$emit('useInQuote', calc)">
        ...existing Use in Quote button...
      </button>

    </div>

    <!-- ADD the panel AFTER the closing div of the main component,
         still inside the root template element -->
    <CreateJobCardPanel
      v-model:open="showJobCardPanel"
      :calc="calculation"
      :calculation-id="savedCalculationId"
      @created="onJobCardCreated"
    />

  CHANGE 4 — Add onJobCardCreated handler in <script setup>:

    function onJobCardCreated(jobCardId: string, jobCardNumber: string) {
      // Optional: store reference, emit up, or just let the panel navigate
      console.info(`[FowlrunCalculator] Job card created: ${jobCardNumber}`)
    }

  CHANGE 5 — Add prop for saved calculation ID (optional, for linking back):

    const props = defineProps<{
      savedCalculationId?: string    // ADD to existing props if any
    }>()

  CHANGE 6 — Add CSS for new button in <style scoped>:

    .btn--jobcard {
      background: transparent;
      border: 0.5px solid var(--color-border-secondary);
      color: var(--color-text-primary);
    }
    .btn--jobcard:hover {
      background: #FFF0E6;
      border-color: #CC5500;
      color: #CC5500;
    }

  ─────────────────────────────────────────────────────────────────────────
  That is the COMPLETE and ONLY change to FowlrunCalculator.vue.
  No logic changes. No template restructuring.
  ─────────────────────────────────────────────────────────────────────────
-->
