"""Composable automation functions for BrowserPilot."""

from browserpilot.functions.example import search_buffalo
from browserpilot.functions.data import export_to_csv
from browserpilot.functions.security import handle_captcha

__all__ = ["search_buffalo", "export_to_csv", "handle_captcha"]
