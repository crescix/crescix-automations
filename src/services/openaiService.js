const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const fs = require('fs');
const path = require('path');

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
        messages: [
            { 
                role: "system", 
                content: "Sua única função é classificar. Se o usuário disser SIM ou qualquer variação de concordância (ok, pode ser, confirma), responda APENAS: CONFIRMADO. Caso contrário, responda: CORRECAO." 
            },
            { role: "user", content: message }
        ],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

module.exports = { transcribeAudio, classifyIntent };