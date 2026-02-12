const { Pool } = require('pg');
const pool = new Pool({ /* Suas configs do Easypanel */ });

async function verificarOuCadastrarUsuario(whatsapp_id, nome) {
    const res = await pool.query("SELECT id FROM usuarios_crescix WHERE whatsapp_id = $1", [whatsapp_id]);
    if (res.rows.length === 0) {
        await pool.query("INSERT INTO usuarios_crescix (whatsapp_id, nome) VALUES ($1, $2)", [whatsapp_id, nome]);
        return { isNew: true };
    }
    return { isNew: false };
}

async function processarVendaAutomatica(whatsapp_id, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const prodRes = await client.query("SELECT id, preco, estoque, nome FROM produtos WHERE nome ILIKE $1 AND whatsapp_id = $2 FOR UPDATE", [`%${dadosIA.item}%`, whatsapp_id]);
        if (prodRes.rows.length === 0) throw new Error("Produto não cadastrado.");
        
        const produto = prodRes.rows[0];
        const qtd = dadosIA.qtd || 1;
        const total = produto.preco * qtd;
        const novoEstoque = produto.estoque - qtd;

        await client.query("UPDATE produtos SET estoque = $1 WHERE id = $2", [novoEstoque, produto.id]);
        await client.query("INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor) VALUES ($1, 'venda', $2, $3)", [whatsapp_id, `${qtd}x ${produto.nome}`, total]);
        await client.query('COMMIT');

        return { total, novoEstoque, alerta: novoEstoque <= 5 ? `⚠️ Estoque crítico: ${produto.nome} (${novoEstoque} unid.)` : "" };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function gerarRelatorioCompleto(whatsapp_id) {
    const finRes = await pool.query("SELECT tipo, SUM(valor) as total FROM transacoes_crescix WHERE whatsapp_id = $1 AND data_pedido >= CURRENT_DATE GROUP BY tipo", [whatsapp_id]);
    let r = { venda: 0, entrada: 0, custo: 0, despesa: 0 };
    finRes.rows.forEach(row => r[row.tipo] = parseFloat(row.total));

    const topRes = await pool.query("SELECT descricao, COUNT(*) as qtd FROM transacoes_crescix WHERE whatsapp_id = $1 AND tipo = 'venda' AND data_pedido >= NOW() - INTERVAL '7 days' GROUP BY descricao ORDER BY qtd DESC LIMIT 5", [whatsapp_id]);
    
    return { ...r, saldo: (r.venda + r.entrada) - (r.custo + r.despesa), ranking: topRes.rows };
}

async function gerarCodigoLogin(whatsapp_id) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracao = new Date(Date.now() + 10 * 60000); 
    await pool.query("UPDATE usuarios_crescix SET login_code = $1, login_expires = $2 WHERE whatsapp_id = $3", [codigo, expiracao, whatsapp_id]);
    return codigo;
}

// Funções auxiliares (Consultar estoque, cadastrar produto, registrar movimentação)
async function consultarEstoque(whatsapp_id) { /* Select na tabela produtos */ }
async function cadastrarProduto(whatsapp_id, dados) { /* Insert ou Update na tabela produtos */ }
async function registrarMovimentacao(w, t, d) { /* Insert na tabela transacoes_crescix */ }

module.exports = { verificarOuCadastrarUsuario, processarVendaAutomatica, gerarRelatorioCompleto, gerarCodigoLogin, consultarEstoque, cadastrarProduto, registrarMovimentacao };