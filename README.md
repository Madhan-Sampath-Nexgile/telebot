# Angular + Qwen Animal Chatbot

This project combines:
- Angular chat UI
- Local AI API server (`server/ai_server.py`)
- Qwen model through Hugging Face Router (or Ollama)
- JSON animal knowledge base for grounded responses

For Telegram replies, a local polling runner is included in `bot/telegram_polling_bot.py`.

## Where data is stored

- Bot rules and responses: `public/data/bot-config.json`
- Animal full-detail knowledge base: `public/data/animals.json`
- Seed chat history: `public/data/chat-history.json`
- Runtime history persistence: browser `localStorage` as JSON
- Export/import history: JSON file from the UI

## Run (Web App + AI)

```bash
npm install
pip install -r requirements.txt
npm run start:full
```

Open `http://localhost:4200`.

This starts:
- Angular dev server (`4200`)
- AI API server (`3000`)

## Hugging Face Router Setup (Recommended)

Set `.env` (or copy from `.env.example`):

```env
TELEGRAM_BOT_TOKEN=your-token-from-botfather
MODEL_PROVIDER=huggingface
HF_TOKEN=your-huggingface-token
HF_BASE_URL=https://router.huggingface.co/v1
HF_MODEL=Qwen/Qwen2.5-7B-Instruct:together
```

## Optional Ollama Setup

```env
MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

## Enable Telegram Bot Replies

1. Verify token:

```bash
npm run bot:check
```

2. Start Telegram polling bot:

```bash
npm run bot
```

Then chat with your bot in Telegram (`@wildfactbot`).
The polling bot uses the same Qwen + JSON grounded reply engine.

## Customize bot behavior

Edit `public/data/bot-config.json`:

- `greetings`: replies for hello-like messages
- `fallback`: replies when no intent matches
- `intents`: keyword-based matching

Each intent has:
- `contains`: keyword list
- `responses`: possible bot replies

Edit `public/data/animals.json` to control full animal profiles.

Each animal entry includes:
- common name and scientific name
- classification, habitat, diet
- lifespan, weight, top speed
- conservation status
- regions, traits, and facts

## Animal chatbot prompts

Try prompts like:
- `list animals`
- `random animal`
- `tell me about lion`
- `full details of giant panda`

## Chat history JSON workflow

- Click **Export History JSON** to download current messages.
- Click **Import History JSON** to load a previous history file.
- Click **Clear History** to reset current chat.
