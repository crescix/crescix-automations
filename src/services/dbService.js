const { Pool } = require('pg');

// Configuração do pool de conexões usando as variáveis de ambiente do Easypanel
const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/**
 * SALVAR PEDIDO: Registra a venda na tabela pedidos_crescix para estatísticas
 */
async function savePedido(whatsapp_id, nome, detalhes) {
    const query = `
        INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, data_pedido)
        VALUES ($1, $2, $3, NOW());
    `;
    
    try {
        await pool.query(query, [whatsapp_id, nome, detalhes]);
        console.log(`🚀 SUCESSO: Dados de ${nome} salvos no banco de dados da CrescIX.`);
    } catch (err) {
        console.error('❌ ERRO AO INSERIR NO POSTGRES:', err.message);
        throw err; 
    }
}

module.exports = { savePedido };