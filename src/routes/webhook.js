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

    // --- SUPORTE PARA ÁUDIO ---
    if (data.message?.audioMessage) {
        // A Evolution envia o base64 se a opção "Webhook Base64" estiver ligada
        const base64Audio = data.message.audioMessage.base64;
        if (base64Audio) {
            userMessage = await openai.transcribeAudio(base64Audio);
        }
    } else {
        userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    }

    if (!userMessage) return;

    try {
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        const status = await redis.getStatus(remoteJid);

        // --- LÓGICA DE CONFIRMAÇÃO (SEM ERROS) ---
        if (status?.startsWith("aguardando_")) {
            const cleanMsg = userMessage.toLowerCase().trim();
            
            // Tratamento direto para evitar que a IA cancele o "sim"
            if (['sim', 's', 'confirmar', 'ok'].includes(cleanMsg)) {
                const tipo = status.replace("aguardando_", "");
                const rascunho = await redis.getDraft(remoteJid);
                const dados = await openai.extrairDadosFinanceiros(rascunho);

                if (tipo === "venda") {
                    const r = await db.processarVendaAutomatica(remoteJid, rascunho, dados);
                    await whatsapp.sendMessage(remoteJid, `✅ Venda de R$ ${r.total.toFixed(2)} salva!`);
                    if (r.alerta) await whatsapp.sendMessage(remoteJid, r.alerta);
                } else {
                    await db.registrarMovimentacao(remoteJid, tipo, dados);
                    await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado!`);
                }
                await redis.clearAll(remoteJid);
            } else if (['não', 'nao', 'n', 'cancelar'].includes(cleanMsg)) {
                await whatsapp.sendMessage(remoteJid, "❌ Operação cancelada.");
                await redis.clearAll(remoteJid);
            }
            return;
        }

        // --- IDENTIFICAÇÃO DE COMANDOS ---
        const intent = await openai.classifyIntent(userMessage);

        if (["VENDA", "DESPESA", "CUSTO", "ENTRADA"].includes(intent)) {
            await redis.saveDraft(remoteJid, userMessage);
            await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
            await whatsapp.sendMessage(remoteJid, `🤖 Confirma registro de **${intent}**? (Sim/Não)`);
        } else if (intent === "ESTOQUE") {
            const itens = await db.consultarEstoque(remoteJid);
            let lista = `📦 *Seu Estoque*\n\n`;
            itens.forEach(p => lista += `${p.estoque <= 5 ? "⚠️" : "✅"} ${p.nome}: ${p.estoque} un.\n`);
            await whatsapp.sendMessage(remoteJid, lista);
        } else if (intent === "RELATORIO") {
            const r = await db.gerarRelatorioCompleto(remoteJid);
            await whatsapp.sendMessage(remoteJid, `📊 *Resumo*\n💰 Vendas: R$ ${r.venda}\n⚖️ *Saldo: R$ ${r.saldo.toFixed(2)}*`);
        } else if (intent === "LOGIN") {
            const codigo = await db.gerarCodigoLogin(remoteJid);
            await whatsapp.sendMessage(remoteJid, `🔐 Código: *${codigo}*`);
        }

    } catch (e) {
        console.error("Erro:", e.message);
    } finally {
        await redis.setLock(remoteJid, false);
    }
});

module.exports = router;