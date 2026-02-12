const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    console.log("📩 Webhook recebido da Evolution!");
    res.sendStatus(200);
    const data = req.body.data;
    if (!data || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    const pushName = data.pushName || "Motorista";

    try {
        // 1. Previne processamento duplicado
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        const userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";

        // 2. Cadastro de novos motoristas (Onboarding)
        const { isNew } = await db.verificarOuCadastrarUsuario(remoteJid, pushName);
        if (isNew) {
            const welcome = `🚛 *CrescIX Pro: Bem-vindo, ${pushName}!* \n\nSua gestão na palma da mão:\n💰 "Vendi 2 águas"\n📉 "Gastei 50 diesel"\n📦 "Estoque"\n📊 "Relatório"\n🔐 "Login" (para acesso web)`;
            await redis.setLock(remoteJid, false);
            return await whatsapp.sendMessage(remoteJid, welcome);
        }

        const status = await redis.getStatus(remoteJid);

        // 3. Processamento de Confirmações
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
                    await whatsapp.sendMessage(remoteJid, `📦 Produto "${dados.item}" cadastrado/atualizado!`);
                } else {
                    await db.registrarMovimentacao(remoteJid, tipo, dados);
                    await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado!`);
                }
            } else {
                await whatsapp.sendMessage(remoteJid, "❌ Operação cancelada.");
            }
            await redis.clearAll(remoteJid);
        } else {
            // 4. Identificação de Intenções (IA)
            const intent = await openai.classifyIntent(userMessage);

            if (["VENDA", "DESPESA", "CUSTO", "ENTRADA", "CADASTRO_PRODUTO"].includes(intent)) {
                await redis.saveDraft(remoteJid, userMessage);
                await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
                await whatsapp.sendMessage(remoteJid, `🤖 Confirma registro de **${intent}**? (Sim/Não)`);
            } else if (intent === "ESTOQUE") {
                const itens = await db.consultarEstoque(remoteJid);
                let lista = `📦 *Seu Estoque*\n\n`;
                itens.length === 0 ? lista += "Vazio." : itens.forEach(p => lista += `${p.estoque <= 5 ? "⚠️" : "✅"} ${p.nome}: ${p.estoque} un.\n`);
                await whatsapp.sendMessage(remoteJid, lista);
            } else if (intent === "RELATORIO") {
                const r = await db.gerarRelatorioCompleto(remoteJid);
                let msg = `📊 *Resumo de Hoje*\n💰 Vendas: R$ ${r.venda}\n⚖️ *Saldo: R$ ${r.saldo.toFixed(2)}*`;
                await whatsapp.sendMessage(remoteJid, msg);
            } else if (intent === "LOGIN") {
                const codigo = await db.gerarCodigoLogin(remoteJid);
                await whatsapp.sendMessage(remoteJid, `🔐 Código de acesso web: *${codigo}* (Válido por 10 min)`);
            }
        }
    } catch (e) {
        console.error("❌ Erro no Webhook:", e.message);
    } finally {
        await redis.setLock(remoteJid, false);
    }
});

module.exports = router;