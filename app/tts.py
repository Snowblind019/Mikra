"""
Pronunciation audio.

Uses edge-tts (Microsoft's online neural voices, free, no account) when it is installed:
    pip install edge-tts==7.2.8   (the version run.sh and run.bat install)
Every clip is cached on disk, so a word only needs the internet the first time it is played.
If edge-tts is missing or offline, the app falls back to the browser's own Hebrew voice when one exists.
"""
import asyncio
import hashlib
import os
import re
import threading

VOICES = {
    "he-IL-AvriNeural": "Avri (male)",
    "he-IL-HilaNeural": "Hila (female)",
}

# A fixed set of locks shared by hash, so two requests for the same clip never download it twice
# and the table doesn't grow with every new word.
_locks = [threading.Lock() for _ in range(64)]
_last_error = {"msg": None}
TIMEOUT = 30  # seconds; without it a stalled connection would hold a server thread forever

# cantillation, meteg, paseq, sof pasuq, nun hafukha, upper/lower dots. Vowels and dagesh stay.
_CANT = re.compile("[֑-ֽ֯׀׃-׆]")


def clean_text(text):
    text = _CANT.sub("", text)
    text = text.replace("־", " ")  # maqaf
    text = re.sub(r"[/\\]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def available():
    try:
        import edge_tts  # noqa: F401
        return True
    except Exception:
        return False


def status():
    if available():
        msg = "edge-tts is installed (needs internet the first time each word is played, then it is cached)"
        if _last_error["msg"]:
            msg += "; last error: " + _last_error["msg"]
        return {"engine": "edge-tts", "ok": True, "message": msg, "voices": VOICES}
    return {"engine": None, "ok": False, "voices": VOICES,
            "message": "edge-tts is not installed, so the app will use your browser's Hebrew voice if it has one. "
                       "For the best audio run:  pip install edge-tts==7.2.8"}


def _lock_for(key):
    return _locks[int(key[:4], 16) % len(_locks)]


def synthesize(text, voice, rate, cache_dir):
    text = clean_text(text)[:600]
    if not text:
        return None, "empty text"
    if voice not in VOICES:
        voice = "he-IL-AvriNeural"
    if not re.fullmatch(r"[+-][0-9]{1,2}%", rate or ""):
        rate = "+0%"
    os.makedirs(cache_dir, exist_ok=True)
    key = hashlib.sha1(f"{voice}|{rate}|{text}".encode("utf-8"), usedforsecurity=False).hexdigest()  # a cache file name only
    path = os.path.join(cache_dir, key[:2], key + ".mp3")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path, None
    if not available():
        return None, "edge-tts not installed"
    with _lock_for(key):
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return path, None
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".part"
        try:
            import edge_tts

            async def run():
                com = edge_tts.Communicate(text, voice, rate=rate)
                await com.save(tmp)

            asyncio.run(asyncio.wait_for(run(), TIMEOUT))
            if not os.path.exists(tmp) or os.path.getsize(tmp) == 0:
                raise RuntimeError("no audio returned")
            os.replace(tmp, path)
            _last_error["msg"] = None
            return path, None
        except Exception as e:  # offline, blocked, timed out, service change
            _last_error["msg"] = (str(e) or e.__class__.__name__)[:200]
            try:
                os.remove(tmp)
            except OSError:
                pass
            return None, "audio service unavailable: " + _last_error["msg"]
