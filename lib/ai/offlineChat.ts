/**
 * OFFLINE CHAT — currently uses Groq (cloud) as a stand-in for a local model.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO SWAP TO A REAL LOCAL MODEL (llama.rn + Gemma 2 2B)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Prerequisites:
 *   1. You need a custom dev build (NOT Expo Go) — run:
 *        npx eas-cli build --profile development --platform android
 *      because llama.rn is a native module unavailable in Expo Go.
 *
 *   2. Download the model file (≈1.5 GB) from Hugging Face:
 *        https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q5_K_M.gguf
 *      Place it at:  <app documentDirectory>/models/gemma-2-2b-it-Q5_K_M.gguf
 *      OR use the in-app download helper (see downloadOfflineModel below).
 *
 *   3. Replace this file's content with:
 *
 *        import { initLlama, LlamaContext } from 'llama.rn';
 *        import * as FileSystem from 'expo-file-system/legacy';
 *
 *        let context: LlamaContext | null = null;
 *        const MODEL_PATH = `${FileSystem.documentDirectory}models/gemma-2-2b-it-Q5_K_M.gguf`;
 *
 *        export async function loadOfflineModel() {
 *          const { exists } = await FileSystem.getInfoAsync(MODEL_PATH);
 *          if (!exists) throw new Error('Model file not found.');
 *          context = await initLlama({ model: MODEL_PATH, n_ctx: 1024, n_threads: 4 });
 *        }
 *
 *        export async function askOffline(message: string): Promise<string> {
 *          if (!context) await loadOfflineModel();
 *          const result = await context!.completion({
 *            prompt: `<start_of_turn>user\n${OFFLINE_SYSTEM_PROMPT}\n\n${message}<end_of_turn>\n<start_of_turn>model\n`,
 *            n_predict: 200,
 *            temperature: 0.3,
 *            stop: ['<end_of_turn>'],
 *          });
 *          return result.text.trim();
 *        }
 *
 *   4. Add to package.json dependencies:  "llama.rn": "^0.x.x"
 *      and rebuild the dev client.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const OFFLINE_SYSTEM_PROMPT = `You are Nexus Offline — a crisis survival assistant operating under the assumption that:
- There is NO working internet or mobile network
- Emergency services (112/911) may be unreachable or overwhelmed
- The user must act with what they have RIGHT NOW

You answer ONLY about the following survival domains:
1. First aid: CPR (30:2 ratio, 5 cm depth, 100-120/min), Heimlich maneuver, tourniquet application, wound packing, burn treatment, hypothermia, stroke recognition, diabetic emergencies
2. Blackout survival: food safety timelines (fridge 4h, freezer 48h), safe heating alternatives, carbon monoxide risk, battery/generator safety
3. Water: boiling (1 min rolling boil), bleach purification (8 drops/liter, 30 min wait), improvised filtration
4. Food: identifying spoilage, foraging basics, caloric priorities for multi-day survival
5. Shelter and warmth: insulation layering, improvised shelter, fire safety indoors
6. Evacuation: go-bag essentials, on-foot navigation without GPS, group coordination signals

Response rules:
- First line: what to do RIGHT NOW (one sentence, imperative)
- Then: numbered steps with specific values (amounts, times, distances)
- Flag life-threatening signs explicitly: "CALL FOR HELP if you have any signal"
- No prose paragraphs — lists only
- Respond in the same language the user writes in (Polish, Czech, English, Slovak)
- Never say "consult a doctor" — assume no doctor is available`;

export async function askOffline(message: string): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: OFFLINE_SYSTEM_PROMPT },
        { role: 'user',   content: message },
      ],
      max_tokens: 300,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('429');
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.choices[0].message.content.trim();
}
