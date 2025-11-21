"""Data-centric automation helpers for BrowserPilot."""

from __future__ import annotations

import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import pandas as pd

from backend.browser_controller import BrowserController


async def _extract_tables(page) -> List[Dict[str, Any]]:
    """Extract structured data from all tables on the active page."""

    return await page.evaluate(
        """
        () => {
            const tables = Array.from(document.querySelectorAll('table'));
            return tables.map((table) => {
                const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.innerText.trim())
                    || Array.from(table.querySelectorAll('tr th')).map(h => h.innerText.trim());

                const rows = Array.from(table.querySelectorAll('tr'))
                    .map(row => Array.from(row.querySelectorAll('th,td')).map(cell => cell.innerText.trim()))
                    .filter(row => row.length > 0);

                return { headers, rows };
            });
        }
        """
    )


def _normalize_dataframe(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> pd.DataFrame:
    """Create a DataFrame with best-effort header alignment."""

    if headers and all(len(row) == len(headers) for row in rows):
        return pd.DataFrame(rows, columns=list(headers))

    df = pd.DataFrame(rows)
    if headers and len(headers) == df.shape[1]:
        df.columns = list(headers)
    return df


async def export_to_csv(
    browser: BrowserController,
    download_dir: Path | str = "downloads",
    table_index: int = 0,
) -> Optional[Path]:
    """Extract tabular data from the current page and save it to CSV.

    The function locates HTML tables, converts the selected table into a
    structured DataFrame, and writes a timestamped CSV file in the provided
    ``download_dir``. The first table is exported by default.
    """

    tables = await _extract_tables(browser.page)
    if not tables:
        print("⚠️ No tables found on the current page")
        return None

    if table_index >= len(tables):
        print(f"⚠️ Requested table index {table_index} is out of bounds; falling back to the first table")
        table_index = 0

    table = tables[table_index]
    headers: List[str] = [h for h in table.get("headers", []) if h]
    rows: List[List[str]] = table.get("rows", [])

    df = _normalize_dataframe(headers, rows)

    target_dir = Path(download_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    file_path = target_dir / f"export_{timestamp}.csv"

    df.to_csv(file_path, index=False)
    print(f"💾 Exported table to {file_path}")

    # Brief pause to ensure the filesystem settles in containerized environments
    await asyncio.sleep(0.1)
    return file_path
