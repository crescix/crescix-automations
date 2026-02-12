router.post("/", async (req, res) => {
    res.sendStatus(200);
    const data = req.body.data;
    if (!data || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    const pushName = data.pushName || "Motorista";

    try {
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
        const { isNew } = await db.verificarOuCadastrarUsuario(remoteJid, pushName);
        
        if (isNew) {
            const welcome = `🚛 *CrescIX: Bem-vindo!* \n💰 "Vendi 2 águas"\n📉 "Gastei 50 diesel"\n📦 "Estoque"\n📊 "Relatório"\n🔐 "Login"`;
            await redis.setLock(remoteJid, false);
            return await whatsapp.sendMessage(remoteJid, welcome);
        }

        const status = await redis.getStatus(remoteJid);

        if (status?.startsWith("aguardando_")) {
            const intent = await openai.classifyIntent(userMessage);
            if (intent === "CONFIRMADO") {
                const tipo = status.replace("aguardando_", "");
                const rascunho = await redis.getDraft(remoteJid);
                const dados = await openai.extrairDadosFinanceiros(rascunho);

                if (tipo === "venda") {
                    const r = await db.processarVendaAutomatica(remoteJid, rascunho, dados);
                    await whatsapp.sendMessage(remoteJid, `✅ Venda de R$ ${r.total.toFixed(2)} salva!`);
                    if (r.alerta) await whatsapp.sendMessage(remoteJid, r.alerta);
                } else if (tipo === "cadastro_produto") {
                    await db.cadastrarProduto(remoteJid, dados);
                    await whatsapp.sendMessage(remoteJid, `📦 Produto atualizado!`);
                } else {
                    await db.registrarMovimentacao(remoteJid, tipo, dados);
                    await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado!`);
                }
            } else { await whatsapp.sendMessage(remoteJid, "❌ Operação cancelada."); }
            await redis.clearAll(remoteJid);
        } else {
            const intent = await openai.classifyIntent(userMessage);
            if (["VENDA", "DESPESA", "CUSTO", "ENTRADA", "CADASTRO_PRODUTO"].includes(intent)) {
                await redis.saveDraft(remoteJid, userMessage);
                await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
                await whatsapp.sendMessage(remoteJid, `🤖 Confirma registro de **${intent}**? (Sim/Não)`);
            } else if (intent === "ESTOQUE") {
                // ... lógica de consultar estoque
            } else if (intent === "RELATORIO") {
                // ... lógica de gerar relatório
            } else if (intent === "LOGIN") {
                const codigo = await db.gerarCodigoLogin(remoteJid);
                await whatsapp.sendMessage(remoteJid, `🔐 Código de acesso: *${codigo}* (Válido por 10 min)`);
            }
        }
    } catch (e) { console.error(e.message); } finally { await redis.setLock(remoteJid, false); }
});