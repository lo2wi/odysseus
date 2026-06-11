"""
Odysseus i18n — Python backend translation layer.

Usage:
    from src.i18n import _, I18N
    error_msg = _('auth.invalid_credentials', 'Invalid username or password')

The locale JSON files live in static/locale/ and are shared with the frontend.
"""
import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
LOCALE_DIR = BASE_DIR / "static" / "locale"


class I18N:
    _instance = None
    _dict: dict = {}
    _locale: str = "en"

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def init(self, locale: str = None):
        """Load the locale dictionary. Call once at startup."""
        if locale is None:
            locale = os.environ.get("ODYSSEUS_LOCALE", "en")

        self._locale = locale

        if locale == "en" or locale.startswith("en-"):
            return

        locale_file = LOCALE_DIR / f"{locale}.json"
        if not locale_file.exists():
            # Try base language (e.g., zh-CN -> zh)
            base = locale.split("-")[0] if "-" in locale else None
            if base:
                locale_file = LOCALE_DIR / f"{base}.json"

        if locale_file.exists():
            try:
                with open(locale_file, "r", encoding="utf-8") as f:
                    self._dict = json.load(f)
            except Exception:
                pass

    def t(self, key: str, fallback: str = None) -> str:
        """Translate a key. Returns fallback or key if not found."""
        if not self._dict:
            return fallback if fallback is not None else key

        parts = key.split(".")
        val = self._dict
        for p in parts:
            if not isinstance(val, dict):
                break
            val = val.get(p)

        if val is None or val == "":
            return fallback if fallback is not None else key
        return val


# Singleton
I18N = I18N()

# Shortcut
def _(key: str, fallback: str = None) -> str:
    return I18N.t(key, fallback)
