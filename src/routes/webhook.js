const express = require('express');
const router = express.Router(); // Esta linha define o 'router' que estava faltando
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    res.sendStatus(200); // Responde à Evolution primeiro

    const { event, data } = req.body;
    if (event !== 'messages.upsert' || !data?.key || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    console.log("📩 Webhook válido recebido da Evolution!");

    try {
        // 1. Verifica/Cria usuário (Onde o crash costuma ocorrer)
        const { user } = await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        console.log(`✅ Usuário identificado: ${user.nome}`);

        // 2. Captura a mensagem
        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
        if (!userMessage) return;

        // 3. Processa Intenção
        const intent = await openai.classifyIntent(userMessage);
        console.log(`🤖 IA classificou como: ${intent}`);

        // 4. Envia resposta de teste para confirmar que o TOKEN funciona
        if (intent === "SAUDACAO" || userMessage.toLowerCase() === "oi") {
            await whatsapp.sendMessage(remoteJid, "🚀 CrescIX Online! O sistema de controle está pronto.");
        } else if (["VENDA", "RELATORIO"].includes(intent)) {
            // ... lógica de venda/relatório
            await whatsapp.sendMessage(remoteJid, `Recebi seu comando de ${intent}.`);
        }

    } catch (e) {
        // Isso impede o reinício e mostra o erro exato no log!
        console.error("❌ ERRO FATAL CAPTURADO:", e.message);
        // Opcional: te avisa no WhatsApp que deu erro interno
        await whatsapp.sendMessage(remoteJid, "⚠️ Ocorreu um erro interno no processamento.");
    }
});