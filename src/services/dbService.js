const { Pool } = require('pg');
const pool = new Pool({ /* ... mesmas configs ... */ });

// Lógica de Venda com Estoque (mantida e aprimorada)
async function processarVendaAutomatica(whatsapp_id, nome_cliente, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const prodRes = await client.query("SELECT id, preco, estoque FROM produtos WHERE nome ILIKE $1 FOR UPDATE", [`%${dadosIA.item}%`]);
        if (prodRes.rows.length === 0) throw new Error("Produto não cadastrado.");
        
        const produto = prodRes.rows[0];
        const valorTotal = produto.preco * dadosIA.qtd;

        await client.query("UPDATE produtos SET estoque = estoque - $1 WHERE id = $2", [dadosIA.qtd, produto.id]);
        await client.query(
            "INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor, data_pedido) VALUES ($1, 'venda', $2, $3, NOW())",
            [whatsapp_id, `${dadosIA.qtd}x ${dadosIA.item}`, valorTotal]
        );
        await client.query('COMMIT');
        return { total: valorTotal, novoEstoque: produto.estoque - dadosIA.qtd };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Registra Custos, Despesas e Entradas
async function registrarMovimentacao(whatsapp_id, tipo, dados) {
    const query = "INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor, data_pedido) VALUES ($1, $2, $3, $4, NOW())";
    await pool.query(query, [whatsapp_id, tipo.toLowerCase(), dados.item, dados.valor]);
}

// Gera o Resumo Financeiro do dia
async function gerarRelatorioDiario(whatsapp_id) {
    const query = `
        SELECT tipo, SUM(valor) as total 
        FROM transacoes_crescix 
        WHERE whatsapp_id = $1 AND data_pedido >= CURRENT_DATE 
        GROUP BY tipo;
    `;
    const res = await pool.query(query, [whatsapp_id]);
    let resumo = { venda: 0, entrada: 0, custo: 0, despesa: 0 };
    res.rows.forEach(row => resumo[row.tipo] = parseFloat(row.total));
    const saldo = (resumo.venda + resumo.entrada) - (resumo.custo + resumo.despesa);
    return { ...resumo, saldo };
}

module.exports = { processarVendaAutomatica, registrarMovimentacao, gerarRelatorioDiario };