// src/services/openaiService.js
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────────────────────────────────────
// CLASSIFICAÇÃO DE INTENÇÃO
// ─────────────────────────────────────────────────────────────────────────────

async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `Você é o classificador de intenções da CrescIX, um app de gestão financeira para pequenos negócios.

Classifique a mensagem em UMA das categorias abaixo e responda APENAS com a palavra-chave:

ENTRADA   → Venda de produto/serviço, recebimento de dinheiro.
            Ex: "Vendi 4 águas", "Recebi 50 reais", "Venda de 3 coxinhas"

DESPESA   → Pagamento de conta, gasto operacional (não é compra para revenda).
            Ex: "Paguei aluguel", "Gastei com luz", "Paguei funcionário"

CUSTO     → Compra de produto/insumo para o negócio ou para revenda.
            Ex: "Comprei arroz", "Comprei embalagens", "Adquiri mercadoria"

RELATORIO → Pedido de histórico, relatório, resumo ou consulta de dados.
            Ex: "Quero ver minhas vendas", "Relatório da semana", "Histórico do mês"

SAUDACAO  → Cumprimento ou início de conversa sem intenção financeira.
            Ex: "Oi", "Olá", "Bom dia", "Tudo bem?", "Oi, pode me ajudar?"

DESCONHECIDO → Qualquer outra coisa que não se encaixe nas categorias acima.

Responda APENAS com a palavra-chave, sem pontuação ou explicação.`,
            },
            { role: 'user', content: message },
        ],
        temperature: 0,
    });

    return response.choices[0].message.content.trim().toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE DADOS FINANCEIROS
// ─────────────────────────────────────────────────────────────────────────────

async function extrairDadosFinanceiros(message) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `Você é o extrator de dados financeiros da CrescIX.
Analise a mensagem e responda APENAS com um JSON válido no formato:
{ "item": string, "valor": number, "qtd": number }

REGRAS OBRIGATÓRIAS:
- "item": nome do produto ou serviço em SINGULAR, sem acentos, em minúsculas.
          Se a mensagem for vaga (ex: "uma coisa", "algo"), use "geral".
- "valor": SEMPRE o valor UNITÁRIO como número decimal.
           Se o usuário informar o valor TOTAL, divida pelo número de itens.
           Ex: "4 águas por 12 reais" → valor = 3.00 (12 dividido por 4)
- "qtd": quantidade como número inteiro. Se não informada, use 1.

EXEMPLOS:
"Vendi 4 águas a 3 reais cada"        → { "item": "agua", "valor": 3.00, "qtd": 4 }
"Vendi 4 águas por 12 reais no total" → { "item": "agua", "valor": 3.00, "qtd": 4 }
"Comprei 3 sacos de arroz a 18 reais" → { "item": "arroz", "valor": 18.00, "qtd": 3 }
"Paguei 150 de aluguel"               → { "item": "aluguel", "valor": 150.00, "qtd": 1 }
"Gastei 7 reais com uma coisa"        → { "item": "geral", "valor": 7.00, "qtd": 1 }`,
            },
            { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
    });

    return JSON.parse(response.choices[0].message.content);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTRAÇÃO DE PARÂMETROS DE RELATÓRIO
// ─────────────────────────────────────────────────────────────────────────────

async function extrairParametrosRelatorio(message) {
    const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: `Extraia os parâmetros do relatório financeiro e responda APENAS com JSON:
{ "dias": number, "tipo": string, "label": string }

REGRAS:
- "dias": número de dias para o relatório.
  "hoje" → 1 | "semana" ou "7 dias" → 7 | "15 dias" → 15 | "mês" ou "30 dias" → 30 | "2 meses" → 60
  Se não especificado, use 7.
- "tipo": filtro de tipo de transação.
  Se mencionar só "vendas" → "ENTRADA"
  Se mencionar só "despesas" ou "gastos" → "DESPESA"
  Se mencionar só "compras" ou "custos" → "CUSTO"
  Se mencionar "tudo" ou nada específico → "todos"
- "label": descrição amigável em português. Ex: "últimos 7 dias", "este mês", "hoje"

EXEMPLOS:
"relatório de vendas da semana"      → { "dias": 7, "tipo": "ENTRADA", "label": "últimos 7 dias" }
"histórico do mês"                   → { "dias": 30, "tipo": "todos", "label": "últimos 30 dias" }
"relatório de despesas de hoje"      → { "dias": 1, "tipo": "DESPESA", "label": "hoje" }
"quero ver tudo dos últimos 15 dias" → { "dias": 15, "tipo": "todos", "label": "últimos 15 dias" }`,
            },
            { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
    });

    return JSON.parse(response.choices[0].message.content);
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSCRIÇÃO DE ÁUDIO — CORRIGIDA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Transcreve um áudio via Whisper.
 * 
 * CORREÇÃO: O Whisper precisa que o arquivo tenha uma extensão reconhecida
 * (.ogg, .mp3, .wav, etc). O stream do Telegram não tem nome, por isso
 * salvamos em um arquivo temporário com extensão .ogg antes de enviar.
 * 
 * @param {string} fileUrl - URL pública do arquivo de áudio do Telegram
 */
async function transcribeAudio(fileUrl) {
    // Arquivo temporário com extensão .ogg (formato padrão do Telegram)
    const tmpPath = path.join(os.tmpdir(), `crescix_audio_${Date.now()}.ogg`);

    try {
        // 1. Baixa o áudio e salva em disco
        const audioResponse = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'arraybuffer', // baixa tudo em memória primeiro
        });

        fs.writeFileSync(tmpPath, Buffer.from(audioResponse.data));

        // 2. Envia o arquivo para o Whisper usando fs.createReadStream
        //    O nome do arquivo (.ogg) indica o formato para a API
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tmpPath),
            model: 'whisper-1',
            language: 'pt',
        });

        return transcription.text;

    } finally {
        // 3. Remove o arquivo temporário independente de sucesso ou erro
        if (fs.existsSync(tmpPath)) {
            fs.unlinkSync(tmpPath);
        }
    }
}

module.exports = {
    classifyIntent,
    extrairDadosFinanceiros,
    extrairParametrosRelatorio,
    transcribeAudio,
};