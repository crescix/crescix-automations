const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post('/', async (req, res) => {
    try {
        const body = req.body; // Acessa o corpo da requisição
        const data = body.data;

        // Validação básica para evitar erros se o webhook vier vazio
        if (!data || !data.key) return res.sendStatus(200);

        const remoteJid = data.key.remoteJid;
        const pushName = data.pushName || 'Cliente';
        const userMessage = data.message?.conversation || "";
        const messageType = data.messageType;

        // 1. Verificar se o usuário já está em uma conversa bloqueada (Segurança)
        if (await redis.isLocked(remoteJid)) return res.sendStatus(200);

        // 2. Busca o status atual da conversa no Redis
        const status = await redis.getStatus(remoteJid);

        /**
         * ESTADO: AGUARDANDO CONFIRMAÇÃO
         * O cliente já enviou um pedido (áudio/texto) e agora está respondendo Sim ou Não.
         */
        if (status === 'aguardando_confirmacao') {
            await redis.setLock(remoteJid, true); // Trava para evitar processamento duplo

            // IA classifica se o usuário confirmou ou quer corrigir
            const intent = await openai.classifyIntent(userMessage);

            if (intent === 'CONFIRMADO') {
                const rascunho = await redis.getDraft(remoteJid); // Recupera o pedido do Redis
                
                // Salva definitivamente no Postgres
                await db.savePedido(remoteJid, pushName, rascunho);
                
                await whatsapp.sendMessage(remoteJid, "✅ Show! Seu pedido foi registrado com sucesso na CrescIX.");
                await redis.clearAll(remoteJid); // Limpa o estado para o próximo pedido
            } else {
                await whatsapp.sendMessage(remoteJid, "Entendido! Cancelando o registro. Pode enviar o pedido novamente quando quiser.");
                await redis.clearAll(remoteJid);
            }
            
            await redis.setLock(remoteJid, false);
            return res.sendStatus(200);
        }

        /**
         * ESTADO: NOVO PEDIDO (FLUXO PADRÃO)
         */
        if (messageType === 'audioMessage') {
            // Processa o áudio vindo da Evolution API
            const base64Audio = data.message.audioMessage.base64;
            const transcricao = await openai.transcribeAudio(base64Audio); // Whisper

            // Salva no Redis para confirmação futura
            await redis.saveDraft(remoteJid, transcricao);
            await redis.setStatus(remoteJid, 'aguardando_confirmacao');

            await whatsapp.sendMessage(remoteJid, `📝 *Transcrição do seu áudio:* "${transcricao}"\n\nDeseja confirmar este pedido?\n👉 Responda com *Sim* ou *Não*.`);
        } else {
            // Se for texto comum, usa o Agente de IA com histórico
            const history = await redis.getHistory(remoteJid);
            const aiResponse = await openai.chatWithAgent(userMessage, history);

            await whatsapp.sendMessage(remoteJid, aiResponse);
            await redis.saveMessage(remoteJid, userMessage, aiResponse);
        }

        res.sendStatus(200);

    } catch (error) {
        console.error("❌ Erro Crítico no Webhook:", error);
        res.status(500).send("Erro Interno");
    }
});

module.exports = router;