"""Quick test of the Gemini SDK integration."""
import os
from dotenv import load_dotenv
load_dotenv()

from google import genai
from google.genai import types

api_key = os.getenv("GEMINI_API_KEY", "").strip()
model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
print(f"Key present: {bool(api_key)}, Key prefix: {api_key[:10]}...")
print(f"Model: {model}")

client = genai.Client(api_key=api_key)

prompt = 'Respond ONLY with a valid JSON object like: {"test": true, "message": "hello"}'

print("\n--- Test 1: with response_mime_type=application/json ---")
try:
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=256,
            response_mime_type="application/json",
        ),
    )
    print(f"Response text: {response.text}")
except Exception as e:
    print(f"ERROR: {e}")

print("\n--- Test 2: without response_mime_type ---")
try:
    response2 = client.models.generate_content(
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.3,
            max_output_tokens=256,
        ),
    )
    print(f"Response text: {response2.text}")
except Exception as e:
    print(f"ERROR: {e}")
