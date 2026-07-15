import { expect, test } from '@playwright/test'

test.use({ storageState: '.context/playwright/auth.json', viewport: { width: 1440, height: 900 } })

test('handoff gallery exposes all 22 reference states and live routes', async ({ page }) => {
  await page.goto('/__handoff-preview')
  await expect(page.getByText('Handoff states')).toBeVisible()
  const states = page.locator('.hp-index > button')
  await expect(states).toHaveCount(22)

  for (let index = 0; index < 22; index += 1) {
    await states.nth(index).click()
    const image = page.locator('.hp-stage img')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => [element.naturalWidth, element.naturalHeight])).toEqual([924, 540])
    await expect(page.locator('.hp-stage iframe')).toHaveCount(1)
  }

  await page.screenshot({ path: '.context/playwright/handoff-gallery.png', fullPage: true })
})

test('object view settings persist a column visibility change across refresh', async ({ page }) => {
  await page.goto('/companies/view/all')
  await expect(page.getByRole('button', { name: /View settings/ })).toBeVisible()
  await page.getByRole('button', { name: /View settings/ }).click()
  const hidden = page.locator('.vs-chip.hidden').first()
  await expect(hidden).toBeVisible()
  const label = await hidden.locator('.lbl').innerText()
  await hidden.locator('button.eye').click()
  await page.reload()
  await page.getByRole('button', { name: /View settings/ }).click()
  const visible = page.locator('.vs-chip:not(.hidden)', { hasText: label })
  await expect(visible).toBeVisible()
  await visible.locator('button.eye').click()
})

test('view creation, switching and deletion are real', async ({ page }) => {
  await page.goto('/people/view/all')
  await page.locator('.viewpill').click()
  await page.getByText('Create new view', { exact: true }).click()
  await expect(page.getByText('Create view', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Enter a title for this view').fill('QA temporary view')
  await page.getByRole('button', { name: /Confirm/ }).click()
  await expect(page.locator('.viewpill')).toContainText('QA temporary view')

  await page.locator('.viewpill').click()
  const row = page.locator('.pop-item', { hasText: 'QA temporary view' })
  await row.locator('.rowmenu').click()
  await page.getByText('Delete', { exact: true }).click()
  await page.goto('/people/view/all')
  await expect(page.locator('.viewpill')).toContainText('All People')
})

test('list Table and Kanban use the same persisted view switcher', async ({ page }) => {
  await page.goto('/lists')
  await page.waitForURL(/\/lists\/[0-9a-f-]+/)
  await expect(page.locator('.viewpill')).toBeVisible()
  await page.locator('.viewpill').click()
  const rows = page.locator('.pop-item').filter({ has: page.locator('.vm, svg') })
  await expect(page.locator('.pop-item', { hasText: /Table|Kanban/ }).first()).toBeVisible()
  expect(await rows.count()).toBeGreaterThan(0)
})
