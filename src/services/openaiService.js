const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Função para classificar a intenção do motorista
async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Você é a inteligência da CrescIX. Classifique a mensagem em apenas UMA palavra:
            VENDA, DESPESA, CUSTO, ENTRADA, ESTOQUE, RELATORIO ou SAUDACAO.
            Ex: "Vendi 2 águas" -> VENDA | "Quanto tenho?" -> ESTOQUE.`
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

// Função para extrair dados financeiros e NORMALIZAR o item
async function extrairDadosFinanceiros(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Extraia: item (singular, sem artigos, sem acentos), valor (número), qtd (número).
            Ex: "3 Garrafas de água" -> { "item": "agua", "valor": 0, "qtd": 3 }`
        }, { role: "user", content: message }],
        response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content);
}

// O erro aconteceu porque faltava exportar as funções aqui!
module.exports = {
    classifyIntent,
    extrairDadosFinanceiros
};