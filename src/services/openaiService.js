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

// Prompt idêntico ao "AI Agent1" do seu n8n
async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: "Você é um assistente de validação. Se o usuário confirmar (disser 'Sim', 'Ok', 'Correto', 'Pode ser', etc.), responda APENAS: CONFIRMADO. Se o usuário corrigir ou mandar um novo texto, responda APENAS: CORRECAO."
        }, { role: "user", content: message }],
        temperature: 0,
    });
    // Limpa a resposta para evitar espaços ou pontos extras
    return response.choices[0].message.content.trim().toUpperCase();
}

module.exports = { transcribeAudio, classifyIntent };