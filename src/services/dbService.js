const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

async function savePedidoComValores(remoteJid, pushName, rascunho, dadosEstruturados) {
    const { item, qtd } = dadosEstruturados;

    try {
        // Busca o preço unitário definido no sistema para aquele item
        const prodRes = await pool.query(
            "SELECT preco FROM produtos WHERE nome ILIKE $1 LIMIT 1",
            [`%${item}%`]
        );

        if (prodRes.rows.length === 0) throw new Error("Produto não cadastrado no sistema.");

        const precoUnitario = prodRes.rows[0].preco;
        const valorTotal = precoUnitario * qtd;

        const query = `
            INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, valor_total, data_pedido)
            VALUES ($1, $2, $3, $4, NOW())
            RETURNING id;
        `;
        
        const res = await pool.query(query, [remoteJid, pushName, `${qtd}x ${item}`, valorTotal]);
        return { id: res.rows[0].id, total: valorTotal };
    } catch (err) {
        console.error('❌ Erro no banco:', err.message);
        throw err;
    }
}

module.exports = { savePedidoComValores };