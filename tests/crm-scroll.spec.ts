import { expect, test, type Page } from '@playwright/test'

test.use({ storageState: '.context/playwright/auth.json', viewport: { width: 924, height: 540 } })

async function waitForTable(page: Page) {
  const scroller = page.locator('.crm-view-surface > .tbl-wrap')
  await expect(scroller).toBeVisible()
  await expect(page.locator('.trow.body').first()).toBeVisible()
  return scroller
}

async function verifyTableScroll(page: Page, route: string) {
  await page.goto(route)
  const scroller = await waitForTable(page)
  const nameCell = page.locator('.trow.body').first().locator('.tcell').nth(1)
  const initialX = (await nameCell.boundingBox())?.x ?? 0

  const dimensions = await scroller.evaluate(element => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight)
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth)

  await scroller.evaluate(element => { element.scrollTop = 120; element.scrollLeft = 180 })
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  const scrolledX = (await nameCell.boundingBox())?.x ?? 0
  expect(Math.abs(scrolledX - initialX)).toBeLessThanOrEqual(0.5)
}

test('Companies table scrolls without moving its frozen name column', async ({ page }) => {
  await verifyTableScroll(page, '/companies/view/all')
})

test('People table scrolls without moving its frozen name column', async ({ page }) => {
  await verifyTableScroll(page, '/people/view/all')
})

test('Lists use the same bounded Table or Kanban scroll surface', async ({ page }) => {
  await page.goto('/lists')
  await page.waitForURL(/\/lists\/[0-9a-f-]+/)
  const surface = page.locator('.crm-view-surface')
  await expect(surface).toBeVisible()
  const scroller = surface.locator(':scope > .tbl-wrap, :scope > .kanban')
  await expect(scroller).toBeVisible()
  const sizing = await scroller.evaluate(element => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }))
  expect(sizing.clientHeight).toBeGreaterThan(0)
  expect(sizing.scrollHeight).toBeGreaterThanOrEqual(sizing.clientHeight)
})
