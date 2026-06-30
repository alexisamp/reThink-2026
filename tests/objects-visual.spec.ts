import { expect, test } from '@playwright/test'

const authFile = '.context/playwright/auth.json'

test.use({ storageState: authFile })

async function waitForObjectsData(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => !document.body.innerText.includes('Loading...'), null, { timeout: 30_000 })
}

test('objects settings shell renders Attio-style objects index', async ({ page }) => {
  await page.goto('/settings/data/objects')
  await expect(page.getByRole('heading', { name: 'Data' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Objects' })).toBeVisible()
  await waitForObjectsData(page)
  await expect(page.getByText('Companies', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('People', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Deals', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: '.context/playwright/objects-index.png', fullPage: true })
})

test('companies object settings supports core tabs without out-of-scope actions', async ({ page }) => {
  await page.goto('/settings/data/objects/companies/general')
  await waitForObjectsData(page)
  await expect(page.getByRole('heading', { name: /Companies/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Configuration/ })).toBeVisible()

  await page.getByRole('button', { name: /Permissions/ }).click()
  await expect(page.locator('.perm-block-title', { hasText: 'Workspace access' })).toBeVisible()

  await page.getByRole('button', { name: /Appearance/ }).click()
  await expect(page.getByText('Record labels')).toBeVisible()
  await expect(page.getByText('Record page layout')).toHaveCount(0)

  await page.getByRole('button', { name: /Attributes/ }).click()
  await expect(page.getByRole('button', { name: /Create attribute/ })).toHaveCount(0)
  await page.screenshot({ path: '.context/playwright/companies-object-settings.png', fullPage: true })
})

test('companies records view keeps Attio-style top controls', async ({ page }) => {
  await page.goto('/companies/view/all')
  await waitForObjectsData(page)
  await expect(page.getByRole('button', { name: /All Companies/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /New Company/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /View settings/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Filter/ })).toBeVisible()
  await expect(page.getByText('Sorted by')).toBeVisible()
  await expect(page.getByRole('button', { name: /Import \/ Export/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Ask Attio/ })).toBeVisible()
  await expect(page.getByText('Country')).toBeVisible()
  await expect(page.getByPlaceholder('Search companies')).toBeVisible()
  await page.screenshot({ path: '.context/playwright/companies-view.png', fullPage: true })
})
