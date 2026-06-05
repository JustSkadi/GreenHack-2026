import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const SYSTEM_PROMPT = `You are a crisis preparedness assistant for Nexus.
Help users prepare for and respond to emergencies: blackouts, floods, earthquakes, medical emergencies.
Be concise, practical, and calm. Prioritize life safety above all else.
When uncertain or for life-threatening situations, always direct users to call 112.`;

export async function askOnline(userMessage: string): Promise<string> {
  const chat = model.startChat({
    history: [
      { role: 'user',  parts: [{ text: SYSTEM_PROMPT }] },
      { role: 'model', parts: [{ text: 'Understood. I am ready to assist.' }] },
    ],
  });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}
