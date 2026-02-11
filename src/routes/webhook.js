const express = require("express");
const router = express.Router();
const whatsapp = require("../services/whatsappService");
const openai = require("../services/openaiService");
const redis = require("../services/redisService");
const db = require("../services/dbService");

router.post("/", async (req, res) => {
    res.sendStatus(200);

    try {
        const data = req.body.data;
        if (!data || !data.key) return;

        const remoteJid = data.key.remoteJid;
        const pushName = data.pushName || "Cliente";
        
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const status = await redis.getStatus(remoteJid);
        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";

        if (status === "aguardando_confirmacao") {
            const intent = await openai.classifyIntent(userMessage);

            if (intent === "CONFIRMADO") {
                const rascunho = await redis.getDraft(remoteJid);
                const dados = await openai.extractOrderItems(rascunho); // Extrai item e qtd
                
                const pedido = await db.savePedidoComValores(remoteJid, pushName, rascunho, dados);
                
                await whatsapp.sendMessage(remoteJid, `✅ Confirmado! Pedido registrado com os valores do sistema.`);
                await whatsapp.sendMessage(remoteJid, `💰 Valor Total: R$ ${pedido.total.toFixed(2)}`);
                await redis.clearAll(remoteJid);
            } else {
                await whatsapp.sendMessage(remoteJid, "Entendido! O rascunho anterior foi descartado.");
                await whatsapp.sendMessage(remoteJid, "Deseja realizar o pedido novamente? É só falar ou digitar o que vendeu.");
                await redis.clearAll(remoteJid);
            }
        } else {
            let conteudo = "";
            if (data.messageType === "audioMessage") {
                conteudo = await openai.transcribeAudio(data.message.audioMessage.base64);
            } else if (userMessage.length > 0) {
                conteudo = userMessage;
            }

            if (conteudo) {
                await redis.saveDraft(remoteJid, conteudo);
                await redis.setStatus(remoteJid, "aguardando_confirmacao");

                // Envio em mensagens separadas
                await whatsapp.sendMessage(remoteJid, `🤖 Transcrição: "${conteudo}\nDeseja confirmar?"`);
                await whatsapp.sendMessage(remoteJid, `👉 Digite: *Sim* ou *Não*`);
            }
        }

        await redis.setLock(remoteJid, false);
    } catch (error) {
        const remoteJid = req.body.data?.key?.remoteJid;
        if (remoteJid) await redis.setLock(remoteJid, false);
    }
});

module.exports = router;