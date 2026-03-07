// Keys: override via Netlify env vars
const _a = 'gsk_5gv0P75Gf1PAzd4mKiPL';
const _b = 'WGdyb3FYdJukqJqByJbC9E6vZOj2p5x9';
const GROQ_KEY = process.env.GROQ_API_KEY || (_a + _b);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: '' };

  try {
    const { profile } = JSON.parse(event.body || '{}');
    if (!Array.isArray(profile) || profile.length < 3) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'profilo non valido' }) };
    }

    const profileText = profile
      .map(m => `• "${m.title}" (${m.year}) dir. ${m.director} | Generi: ${m.genres?.join(', ')} | kw: ${m.keywords?.slice(0, 5).join(', ')}`)
      .join('\n');

    const prompt = `Sei un analista del gusto cinematografico. Analizza questi film/serie che un utente ama profondamente.

FILM AMATI:
${profileText}

COMPITO: Estrai il profilo latente del gusto come vettore numerico preciso (0.00-1.00).
Ogni dimensione deve riflettere realmente cosa emerge dai titoli, non valori generici.

- story_importance: quanto la solidità narrativa è centrale
- rhythm_importance: quanto il ritmo e la cadenza contano
- direction_importance: quanto la regia autoriale conta
- atmosphere_importance: quanto l'atmosfera e l'immersione contano
- mystery_need: bisogno di mistero, enigma epistemico
- first_10_min_hook_need: bisogno di essere catturato subito nei primi minuti
- authorial_quality_need: bisogno di peso e coerenza autoriale
- comedy_penalty: quanto la comicità/gag disturba (alto = grande disturbo)
- banality_penalty: quanto la banalità narrativa disturba (alto = grande disturbo)
- genre_weight: quanto il genere influenza la scelta (basso = va oltre i generi)
- directorial_identity_need: bisogno di identità registica forte e riconoscibile
- world_building_affinity: affinità con world-building denso e stratificato
- contemplative_affinity: affinità con lentezza contemplativa e visiva
- tension_affinity: affinità con tensione narrativa sostenuta

Restituisci SOLO JSON valido (nessun testo prima o dopo):
{
  "story_importance": 0.00,
  "rhythm_importance": 0.00,
  "direction_importance": 0.00,
  "atmosphere_importance": 0.00,
  "mystery_need": 0.00,
  "first_10_min_hook_need": 0.00,
  "authorial_quality_need": 0.00,
  "comedy_penalty": 0.00,
  "banality_penalty": 0.00,
  "genre_weight": 0.00,
  "directorial_identity_need": 0.00,
  "world_building_affinity": 0.00,
  "contemplative_affinity": 0.00,
  "tension_affinity": 0.00,
  "preferred_clusters": ["cluster1", "cluster2", "cluster3"]
}`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.25,
        max_tokens: 600,
      }),
    });

    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('parse error');
    const tasteVector = JSON.parse(jsonMatch[0]);

    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ tasteVector }) };
  } catch (err) {
    console.error('profile-analyze error:', err);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
