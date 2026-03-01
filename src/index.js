// src/index.js — Ponto de entrada único da CrescIX Bot
require('dotenv').config();

const { Telegraf } = require('telegraf');
const { handleMessage, handleCallback } = require('./dispatcher');

// ── Escolhe o banco conforme a variável de ambiente ───────────────────────────
// USE_MOCK_DB=true  → banco em memória (para testar o fluxo sem PostgreSQL)
// USE_MOCK_DB=false → PostgreSQL real (produção)
const useMock = process.env.USE_MOCK_DB === 'true';
const { initDatabase } = useMock
    ? require('./mockDatabase')
    : require('./database');

const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

async function start() {
    // ── 1. Conecta ao banco ───────────────────────────────────────────────────
    let pool;
    try {
        pool = await initDatabase();
    } catch (err) {
        console.error('❌ Falha ao conectar ao banco:', err.message);
        process.exit(1);
    }

    // ── 2. Comando /start ─────────────────────────────────────────────────────
    bot.start(async (ctx) => {
        const nome = ctx.from.first_name || 'usuário';
        await ctx.reply(
            `👋 Olá, *${nome}*! Bem-vindo(a) à *CrescIX*.\n\n` +
            `Sou seu assistente financeiro inteligente para pequenos negócios.\n\n` +
            `Veja o que posso fazer por você:\n\n` +
            `💰 *Registrar vendas*\n_"Vendi 4 águas a 3 reais cada"_\n\n` +
            `🛒 *Registrar compras/custos*\n_"Comprei 3 sacos de arroz a 18 reais"_\n\n` +
            `🧾 *Registrar despesas*\n_"Paguei 150 reais de aluguel"_\n\n` +
            `📊 *Relatórios personalizados*\n_"Relatório de vendas da semana"_\n_"Histórico de despesas do mês"_\n\n` +
            `🎙️ Também aceito mensagens de *voz*!\n\n` +
            `É só me contar o que aconteceu! 🚀`,
            { parse_mode: 'Markdown' }
        );
    });

    // ── 3. Mensagens (texto e voz) ────────────────────────────────────────────
    bot.on('message', async (ctx) => {
        await handleMessage(ctx, pool);
    });

    // ── 4. Botão: Confirmar ───────────────────────────────────────────────────
    bot.action('confirmar_registro', async (ctx) => {
        await ctx.answerCbQuery();
        await handleCallback(ctx, pool, 'confirmar');
    });

    // ── 5. Botão: Cancelar / Não está certo ──────────────────────────────────
    bot.action('cancelar_registro', async (ctx) => {
        await ctx.answerCbQuery();
        await handleCallback(ctx, pool, 'cancelar');
    });

    // ── 6. Inicia o bot ───────────────────────────────────────────────────────
    try {
        await bot.launch();
        console.log('🚀 CrescIX Bot rodando no Telegram!');
    } catch (err) {
        console.error('❌ Erro ao iniciar o bot:', err.message);
        process.exit(1);
    }
}

start();

// Encerramento gracioso
process.once('SIGINT',  () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));