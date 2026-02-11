// ... (mantenha os requires iguais)

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
            console.log(`🤖 Intenção detectada para ${pushName}: ${intent}`); // LOG DE SEGURANÇA

            // Aceita se a resposta da IA contiver a palavra CONFIRMADO
            if (intent.includes("CONFIRMADO")) {
                const rascunho = await redis.getDraft(remoteJid);
                console.log(`💾 Tentando salvar no banco: ${rascunho}`);
                
                await db.savePedido(remoteJid, pushName, rascunho);
                
                await whatsapp.sendMessage(remoteJid, "✅ Confirmado! O pedido foi salvo para suas estatísticas.");
                await redis.clearAll(remoteJid);
            } else {
                console.log(`❌ Usuário recusou ou IA entendeu errado. Resposta: ${userMessage}`);
                await whatsapp.sendMessage(remoteJid, "❌ Cancelado. O rascunho anterior foi descartado.");
                await redis.clearAll(remoteJid);
            }
        } else {
            // ... (restante da lógica de áudio/texto igual à anterior)
        }
    } catch (error) {
        console.error("❌ ERRO NO WEBHOOK:", error.message);
    }
});