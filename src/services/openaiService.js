const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(base64Data) {
    const fileName = `temp_${Date.now()}.ogg`;
    const filePath = path.join(__dirname, '../../', fileName);
    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: "whisper-1",
    });
    fs.unlinkSync(filePath); 
    return transcription.text;
}

async function chatWithAgent(message, history) {
    const response = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
            { 
                role: "system", 
                content: `Você é o assistente virtual da CrescIX, focado em ajudar Thiago na gestão de vendas. Sua personalidade é: Profissional, prestativa e direta ao ponto.` 
            }, 
            ...history, 
            { role: "user", content: message }
        ],
    });
    return response.choices[0].message.content;
}

async function classifyIntent(message) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                { role: "system", content: `Você é um classificador de intenções. Responda APENAS com: CONFIRMADO ou CORRECAO.` },
                { role: "user", content: message }
            ],
            temperature: 0,
        });
        return response.choices[0].message.content.trim().toUpperCase();
    } catch (error) {
        return "CORRECAO";
    }
}

async function extractOrderItems(text) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Extraia o item e a quantidade. Responda apenas em JSON: { \"item\": string, \"qtd\": number }"
        }, { role: "user", content: text }],
        response_format: { type: "json_object" }
    });
    return JSON.parse(response.choices[0].message.content);
}

module.exports = { transcribeAudio, chatWithAgent, classifyIntent, extractOrderItems };