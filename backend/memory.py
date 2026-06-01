"""
Vaani memory layer — Supabase (pgvector) or local JSON fallback.

If SUPABASE_URL and SUPABASE_KEY are set in .env, conversations are stored
in Supabase with pgvector embeddings for semantic retrieval.
Otherwise, summaries are appended to data/memory.json — no vector search,
just recency-based context.

────────────────────────────────────────────────────────────────────────
 Run this ONCE in your Supabase SQL editor to create the schema:
────────────────────────────────────────────────────────────────────────

 create extension if not exists vector;

 create table conversations (
   id          uuid        default gen_random_uuid() primary key,
   session_id  text        not null,
   summary     text        not null,
   embedding   vector(768),
   language    text        default 'en',
   transcript  text,
   created_at  timestamptz default now()
 );

 create index on conversations
   using ivfflat (embedding vector_cosine_ops)
   with (lists = 100);

────────────────────────────────────────────────────────────────────────
"""

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

from config import GEMINI_API_KEY, GEMINI_TEXT_MODEL, BASE_DIR

_MEMORY_FILE = BASE_DIR / "data" / "memory.json"

_SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
_SUPABASE_KEY = os.getenv("SUPABASE_KEY", "").strip()
_USE_SUPABASE = bool(_SUPABASE_URL and _SUPABASE_KEY)

_supabase_client = None

if _USE_SUPABASE:
    try:
        from supabase import create_client
        _supabase_client = create_client(_SUPABASE_URL, _SUPABASE_KEY)
        logging.info("[MEMORY] Supabase client initialised")
    except Exception as e:
        logging.warning(f"[MEMORY] Supabase init failed, falling back to local JSON: {e}")
        _USE_SUPABASE = False


# ── Gemini helpers ───────────────────────────────────────────────────


async def _gemini_summarise(transcript_text: str) -> str:
    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = (
            "Summarize this conversation in 2-3 concise sentences. "
            "Focus on what the user asked and what was answered. "
            "Write in third person (e.g. 'The user asked about...').\n\n"
            + transcript_text
        )
        resp = await client.aio.models.generate_content(
            model=GEMINI_TEXT_MODEL, contents=prompt
        )
        return resp.text.strip()
    except Exception as e:
        logging.warning(f"[MEMORY] Summarisation error: {e}")
        return ""


async def _gemini_embed(text: str) -> list[float] | None:
    try:
        from google import genai
        client = genai.Client(api_key=GEMINI_API_KEY)
        resp = await client.aio.models.embed_content(
            model="models/text-embedding-004",
            contents=text,
        )
        return resp.embeddings[0].values
    except Exception as e:
        logging.warning(f"[MEMORY] Embedding error: {e}")
        return None


# ── Local JSON helpers ───────────────────────────────────────────────


def _read_local() -> list[dict]:
    if not _MEMORY_FILE.exists():
        return []
    try:
        return json.loads(_MEMORY_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _write_local(entries: list[dict]):
    _MEMORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    _MEMORY_FILE.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2), encoding="utf-8"
    )


# ── Public API ───────────────────────────────────────────────────────


async def save_conversation(
    session_id: str,
    transcript: list[dict],
    language: str = "en",
):
    """
    Summarise and persist a completed conversation.
    Called as a background task — does not block the response pipeline.
    """
    if not transcript:
        return

    turns = "\n".join(f"{t['role'].upper()}: {t['text']}" for t in transcript)
    summary = await _gemini_summarise(turns)
    if not summary:
        return

    now = datetime.now(timezone.utc).isoformat()

    if _USE_SUPABASE and _supabase_client is not None:
        embedding = await _gemini_embed(summary)
        row = {
            "session_id": session_id,
            "summary":    summary,
            "language":   language,
            "transcript": turns,
            "created_at": now,
        }
        if embedding:
            row["embedding"] = embedding
        try:
            _supabase_client.table("conversations").insert(row).execute()
            logging.info(f"[MEMORY] Saved to Supabase: {session_id}")
        except Exception as e:
            logging.warning(f"[MEMORY] Supabase insert failed: {e}")
    else:
        entries = _read_local()
        entries.append({
            "session_id": session_id,
            "summary":    summary,
            "language":   language,
            "created_at": now,
        })
        _write_local(entries)
        logging.info(f"[MEMORY] Saved to local JSON: {session_id}")


async def get_relevant_context(current_query: str, limit: int = 3) -> str:
    """
    Return a formatted string of relevant past conversation summaries.
    Uses cosine similarity search on Supabase, or recency fallback locally.
    Returns empty string if no memory exists yet.
    """
    if _USE_SUPABASE and _supabase_client is not None:
        embedding = await _gemini_embed(current_query)
        if embedding is None:
            return ""
        try:
            resp = _supabase_client.rpc(
                "match_conversations",
                {
                    "query_embedding": embedding,
                    "match_count":     limit,
                },
            ).execute()
            rows = resp.data or []
        except Exception as e:
            logging.warning(f"[MEMORY] Supabase search failed: {e}")
            rows = []
    else:
        entries = _read_local()
        rows = entries[-limit:] if entries else []

    if not rows:
        return ""

    lines = ["RELEVANT CONTEXT FROM PAST CONVERSATIONS:"]
    for row in rows:
        date = row.get("created_at", "")[:10]
        summary = row.get("summary", "").strip()
        if summary:
            lines.append(f"[{date}]: {summary}")

    return "\n".join(lines)
