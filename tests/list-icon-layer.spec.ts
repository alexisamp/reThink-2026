import { expect, test } from '@playwright/test'

test('saved line-icon values resolve in both legacy and current formats', async ({ page }) => {
  await page.goto('/')
  const values = await page.evaluate(async () => {
    const { listLineIconName, listUploadedIconUrl } = await import('/src/components/crm/ListGlyph.tsx')
    return {
      icons: [listLineIconName('list'), listLineIconName('icon:target'), listLineIconName('🔥')],
      uploaded: listUploadedIconUrl('storage:list-icons:user/list/icon.png'),
      plain: listUploadedIconUrl('list'),
    }
  })
  expect(values.icons).toEqual(['list', 'target', null])
  expect(values.uploaded).toContain('/storage/v1/object/public/list-icons/user/list/icon.png')
  expect(values.plain).toBeNull()
})

test('the header icon picker receives clicks above its dismiss scrim', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const layer = document.createElement('div')
    layer.innerHTML = '<button class="list-icon-picker-scrim" aria-label="dismiss"></button><div class="emoji-pop list-icon-picker-portal" style="position:fixed;top:98px;left:38px"><button id="picker-option">Pick icon</button></div>'
    document.body.appendChild(layer)
    document.querySelector('#picker-option')?.addEventListener('click', () => document.body.setAttribute('data-picker-clicked', 'true'))
  })
  await page.locator('#picker-option').click()
  await expect(page.locator('body')).toHaveAttribute('data-picker-clicked', 'true')
})
