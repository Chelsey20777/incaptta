export const filterReturnableTools = (requisitionSections: any[], resolveJobCategoryName: (id?: string) => string) => {
  return (requisitionSections || []).flatMap((s: any) => {
    const catName = resolveJobCategoryName(s.jobCategoryId).toLowerCase()
    const isToolSection = catName.includes('tool') || catName.includes('equipment')
    if (isToolSection) return s.items || []
    return (s.items || []).filter((i: any) => {
      const name = (i.itemName || '').toLowerCase()
      return ['ladder', 'hammer', 'drill', 'wheelbarrow', 'shovel', 'pick', 'grinder', 'saw', 'toolbox', 'measuring tape', 'spirit level'].some(t => name.includes(t))
    })
  })
}
