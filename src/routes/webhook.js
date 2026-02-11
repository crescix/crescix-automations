const express = require('express'); // ESTA LINHA É OBRIGATÓRIA
const router = express.Router();    // ESTA LINHA DEFINE O ROUTER
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

        const status = await redis.getStatus(remoteJid);

        if (status === "aguardando_confirmacao") {
            const intent = await openai.classifyIntent(userMessage);

            if (intent === "CONFIRMADO") {
                const rascunho = await redis.getDraft(remoteJid);
                // SALVA EXATAMENTE O QUE O CLIENTE FALOU
                await db.savePedido(remoteJid, pushName, rascunho);
                
                await whatsapp.sendMessage(remoteJid, "✅ Confirmado! Dados registrados no banco da CrescIX.");
                await redis.clearAll(remoteJid);
            } else {
                await whatsapp.sendMessage(remoteJid, "❌ Cancelado. O rascunho foi descartado.");
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

                // Prompts literais como no n8n
                await whatsapp.sendMessage(remoteJid, `🤖Transcrição: "${conteudo}"\n\nDeseja confirmar?`);
                await whatsapp.sendMessage(remoteJid, "👉 Digite: *Sim* ou *Não*");
            }
        }
    } catch (e) {
        console.error("❌ Erro Webhook:", e.message);
    }
});

module.exports = router;