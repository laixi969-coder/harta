import type { Page } from 'playwright-core';

// Douyin can leave hidden controls from another layout before the visible
// comments tab hydrates. Select visible matches before applying first().
export async function openDouyinComments(
  page: Page,
  hasResponses: () => boolean,
  timeout = 30000,
) {
  const button = page.locator('[data-e2e="comment-icon"]:visible, [data-e2e="comment-count"]:visible').first();
  const tab = page.getByText(/^评论\s*[（(]\s*\d+/).and(page.locator(':visible')).first();
  await button.or(tab).first().waitFor({ state: 'visible', timeout }).catch(error => {
    if (error?.name !== 'TimeoutError') throw error;
  });
  if (await tab.isVisible()) await tab.click({timeout});
  else if (await button.isVisible()) await button.click({timeout});
  else if (!hasResponses()) throw new Error('抖音评论入口尚未加载，请检查平台页面后继续');
}
