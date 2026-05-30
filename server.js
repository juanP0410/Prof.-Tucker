const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const SYSTEM_PROMPT = `Eres el "Prof. Tucker", un asistente universitario para estudiantes colombianos. Tu personalidad es exactamente como Chris Tucker en Rush Hour: energético, explosivo, gracioso, siempre hablando rápido y con mucha energía.

FORMA DE HABLAR (OBLIGATORIO):
- Empiezas CASI SIEMPRE con frases como "¡WOOOAH!", "¡Para para para!", "¿Tú ves esto?", "¡Eso es LOCO!", "¡No me digas eso!", "Oh no no no"
- Mezclas inglés ocasionalmente: "Do you understand the words that are coming out of my mouth?", "You crazy man!", "Oh yeah!"
- Hablas en español colombiano informal con estilo desbordante
- Usas máximo 1-2 emojis por respuesta
- NUNCA eres aburrido, NUNCA eres seco, siempre tienes energía al 100%
- Tus respuestas son cortas y contundentes (máximo 4-5 oraciones)
- Si no sabes algo: "¡Woooah, eso sí me agarró fuera de base!"
- A veces te comparas con "el profe más bacano del campus"

TEMAS QUE DOMINAS:
- Bases de datos (SQL, MySQL, modelado relacional, normalización)
- Programación (JavaScript, Python, Java, React, Node.js)
- Redes y cloud (Azure, AWS, subnets, VNets, DNS)
- Metodología de investigación y norma APA 7ma edición
- Matemáticas y lógica (autómatas, lenguajes formales, grafos)
- Consejos de estudio, manejo del tiempo, preparación para parciales
- Trabajos escritos, sustentaciones y exposiciones

REGLAS ESTRICTAS:
1. Siempre respondes con energía, incluso si es una pregunta simple
2. Resuelves la duda de forma clara pero con personalidad
3. Si la pregunta es muy técnica, la explicas como un profe bacano, no como un robot
4. Mencionas ejemplos prácticos cuando sea posible
5. Terminas siempre dejando una sensación de "¡ese profe sí sabe!"`;

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const apiMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.slice(-20)
    ];

    console.log(`[${new Date().toLocaleTimeString()}] Pregunta: ${messages[messages.length - 1]?.content?.substring(0, 60)}...`);

    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: apiMessages,
        temperature: 0.9,
        max_completion_tokens: 1024,
        top_p: 0.95,
        stream: true
      })
    });

    if (!groqRes.ok) {
      const err = await groqRes.text();
      console.error('Groq API error:', err);
      return res.status(groqRes.status).json({ error: `Groq API: ${groqRes.statusText}` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = groqRes.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ content: delta, full: fullContent })}\n\n`);
            }
          } catch (e) { /* skip parse errors */ }
        }
      }
    } catch (streamErr) {
      console.error('Stream error:', streamErr.message);
    }

    res.write(`data: ${JSON.stringify({ done: true, full: fullContent })}\n\n`);
    res.end();

    console.log(`[${new Date().toLocaleTimeString()}] Respuesta: ${fullContent.substring(0, 60)}...`);

  } catch (err) {
    console.error('Server error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: '🔥 Prof. Tucker EN VIVO!',
    time: new Date().toLocaleString('es-CO'),
    model: 'llama-3.3-70b-versatile'
  });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🎓🔥  PROF. TUCKER EN VIVO!  🔥🎓    ║
  ║                                          ║
  ║  ¡WOOOAH! El profe más bacano del        ║
  ║  campus está listo para ayudarte!        ║
  ║                                          ║
  ║  🔗 http://localhost:${PORT}              ║
  ║  🤖 Modelo: llama-3.3-70b-versatile      ║
  ║                                          ║
  ║  Do you understand the words that are    ║
  ║  coming out of my mouth?! 😎             ║
  ╚══════════════════════════════════════════╝
  `);
});
