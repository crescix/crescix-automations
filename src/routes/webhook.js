const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    // 1. Responde imediatamente para a Evolution não tentar reenviar a mesma mensagem
    res.sendStatus(200);

    const event = req.body.event;
    const data = req.body.data;

    if (event !== 'messages.upsert' || !data?.key || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    console.log("📩 Webhook válido recebido da Evolution!");

    try {
        // --- PROCESSAMENTO DE ÁUDIO ---
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        
        if (data.message?.audioMessage) {
            console.log("🎤 Processando mensagem de áudio...");
            const base64Audio = data.message.audioMessage.base64;
            if (base64Audio) {
                userMessage = await openai.transcribeAudio(base64Audio);
                console.log(`📝 Transcrição: "${userMessage}"`);
            }
        } else {
            userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
        }

        if (!userMessage) return;

        // --- SISTEMA DE TRAVA (REDIS) ---
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        // Garante que o usuário existe no banco
        await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        const status = await redis.getStatus(remoteJid);

        // --- LÓGICA DE CONFIRMAÇÃO ---
        if (status?.startsWith("aguardando_")) {
            const cleanMsg = userMessage.toLowerCase().trim();
            
            if (['sim', 's', 'confirmar', 'ok'].includes(cleanMsg)) {
                const tipo = status.replace("aguardando_", "");
                const rascunho = await redis.getDraft(remoteJid);
                const dados = await openai.extrairDadosFinanceiros(rascunho);

                try {
                    if (tipo === "venda") {
                        const r = await db.processarVendaAutomatica(remoteJid, rascunho, dados);
                        await whatsapp.sendMessage(remoteJid, `✅ Venda de R$ ${r.total.toFixed(2)} salva!\n📦 Estoque atual: ${r.novoEstoque} un.`);
                    } else {
                        await db.registrarMovimentacao(remoteJid, tipo, dados);
                        await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado!`);
                    }
                } catch (dbError) {
                    // Trata erro de produto não cadastrado
                    console.error("Erro no DB:", dbError.message);
                    await whatsapp.sendMessage(remoteJid, `⚠️ Erro: ${dbError.message}\nUse "Cadastrar produto [nome] por [valor]" primeiro.`);
                }
                await redis.clearAll(remoteJid);
            } else if (['não', 'nao', 'n', 'cancelar'].includes(cleanMsg)) {
                await whatsapp.sendMessage(remoteJid, "❌ Operação cancelada.");
                await redis.clearAll(remoteJid);
            }
            return;
        }

        // --- CLASSIFICAÇÃO DE COMANDOS ---
        const intent = await openai.classifyIntent(userMessage);
        console.log(`🤖 Intenção identificada: ${intent}`);

        if (["VENDA", "DESPESA", "CUSTO", "ENTRADA", "CADASTRO_PRODUTO"].includes(intent)) {
            await redis.saveDraft(remoteJid, userMessage);
            await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
            await whatsapp.sendMessage(remoteJid, `🤖 Confirma registro de **${intent}**? (Sim/Não)`);
        } else if (intent === "ESTOQUE") {
            const itens = await db.consultarEstoque(remoteJid);
            let lista = `📦 *Seu Estoque*\n\n`;
            itens.forEach(p => lista += `${p.estoque <= 5 ? "⚠️" : "✅"} ${p.nome}: ${p.estoque} un.\n`);
            await whatsapp.sendMessage(remoteJid, lista.length > 15 ? lista : "📦 Estoque vazio.");
        } else if (intent === "RELATORIO") {
            const r = await db.gerarRelatorioCompleto(remoteJid);
            await whatsapp.sendMessage(remoteJid, `📊 *Resumo*\n💰 Vendas: R$ ${r.venda}\n⚖️ *Saldo: R$ ${r.saldo.toFixed(2)}*`);
        }

    } catch (e) {
        console.error("❌ Erro fatal no processamento:", e.message);
    } finally {
        await redis.setLock(remoteJid, false);
    }
});

module.exports = router;