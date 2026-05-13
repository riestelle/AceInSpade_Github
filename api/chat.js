module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const keys = [
    process.env.GROQ_1,
    process.env.GROQ_2,
    process.env.GROQ_3,
    process.env.GROQ_4,
    process.env.GROQ_5,
  ].filter(Boolean);

  if (!keys.length) {
    return res.status(500).json({ error: 'Server configuration error: no API keys found. Contact the app owner.' });
  }

  let lastErr = null;
  for (const key of keys) {
    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify(req.body),
      });
      const data = await r.json();
      if (data.error) { lastErr = data.error.message; continue; }
      return res.status(200).json(data);
    } catch (e) { lastErr = e.message; }
  }
  res.status(500).json({ error: lastErr || 'Unknown error from Groq API' });
};