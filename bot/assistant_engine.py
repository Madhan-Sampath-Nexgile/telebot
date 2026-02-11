import json
import os
import re
from pathlib import Path
from typing import Callable, Dict, List, Optional

import requests


Animal = Dict[str, object]
Config = Dict[str, object]


def load_knowledge(root_dir: str) -> tuple[Config, List[Animal]]:
  root = Path(root_dir)
  with (root / "public" / "data" / "bot-config.json").open("r", encoding="utf-8") as handle:
    config = json.load(handle)
  with (root / "public" / "data" / "animals.json").open("r", encoding="utf-8") as handle:
    animals = json.load(handle)
  return config, animals


def _pick(options: List[str]) -> str:
  if not options:
    return ""
  index = int(os.urandom(1)[0]) % len(options)
  return options[index]


def _matches_any(text: str, words: List[str]) -> bool:
  return any(word in text for word in words)


def _find_animals_in_prompt(prompt: str, animals: List[Animal]) -> List[Animal]:
  matches: List[Animal] = []
  for animal in animals:
    common_name = str(animal.get("commonName", "")).lower()
    scientific_name = str(animal.get("scientificName", "")).lower()
    if common_name and (common_name in prompt or scientific_name in prompt):
      matches.append(animal)
  return matches


def _extract_requested_animal_name(prompt: str) -> Optional[str]:
  patterns = [
    r"(?:tell me about|details of|full details of|info on|information on)\s+([a-z\s-]+)",
    r"what is\s+([a-z\s-]+)",
    r"about\s+([a-z\s-]+)",
  ]
  for pattern in patterns:
    match = re.search(pattern, prompt)
    if not match:
      continue
    candidate = match.group(1).strip().rstrip("?")
    if len(candidate) > 1:
      return candidate
  return None


def _format_animal_details(animal: Animal) -> str:
  regions = ", ".join(animal.get("regions", []))
  traits = "; ".join(animal.get("traits", []))
  facts = " | ".join(animal.get("facts", []))
  lines = [
    f"Animal: {animal.get('commonName', '')}",
    f"Scientific Name: {animal.get('scientificName', '')}",
    f"Classification: {animal.get('classification', '')}",
    f"Habitat: {animal.get('habitat', '')}",
    f"Diet: {animal.get('diet', '')}",
    f"Average Lifespan: {animal.get('averageLifespan', '')}",
    f"Average Weight: {animal.get('averageWeight', '')}",
    f"Top Speed: {animal.get('topSpeed', '')}",
    f"Conservation Status: {animal.get('conservationStatus', '')}",
    f"Regions: {regions}",
    f"Traits: {traits}",
    f"Facts: {facts}",
  ]
  return "\n".join(lines)


def _build_missing_animal_reply(requested_animal: str, animals: List[Animal]) -> str:
  suggestions = ", ".join(str(animal.get("commonName", "")) for animal in animals[:8])
  return "\n".join(
    [
      f'I do not have full data for "{requested_animal}" yet.',
      "You can add it in public/data/animals.json.",
      f"Available examples: {suggestions}.",
    ]
  )


Category = Dict[str, object]


def _resolve_category_query(prompt: str) -> Optional[Category]:
  categories: List[Category] = [
    {
      "key": "snake",
      "aliases": ["snake", "snakes"],
      "test": lambda a: (
        "snake" in str(a.get("commonName", "")).lower()
        or "cobra" in str(a.get("commonName", "")).lower()
        or "python" in str(a.get("commonName", "")).lower()
        or "viper" in str(a.get("commonName", "")).lower()
        or "mamba" in str(a.get("commonName", "")).lower()
        or "anaconda" in str(a.get("commonName", "")).lower()
        or "serpentes" in str(a.get("scientificName", "")).lower()
      ),
    },
    {
      "key": "bird",
      "aliases": ["bird", "birds"],
      "test": lambda a: str(a.get("classification", "")).lower() == "bird",
    },
    {
      "key": "mammal",
      "aliases": ["mammal", "mammals"],
      "test": lambda a: str(a.get("classification", "")).lower() == "mammal",
    },
    {
      "key": "reptile",
      "aliases": ["reptile", "reptiles"],
      "test": lambda a: str(a.get("classification", "")).lower() == "reptile",
    },
    {
      "key": "amphibian",
      "aliases": ["amphibian", "amphibians", "frog", "frogs"],
      "test": lambda a: str(a.get("classification", "")).lower() == "amphibian",
    },
    {
      "key": "fish",
      "aliases": ["fish", "fishes", "shark", "sharks"],
      "test": lambda a: (
        str(a.get("classification", "")).lower() == "fish"
        or "shark" in str(a.get("commonName", "")).lower()
      ),
    },
    {
      "key": "insect",
      "aliases": ["insect", "insects", "bee", "bees"],
      "test": lambda a: str(a.get("classification", "")).lower() == "insect",
    },
  ]

  for category in categories:
    aliases = category["aliases"]
    if any(alias in prompt for alias in aliases):
      return category
  return None


def _build_group_overview(category_key: str) -> str:
  if category_key == "snake":
    return "\n".join(
      [
        "Snakes are legless reptiles (suborder Serpentes).",
        "They are carnivorous and swallow prey whole because their jaws are highly flexible.",
        "Most species are non-venomous; some use venom for hunting and defense.",
      ]
    )
  return ""


def _build_category_reply(category: Category, animals: List[Animal]) -> Optional[str]:
  test_func: Callable[[Animal], bool] = category["test"]  # type: ignore[assignment]
  matches = [animal for animal in animals if test_func(animal)]
  if not matches:
    return None

  overview = _build_group_overview(str(category["key"]))
  entries = "\n".join(
    [
      f"- {animal.get('commonName', '')}: {animal.get('habitat', '')}; "
      f"diet: {animal.get('diet', '')}; status: {animal.get('conservationStatus', '')}"
      for animal in matches
    ]
  )
  key = str(category["key"])
  heading = f"{key[:1].upper() + key[1:]} entries in my dataset:"
  return "\n".join(
    [part for part in [overview, "", heading, entries, "", f'Ask: "tell me about {str(matches[0].get("commonName", "")).lower()}".'] if part]
  )


def build_rule_reply(prompt: str, config: Config, animals: List[Animal]) -> str:
  normalized = prompt.lower()

  if _matches_any(normalized, ["/start", "start", "hello", "hi", "hey"]):
    greetings = config.get("greetings", [])
    return f"{_pick(greetings)}\n\nCommands:\n- list animals\n- random animal\n- tell me about <animal>"

  if _matches_any(normalized, ["list animals", "animal list", "/list"]):
    names = ", ".join(str(animal.get("commonName", "")) for animal in animals)
    return f"I can share full details for {len(animals)} animals:\n{names}\n\nTry: tell me about bengal tiger"

  if _matches_any(normalized, ["random animal", "/random"]):
    if not animals:
      return "Animal dataset is empty."
    return _format_animal_details(_pick(animals))

  category = _resolve_category_query(normalized)
  if category:
    category_reply = _build_category_reply(category, animals)
    if category_reply:
      return category_reply

  matches = _find_animals_in_prompt(normalized, animals)
  if len(matches) == 1:
    return _format_animal_details(matches[0])
  if len(matches) > 1:
    names = ", ".join(str(animal.get("commonName", "")) for animal in matches)
    return f"I found multiple animals in your request: {names}. Ask one at a time for full detail."

  requested = _extract_requested_animal_name(normalized)
  if requested:
    return _build_missing_animal_reply(requested, animals)

  intents = config.get("intents", [])
  for intent in intents:
    contains = intent.get("contains", [])
    if any(str(word).lower() in normalized for word in contains):
      return _pick(intent.get("responses", []))

  return f"{_pick(config.get('fallback', []))}\n\nTry: list animals"


def _build_ai_prompt(user_prompt: str, matched_animals: List[Animal], all_animals: List[Animal]) -> str:
  available_names = ", ".join(str(a.get("commonName", "")) for a in all_animals)
  if matched_animals:
    focused_data = json.dumps(matched_animals, indent=2)
  else:
    focused_data = json.dumps(
      {"availableAnimals": [a.get("commonName", "") for a in all_animals[:40]]},
      indent=2,
    )

  return "\n".join(
    [
      "You are WildFact, an animal expert assistant.",
      "Rules:",
      "- Prefer the provided dataset when available.",
      "- If requested animal is missing from dataset, you may answer from general zoology knowledge.",
      "- Clearly mention when an answer is from general knowledge, not local dataset.",
      "- Be concise, accurate, and engaging.",
      "",
      f"Available animals: {available_names}",
      "",
      "Focused dataset context:",
      focused_data,
      "",
      f"User question: {user_prompt}",
      "Return a direct helpful answer.",
    ]
  )


def _call_huggingface_router(prompt: str, model: str, token: str, base_url: str) -> str:
  if not token:
    raise RuntimeError("Missing HF_TOKEN for Hugging Face provider.")
  response = requests.post(
    f"{base_url.rstrip('/')}/chat/completions",
    headers={
      "content-type": "application/json",
      "authorization": f"Bearer {token}",
    },
    json={
      "model": model,
      "messages": [{"role": "user", "content": prompt}],
      "temperature": 0.3,
    },
    timeout=120,
  )
  response.raise_for_status()
  payload = response.json()
  content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
  if isinstance(content, str):
    return content.strip()
  if isinstance(content, list):
    text_parts = []
    for item in content:
      if isinstance(item, str):
        text_parts.append(item)
      elif isinstance(item, dict):
        text_parts.append(str(item.get("text", "")))
    return "".join(text_parts).strip()
  return ""


def _call_ollama(prompt: str, model: str, base_url: str) -> str:
  response = requests.post(
    f"{base_url.rstrip('/')}/api/generate",
    json={
      "model": model,
      "prompt": prompt,
      "stream": False,
      "options": {"temperature": 0.3},
    },
    timeout=120,
  )
  response.raise_for_status()
  return str(response.json().get("response", "")).strip()


def generate_reply_with_qwen(prompt: str, config: Config, animals: List[Animal], use_ai: bool = True) -> str:
  fallback = build_rule_reply(prompt, config, animals)
  if not use_ai:
    return fallback

  provider = os.getenv("MODEL_PROVIDER", "huggingface").lower()
  normalized = prompt.lower()
  if _matches_any(normalized, ["list animals", "animal list", "/list", "random animal", "/random"]):
    return fallback

  matched_animals = _find_animals_in_prompt(normalized, animals)
  ai_prompt = _build_ai_prompt(prompt, matched_animals, animals)

  try:
    if provider == "ollama":
      model = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
      base_url = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
      reply = _call_ollama(ai_prompt, model, base_url)
    else:
      model = os.getenv("HF_MODEL", "Qwen/Qwen2.5-7B-Instruct:together")
      token = os.getenv("HF_TOKEN", "")
      base_url = os.getenv("HF_BASE_URL", "https://router.huggingface.co/v1")
      reply = _call_huggingface_router(ai_prompt, model, token, base_url)

    return reply or fallback
  except Exception:
    return fallback
