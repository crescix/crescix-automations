const { Pool } = require('pg');
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

async function processarVendaAutomatica(whatsapp_id, nome_cliente, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Busca o produto exato (Ex: 'água Water')
        const prodRes = await client.query(
            "SELECT id, preco, estoque FROM produtos WHERE nome ILIKE $1 FOR UPDATE",
            [`%${dadosIA.item}%`]
        );

        if (prodRes.rows.length === 0) throw new Error("Produto não cadastrado.");
        
        const produto = prodRes.rows[0];
        const valorTotal = produto.preco * dadosIA.qtd;

        // Subtrai do estoque e salva o valor financeiro
        await client.query("UPDATE produtos SET estoque = estoque - $1 WHERE id = $2", [dadosIA.qtd, produto.id]);
        
        await client.query(
            "INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, valor_venda, data_pedido) VALUES ($1, $2, $3, $4, NOW())",
            [whatsapp_id, nome_cliente, rascunho, valorTotal]
        );

        await client.query('COMMIT');
        return { total: valorTotal, novoEstoque: produto.estoque - dadosIA.qtd };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

module.exports = { processarVendaAutomatica };