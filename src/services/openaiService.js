const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(base64Data) {
    const filePath = path.join(__dirname, '../../', `temp_${Date.now()}.ogg`);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
    });
    fs.unlinkSync(filePath); 
    return transcription.text;
}

async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Você é um validador. Se o usuário confirmar, responda APENAS: CONFIRMADO. Se ele negar ou corrigir, responda APENAS: CORRECAO."
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

module.exports = { transcribeAudio, classifyIntent };