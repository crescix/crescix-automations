const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Você é o cérebro da CrescIX. Classifique a intenção em: 
            VENDA, DESPESA, CUSTO, ENTRADA, ESTOQUE, RELATORIO.
            REGRA: "Gastei", "Paguei" ou "Comprei algo" deve ser sempre DESPESA ou CUSTO.`
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

async function extrairDadosFinanceiros(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Responda apenas com um objeto JSON. 
            REGRAS PARA O ITEM: 
            1. Se o usuário for vago ("algo", "uma coisa"), use item: "geral".
            2. Nome sempre no SINGULAR e sem acentos.
            Ex: "7 reais com algo" -> { "item": "geral", "valor": 7.00, "qtd": 1 }`
        }, { role: "user", content: message }],
        response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content);
}
// Função para extrair dados financeiros considerando o rascunho anterior
async function extrairDadosComContexto(mensagemAtual, rascunhoAnterior) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Você é a inteligência da CrescIX. 
            Sua tarefa é extrair os dados finais (item, valor, qtd) mesclando o que foi dito antes com a nova correção.
            
            Exemplo:
            Rascunho: "Vendi 3 águas" (item: agua, qtd: 3, valor: 0)
            Mensagem: "Vendi por 3 reais cada e confirme"
            Resultado JSON: { "item": "agua", "qtd": 3, "valor": 3.00, "confirmado": true }
            
            Responda apenas com o objeto JSON.`
        }, { 
            role: "user", 
            content: `Rascunho Original: ${rascunhoAnterior}\nNova Mensagem: ${mensagemAtual}` 
        }],
        response_format: { type: "json_object" },
    });
    return JSON.parse(response.choices[0].message.content);
}

module.exports = {
    classifyIntent,
    extrairDadosFinanceiros,
    extrairDadosComContexto
};