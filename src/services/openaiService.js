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

// Instrução para o System Prompt da OpenAI
const SYSTEM_PROMPT = `
Você é o núcleo de inteligência da CrescIX, um SaaS para motoristas e pequenos empreendedores.
Sua missão é transformar falas informais em dados estruturados.

REGRAS DE OURO PARA O 'ITEM':
1. Sempre no singular (ex: "águas" -> "agua").
2. Sem artigos ou preposições (ex: "garrafa de água" -> "agua").
3. Remova acentos para facilitar a busca no banco (ex: "café" -> "cafe").
4. Se o item for combustível, padronize como "combustivel".

INTENÇÕES DISPONÍVEIS:
- VENDA: "Vendi 2 cocas", "Saiu mais uma água".
- ENTRADA: "Chegou 10 fardos de água", "Comprei estoque de refri".
- CUSTO: "Gastei 50 de diesel", "Paguei o mecânico".
- ESTOQUE: "Como está o estoque?", "O que eu tenho ainda?".
- RELATORIO: "Quanto lucrei hoje?", "Resumo do dia".
`;

module.exports = { transcribeAudio};