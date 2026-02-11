# Angular JSON Chatbot

This project is a chatbot built with Angular only.

No backend. No database.

For Telegram replies, a local polling runner is included in `bot/telegram-polling-bot.js`.

## Where data is stored

- Bot rules and responses: `public/data/bot-config.json`
- Animal full-detail knowledge base: `public/data/animals.json`
- Seed chat history: `public/data/chat-history.json`
- Runtime history persistence: browser `localStorage` as JSON
- Export/import history: JSON file from the UI

## Run

```bash
npm install
npm start
```

Open `http://localhost:4200`.

## Enable Telegram Bot Replies

1. Add token to `.env`:

```env
TELEGRAM_BOT_TOKEN=your-token-from-botfather
```

2. Verify token:

```bash
npm run bot:check
```

3. Start Telegram polling bot:

```bash
npm run bot
```

Then chat with your bot in Telegram (`@wildfactbot`).

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
