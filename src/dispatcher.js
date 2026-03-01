// src/dispatcher.js
const { Markup } = require('telegraf');
const {
    classifyIntent,
    extrairDadosFinanceiros,
    extrairParametrosRelatorio,
    transcribeAudio,
} = require('./services/openaiService');
const userService = require('./services/userService');
const { gerarExcelFinanceiro } = require('./services/excelService');

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const INTENCOES_FINANCEIRAS = ['ENTRADA', 'DESPESA', 'CUSTO'];

const LABEL_OPERACAO = {
    ENTRADA: '💰 Venda / Entrada',
    DESPESA: '🧾 Despesa / Gasto',
    CUSTO:   '🛒 Compra / Custo',
};

const LABEL_TIPO_RELATORIO = {
    ENTRADA: 'Vendas',
    DESPESA: 'Despesas',
    CUSTO:   'Compras / Custos',
    todos:   'Todas as operações',
};

// ─────────────────────────────────────────────────────────────────────────────
// PONTO DE ENTRADA — handleMessage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa qualquer mensagem recebida (texto ou voz).
 */
async function handleMessage(ctx, pool) {
    const telegramId = ctx.from.id.toString();
    const user = await userService.getOrCreateUser(pool, telegramId);

    // ── Captura a mensagem ───────────────────────────────────────────────────
    let userMessage = ctx.message?.text || '';

    if (ctx.message?.voice) {
        try {
            const fileLink = await ctx.telegram.getFileLink(ctx.message.voice.file_id);
            userMessage = await transcribeAudio(fileLink.href);
            await ctx.reply(`🎙️ _Entendi: "${userMessage}"_`, { parse_mode: 'Markdown' });
        } catch {
            return ctx.reply('❌ Não consegui entender o áudio. Tente enviar como texto.');
        }
    }

    if (!userMessage.trim()) return;

    const msgLow = userMessage.toLowerCase().trim();

    // ── FLUXO 1: SAUDAÇÃO ────────────────────────────────────────────────────
    const SAUDACOES = ['oi', 'olá', 'ola', 'hey', 'hello', 'bom dia', 'boa tarde', 'boa noite', 'tudo bem', 'e aí', 'e ai', 'salve'];
    if (SAUDACOES.some((s) => msgLow === s || msgLow.startsWith(s + ' ') || msgLow.startsWith(s + '!'))) {
        const nome = ctx.from.first_name || 'usuário';
        return ctx.reply(
            `👋 Olá, *${nome}*! Como posso te ajudar hoje?\n\n` +
            `Aqui estão alguns exemplos do que posso fazer:\n\n` +
            `💰 *Registrar venda:*\n_"Vendi 4 águas a 3 reais cada"_\n\n` +
            `🛒 *Registrar compra/custo:*\n_"Comprei 3 sacos de arroz a 18 reais"_\n\n` +
            `🧾 *Registrar despesa:*\n_"Paguei 150 reais de aluguel"_\n\n` +
            `📊 *Ver relatório:*\n_"Relatório de vendas da semana"_\n_"Histórico do mês"_`,
            { parse_mode: 'Markdown' }
        );
    }

    // ── Classifica a intenção com a IA ───────────────────────────────────────
    let intent;
    try {
        intent = await classifyIntent(userMessage);
    } catch (err) {
        console.error('[classifyIntent] Erro:', err);
        return ctx.reply('❌ Tive um problema técnico. Tente novamente em instantes.');
    }

    // ── FLUXO 2: RELATÓRIO ───────────────────────────────────────────────────
    if (intent === 'RELATORIO') {
        return handleRelatorio(ctx, pool, user, userMessage);
    }

    // ── FLUXO 3: TRANSAÇÃO FINANCEIRA ────────────────────────────────────────
    if (INTENCOES_FINANCEIRAS.includes(intent)) {
        return handleTransacao(ctx, pool, user, userMessage, intent);
    }

    // ── FLUXO 4: MENSAGEM NÃO RECONHECIDA ────────────────────────────────────
    return ctx.reply(
        '🤷 Não consegui entender o que você quis dizer.\n\n' +
        'Tente descrever de forma mais direta, por exemplo:\n' +
        '• _"Vendi 2 coxinhas a 5 reais"_\n' +
        '• _"Paguei 80 reais de conta de luz"_\n' +
        '• _"Relatório dos últimos 7 dias"_',
        { parse_mode: 'Markdown' }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO DE TRANSAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

async function handleTransacao(ctx, pool, user, userMessage, intent) {
    let dados;
    try {
        dados = await extrairDadosFinanceiros(userMessage);
    } catch (err) {
        console.error('[extrairDadosFinanceiros] Erro:', err);
        return ctx.reply(
            '❌ Não consegui identificar os dados dessa operação.\n\n' +
            'Por favor, tente ser mais específico. Exemplo:\n' +
            '_"Vendi 4 garrafas de água a 3 reais cada"_',
            { parse_mode: 'Markdown' }
        );
    }

    // Valida os dados extraídos
    if (!dados.item || isNaN(dados.valor) || isNaN(dados.qtd) || dados.valor <= 0 || dados.qtd <= 0) {
        return ctx.reply(
            '⚠️ Não consegui identificar todos os dados necessários.\n\n' +
            'Preciso saber:\n' +
            '• *O quê* foi vendido/comprado\n' +
            '• *Quanto* custou cada unidade\n' +
            '• *Quantas* unidades\n\n' +
            'Exemplo: _"Vendi 4 garrafas de água a 3 reais cada"_',
            { parse_mode: 'Markdown' }
        );
    }

    const total = Number(dados.valor) * Number(dados.qtd);
    const rascunho = { ...dados, type: intent };

    // Salva rascunho aguardando confirmação
    await pool.query(
        'UPDATE users SET pending_transaction = $1 WHERE id = $2',
        [JSON.stringify(rascunho), user.id]
    );

    return ctx.reply(
        `🤖 *Entendi! Confirme o registro abaixo:*\n\n` +
        `📋 *Tipo:* ${LABEL_OPERACAO[intent]}\n` +
        `📦 *Item:* ${dados.item}\n` +
        `💵 *Valor unitário:* R$ ${Number(dados.valor).toFixed(2)}\n` +
        `🔢 *Quantidade:* ${dados.qtd} unidade(s)\n` +
        `💰 *Total:* R$ ${total.toFixed(2)}\n\n` +
        `_Está correto?_`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('✅ Confirmar', 'confirmar_registro'),
                Markup.button.callback('❌ Não está certo', 'cancelar_registro'),
            ]),
        }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// FLUXO DE RELATÓRIO
// ─────────────────────────────────────────────────────────────────────────────

async function handleRelatorio(ctx, pool, user, userMessage) {
    let params;
    try {
        params = await extrairParametrosRelatorio(userMessage);
    } catch (err) {
        console.error('[extrairParametrosRelatorio] Erro:', err);
        params = { dias: 7, tipo: 'todos', label: 'últimos 7 dias' };
    }

    const { dias, tipo, label } = params;

    // Confirmação antes de gerar o relatório
    const rascunhoRelatorio = { relatorio: true, dias, tipo, label };
    await pool.query(
        'UPDATE users SET pending_transaction = $1 WHERE id = $2',
        [JSON.stringify(rascunhoRelatorio), user.id]
    );

    const tipoLabel = LABEL_TIPO_RELATORIO[tipo] || 'Todas as operações';

    return ctx.reply(
        `📊 *Entendi! Confirme o relatório abaixo:*\n\n` +
        `📅 *Período:* ${label}\n` +
        `🔍 *Tipo:* ${tipoLabel}\n\n` +
        `_Posso gerar esse relatório?_`,
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                Markup.button.callback('✅ Gerar relatório', 'confirmar_registro'),
                Markup.button.callback('❌ Não está certo', 'cancelar_registro'),
            ]),
        }
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// CALLBACK DOS BOTÕES (Confirmar / Cancelar)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Processa a resposta do usuário aos botões inline.
 * @param {string} acao - 'confirmar' | 'cancelar'
 */
async function handleCallback(ctx, pool, acao) {
    const telegramId = ctx.from.id.toString();
    const user = await userService.getOrCreateUser(pool, telegramId);

    // ── CANCELAR ─────────────────────────────────────────────────────────────
    if (acao === 'cancelar') {
        await pool.query('UPDATE users SET pending_transaction = NULL WHERE id = $1', [user.id]);

        await ctx.editMessageText('❌ *Operação cancelada.*', { parse_mode: 'Markdown' });

        return ctx.reply(
            '📝 Tudo bem! Por favor, tente novamente com mais detalhes.\n\n' +
            'Exemplos de como descrever:\n' +
            '• _"Vendi 4 garrafas de água a 3 reais cada"_\n' +
            '• _"Comprei 3 sacos de arroz a 18 reais cada"_\n' +
            '• _"Relatório de vendas dos últimos 7 dias"_',
            { parse_mode: 'Markdown' }
        );
    }

    // ── CONFIRMAR ─────────────────────────────────────────────────────────────
    if (acao === 'confirmar') {
        if (!user.pending_transaction) {
            return ctx.editMessageText('⚠️ Não há nenhuma operação pendente para confirmar.');
        }

        const rascunho = user.pending_transaction; // já parseado no userService

        // ── É um relatório? ──────────────────────────────────────────────────
        if (rascunho.relatorio === true) {
            return confirmarRelatorio(ctx, pool, user, rascunho);
        }

        // ── É uma transação financeira? ──────────────────────────────────────
        return confirmarTransacao(ctx, pool, user, rascunho);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAÇÃO DE TRANSAÇÃO
// ─────────────────────────────────────────────────────────────────────────────

async function confirmarTransacao(ctx, pool, user, rascunho) {
    try {
        const total = Number(rascunho.valor) * Number(rascunho.qtd);

        await pool.query(
            `INSERT INTO transactions (user_id, type, item, amount, quantity)
             VALUES ($1, $2, $3, $4, $5)`,
            [user.id, rascunho.type, rascunho.item, rascunho.valor, rascunho.qtd]
        );

        await pool.query('UPDATE users SET pending_transaction = NULL WHERE id = $1', [user.id]);

        await ctx.editMessageText(
            `✅ *Operação registrada com sucesso!*\n\n` +
            `📋 *Tipo:* ${LABEL_OPERACAO[rascunho.type] || rascunho.type}\n` +
            `📦 *Item:* ${rascunho.item} (${rascunho.qtd} unid.)\n` +
            `💰 *Total:* R$ ${total.toFixed(2)}`,
            { parse_mode: 'Markdown' }
        );

        return ctx.reply('Registro salvo no caixa da CrescIX. ✅\n\nPosso ajudar com mais alguma coisa?');
    } catch (err) {
        console.error('[confirmarTransacao] Erro:', err);
        return ctx.reply('❌ Erro ao salvar o registro. Tente novamente.');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRMAÇÃO DE RELATÓRIO
// ─────────────────────────────────────────────────────────────────────────────

async function confirmarRelatorio(ctx, pool, user, rascunho) {
    const { dias, tipo, label } = rascunho;

    try {
        await ctx.editMessageText(
            `⏳ *Gerando seu relatório...*\n📅 Período: ${label}`,
            { parse_mode: 'Markdown' }
        );

        // Monta a query com filtro de tipo opcional
        const tipoFiltro = tipo !== 'todos' ? `AND type = '${tipo}'` : '';
        const query = `
            SELECT created_at, type, item, quantity, amount
            FROM transactions
            WHERE user_id = $1
              AND created_at >= NOW() - ($2 || ' days')::INTERVAL
              ${tipoFiltro}
            ORDER BY created_at DESC
        `;

        const { rows } = await pool.query(query, [user.id, dias]);

        await pool.query('UPDATE users SET pending_transaction = NULL WHERE id = $1', [user.id]);

        if (rows.length === 0) {
            return ctx.reply(
                `📭 *Nenhum registro encontrado.*\n\n` +
                `Não há dados de *${LABEL_TIPO_RELATORIO[tipo] || 'operações'}* para o período: *${label}*.`,
                { parse_mode: 'Markdown' }
            );
        }

        const excelBuffer = await gerarExcelFinanceiro(rows);
        const nomeArquivo = `CrescIX_${tipo !== 'todos' ? tipo + '_' : ''}${dias}dias.xlsx`;

        return ctx.replyWithDocument(
            { source: excelBuffer, filename: nomeArquivo },
            {
                caption:
                    `✅ *Relatório pronto!*\n\n` +
                    `📅 *Período:* ${label}\n` +
                    `🔍 *Tipo:* ${LABEL_TIPO_RELATORIO[tipo] || 'Todos'}\n` +
                    `📋 *Registros:* ${rows.length}`,
                parse_mode: 'Markdown',
            }
        );
    } catch (err) {
        console.error('[confirmarRelatorio] Erro:', err);
        return ctx.reply('❌ Tive um problema ao gerar o relatório. Tente novamente.');
    }
}

module.exports = { handleMessage, handleCallback };