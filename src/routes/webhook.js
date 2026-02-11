const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post('/', async (req, res) => {
    res.sendStatus(200); // Resposta imediata para evitar duplicatas

    try {
        const data = req.body.data;
        if (!data || !data.key) return;

        const remoteJid = data.key.remoteJid;
        const pushName = data.pushName || 'Cliente';
        const messageType = data.messageType;

        // 1. Trava de segurança
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const status = await redis.getStatus(remoteJid);
        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";

        // --- FLUXO A: USUÁRIO ESTÁ RESPONDENDO AO "SIM" OU "NÃO" ---
        if (status === 'aguardando_confirmacao') {
            const intent = await openai.classifyIntent(userMessage);

            if (intent === 'CONFIRMADO') {
                const rascunho = await redis.getDraft(remoteJid);
                await db.savePedido(remoteJid, pushName, rascunho);
                await whatsapp.sendMessage(remoteJid, "✅ Show! Seu pedido foi registrado com sucesso na CrescIX.");
                await redis.clearAll(remoteJid);
            } else {
                await whatsapp.sendMessage(remoteJid, "Entendido! O rascunho anterior foi descartado. Pode enviar o novo pedido.");
                await redis.clearAll(remoteJid);
            }
        } 
        // --- FLUXO B: NOVA MENSAGEM (ÁUDIO OU TEXTO) PARA REGISTRAR ---
        else {
            let conteudoParaConfirmar = "";

            if (messageType === 'audioMessage') {
                const base64Audio = data.message.audioMessage.base64;
                conteudoParaConfirmar = await openai.transcribeAudio(base64Audio);
            } else if (userMessage.length > 0) {
                conteudoParaConfirmar = userMessage;
            }

            if (conteudoParaConfirmar) {
                // Salva no Redis e muda o status
                await redis.saveDraft(remoteJid, conteudoParaConfirmar);
                await redis.setStatus(remoteJid, 'aguardando_confirmacao');

                // Envia a mensagem exatamente como na imagem
                const mensagemFinal = `🤖 Transcrição: "${conteudoParaConfirmar}"\n\nDeseja confirmar?\n\n👉 Digite: *Sim* ou *Não*`;
                await whatsapp.sendMessage(remoteJid, mensagemFinal);
            }
        }

        await redis.setLock(remoteJid, false);
    } catch (error) {
        console.error("❌ Erro no webhook:", error);
        const remoteJid = req.body.data?.key?.remoteJid;
        if (remoteJid) await redis.setLock(remoteJid, false);
    }
});

module.exports = router;