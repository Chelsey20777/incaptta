/**
 * useAiChatPanel — singleton global state for the AI chat slide-over
 *
 * The `isOpen` ref lives at module level so every caller shares the same
 * reactive instance. Calling useAiChatPanel() from TopBar, AppLayout, and
 * AiChatSlideOver all read/write the same ref.
 */
import { ref } from 'vue'

// Module-level ref — created once, shared across all imports
const isOpen = ref(false)

export function useAiChatPanel() {
  const open   = () => { isOpen.value = true }
  const close  = () => { isOpen.value = false }
  const toggle = () => { isOpen.value = !isOpen.value }
  return { isOpen, open, close, toggle }
}
