const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

async function savePedido(whatsapp_id, nome, detalhes) {
    const query = `
        INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, data_pedido)
        VALUES ($1, $2, $3, NOW());
    `;
    try {
        await pool.query(query, [whatsapp_id, nome, detalhes]);
        console.log(`🚀 SUCESSO: Registro de ${nome} salvo no banco.`);
    } catch (err) {
        console.error('❌ ERRO NO POSTGRES:', err.message);
        throw err;
    }
}

async function processarVendaAutomatica(whatsapp_id, nome_cliente, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const prodRes = await client.query(
            "SELECT id, preco, estoque FROM produtos WHERE nome ILIKE $1 FOR UPDATE",
            [`%${dadosIA.item}%`]
        );

        if (prodRes.rows.length === 0) throw new Error("Produto não encontrado");
        
        const produto = prodRes.rows[0];
        if (produto.estoque < dadosIA.qtd) throw new Error("Estoque insuficiente");

        const valorTotal = produto.preco * dadosIA.qtd;

        await client.query(
            "UPDATE produtos SET estoque = estoque - $1 WHERE id = $2",
            [dadosIA.qtd, produto.id]
        );

        await client.query(
            "INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, valor_venda, data_pedido) VALUES ($1, $2, $3, $4, NOW())",
            [whatsapp_id, nome_cliente, `${dadosIA.qtd}x ${dadosIA.item}`, valorTotal]
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

// CORREÇÃO: Exportando ambas as funções
module.exports = { savePedido, processarVendaAutomatica };