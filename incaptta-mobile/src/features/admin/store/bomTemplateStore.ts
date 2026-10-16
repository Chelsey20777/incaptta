import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BomTemplate } from '../types'

export const useBomTemplateStore = defineStore('bomTemplate', () => {
  const templates = ref<BomTemplate[]>([])
  const loading = ref(false)
  const currentTemplate = ref<BomTemplate | null>(null)

  const activeTemplates = computed(() =>
    templates.value.filter(t => t.isActive)
  )

  const setTemplates = (templateList: BomTemplate[]) => {
    templates.value = templateList
  }

  const setCurrentTemplate = (template: BomTemplate | null) => {
    currentTemplate.value = template
  }

  const createTemplate = (data: Partial<BomTemplate>, userId: string): BomTemplate => {
    const template: BomTemplate = {
      id: '',
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: userId,
      updatedBy: userId,
      templateNumber: generateTemplateNumber(),
      name: '',
      category: '',
      items: [],
      totalCost: 0,
      isActive: true,
      ...data
    }

    return template
  }

  function generateTemplateNumber(): string {
    const date = new Date()
    const year = date.getFullYear()
    const count = templates.value.length + 1
    return `BOM-${year}-${String(count).padStart(4, '0')}`
  }

  return {
    templates,
    loading,
    currentTemplate,
    activeTemplates,
    setTemplates,
    setCurrentTemplate,
    createTemplate
  }
})
