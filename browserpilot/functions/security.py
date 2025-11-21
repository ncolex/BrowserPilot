"""Security and anti-bot helpers for BrowserPilot."""

from __future__ import annotations

import asyncio
from typing import Awaitable, Callable, Optional

import cv2
import numpy as np

from backend.browser_controller import BrowserController

CaptchaSolver = Callable[[np.ndarray], str | None] | Callable[[np.ndarray], Awaitable[str | None]]


async def _detect_captcha(page) -> bool:
    """Detect common CAPTCHA widgets on the current page."""

    # Look for well-known iframe patterns first
    captcha_iframe = await page.query_selector(
        "iframe[src*='recaptcha'], iframe[src*='hcaptcha'], iframe[src*='challenge']"
    )
    if captcha_iframe:
        return True

    # Check for specific elements rendered inline
    selectors = [
        "div.g-recaptcha",
        "div.hcaptcha-box",
        "div[id*='captcha']",
        "input[name='g-recaptcha-response']",
    ]
    for selector in selectors:
        element = await page.query_selector(selector)
        if element and await element.is_visible():
            return True

    # Inspect frames for recaptcha URLs
    for frame in page.frames:
        if any(token in (frame.url or "").lower() for token in ["recaptcha", "hcaptcha"]):
            return True

    return False


async def _apply_solver(browser: BrowserController, solution: str) -> bool:
    """Attempt to apply a solver's text solution to the page."""

    text_inputs = await browser.page.query_selector_all("input[type='text'], input:not([type])")
    for input_el in text_inputs:
        if await input_el.is_visible():
            await input_el.fill(solution)
            await asyncio.sleep(1)
            submit_buttons = await browser.page.query_selector_all("button, input[type='submit']")
            for button in submit_buttons:
                if await button.is_visible():
                    await button.click()
                    await asyncio.sleep(2)
                    return True
    return False


async def handle_captcha(
    browser: BrowserController,
    solver: Optional[CaptchaSolver] = None,
    wait_timeout: int = 120,
) -> bool:
    """Detect and optionally solve CAPTCHA challenges using vision or manual review.

    When a CAPTCHA is detected, the function logs the event, optionally delegates
    to a vision-based solver, and waits for the challenge to clear before
    continuing. Returns ``True`` when the page is clear of CAPTCHAs, ``False``
    otherwise.
    """

    detected = await _detect_captcha(browser.page)
    if not detected:
        return False

    print("🛡️ CAPTCHA Detected")

    if solver:
        screenshot_bytes = await browser.page.screenshot(full_page=True)
        image = cv2.imdecode(np.frombuffer(screenshot_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)

        maybe_awaitable = solver(image)
        solution = await maybe_awaitable if asyncio.iscoroutine(maybe_awaitable) else maybe_awaitable

        if solution:
            applied = await _apply_solver(browser, str(solution))
            if applied:
                print("✅ CAPTCHA solver applied solution")
            else:
                print("⚠️ CAPTCHA solver produced a solution but it could not be applied automatically")

    # Wait for challenge to clear or timeout
    waited = 0
    while waited < wait_timeout:
        if not await _detect_captcha(browser.page):
            print("🔓 CAPTCHA cleared")
            return True
        await asyncio.sleep(2)
        waited += 2

    print("⏳ CAPTCHA still present after waiting period")
    return False
