import type { CloudflareEnv } from "../types/env.js";

/**
 * Multilingual translation service.
 *
 * Loop targets multilingual African audiences.
 * This service translates room titles, AI summaries, and commentary
 * into the user's preferred language.
 *
 * Supported (planned):
 *  English, Hausa, Yoruba, Igbo, Swahili, Amharic, Zulu,
 *  Afrikaans, French, Portuguese, Arabic
 *
 * Powered by:
 *  - Workers AI (@cf/meta/m2m100-1.2b) — free, low latency, on-edge
 *  - Tencent Translation (TENCENT_API_KEY) — fallback for rare pairs
 */

export interface TranslationRequest {
  text: string;
  sourceLang: string;
  targetLang: string;
}

export interface TranslationResult {
  translated: string;
  sourceLang: string;
  targetLang: string;
  provider: "workers-ai" | "tencent" | "passthrough";
}

const PASSTHROUGH_LANGS = new Set(["en"]);

/**
 * Translate a piece of text to the target language.
 * Returns original text unchanged if source === target.
 */
export async function translate(
  env: CloudflareEnv,
  req: TranslationRequest,
): Promise<TranslationResult> {
  if (req.sourceLang === req.targetLang || PASSTHROUGH_LANGS.has(req.targetLang)) {
    return { translated: req.text, sourceLang: req.sourceLang, targetLang: req.targetLang, provider: "passthrough" };
  }

  const cacheKey = `tx:${req.targetLang}:${hashText(req.text)}`;
  const cached = await env.CACHE.get(cacheKey);
  if (cached) return { translated: cached, sourceLang: req.sourceLang, targetLang: req.targetLang, provider: "workers-ai" };

  // TODO: implement Workers AI translation
  // const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
  //   text: req.text,
  //   source_lang: req.sourceLang,
  //   target_lang: req.targetLang,
  // });
  // const translated = result.translated_text;

  const translated = req.text; // placeholder — returns original until wired
  await env.CACHE.put(cacheKey, translated, { expirationTtl: 3600 });

  return { translated, sourceLang: req.sourceLang, targetLang: req.targetLang, provider: "workers-ai" };
}

function hashText(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
