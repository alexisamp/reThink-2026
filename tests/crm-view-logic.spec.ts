import { expect, test } from '@playwright/test'

test('CRM view engine applies handoff sorts and filters consistently', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { applyCrmView } = await import('/src/components/crm/CrmViewSurface.tsx')
    const attributes = [
      { id: 'name', key: 'name', name: 'Name', attribute_type: 'Text', options: null },
      { id: 'score', key: 'score', name: 'Score', attribute_type: 'Number', options: null },
      { id: 'stage', key: 'stage', name: 'Stage', attribute_type: 'Status', options: [{ id: 'active', label: 'Active', color: '#2F6DF6' }, { id: 'new', label: 'New', color: '#79D65E' }] },
      { id: 'date', key: 'date', name: 'Date', attribute_type: 'Date', options: null },
    ]
    const records = [
      { id: '1', title: 'Zulu', values: { score: 2, stage: 'Active', date: '2026-07-09' } },
      { id: '2', title: 'Alpha', values: { score: 10, stage: 'new', date: '2026-07-10' } },
      { id: '3', title: 'Monica', values: { score: 4, stage: 'active', date: '2026-07-08' } },
    ]
    const base = {
      filters: [], sorts: [], columns: [], column_widths: {}, density: 'standard',
      show_attribute_names: true, stage_settings: [], is_favorite: false,
    }
    const ids = (view: Record<string, unknown>) => applyCrmView(records as never, { ...base, ...view } as never, attributes as never).map(record => record.id)
    return {
      titleAsc: ids({ sorts: [{ key: 'name', direction: 'asc' }] }),
      numberDesc: ids({ sorts: [{ key: 'score', direction: 'desc' }] }),
      dateAsc: ids({ sorts: [{ key: 'date', direction: 'asc' }] }),
      selectById: ids({ filters: [{ key: 'stage', operator: 'is', value: 'active' }] }),
      combined: ids({ filters: [{ key: 'stage', operator: 'is not', value: 'new' }], sorts: [{ key: 'score', direction: 'desc' }] }),
    }
  })

  expect(result.titleAsc).toEqual(['2', '3', '1'])
  expect(result.numberDesc).toEqual(['2', '3', '1'])
  expect(result.dateAsc).toEqual(['3', '1', '2'])
  expect(result.selectById).toEqual(['1', '3'])
  expect(result.combined).toEqual(['3', '1'])
})
