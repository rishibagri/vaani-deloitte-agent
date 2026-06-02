import base64
import logging
from typing import Optional

import cv2
import numpy as np
import psycopg2
from psycopg2.extras import RealDictCursor

try:
    import face_recognition
    _FR_AVAILABLE = True
except ImportError:
    _FR_AVAILABLE = False
    logging.warning("[MEMORY] face_recognition not installed — face identification disabled")

# Euclidean distance threshold; face_recognition considers < 0.6 a match by default
MATCH_THRESHOLD = 0.55


class FaceMemory:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self._conn: Optional[psycopg2.extensions.connection] = None
        self.available = _FR_AVAILABLE

    @property
    def connected(self) -> bool:
        return self._conn is not None

    def connect(self):
        self._conn = psycopg2.connect(self.db_url)
        self._ensure_schema()
        logging.info("[MEMORY] PostgreSQL connected")

    def close(self):
        if self._conn:
            self._conn.close()

    def _ensure_schema(self):
        with self._conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS vaani_users (
                    id                 SERIAL PRIMARY KEY,
                    name               VARCHAR(255) NOT NULL,
                    role               VARCHAR(255),
                    face_encoding      FLOAT8[],
                    preferred_language VARCHAR(10) DEFAULT 'en',
                    visit_count        INTEGER DEFAULT 1,
                    created_at         TIMESTAMPTZ DEFAULT NOW(),
                    last_seen          TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS vaani_sessions (
                    id         SERIAL PRIMARY KEY,
                    user_id    INTEGER REFERENCES vaani_users(id) ON DELETE CASCADE,
                    session_id VARCHAR(255) UNIQUE NOT NULL,
                    summary    TEXT,
                    language   VARCHAR(10) DEFAULT 'en',
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS idx_vaani_sessions_user
                    ON vaani_sessions(user_id);
            """)
            # Non-destructive migrations for multi-tenant + admin features
            cur.execute("""
                ALTER TABLE vaani_users
                    ADD COLUMN IF NOT EXISTS company_id VARCHAR(255) DEFAULT 'default';
                UPDATE vaani_users SET company_id = 'default' WHERE company_id IS NULL;
                ALTER TABLE vaani_sessions
                    ADD COLUMN IF NOT EXISTS transcript TEXT;
            """)
            try:
                cur.execute("ALTER TABLE vaani_users ALTER COLUMN face_encoding DROP NOT NULL;")
            except Exception:
                pass  # already nullable or does not apply
            self._conn.commit()

    # ── image helpers ──────────────────────────────────────────────────────────

    def _to_rgb(self, image_data: "str | bytes") -> Optional[np.ndarray]:
        if isinstance(image_data, str):
            if "," in image_data:
                image_data = image_data.split(",", 1)[1]
            raw = base64.b64decode(image_data)
        else:
            raw = image_data
        arr = np.frombuffer(raw, np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return None
        return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    def _extract_encoding(self, image_data: "str | bytes") -> Optional[list]:
        if not _FR_AVAILABLE:
            return None
        img = self._to_rgb(image_data)
        if img is None:
            return None
        encodings = face_recognition.face_encodings(img)
        return encodings[0].tolist() if encodings else None

    # ── public API ─────────────────────────────────────────────────────────────

    def identify(self, image_data: "str | bytes") -> Optional[dict]:
        """Return user profile dict if a known face is found, else None."""
        encoding = self._extract_encoding(image_data)
        if encoding is None:
            return None

        with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute("SELECT * FROM vaani_users")
            users = cur.fetchall()

        users = [u for u in users if u.get("face_encoding")]  # skip profile-only users

        if not users:
            return None

        known = [np.array(u["face_encoding"]) for u in users]
        distances = face_recognition.face_distance(known, np.array(encoding))
        best = int(np.argmin(distances))

        if distances[best] > MATCH_THRESHOLD:
            return None

        user = dict(users[best])
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE vaani_users SET last_seen=NOW(), visit_count=visit_count+1 WHERE id=%s",
                (user["id"],),
            )
            self._conn.commit()
        user.pop("face_encoding")
        return user

    def enroll(
        self,
        image_data: "str | bytes",
        name: str,
        role: Optional[str] = None,
        language: str = "en",
    ) -> Optional[dict]:
        """Enroll a new user. Returns their profile dict or None if no face found."""
        encoding = self._extract_encoding(image_data)
        if encoding is None:
            return None
        with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """INSERT INTO vaani_users (name, role, face_encoding, preferred_language)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, name, role, preferred_language, visit_count,
                             created_at, last_seen""",
                (name, role, encoding, language),
            )
            user = dict(cur.fetchone())
            self._conn.commit()
        return user

    def get_context_prompt(self, user_id: int) -> str:
        """Build a context block to prepend to the system instruction."""
        with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT name, role, visit_count, preferred_language FROM vaani_users WHERE id=%s",
                (user_id,),
            )
            user = cur.fetchone()
            if not user:
                return ""
            cur.execute(
                """SELECT summary FROM vaani_sessions
                   WHERE user_id=%s AND summary IS NOT NULL
                   ORDER BY created_at DESC LIMIT 3""",
                (user_id,),
            )
            past = [r["summary"] for r in cur.fetchall()]

        lines = [f"MEMORY — You are speaking with {user['name']}"]
        if user["role"]:
            lines[-1] += f" ({user['role']})"
        lines[-1] += "."

        if user["visit_count"] > 1:
            lines.append(
                f"This is visit #{user['visit_count']}. Greet them warmly as a returning guest."
            )
        else:
            lines.append("This is their first visit. Welcome them.")

        if past:
            lines.append("Summaries of previous conversations:")
            lines.extend(f"  • {s}" for s in past)

        lang = user.get("preferred_language", "en")
        if lang and lang != "en":
            lines.append(f"Their preferred language code: {lang}.")

        return "\n".join(lines)

    def save_session(
        self,
        session_id: str,
        user_id: Optional[int],
        summary: str,
        language: str = "en",
    ):
        with self._conn.cursor() as cur:
            cur.execute(
                """INSERT INTO vaani_sessions (session_id, user_id, summary, language)
                   VALUES (%s, %s, %s, %s)
                   ON CONFLICT (session_id) DO UPDATE
                   SET summary=EXCLUDED.summary, language=EXCLUDED.language""",
                (session_id, user_id, summary, language),
            )
            self._conn.commit()

    def update_language(self, user_id: int, language: str):
        with self._conn.cursor() as cur:
            cur.execute(
                "UPDATE vaani_users SET preferred_language=%s WHERE id=%s",
                (language, user_id),
            )
            self._conn.commit()

    # ── admin helpers ──────────────────────────────────────────────────────────

    def validate_face(self, image_data: "str | bytes") -> dict:
        """Check if a face is detectable in the image."""
        if not _FR_AVAILABLE:
            return {"valid": False, "reason": "face_recognition_unavailable"}
        encoding = self._extract_encoding(image_data)
        if encoding is None:
            return {"valid": False, "reason": "no_face_detected"}
        return {"valid": True}

    def list_users(self) -> list:
        """Return all enrolled users without face encodings."""
        if not self.connected:
            return []
        try:
            with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("""
                    SELECT id, name, role,
                           COALESCE(company_id, 'default') AS company_id,
                           preferred_language, visit_count, created_at, last_seen
                    FROM vaani_users
                    ORDER BY last_seen DESC NULLS LAST
                """)
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logging.error(f"[MEMORY] list_users error: {e}")
            return []

    def add_user(
        self,
        name: str,
        role: Optional[str] = None,
        language: str = "en",
        company_id: str = "default",
        image_data: Optional["str | bytes"] = None,
    ) -> Optional[dict]:
        """Add a user profile, optionally with a face encoding."""
        if not self.connected:
            return None
        encoding = None
        if image_data:
            encoding = self._extract_encoding(image_data)
            if encoding is None:
                return None  # image provided but no face found
        try:
            with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """INSERT INTO vaani_users
                           (name, role, face_encoding, preferred_language, company_id)
                       VALUES (%s, %s, %s, %s, %s)
                       RETURNING id, name, role, preferred_language, visit_count, created_at, last_seen""",
                    (name, role, encoding, language, company_id),
                )
                user = dict(cur.fetchone())
                self._conn.commit()
                user["company_id"] = company_id
                return user
        except Exception as e:
            logging.error(f"[MEMORY] add_user error: {e}")
            self._conn.rollback()
            return None

    def delete_user(self, user_id: int) -> bool:
        """Delete a user and cascade to their sessions."""
        if not self.connected:
            return False
        try:
            with self._conn.cursor() as cur:
                cur.execute("DELETE FROM vaani_users WHERE id=%s", (user_id,))
                deleted = cur.rowcount > 0
                self._conn.commit()
            return deleted
        except Exception as e:
            logging.error(f"[MEMORY] delete_user error: {e}")
            self._conn.rollback()
            return False

    def get_user_sessions(self, user_id: int) -> list:
        """Return conversation sessions for a user, newest first."""
        if not self.connected:
            return []
        try:
            with self._conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT id, session_id, summary, language, created_at,
                              COALESCE(transcript, '') AS transcript
                       FROM vaani_sessions
                       WHERE user_id=%s
                       ORDER BY created_at DESC""",
                    (user_id,),
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logging.error(f"[MEMORY] get_user_sessions error: {e}")
            return []
