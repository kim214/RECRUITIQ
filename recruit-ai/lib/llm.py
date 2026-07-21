"""LLM helper — supports OpenAI, Groq (free), Gemini (free tier), Ollama (local/free)."""
import json
import os
import re

import urllib.request
import urllib.error


def _valid_key(key: str) -> bool:
    if not key:
        return False
    placeholders = ("sk-your", "paste", "your-key", "YOUR_")
    return not any(p in key for p in placeholders)


def _resolve_provider():
    forced = os.getenv("LLM_PROVIDER", "auto").lower()
    providers = {
        "groq": {
            "name": "groq",
            "api_key": os.getenv("GROQ_API_KEY", ""),
            "base_url": os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"),
            "model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        },
        "openai": {
            "name": "openai",
            "api_key": os.getenv("OPENAI_API_KEY", ""),
            "base_url": os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1"),
            "model": os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        },
        "gemini": {
            "name": "gemini",
            "api_key": os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY", ""),
            "model": os.getenv("GEMINI_MODEL", "gemini-1.5-flash"),
        },
        "ollama": {
            "name": "ollama",
            "api_key": "ollama",
            "base_url": os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
            "model": os.getenv("OLLAMA_MODEL", "llama3.2"),
        },
    }

    if forced != "auto" and forced in providers:
        p = providers[forced]
        if p["name"] == "ollama" or _valid_key(p.get("api_key", "")):
            return p
        return None

    for key in ("groq", "openai", "gemini"):
        p = providers[key]
        if _valid_key(p.get("api_key", "")):
            return p
    if forced == "ollama" or os.getenv("LLM_PROVIDER") == "ollama":
        return providers["ollama"]
    return None


def _parse_json(text: str) -> dict:
    raw = (text or "").strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(raw)


def _call_openai_compatible(provider: dict, system_prompt: str, user_prompt: str) -> dict | None:
    from openai import OpenAI

    client = OpenAI(api_key=provider["api_key"], base_url=provider["base_url"], timeout=45.0)
    response = client.chat.completions.create(
        model=provider["model"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    return _parse_json(response.choices[0].message.content)


def _call_gemini(provider: dict, system_prompt: str, user_prompt: str) -> dict | None:
    model = provider["model"]
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={provider['api_key']}"
    payload = json.dumps({
        "contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}],
        "generationConfig": {"temperature": 0.2, "responseMimeType": "application/json"},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read().decode())
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return _parse_json(text)


def call_llm(system_prompt: str, user_prompt: str) -> dict | None:
    """Call configured LLM provider or return None."""
    provider = _resolve_provider()
    if not provider:
        return None
    try:
        if provider["name"] == "gemini":
            result = _call_gemini(provider, system_prompt, user_prompt)
        else:
            result = _call_openai_compatible(provider, system_prompt, user_prompt)
        if result:
            result["model_version"] = f"{provider['name']}:{provider['model']}"
        return result
    except Exception as e:
        print(f"LLM error ({provider['name']}): {e}")
        return None


def extract_json(text: str) -> dict:
    return _parse_json(text)
