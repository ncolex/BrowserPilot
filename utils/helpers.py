"""Utility helpers for function discovery and prompt preprocessing."""

from __future__ import annotations

import importlib
import inspect
import re
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

FUNCTIONS_PACKAGE = "browserpilot.functions"
FUNCTIONS_PATH = Path("browserpilot/functions")


def parse_run_functions(prompt: str) -> Tuple[List[str], str]:
    """Parse ``RUN_FUNCTION <name>`` directives from a prompt.

    Returns a tuple of (function_names, cleaned_prompt).
    """

    function_calls: List[str] = []
    cleaned_lines: List[str] = []
    pattern = re.compile(r"^\s*RUN_FUNCTION\s+([a-zA-Z_][\w]*)", re.IGNORECASE)

    for line in prompt.splitlines():
        match = pattern.match(line)
        if match:
            function_calls.append(match.group(1).lower())
        else:
            cleaned_lines.append(line)

    cleaned_prompt = "\n".join(cleaned_lines).strip()
    return function_calls, cleaned_prompt


def discover_function_registry(allowed_modules: Iterable[str] | None = None) -> Dict[str, object]:
    """Safely import callable automation helpers from ``browserpilot.functions``.

    Only coroutine functions are registered to avoid accidental execution of
    module-level code. The ``allowed_modules`` parameter can restrict loading to
    a subset of modules if desired.
    """

    registry: Dict[str, object] = {}
    modules_to_scan = []

    for path in FUNCTIONS_PATH.glob("*.py"):
        if path.name.startswith("__"):
            continue
        module_name = path.stem
        if allowed_modules and module_name not in allowed_modules:
            continue
        modules_to_scan.append(f"{FUNCTIONS_PACKAGE}.{module_name}")

    for module_path in modules_to_scan:
        module = importlib.import_module(module_path)
        for name, func in inspect.getmembers(module, inspect.iscoroutinefunction):
            registry[name.lower()] = func

    return registry
