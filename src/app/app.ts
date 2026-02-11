import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

interface BotIntent {
  contains: string[];
  responses: string[];
}

interface BotConfig {
  botName: string;
  telegramUsername?: string;
  greetings: string[];
  fallback: string[];
  intents: BotIntent[];
}

interface AnimalProfile {
  commonName: string;
  scientificName: string;
  classification: string;
  habitat: string;
  diet: string;
  averageLifespan: string;
  averageWeight: string;
  topSpeed: string;
  conservationStatus: string;
  regions: string[];
  traits: string[];
  facts: string[];
}

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  at: string;
}

interface ChatApiResponse {
  ok: boolean;
  reply?: string;
}

interface AnimalCategory {
  key: string;
  aliases: string[];
  test: (animal: AnimalProfile) => boolean;
}

const HISTORY_STORAGE_KEY = 'telebot_chat_history_json';

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App implements OnInit {
  protected readonly title = signal('WildFact Bot Studio');
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly pending = signal(false);
  protected readonly botName = signal('TeleBot');
  protected telegramUsernameInput = '';
  protected readonly telegramJoinLink = signal('');
  protected readonly telegramQrUrl = signal('');

  protected prompt = '';

  private botConfig: BotConfig | null = null;
  private animals: AnimalProfile[] = [];

  constructor(private readonly http: HttpClient) {}

  async ngOnInit(): Promise<void> {
    await this.loadBotConfig();
    await this.loadAnimals();
    await this.loadInitialHistory();
  }

  protected async sendMessage(): Promise<void> {
    const prompt = this.prompt.trim();
    if (!prompt) return;

    this.prompt = '';
    this.appendMessage({
      role: 'user',
      text: prompt,
      at: new Date().toISOString()
    });

    this.pending.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<ChatApiResponse>('/api/chat', {
          prompt
        })
      );

      const reply = response.reply?.trim() || this.generateReply(prompt);
      this.appendMessage({
        role: 'bot',
        text: reply,
        at: new Date().toISOString()
      });
    } catch {
      const fallbackReply = this.generateReply(prompt);
      this.appendMessage({
        role: 'bot',
        text: `${fallbackReply}\n\n(Using local fallback. Start AI server with: npm run start:api)`,
        at: new Date().toISOString()
      });
    } finally {
      this.pending.set(false);
    }
  }

  protected clearHistory(): void {
    this.messages.set([]);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  protected exportHistory(): void {
    const payload = JSON.stringify(this.messages(), null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'chat-history.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected async importHistory(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as ChatMessage[];
      if (!Array.isArray(parsed)) {
        throw new Error('Invalid JSON array.');
      }

      const sanitized = parsed.filter(
        (item) =>
          (item?.role === 'user' || item?.role === 'bot') &&
          typeof item?.text === 'string' &&
          typeof item?.at === 'string'
      );
      this.messages.set(sanitized);
      this.persistHistory();
    } catch {
      this.appendMessage({
        role: 'bot',
        text: 'Import failed. Upload a valid chat-history JSON file.',
        at: new Date().toISOString()
      });
    } finally {
      input.value = '';
    }
  }

  private async loadBotConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(this.http.get<BotConfig>('/data/bot-config.json'));
      this.botConfig = config;
      this.botName.set(config.botName);
      this.setTelegramUsername(config.telegramUsername || '');
    } catch {
      this.botConfig = {
        botName: 'TeleBot',
        telegramUsername: '',
        greetings: ['Hello.'],
        fallback: ['I did not understand that.'],
        intents: []
      };
      this.setTelegramUsername('');
    }
  }

  private async loadAnimals(): Promise<void> {
    try {
      this.animals = await firstValueFrom(this.http.get<AnimalProfile[]>('/data/animals.json'));
    } catch {
      this.animals = [];
    }
  }

  private async loadInitialHistory(): Promise<void> {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      try {
        this.messages.set(JSON.parse(saved) as ChatMessage[]);
        return;
      } catch {
        localStorage.removeItem(HISTORY_STORAGE_KEY);
      }
    }

    try {
      const seeded = await firstValueFrom(this.http.get<ChatMessage[]>('/data/chat-history.json'));
      this.messages.set(seeded);
      this.persistHistory();
    } catch {
      this.messages.set([]);
    }
  }

  private appendMessage(message: ChatMessage): void {
    this.messages.update((value) => [...value, message]);
    this.persistHistory();
  }

  private persistHistory(): void {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.messages()));
  }

  private generateReply(prompt: string): string {
    const config = this.botConfig;
    if (!config) return 'Bot config not loaded.';

    const normalized = prompt.toLowerCase();

    if (this.matchesAny(normalized, ['hello', 'hi', 'hey', 'start'])) {
      return this.pick(config.greetings);
    }

    if (this.matchesAny(normalized, ['list animals', 'animal list', 'show animals'])) {
      return this.buildAnimalListReply();
    }

    if (this.matchesAny(normalized, ['random animal', 'suggest an animal'])) {
      return this.buildRandomAnimalReply();
    }

    const category = this.resolveCategoryQuery(normalized);
    if (category) {
      const categoryReply = this.buildCategoryReply(category);
      if (categoryReply) return categoryReply;
    }

    const animal = this.findAnimalInPrompt(normalized);
    if (animal) {
      return this.formatAnimalDetails(animal);
    }

    const requestedAnimal = this.extractRequestedAnimalName(normalized);
    if (requestedAnimal) {
      return this.buildMissingAnimalReply(requestedAnimal);
    }

    for (const intent of config.intents) {
      if (intent.contains.some((word) => normalized.includes(word.toLowerCase()))) {
        return this.pick(intent.responses);
      }
    }

    return `${this.pick(config.fallback)}\n\nTry: "list animals", "random animal", or "tell me about tiger".`;
  }

  private findAnimalInPrompt(prompt: string): AnimalProfile | null {
    for (const animal of this.animals) {
      const commonName = animal.commonName.toLowerCase();
      const scientific = animal.scientificName.toLowerCase();
      if (prompt.includes(commonName) || prompt.includes(scientific)) {
        return animal;
      }
    }
    return null;
  }

  private buildAnimalListReply(): string {
    if (!this.animals.length) {
      return 'Animal dataset is empty. Add entries in public/data/animals.json.';
    }

    const names = this.animals.map((animal) => animal.commonName).join(', ');
    return `I can share full details for ${this.animals.length} animals:\n${names}\n\nAsk: "tell me about panda".`;
  }

  private buildRandomAnimalReply(): string {
    if (!this.animals.length) {
      return 'Animal dataset is empty. Add entries in public/data/animals.json.';
    }

    const animal = this.animals[Math.floor(Math.random() * this.animals.length)];
    return this.formatAnimalDetails(animal);
  }

  private formatAnimalDetails(animal: AnimalProfile): string {
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

  private buildMissingAnimalReply(requestedAnimal: string): string {
    const suggestions = this.animals
      .slice(0, 8)
      .map((animal) => animal.commonName)
      .join(', ');
    return [
      `I do not have full data for "${requestedAnimal}" yet.`,
      'You can add it in public/data/animals.json.',
      `Available examples: ${suggestions}.`
    ].join('\n');
  }

  private resolveCategoryQuery(prompt: string): AnimalCategory | null {
    const categories: AnimalCategory[] = [
      {
        key: 'snake',
        aliases: ['snake', 'snakes'],
        test: (animal) =>
          animal.commonName.toLowerCase().includes('snake') ||
          animal.commonName.toLowerCase().includes('cobra') ||
          animal.commonName.toLowerCase().includes('python') ||
          animal.commonName.toLowerCase().includes('viper') ||
          animal.commonName.toLowerCase().includes('mamba') ||
          animal.commonName.toLowerCase().includes('anaconda') ||
          animal.scientificName.toLowerCase().includes('serpentes')
      },
      {
        key: 'bird',
        aliases: ['bird', 'birds'],
        test: (animal) => animal.classification.toLowerCase() === 'bird'
      },
      {
        key: 'mammal',
        aliases: ['mammal', 'mammals'],
        test: (animal) => animal.classification.toLowerCase() === 'mammal'
      },
      {
        key: 'reptile',
        aliases: ['reptile', 'reptiles'],
        test: (animal) => animal.classification.toLowerCase() === 'reptile'
      },
      {
        key: 'amphibian',
        aliases: ['amphibian', 'amphibians', 'frog', 'frogs'],
        test: (animal) => animal.classification.toLowerCase() === 'amphibian'
      },
      {
        key: 'fish',
        aliases: ['fish', 'fishes', 'shark', 'sharks'],
        test: (animal) =>
          animal.classification.toLowerCase() === 'fish' ||
          animal.commonName.toLowerCase().includes('shark')
      },
      {
        key: 'insect',
        aliases: ['insect', 'insects', 'bee', 'bees'],
        test: (animal) => animal.classification.toLowerCase() === 'insect'
      }
    ];

    return categories.find((category) => category.aliases.some((alias) => prompt.includes(alias))) || null;
  }

  private buildCategoryReply(category: AnimalCategory): string | null {
    const matches = this.animals.filter((animal) => category.test(animal));
    if (!matches.length) return null;

    const overview =
      category.key === 'snake'
        ? [
            'Snakes are legless reptiles (suborder Serpentes).',
            'They are carnivorous and swallow prey whole because their jaws are highly flexible.',
            'Most species are non-venomous; some use venom for hunting and defense.'
          ].join('\n')
        : '';

    const entries = matches
      .map(
        (animal) =>
          `- ${animal.commonName}: ${animal.habitat}; diet: ${animal.diet}; status: ${animal.conservationStatus}`
      )
      .join('\n');

    return [overview, '', `${category.key[0].toUpperCase() + category.key.slice(1)} entries in my dataset:`, entries, '', `Ask: "tell me about ${matches[0].commonName.toLowerCase()}".`]
      .filter(Boolean)
      .join('\n');
  }

  private extractRequestedAnimalName(prompt: string): string | null {
    const patterns = [
      /(?:tell me about|details of|full details of|info on|information on)\s+([a-z\s-]+)/,
      /what is\s+([a-z\s-]+)/,
      /about\s+([a-z\s-]+)/
    ];

    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match?.[1]) {
        const candidate = match[1].trim().replace(/\?+$/, '');
        if (candidate.length > 1) return candidate;
      }
    }
    return null;
  }

  private matchesAny(text: string, words: string[]): boolean {
    return words.some((word) => text.includes(word));
  }

  private pick(options: string[]): string {
    if (!options.length) return '';
    const index = Math.floor(Math.random() * options.length);
    return options[index];
  }

  protected applyTelegramUsername(): void {
    this.setTelegramUsername(this.telegramUsernameInput);
  }

  protected hasValidTelegramUsername(): boolean {
    return !!this.telegramJoinLink();
  }

  private setTelegramUsername(input: string): void {
    const cleaned = input.trim().replace(/^@+/, '');
    this.telegramUsernameInput = cleaned;

    if (!cleaned) {
      this.telegramJoinLink.set('');
      this.telegramQrUrl.set('');
      return;
    }

    const link = `https://t.me/${cleaned}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
    this.telegramJoinLink.set(link);
    this.telegramQrUrl.set(qrUrl);
  }
}
