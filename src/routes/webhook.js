const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    res.sendStatus(200);

    try {
        const data = req.body.data;
        if (!data || !data.key || data.key.fromMe) return;

        const remoteJid = data.key.remoteJid;
        const pushName = data.pushName || "Cliente";
        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";

        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const status = await redis.getStatus(remoteJid);

        if (status === "aguardando_confirmacao") {
            const intent = await openai.classifyIntent(userMessage);

            if (intent.includes("CONFIRMADO")) {
                const rascunho = await redis.getDraft(remoteJid);
                const dadosIA = await openai.extrairDadosVenda(rascunho); // IA entende o item
                
                // CORREÇÃO: Chamando o nome exato que está no dbService.js
                const resultado = await db.processarVendaAutomatica(remoteJid, pushName, rascunho, dadosIA);
                
                await whatsapp.sendMessage(remoteJid, `✅ Venda Processada!\n💰 Total: R$ ${resultado.total.toFixed(2)}\n📦 Estoque: ${resultado.novoEstoque} unid.`);
                await redis.clearAll(remoteJid);
            } else {
                await whatsapp.sendMessage(remoteJid, "❌ Cancelado. O rascunho foi descartado.");
                await redis.clearAll(remoteJid);
            }
        } else {
            let conteudo = "";
            // Trava para evitar erro de 'undefined' no Buffer
            if (data.messageType === "audioMessage" && data.message.audioMessage?.base64) {
                conteudo = await openai.transcribeAudio(data.message.audioMessage.base64);
            } else if (userMessage.length > 0) {
                conteudo = userMessage;
            }

            if (conteudo) {
                await redis.saveDraft(remoteJid, conteudo);
                await redis.setStatus(remoteJid, "aguardando_confirmacao");
                await whatsapp.sendMessage(remoteJid, `🤖Transcrição: "${conteudo}"\n\nDeseja confirmar?`);
                await whatsapp.sendMessage(remoteJid, "👉 Digite: *Sim* ou *Não*");
            }
        }
        await redis.setLock(remoteJid, false);
    } catch (e) {
        console.error("❌ Erro no Webhook:", e.message);
        const remoteJid = req.body.data?.key?.remoteJid;
        if (remoteJid) await redis.setLock(remoteJid, false);
    }
});

module.exports = router;