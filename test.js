require('dotenv').config();
const openai = require('./src/services/openaiService');

async function runTest() {
    console.log("🚀 Iniciando teste de fluxo da CrescIX...");

    // Teste 1: Classificação de Intenção Positiva
    const sim = await openai.classifyIntent("Sim, pode salvar o pedido");
    console.log(`Teste 'Sim': ${sim === 'CONFIRMADO' ? '✅ PASSOU' : '❌ FALHOU'} (${sim})`);

    // Teste 2: Classificação de Intenção Negativa/Correção
    const nao = await openai.classifyIntent("Não, eu quero mudar a quantidade");
    console.log(`Teste 'Não': ${nao === 'CORRECAO' ? '✅ PASSOU' : '❌ FALHOU'} (${nao})`);

    console.log("\n🏁 Teste concluído!");
}

runTest();