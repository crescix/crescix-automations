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
        messages: [{
            role: "system",
            content: "Você é um validador. Se o usuário confirmar (disser sim, ok, pode ser, confirma), responda APENAS: CONFIRMADO. Se ele negar ou quiser mudar algo, responda: CORRECAO."
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

async function extrairDadosVenda(texto) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Retorne APENAS JSON: { \"item\": string, \"qtd\": number }. Ex: 'vendi 3 águas Water' -> { \"item\": \"água Water\", \"qtd\": 3 }"
        }, { role: "user", content: texto }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

module.exports = { transcribeAudio, classifyIntent, extrairDadosVenda };