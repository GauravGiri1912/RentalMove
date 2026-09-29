const fs = require('fs');
if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...v] = trimmed.split('=');
      if (!process.env[k.trim()]) process.env[k.trim()] = v.join('=').trim();
    }
  }
}
const key = process.env.GROQ_API_KEY;
if (!key) throw new Error('GROQ_API_KEY not found in environment.');
const imgUrl = 'https://res.cloudinary.com/yxrdw0hc/image/upload/v1790679808/properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01.jpg';

const prompt = `You are an objective AI property inspection assistant. Inspect this rental property photo and output ONLY valid JSON matching this schema:
{
  "room_guess": "living_room" | "kitchen" | "bathroom" | "bedroom" | "exterior" | "unknown",
  "image_quality": "ok" | "blurry" | "too_dark" | "not_a_room",
  "observations": [
    {
      "category": "scratch" | "stain" | "crack" | "dent" | "mark" | "other",
      "sub_area": "string",
      "description": "neutral description of visible surface feature",
      "confidence": 0.85,
      "bbox": [0.1, 0.2, 0.4, 0.5]
    }
  ]
}
Rules:
1. Use neutral, objective language. Never assign fault, blame, deposit deductions, or tenant liability.
2. Return ONLY valid JSON.`;

async function main() {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + key,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imgUrl } }
          ]
        }
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.1
    })
  });
  const data = await res.json();
  console.log('STATUS:', res.status);
  if (data.choices) {
    console.log('CONTENT:', data.choices[0].message.content);
  } else {
    console.log('ERROR:', data);
  }
}

main().catch(console.error);
