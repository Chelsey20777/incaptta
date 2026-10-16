import { ref } from 'vue'

/**
 * useAiChatInput
 * 
 * Shared state for the AI Analytics Chat. Allows components (like the Brief panel)
 * to trigger a drill-down question in the chat interface regardless of where
 * it is rendered (SlideOver or Dashboard Panel).
 */
const globalPendingQuestion = ref<string | null>(null)

export function useAiChatInput() {
  /**
   * Sets a question to be processed by the next available chat component.
   */
  function triggerDrillDown(question: string) {
    globalPendingQuestion.value = question
  }

  /**
   * Consumes the pending question (sets it to null) and returns the value.
   */
  function consumePendingQuestion(): string | null {
    const q = globalPendingQuestion.value
    globalPendingQuestion.value = null
    return q
  }

  return {
    globalPendingQuestion,
    triggerDrillDown,
    consumePendingQuestion,
  }
}
