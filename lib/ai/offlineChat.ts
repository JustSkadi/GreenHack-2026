import { initLlama, LlamaContext } from 'llama.rn';
import * as FileSystem from 'expo-file-system';

let context: LlamaContext | null = null;

const MODEL_PATH = `${FileSystem.documentDirectory}models/gemma-2-2b-it-Q4_K_M.gguf`;

const CRISIS_SYSTEM_PROMPT = `You are an offline emergency assistant. Answer only about:
first aid (CPR, Heimlich maneuver, hypothermia, bleeding), blackout survival,
water purification, and evacuation. Be brief and give step-by-step instructions.`;

export async function loadOfflineModel(): Promise<void> {
  const info = await FileSystem.getInfoAsync(MODEL_PATH);
  if (!info.exists) throw new Error('Gemma model file not found. Download it during online mode.');

  context = await initLlama({
    model: MODEL_PATH,
    n_ctx: 1024,
    n_threads: 4,
  });
}

export function isModelLoaded(): boolean {
  return context !== null;
}

export async function askOffline(message: string): Promise<string> {
  if (!context) throw new Error('Model not loaded');

  const result = await context.completion({
    prompt: `<start_of_turn>user\n${CRISIS_SYSTEM_PROMPT}\n\n${message}<end_of_turn>\n<start_of_turn>model\n`,
    n_predict: 200,
    temperature: 0.3,
    stop: ['<end_of_turn>'],
  });

  return result.text.trim();
}
