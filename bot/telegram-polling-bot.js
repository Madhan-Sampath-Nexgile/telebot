const fs = require('node:fs');
const path = require('node:path');

function loadEnvFromFile() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pick(options) {
  if (!Array.isArray(options) || options.length === 0) return '';
  const index = Math.floor(Math.random() * options.length);
  return options[index];
}

function findAnimalInPrompt(prompt, animals) {
  for (const animal of animals) {
    const commonName = animal.commonName.toLowerCase();
    const scientific = animal.scientificName.toLowerCase();
    if (prompt.includes(commonName) || prompt.includes(scientific)) {
      return animal;
    }
  }
  return null;
}

function formatAnimalDetails(animal) {
  return [
    `Animal: ${animal.commonName}`,
    `Scientific Name: ${animal.scientificName}`,
    `Classification: ${animal.classification}`,
    `Habitat: ${animal.habitat}`,
    `Diet: ${animal.diet}`,
    `Average Lifespan: ${animal.averageLifespan}`,
    `Average Weight: ${animal.averageWeight}`,
    `Top Speed: ${animal.topSpeed}`,
    `Conservation Status: ${animal.conservationStatus}`,
    `Regions: ${animal.regions.join(', ')}`,
    `Traits: ${animal.traits.join('; ')}`,
    `Facts: ${animal.facts.join(' | ')}`
  ].join('\n');
}

function buildAnimalListReply(animals) {
  if (!animals.length) {
    return 'Animal dataset is empty. Add entries in public/data/animals.json.';
  }
  const names = animals.map((animal) => animal.commonName).join(', ');
  return `I can share full details for ${animals.length} animals:\n${names}\n\nTry: tell me about bengal tiger`;
}

function extractRequestedAnimalName(prompt) {
  const patterns = [
    /(?:tell me about|details of|full details of|info on|information on)\s+([a-z\s-]+)/,
    /what is\s+([a-z\s-]+)/,
    /about\s+([a-z\s-]+)/
  ];

  for (const pattern of patterns) {
    const match = prompt.match(pattern);
    if (match && match[1]) {
      const candidate = match[1].trim().replace(/\?+$/, '');
      if (candidate.length > 1) return candidate;
    }
  }
  return null;
}

function buildMissingAnimalReply(requestedAnimal, animals) {
  const suggestions = animals
    .slice(0, 8)
    .map((animal) => animal.commonName)
    .join(', ');
  return [
    `I do not have full data for "${requestedAnimal}" yet.`,
    'You can add it in public/data/animals.json.',
    `Available examples: ${suggestions}.`
  ].join('\n');
}

function buildReply(prompt, config, animals) {
  const normalized = prompt.toLowerCase();

  if (['/start', 'start', 'hello', 'hi', 'hey'].some((word) => normalized.includes(word))) {
    return `${pick(config.greetings)}\n\nCommands:\n- list animals\n- random animal\n- tell me about <animal>`;
  }

  if (
    ['list animals', 'animal list', '/list'].some((phrase) => normalized.includes(phrase))
  ) {
    return buildAnimalListReply(animals);
  }

  if (['random animal', '/random'].some((phrase) => normalized.includes(phrase))) {
    if (!animals.length) return 'Animal dataset is empty.';
    return formatAnimalDetails(pick(animals));
  }

  const animal = findAnimalInPrompt(normalized, animals);
  if (animal) return formatAnimalDetails(animal);

  const requestedAnimal = extractRequestedAnimalName(normalized);
  if (requestedAnimal) return buildMissingAnimalReply(requestedAnimal, animals);

  for (const intent of config.intents || []) {
    if ((intent.contains || []).some((word) => normalized.includes(String(word).toLowerCase()))) {
      return pick(intent.responses);
    }
  }

  return `${pick(config.fallback)}\n\nTry: list animals`;
}

async function telegramCall(token, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `Telegram ${method} failed with status ${response.status}`);
  }

  return data;
}

async function checkBot(token) {
  const me = await telegramCall(token, 'getMe', {});
  const user = me.result;
  console.log(`Connected as @${user.username} (${user.first_name})`);
}

async function run() {
  loadEnvFromFile();

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN in .env');
  }

  const root = process.cwd();
  const configPath = path.resolve(root, 'public/data/bot-config.json');
  const animalsPath = path.resolve(root, 'public/data/animals.json');
  const config = readJson(configPath);
  const animals = readJson(animalsPath);

  if (process.argv.includes('--check')) {
    await checkBot(token);
    return;
  }

  console.log('Telegram polling bot started.');
  console.log('Send a message to your bot in Telegram to receive responses.');

  let offset = 0;
  while (true) {
    try {
      const updates = await telegramCall(token, 'getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message']
      });

      for (const update of updates.result || []) {
        offset = update.update_id + 1;
        const message = update.message;
        if (!message || typeof message.text !== 'string') continue;

        const reply = buildReply(message.text, config, animals);
        await telegramCall(token, 'sendMessage', {
          chat_id: message.chat.id,
          text: reply
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Polling error: ${message}`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
