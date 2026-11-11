import { test, expect, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

const NAME = 'E2E Rowan';
const ACTIVITY = 'E2E: shipped the approval flow';
const QUEST = 'E2E milestone quest';
const JOURNAL = 'E2E reflection';
const ITEM = 'E2E certificate';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function expectToast(page: Page, text: string) {
  await expect(page.getByRole('status').filter({ hasText: text }).first()).toBeVisible();
}

async function ensureProfile(page: Page, name: string = NAME) {
  await page.goto('/');
  if (await page.getByRole('heading', { name: 'Begin your legend' }).isVisible()) {
    await page.getByPlaceholder('e.g. Rowan Ashvale').fill(name);
    await page.getByRole('button', { name: /Create character/ }).click();
    await expect(page.getByRole('heading', { name: name, exact: true })).toBeVisible();
  }
}

test('onboarding creates the local profile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Begin your legend' })).toBeVisible();
  await page.getByPlaceholder('e.g. Rowan Ashvale').fill(NAME);
  await page.getByRole('button', { name: /Create character/ }).click();
  await expect(page.getByRole('heading', { name: NAME, exact: true })).toBeVisible();
  await expect(page.getByText('Lifetime XP and player level never decay.')).toBeVisible();
});

test('activity analysis is proposed, editable and approved', async ({ page }) => {
  await ensureProfile(page);
  await page.getByRole('button', { name: /Log activity/ }).first().click();
  const describe = page.getByRole('dialog', { name: 'Log an activity' });
  await expect(describe).toBeVisible();
  await describe.getByPlaceholder('e.g. Built the activity approval flow').fill(ACTIVITY);
  await describe.getByPlaceholder('e.g. Coding').fill('Coding');
  await describe.getByRole('button', { name: /Analyze activity/ }).click();

  const review = page.getByRole('dialog', { name: 'Review proposal' });
  await expect(review).toBeVisible();
  await expect(review.getByText(/Offline heuristic/)).toBeVisible();
  await review.getByRole('button', { name: /Approve & record/ }).click();

  await expectToast(page, 'Activity recorded');
  await expect(page.getByText(ACTIVITY).first()).toBeVisible();
});

test('quest milestones drive progress and completion', async ({ page }) => {
  await ensureProfile(page);
  await page.goto('/quests');
  await page.getByRole('button', { name: /New quest/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New quest' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title', { exact: true }).fill(QUEST);
  await dialog.getByPlaceholder(/Add a milestone/).fill('Step one');
  await dialog.getByRole('button', { name: /Add/ }).click();
  await dialog.getByRole('button', { name: /Create quest/ }).click();

  await expectToast(page, 'Quest created');
  const card = page.locator('section').filter({ hasText: QUEST }).first();
  await expect(card.getByText('0/1 milestones')).toBeVisible();
  await card.getByRole('button', { name: /Step one/ }).click();

  await expectToast(page, 'Milestone updated');
  await page.getByRole('tab', { name: /Completed/ }).click();
  const completed = page.locator('section').filter({ hasText: QUEST }).first();
  await expect(completed.getByText('1/1 milestones')).toBeVisible();
  await expect(completed.getByText('100% complete')).toBeVisible();
});

test('journal entry renders sanitized markdown', async ({ page }) => {
  await ensureProfile(page);
  await page.goto('/journal');
  await page.getByRole('button', { name: /New entry/ }).first().click();
  const dialog = page.getByRole('dialog', { name: 'New journal entry' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Title', { exact: true }).fill(JOURNAL);
  await dialog
    .locator('textarea')
    .fill('# First light\n\nToday I tested the **journal**.\n\n- local only\n\n<script>alert(1)</script>');
  await dialog.getByRole('button', { name: 'Write entry' }).click();

  await expectToast(page, 'Entry written');
  await expect(page.getByRole('heading', { name: JOURNAL })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'First light' })).toBeVisible();
  await expect(page.getByText('local only', { exact: true })).toBeVisible();
  await expect(page.locator('.markdown script')).toHaveCount(0);
});

test('inventory item accepts a real attachment and keeps integrity metadata', async ({ page }) => {
  await ensureProfile(page);
  await page.goto('/inventory');
  await page.getByRole('button', { name: /New item/ }).click();
  const dialog = page.getByRole('dialog', { name: 'New inventory item' });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('AWS Solutions Architect').fill(ITEM);
  await dialog.getByRole('button', { name: 'Create item' }).click();

  await expectToast(page, 'Item added');
  await expect(page.getByRole('dialog', { name: 'E2E certificate' })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'proof.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expectToast(page, 'File attached');
  await expect(page.getByText('proof.png', { exact: true })).toBeVisible();
  await expect(page.getByText(/SHA-256|sha256/i).first()).toBeVisible();
});

test('backup restore keeps the archive catalog and a safety snapshot', async ({ page }) => {
  await ensureProfile(page);
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Backups & Data' }).click();

  await page.getByRole('button', { name: /Create backup/ }).click();
  await expectToast(page, 'Backup created');
  const filename = (
    await page.getByText(/liferpg-backup-\d+-\d+-manual\.zip/).first().textContent()
  )?.trim();
  expect(filename).toBeTruthy();

  await page.getByRole('button', { name: /^Validate$/ }).first().click();
  await expectToast(page, 'Backup verified');

  await page.getByRole('button', { name: /^Restore$/ }).first().click();
  const confirm = page.getByRole('dialog', { name: 'Restore this backup?' });
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(/A safety snapshot of your/)).toBeVisible();
  await confirm.getByRole('button', { name: 'Restore backup' }).click();

  await expectToast(page, 'Backup restored');
  await expect(page.getByText(filename as string, { exact: true })).toBeVisible();
  await expect(page.getByText('Automatic pre-restore safety snapshot')).toBeVisible();
});
