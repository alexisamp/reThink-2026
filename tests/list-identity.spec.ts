import { expect, test } from '@playwright/test'

test.use({ storageState: '.context/playwright/auth.json', viewport: { width: 924, height: 540 } })

test('list title is editable and its icon picker exposes emoji and line icons', async ({ page }) => {
  await page.goto('/lists')
  await page.waitForURL(/\/lists\/[0-9a-f-]+/)

  const title = page.locator('.tb-list-name')
  await expect(title).toBeVisible()
  const originalName = (await title.innerText()).trim()
  const temporaryName = `${originalName} QA`

  await title.click()
  const input = page.locator('.tb-title-input')
  await expect(input).toBeFocused()
  await input.fill(temporaryName)
  await input.press('Enter')
  await expect(page.locator('.tb-list-name')).toHaveText(temporaryName)
  await page.reload()
  await expect(page.locator('.tb-list-name')).toHaveText(temporaryName)

  await page.locator('.tb-list-name').click()
  await page.locator('.tb-title-input').fill(originalName)
  await page.locator('.tb-title-input').press('Enter')
  await expect(page.locator('.tb-list-name')).toHaveText(originalName)

  await page.locator('.tb-list-icon-btn').click()
  await expect(page.getByPlaceholder('Search Emojis')).toBeVisible()
  await expect(page.locator('.tb-emoji-pop .emoji-cat', { hasText: 'Icons' })).toBeVisible()
  await expect(page.locator('.tb-emoji-pop .emoji-grid.icons button')).toHaveCount(12)
  await page.keyboard.press('Escape')
  await expect(page.locator('.tb-emoji-pop')).toHaveCount(0)
})

test('create-list icon picker previews the selected icon before saving', async ({ page }) => {
  await page.goto('/lists?new=1')
  const iconButton = page.getByRole('button', { name: 'Choose list icon' })
  await iconButton.click()
  const picker = page.locator('.create-list-emoji-pop')
  await expect(picker).toBeVisible()
  await picker.locator('.emoji-grid.icons button[title="target"]').click()
  await expect(iconButton.locator('svg')).toBeVisible()
  await expect(picker).toHaveCount(0)

  await iconButton.click()
  await picker.locator('.emoji-grid:not(.icons) button').first().click()
  await expect(iconButton).not.toHaveText('📋')
})

test('every saved view exposes favorite, rename, duplicate and delete actions', async ({ page }) => {
  await page.goto('/lists')
  await page.waitForURL(/\/lists\/[0-9a-f-]+/)
  await page.locator('.viewpill').click()
  const rows = page.locator('.view-switch-row')
  await expect(rows.first()).toBeVisible()
  await rows.first().getByRole('button', { name: /Options for/ }).click()
  await expect(page.getByRole('button', { name: /favorites/i })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rename' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Duplicate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete' })).toBeVisible()
})
