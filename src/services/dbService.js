const { Pool } = require('pg');

// Configuração do pool usando as variáveis do seu Easypanel
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,      
    password: process.env.DB_PASSWORD, // O ERRO ESTÁ AQUI NO ENV
    database: process.env.DB_NAME,
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * SALVAR PEDIDO: Registra a venda na tabela pedidos_crescix
 */
async function savePedido(whatsapp_id, nome, detalhes) {
    const query = `
        INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, data_pedido)
        VALUES ($1, $2, $3, NOW());
    `;
    
    try {
        await pool.query(query, [whatsapp_id, nome, detalhes]);
        console.log(`🚀 SUCESSO: O pedido de ${nome} foi gravado no banco.`);
    } catch (err) {
        // Log detalhado para sabermos se o erro de senha continua
        console.error('❌ ERRO AO INSERIR NO POSTGRES:', err.message);
        throw err; 
    }
}

module.exports = { savePedido };