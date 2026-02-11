const { Pool } = require('pg');

// O Pool gerencia as conexões automaticamente
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,      // Verifique se no Easypanel está 'postgres' ou 'crescix'
    password: process.env.DB_PASSWORD, // O erro está vindo daqui
    database: process.env.DB_NAME,
    port: 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * SALVAR PEDIDO: Insere os dados na tabela pedidos_crescix
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
        // Este log vai te mostrar o erro de autenticação se persistir
        console.error('❌ ERRO AO INSERIR NO POSTGRES:', err.message);
        throw err; 
    }
}

module.exports = { savePedido };