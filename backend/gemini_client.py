import os
import asyncio
from typing import Any, Callable

import google.generativeai as genai

DEFAULT_MODEL = "gemini-1.5-flash-002"


def _should_use_fallback(error: Exception) -> bool:
    """Return True when an error indicates an unsupported/unknown model."""
    message = str(error).lower()
    return "not found" in message or "does not support" in message or "unsupported" in message


class GeminiClient:
    """Simple wrapper that retries Gemini calls with a safe fallback model.

    The service occasionally receives requests with bleeding-edge model names
    (for example `gemini-2.5-flash-preview-05-20`). Older SDK versions or API
    regions might not support those models, which previously caused the entire
    request to fail. This client automatically retries with a stable default
    model so the rest of the pipeline can continue.
    """

    def __init__(self, default_model: str = DEFAULT_MODEL, env_var: str = "GOOGLE_MODEL"):
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        self.default_model = default_model
        self.configured_model = os.getenv(env_var, default_model)
        self.current_model_name = self.configured_model
        self.model = genai.GenerativeModel(self.current_model_name)

    def _switch_to_fallback(self) -> None:
        if self.current_model_name == self.default_model:
            return

        print(
            f"⚠️ Falling back to default Gemini model '{self.default_model}' "
            f"from '{self.current_model_name}'"
        )
        self.current_model_name = self.default_model
        self.model = genai.GenerativeModel(self.default_model)

    async def _call_model(self, method: str, *args: Any, **kwargs: Any):
        caller: Callable[..., Any] = getattr(self.model, method)
        try:
            return await asyncio.to_thread(caller, *args, **kwargs)
        except Exception as error:
            if _should_use_fallback(error):
                self._switch_to_fallback()
                caller = getattr(self.model, method)
                return await asyncio.to_thread(caller, *args, **kwargs)
            raise

    async def generate_content(self, *args: Any, **kwargs: Any):
        return await self._call_model("generate_content", *args, **kwargs)

    async def count_tokens(self, *args: Any, **kwargs: Any):
        return await self._call_model("count_tokens", *args, **kwargs)
