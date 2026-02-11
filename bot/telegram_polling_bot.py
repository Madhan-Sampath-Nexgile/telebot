import argparse
import os
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

from assistant_engine import generate_reply_with_qwen, load_knowledge


def telegram_call(token: str, method: str, payload: dict) -> dict:
  response = requests.post(
    f"https://api.telegram.org/bot{token}/{method}",
    json=payload,
    timeout=90,
  )
  response.raise_for_status()
  data = response.json()
  if not data.get("ok"):
    raise RuntimeError(data.get("description", f"Telegram {method} failed"))
  return data


def check_bot(token: str) -> None:
  me = telegram_call(token, "getMe", {})
  user = me.get("result", {})
  print(f"Connected as @{user.get('username', '')} ({user.get('first_name', '')})")


def run_polling(token: str, root_dir: Path) -> None:
  provider = os.getenv("MODEL_PROVIDER", "huggingface").lower()
  model = (
    os.getenv("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct:together")
    if provider == "huggingface"
    else os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
  )

  print("Telegram polling bot started (Python).")
  print(f"AI provider: {provider}")
  print(f"Qwen model: {model}")
  print("Send a message to your bot in Telegram to receive responses.")

  offset = 0
  while True:
    try:
      updates = telegram_call(
        token,
        "getUpdates",
        {
          "offset": offset,
          "timeout": 30,
          "allowed_updates": ["message"],
        },
      )

      for update in updates.get("result", []):
        offset = int(update.get("update_id", 0)) + 1
        message = update.get("message") or {}
        text = message.get("text")
        if not isinstance(text, str):
          continue

        chat_id = (message.get("chat") or {}).get("id")
        if chat_id is None:
          continue

        config, animals = load_knowledge(str(root_dir))
        reply = generate_reply_with_qwen(text, config, animals, use_ai=True)

        telegram_call(
          token,
          "sendMessage",
          {
            "chat_id": chat_id,
            "text": reply,
          },
        )
    except Exception as error:
      print(f"Polling error: {error}")
      time.sleep(2)


def main() -> None:
  parser = argparse.ArgumentParser()
  parser.add_argument("--check", action="store_true", help="Validate Telegram token with getMe")
  args = parser.parse_args()

  root_dir = Path(__file__).resolve().parents[1]
  load_dotenv(root_dir / ".env")

  token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
  if not token:
    raise RuntimeError("Missing TELEGRAM_BOT_TOKEN in .env")

  if args.check:
    check_bot(token)
    return

  run_polling(token, root_dir)


if __name__ == "__main__":
  main()
