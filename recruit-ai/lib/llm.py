"""LLM helper for Reqruit IQ AI agents."""
import json
import os
import re

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")


def call_llm(system_prompt: str, user_prompt: str) -> dict:
    """Call OpenAI or return None if unavailable."""
    api_key = os.getenv("OPENAI_API_KEY", "")
    if not api_key or api_key.startswith("sk-your"):
        return None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key, timeout=15.0)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            response_format={"type": "json_object"},
        )
        text = response.choices[0].message.content
        return json.loads(text)
    except Exception as e:
        print(f"LLM error: {e}")
        return None


def extract_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        return json.loads(match.group())
    return json.loads(text)
