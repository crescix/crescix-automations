const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    res.sendStatus(200);

    const event = req.body.event;
    const data = req.body.data;

    if (event !== 'messages.upsert' || !data?.key || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    let userMessage = "";

    try {
        // 1. Processamento de Entrada
        if (data.message?.audioMessage) {
            const base64Audio = data.message.audioMessage.base64;
            if (base64Audio) userMessage = await openai.transcribeAudio(base64Audio);
        } else {
            userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
        }

        if (!userMessage) return;

        // 2. Trava e Identificação
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        const status = await redis.getStatus(remoteJid);

        // --- BLOCO A: EXECUÇÃO DE CONFIRMAÇÕES PENDENTES ---
        if (status?.startsWith("aguardando_")) {
    const rascunho = await redis.getDraft(remoteJid);
    const tipo = status.replace("aguardando_", "");
    
    // 1. Tenta extrair dados mesclando a mensagem atual com o rascunho
    const dadosFinais = await openai.extrairDadosComContexto(userMessage, rascunho);

    // Se a IA detectar que o usuário quer confirmar (ex: "pode salvar", "ok", "confirmar")
    if (dadosFinais.confirmado || ['sim', 's', 'ok'].includes(userMessage.toLowerCase())) {
        try {
            if (tipo === "venda") {
                const r = await db.processarVendaAutomatica(remoteJid, rascunho, dadosFinais);
                await whatsapp.sendMessage(remoteJid, `✅ Venda de *${dadosFinais.item}* salva por R$ ${dadosFinais.valor} cada!`);
            } else {
                await db.registrarMovimentacao(remoteJid, tipo, dadosFinais);
                await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado!`);
            }
        } catch (e) {
            await whatsapp.sendMessage(remoteJid, `⚠️ Erro: ${e.message}`);
        }
        await redis.clearAll(remoteJid);
    } else if (['nao', 'cancelar'].includes(userMessage.toLowerCase())) {
        await whatsapp.sendMessage(remoteJid, "❌ Cancelado.");
        await redis.clearAll(remoteJid);
    } else {
        // Se ele apenas deu mais informações sem confirmar, atualiza o rascunho
        await redis.saveDraft(remoteJid, `${rascunho} + ${userMessage}`);
        await whatsapp.sendMessage(remoteJid, `🤖 Entendido. Novo resumo:\nItem: ${dadosFinais.item}\nQtd: ${dadosFinais.qtd}\nValor: R$ ${dadosFinais.valor}\n\n**Podemos confirmar agora?**`);
    }
    return;
}

        // --- BLOCO B: ENTENDIMENTO DE NOVOS COMANDOS ---
        const intent = await openai.classifyIntent(userMessage);

        // 1. Comandos de Registro (Exigem Confirmação Detalhada)
        if (["VENDA", "DESPESA", "CUSTO", "ENTRADA", "CADASTRO_PRODUTO"].includes(intent)) {
            // Extraímos os dados ANTES de perguntar para mostrar ao usuário
            const dados = await openai.extrairDadosFinanceiros(userMessage);
            
            await redis.saveDraft(remoteJid, userMessage);
            await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
            
            const msgPerg = `🤖 Entendi: **${intent}** de *${dados.item}*\n🔢 Qtd: ${dados.qtd} | 💵 Valor: R$ ${dados.valor}\n\n**Confirma o registro?**`;
            await whatsapp.sendMessage(remoteJid, msgPerg);

        } else if (intent === "ESTOQUE") {
            const msgEstoque = await db.consultarEstoque(remoteJid);
            await whatsapp.sendMessage(remoteJid, msgEstoque);

        } else if (intent === "RELATORIO") {
            const r = await db.gerarRelatorioCompleto(remoteJid);
            const resumo = `📊 *Resumo de Hoje*\n\n💰 Vendas: R$ ${r.venda}\n💸 Custos: R$ ${r.custo}\n⚖️ *Saldo: R$ ${r.saldo.toFixed(2)}*`;
            await whatsapp.sendMessage(remoteJid, resumo);
        
        } else if (userMessage.toLowerCase().includes("oi") || userMessage.toLowerCase().includes("olá")) {
            await whatsapp.sendMessage(remoteJid, `👋 Olá, Thiago! Como posso ajudar a CrescIX hoje?\n(Você pode vender, cadastrar produtos ou pedir relatórios)`);
        }

    } catch (e) {
        console.error("❌ Erro no Webhook:", e.message);
    } finally {
        await redis.setLock(remoteJid, false);
    }
});

module.exports = router;