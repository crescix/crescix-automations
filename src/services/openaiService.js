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

// Classifica a intenção real do usuário
async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Classifique a intenção: VENDA (vendi algo), DESPESA (gastei/paguei), CUSTO (comprei estoque), ENTRADA (recebi extra), RELATORIO (quer resumo), CONFIRMADO (disse sim/ok), CORRECAO (disse não/corrigir). Responda APENAS a palavra."
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

// Extrai dados para qualquer tipo de movimentação
async function extrairDadosFinanceiros(texto) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Extraia o item, valor e quantidade. Responda apenas JSON: { \"item\": string, \"valor\": number, \"qtd\": number }. Ex: 'Gastei 50 com diesel' -> { \"item\": \"diesel\", \"valor\": 50, \"qtd\": 1 }"
        }, { role: "user", content: texto }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

module.exports = { transcribeAudio, classifyIntent, extrairDadosFinanceiros };