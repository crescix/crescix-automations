const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post('/', async (req, res) => {
    // 1. Responde IMEDIATAMENTE para a Evolution API parar de tentar reenviar
    res.sendStatus(200);

    // 2. O processamento pesado agora acontece em "segundo plano" no servidor
    try {
        const body = req.body;
        const data = body.data;

        if (!data || !data.key) return;

        const remoteJid = data.key.remoteJid;
        const pushName = data.pushName || 'Cliente';
        const userMessage = data.message?.conversation || "";
        const messageType = data.messageType;

        // 3. Trava de segurança para evitar processar a mesma mensagem várias vezes
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const status = await redis.getStatus(remoteJid);

        if (status === 'aguardando_confirmacao') {
            const intent = await openai.classifyIntent(userMessage);

            if (intent === 'CONFIRMADO') {
                const rascunho = await redis.getDraft(remoteJid);
                await db.savePedido(remoteJid, pushName, rascunho);
                await whatsapp.sendMessage(remoteJid, "✅ Show! Seu pedido foi registrado com sucesso na CrescIX.");
                await redis.clearAll(remoteJid);
            } else {
                await whatsapp.sendMessage(remoteJid, "Entendido! Pode enviar o pedido novamente quando quiser.");
                await redis.clearAll(remoteJid);
            }
        } else if (messageType === 'audioMessage') {
            const base64Audio = data.message.audioMessage.base64;
            const transcricao = await openai.transcribeAudio(base64Audio);
            await redis.saveDraft(remoteJid, transcricao);
            await redis.setStatus(remoteJid, 'aguardando_confirmacao');
            await whatsapp.sendMessage(remoteJid, `📝 *Transcrição:* "${transcricao}"\n\nDeseja confirmar? (Sim/Não)`);
        } else {
            // Fluxo de texto comum com IA
            const history = await redis.getHistory(remoteJid);
            const aiResponse = await openai.chatWithAgent(userMessage, history);
            await whatsapp.sendMessage(remoteJid, aiResponse);
            await redis.saveMessage(remoteJid, userMessage, aiResponse);
        }

        // 4. Libera a trava após o processamento completo
        await redis.setLock(remoteJid, false);

    } catch (error) {
        console.error("❌ Erro no processamento assíncrono:", error);
        const remoteJid = req.body.data?.key?.remoteJid;
        if (remoteJid) await redis.setLock(remoteJid, false);
    }
});

module.exports = router;