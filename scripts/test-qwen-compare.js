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
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'demo';
const priorUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2024-move-in/kitchen/cabinet-base-01.jpg`;
const currentUrl = `https://res.cloudinary.com/${cloudName}/image/upload/v1/properties/prop-381/insp-2026-move-out/kitchen/cabinet-base-03.jpg`;

const prompt = `Compare these two condition inspection photos of the kitchen (Prior Baseline vs Current Move-Out).
RULES:
1. Provide an objective, assistive visual comparison only.
2. NEVER use blame, fault, damage penalties, or financial deduction claims.
3. List visible variations observed between the prior baseline and current images.
4. Output ONLY valid JSON:
{
  "summary": string,
  "changes": [
    { "description": string, "confidence": number between 0 and 1 }
  ],
  "caveats": [string]
}`;

async function testCompare() {
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
            { type: 'image_url', image_url: { url: priorUrl } },
            { type: 'image_url', image_url: { url: currentUrl } }
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
    console.log('COMPARISON OUTPUT:', data.choices[0].message.content);
  } else {
    console.log('ERROR:', data);
  }
}

testCompare().catch(console.error);
