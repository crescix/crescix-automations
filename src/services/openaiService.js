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
            content: "Classifique a intenção: VENDA, DESPESA, CUSTO, ENTRADA, RELATORIO, ESTOQUE, CADASTRO_PRODUTO, LOGIN, CONFIRMADO, CANCELAR. Responda APENAS a palavra."
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

async function extrairDadosFinanceiros(texto) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Extraia item, valor e quantidade. Responda JSON: { \"item\": string, \"valor\": number, \"qtd\": number }. Ex: '3 águas' -> { \"item\": \"água\", \"valor\": 0, \"qtd\": 3 }"
        }, { role: "user", content: texto }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

module.exports = { transcribeAudio, classifyIntent, extrairDadosFinanceiros };