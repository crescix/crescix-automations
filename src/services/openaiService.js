const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function transcribeAudio(base64Data) {
    // Usando timestamp para evitar conflitos de arquivos simultâneos
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
            { role: "system", content: "Você é o assistente da CrescIX..." }, 
            ...history, 
            { role: "user", content: message }
        ],
    });
    return response.choices[0].message.content;
} // <--- Chave que faltava aqui!

async function classifyIntent(message) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [
                { 
                    role: "system", 
                    content: `Você é um classificador de intenções para um sistema de vendas. 
                    Responda APENAS com: CONFIRMADO ou CORRECAO.` 
                },
                { role: "user", content: message }
            ],
            temperature: 0,
        });

        const intent = response.choices[0].message.content.trim().toUpperCase();
        return intent;
    } catch (error) {
        console.error("❌ Erro na classificação:", error);
        return "CORRECAO";
    }
}

module.exports = { transcribeAudio, chatWithAgent, classifyIntent };