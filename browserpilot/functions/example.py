"""Example automation routines derived from BrowserPilot demos."""

import asyncio
from typing import Optional

from backend.browser_controller import BrowserController


async def search_buffalo(browser: BrowserController, query: str = "buffalo buffalo buffalo buffalo buffalo") -> Optional[str]:
    """Run a simple Google search for the famous "buffalo" phrase and follow the first result.

    This helper mirrors the demonstration flow from the upstream BrowserPilot examples:
    1. Navigate to Google.
    2. Focus the first visible textarea (the search box).
    3. Submit a predefined tongue-twister query.
    4. Wait briefly for results and click the first link containing "buffalo".

    Returns the URL navigated to after clicking the result, if any.
    """

    await browser.goto("https://www.google.com")

    # Locate the first visible textarea (Google's search box is a textarea).
    textareas = await browser.page.query_selector_all("textarea")
    first_visible = None
    for textarea in textareas:
        if await textarea.is_visible():
            first_visible = textarea
            break

    if not first_visible:
        print("❌ No visible textarea found on Google search page")
        return None

    await first_visible.click()
    await first_visible.fill(query)
    await browser.page.keyboard.press("Enter")

    await asyncio.sleep(2)

    # Click the first visible anchor containing the word "buffalo".
    anchors = await browser.page.query_selector_all("a:has-text('buffalo')")
    for anchor in anchors:
        if await anchor.is_visible():
            await anchor.click()
            await asyncio.sleep(1)
            print("🔗 Clicked first buffalo-related link")
            return browser.page.url

    print("⚠️ No buffalo-related links found")
    return None
