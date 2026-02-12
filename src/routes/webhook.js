const express = require('express');
const router = express.Router();
const whatsapp = require('../services/whatsappService');
const openai = require('../services/openaiService');
const redis = require('../services/redisService');
const db = require('../services/dbService');

router.post("/", async (req, res) => {
    // 1. Resposta imediata para evitar reenvios da Evolution
    res.sendStatus(200);

    const event = req.body.event;
    const data = req.body.data;

    // 2. Filtro de segurança: ignorar mensagens do próprio bot ou eventos irrelevantes
    if (event !== 'messages.upsert' || !data?.key || data.key.fromMe) return;

    const remoteJid = data.key.remoteJid;
    let userMessage = "";

    try {
        // --- PROCESSAMENTO DE ENTRADA (Áudio ou Texto) ---
        if (data.message?.audioMessage) {
            const base64Audio = data.message.audioMessage.base64;
            if (base64Audio) {
                userMessage = await openai.transcribeAudio(base64Audio);
            }
        } else {
            userMessage = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
        }

        if (!userMessage) return;

        // --- SISTEMA DE TRAVA E IDENTIFICAÇÃO (REDIS/DB) ---
        if (await redis.isLocked(remoteJid)) return;
        await redis.setLock(remoteJid, true);

        // Garante que o usuário existe e busca o estado atual
        await db.verificarOuCadastrarUsuario(remoteJid, data.pushName || "Motorista");
        const status = await redis.getStatus(remoteJid);

        console.log(`📩 Mensagem de ${remoteJid}: "${userMessage}" | Estado: ${status || 'Livre'}`);

        // --- BLOCO A: LÓGICA DE CONFIRMAÇÃO (Se houver estado ativo) ---
        if (status?.startsWith("aguardando_")) {
            const cleanMsg = userMessage.toLowerCase().trim();
            
            if (['sim', 's', 'confirmar', 'ok'].includes(cleanMsg)) {
                const tipo = status.replace("aguardando_", "");
                const rascunho = await redis.getDraft(remoteJid);
                const dados = await openai.extrairDadosFinanceiros(rascunho);

                try {
                    if (tipo === "venda") {
                        const r = await db.processarVendaAutomatica(remoteJid, rascunho, dados);
                        await whatsapp.sendMessage(remoteJid, `✅ Venda de R$ ${r.total.toFixed(2)} salva!\n📦 Estoque: ${r.novoEstoque} un. ${r.alerta || ""}`);
                    } else if (tipo === "entrada" || tipo === "cadastro_produto") {
                        await db.cadastrarProduto(remoteJid, dados);
                        await whatsapp.sendMessage(remoteJid, `✅ Estoque de *${dados.item}* atualizado!`);
                    } else {
                        await db.registrarMovimentacao(remoteJid, tipo, dados);
                        await whatsapp.sendMessage(remoteJid, `✅ ${tipo.toUpperCase()} registrado com sucesso!`);
                    }
                } catch (dbError) {
                    await whatsapp.sendMessage(remoteJid, `⚠️ Erro: ${dbError.message}`);
                }
                await redis.clearAll(remoteJid);
            } else if (['não', 'nao', 'n', 'cancelar'].includes(cleanMsg)) {
                await whatsapp.sendMessage(remoteJid, "❌ Operação cancelada.");
                await redis.clearAll(remoteJid);
            }
            return; // Encerra aqui se estava aguardando confirmação
        }

        // --- BLOCO B: CLASSIFICAÇÃO DE NOVOS COMANDOS ---
        const intent = await openai.classifyIntent(userMessage);

        if (["VENDA", "DESPESA", "CUSTO", "ENTRADA", "CADASTRO_PRODUTO"].includes(intent)) {
            await redis.saveDraft(remoteJid, userMessage);
            await redis.setStatus(remoteJid, `aguardando_${intent.toLowerCase()}`);
            await whatsapp.sendMessage(remoteJid, `🤖 Confirma registro de **${intent}**? (Sim/Não)`);
        } else if (intent === "ESTOQUE") {
            const itens = await db.consultarEstoque(remoteJid);
            if (!Array.isArray(itens) || itens.length === 0) {
                await whatsapp.sendMessage(remoteJid, "📦 Seu estoque está vazio.");
            } else {
                let lista = `📦 *Seu Estoque Atual*\n\n`;
                itens.forEach(p => {
                    const alerta = p.estoque <= 5 ? "⚠️" : "✅";
                    lista += `${alerta} *${p.nome.toUpperCase()}*\n💰 R$ ${p.preco} | 🔢 ${p.estoque} un.\n\n`;
                });
                await whatsapp.sendMessage(remoteJid, lista);
            }
        } else if (intent === "RELATORIO") {
            const r = await db.gerarRelatorioCompleto(remoteJid);
            await whatsapp.sendMessage(remoteJid, `📊 *Resumo de Hoje*\n💰 Vendas: R$ ${r.venda}\n💸 Custos: R$ ${r.custo}\n⚖️ *Saldo: R$ ${r.saldo.toFixed(2)}*`);
        }

    } catch (e) {
        console.error("❌ Erro no processamento do Webhook:", e.message);
    } finally {
        // Libera a trava para o próximo comando
        await redis.setLock(remoteJid, false);
    }
});

module.exports = router;