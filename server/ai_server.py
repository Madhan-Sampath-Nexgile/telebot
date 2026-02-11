import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
  sys.path.insert(0, str(ROOT_DIR))

from bot.assistant_engine import generate_reply_with_qwen, load_knowledge


def create_app() -> Flask:
  load_dotenv(ROOT_DIR / ".env")

  app = Flask(__name__)
  CORS(app, origins=["http://localhost:4200"])

  @app.get("/health")
  def health() -> tuple[dict, int]:
    provider = os.getenv("MODEL_PROVIDER", "huggingface").lower()
    model = (
      os.getenv("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct:together")
      if provider == "huggingface"
      else os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    )
    endpoint = (
      os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")
      if provider == "huggingface"
      else os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
    )
    return jsonify(
      {
        "ok": True,
        "service": "wildfact-ai-api-python",
        "provider": provider,
        "model": model,
        "endpoint": endpoint,
      }
    ), 200

  @app.post("/api/chat")
  def chat() -> tuple[dict, int]:
    payload = request.get_json(silent=True) or {}
    prompt = str(payload.get("prompt", "")).strip()
    if not prompt:
      return jsonify({"ok": False, "error": "prompt is required"}), 400

    config, animals = load_knowledge(str(ROOT_DIR))
    reply = generate_reply_with_qwen(prompt, config, animals, use_ai=True)
    return jsonify({"ok": True, "reply": reply}), 200

  return app


if __name__ == "__main__":
  app = create_app()
  port = int(os.getenv("PORT", "3000"))
  app.run(host="0.0.0.0", port=port, debug=False)
