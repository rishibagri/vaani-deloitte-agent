"""
Multi-bot configuration manager.

Each bot is stored as  data/bots/{slug}.json
The currently-active bot slug is stored in  data/active_bot.txt

A "bot" maps 1-to-1 with a client company. The slug is also used as the
company_id for face-recognition isolation — so each company's visitors are
enrolled and matched independently of every other company.
"""

import json
import re
import time
from pathlib import Path
from typing import Optional

# Modal mounts /data at runtime; local dev uses project-root data/
_DATA_CANDIDATES = [Path("/data"), Path(__file__).parent.parent / "data"]
DATA_DIR = next((p for p in _DATA_CANDIDATES if p.exists()), _DATA_CANDIDATES[-1])
BOTS_DIR = DATA_DIR / "bots"
ACTIVE_FILE = DATA_DIR / "active_bot.txt"

BOT_DEFAULTS: dict = {
    "company_name":      "Deloitte",
    "company_tagline":   "DCIT · Avatar Systems",
    "logo_url":          None,
    "primary_color":     "#86BC25",
    "agent_name":        "Vaani",
    "agent_role":        "Your AI Assistant",
    "agent_voice":       "Puck",
    "llm_model":         "gemini-3.1-flash-live-preview",
    "default_language":  "en",
    "supported_languages": ["en", "hi", "ta", "te", "kn", "ml", "bn", "ur"],
    "system_prompt_extra": "",
    "avatar_video_url":  None,
    "welcome_message":   "",
    "created_at":        None,
    "updated_at":        None,
}

_ALLOWED_VOICES = {"Puck", "Charon", "Kore", "Fenrir", "Aoede", "Leda", "Orus", "Perseus"}
_ALLOWED_MODELS = {
    "gemini-3.1-flash-live-preview",
    "gemini-2.0-flash-live-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.5-flash-preview-native-audio-dialog",
}

# In-memory cache:  slug → full config dict (includes "id" key)
_cache: dict[str, dict] = {}
_active_slug_cache: Optional[str] = None


# ── helpers ───────────────────────────────────────────────────────────


def _ensure_dirs() -> None:
    BOTS_DIR.mkdir(parents=True, exist_ok=True)


def slugify(name: str) -> str:
    """Turn a company name into a safe filename slug."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "bot"


def _bot_path(slug: str) -> Path:
    return BOTS_DIR / f"{slug}.json"


def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _validate_in_place(cfg: dict) -> None:
    if cfg.get("agent_voice") not in _ALLOWED_VOICES:
        cfg["agent_voice"] = "Puck"
    if cfg.get("llm_model") not in _ALLOWED_MODELS:
        cfg["llm_model"] = BOT_DEFAULTS["llm_model"]


def _read_bot_file(slug: str) -> Optional[dict]:
    path = _bot_path(slug)
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text())
        return {**BOT_DEFAULTS, **data, "id": slug}
    except Exception as e:
        print(f"[BOT_CONFIG] Read error ({slug}): {e}")
        return None


def _write_bot_file(slug: str, cfg: dict) -> dict:
    _ensure_dirs()
    # Strip the runtime "id" key before writing to disk
    disk_data = {k: v for k, v in cfg.items() if k != "id"}
    _bot_path(slug).write_text(json.dumps(disk_data, indent=2, ensure_ascii=False))
    full = {**cfg, "id": slug}
    _cache[slug] = full
    return full


# ── active-bot management ─────────────────────────────────────────────


def get_active_slug() -> str:
    global _active_slug_cache
    if _active_slug_cache:
        return _active_slug_cache
    if ACTIVE_FILE.exists():
        slug = ACTIVE_FILE.read_text().strip()
        if slug and _bot_path(slug).exists():
            _active_slug_cache = slug
            return slug
    # No valid active file — fall back to "default", creating it if needed
    _ensure_default()
    _active_slug_cache = "default"
    return "default"


def set_active(slug: str) -> bool:
    global _active_slug_cache
    if not _bot_path(slug).exists():
        return False
    _ensure_dirs()
    ACTIVE_FILE.write_text(slug)
    _active_slug_cache = slug
    return True


def get_active() -> dict:
    slug = get_active_slug()
    if slug in _cache:
        return _cache[slug]
    bot = _read_bot_file(slug)
    if bot is None:
        _ensure_default()
        bot = _read_bot_file("default")
    _cache[slug] = bot
    return bot


# ── CRUD ─────────────────────────────────────────────────────────────


def list_bots() -> list[dict]:
    _ensure_dirs()
    bots = []
    for path in sorted(BOTS_DIR.glob("*.json")):
        bot = _read_bot_file(path.stem)
        if bot:
            bots.append(bot)
    if not bots:
        _ensure_default()
        bots = [_read_bot_file("default")]
    return bots


def get_bot(slug: str) -> Optional[dict]:
    if slug in _cache:
        return _cache[slug]
    return _read_bot_file(slug)


def create_bot(data: dict) -> dict:
    company = data.get("company_name") or "New Bot"
    base = slugify(company)
    slug, n = base, 1
    while _bot_path(slug).exists():
        slug, n = f"{base}-{n}", n + 1
    now = _now_iso()
    cfg = {
        **BOT_DEFAULTS,
        **{k: v for k, v in data.items() if k in BOT_DEFAULTS},
        "created_at": now,
        "updated_at": now,
    }
    _validate_in_place(cfg)
    return _write_bot_file(slug, cfg)


def update_bot(slug: str, updates: dict) -> Optional[dict]:
    current = _read_bot_file(slug)
    if current is None:
        return None
    merged = {
        **current,
        **{k: v for k, v in updates.items() if k in BOT_DEFAULTS},
        "updated_at": _now_iso(),
    }
    _validate_in_place(merged)
    return _write_bot_file(slug, merged)


def delete_bot(slug: str) -> bool:
    if slug == "default":
        return False  # default bot is permanent
    path = _bot_path(slug)
    if not path.exists():
        return False
    path.unlink()
    _cache.pop(slug, None)
    global _active_slug_cache
    if _active_slug_cache == slug:
        _active_slug_cache = "default"
        ACTIVE_FILE.write_text("default")
    return True


# ── public helpers ────────────────────────────────────────────────────


def public_view(bot: Optional[dict] = None) -> dict:
    """Safe subset for unauthenticated /config endpoint."""
    if bot is None:
        bot = get_active()
    return {k: bot.get(k) for k in (
        "id", "company_name", "company_tagline", "logo_url", "primary_color",
        "agent_name", "agent_role", "default_language", "supported_languages",
        "avatar_video_url", "welcome_message",
    )}


# ── startup ───────────────────────────────────────────────────────────


def _ensure_default() -> None:
    if not _bot_path("default").exists():
        now = _now_iso()
        _write_bot_file("default", {**BOT_DEFAULTS, "created_at": now, "updated_at": now})


def load() -> None:
    """Call once at startup to prime caches and ensure default bot exists."""
    _ensure_default()
    active = get_active()
    print(f"[BOT_CONFIG] Loaded. Active bot: {active['id']} ({active['company_name']})")
