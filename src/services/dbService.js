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
        console.log(`🚀 SUCESSO: Pedido de ${nome} salvo no banco.`);
    } catch (err) {
        console.error('❌ ERRO NO POSTGRES:', err.message); // Verificaremos este erro no log
        throw err;
    }
}

module.exports = { savePedido };