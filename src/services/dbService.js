const { Pool } = require('pg');

// Configuração do pool de conexões usando as variáveis do Easypanel
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
    max: 20, // Máximo de conexões simultâneas
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * SALVAR PEDIDO: Mapeia os dados do bot para a tabela pedidos_crescix
 */
async function savePedido(remoteJid, pushName, rascunho) {
    const query = `
        INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, data_pedido)
        VALUES ($1, $2, $3, NOW())
        RETURNING id;
    `;
    
    const values = [remoteJid, pushName, rascunho];

    try {
        const res = await pool.query(query, values);
        console.log(`✅ Pedido salvo com sucesso! ID: ${res.rows[0].id}`);
        return res.rows[0].id;
    } catch (err) {
        console.error('❌ Erro ao salvar no banco de dados:', err.stack);
        throw err;
    }
}

module.exports = { savePedido };