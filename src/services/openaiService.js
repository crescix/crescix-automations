const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Inteligência para classificar o que o motorista quer
async function classifyIntent(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Você é a inteligência da CrescIX. Classifique a intenção em uma palavra:
            VENDA, DESPESA, CUSTO, ENTRADA, ESTOQUE, RELATORIO ou SAUDACAO.
            Ex: "Vendi 2 águas" -> VENDA | "Quanto eu tenho?" -> ESTOQUE.`
        }, { role: "user", content: message }],
        temperature: 0,
    });
    return response.choices[0].message.content.trim().toUpperCase();
}

// Inteligência para extrair dados financeiros com normalização de itens
async function extrairDadosFinanceiros(message) {
    const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{
            role: "system",
            content: `Responda apenas com um objeto JSON. Extraia os dados da mensagem.
            REGRAS PARA O ITEM: Nome sempre no SINGULAR, sem artigos (o, a) e sem acentos.
            Ex: "3 Garrafas de águas" -> { "item": "agua", "valor": 0, "qtd": 3 }
            Ex: "Gastei 50 de diesel" -> { "item": "diesel", "valor": 50, "qtd": 1 }`
        }, { role: "user", content: message }],
        response_format: { type: "json_object" }, // Aqui exige a palavra "JSON" no conteúdo acima
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