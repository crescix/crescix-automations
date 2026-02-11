const { Pool } = require('pg');

// Configuração de conexão usando as variáveis do seu Easypanel
const pool = new Pool({
    host: process.env.DB_HOST || 'postrgres', // Nome do serviço no Easypanel
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'crescix', // Nome do banco que criamos
    port: 5432,
});

/**
 * Salva o pedido final na tabela pedidos_crescix
 */
async function savePedido(telefone, nome, texto) {
    const query = `
        INSERT INTO pedidos_crescix (telefone, nome_cliente, pedido_texto)
        VALUES ($1, $2, $3)
        RETURNING id;
    `;
    const values = [telefone, nome, texto];

    try {
        const res = await pool.query(query, values);
        console.log(`✅ Pedido salvo no banco! ID: ${res.rows[0].id}`);
        return res.rows[0].id;
    } catch (err) {
        console.error('❌ Erro ao salvar no Postgres:', err.stack);
        throw err;
    }
}

module.exports = { savePedido };