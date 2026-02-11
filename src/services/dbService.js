const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

/**
 * Salva um log simples do pedido (opcional)
 */
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

/**
 * LÓGICA DE VENDA: Busca preço, subtrai estoque e calcula valor total
 */
async function processarVendaAutomatica(whatsapp_id, nome_cliente, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        // Inicia transação: se algo falhar, nada é alterado no banco
        await client.query('BEGIN'); 

        // 1. Busca o produto e trava a linha para atualização (FOR UPDATE)
        const prodRes = await client.query(
            "SELECT id, preco, estoque FROM produtos WHERE nome ILIKE $1 FOR UPDATE",
            [`%${dadosIA.item}%`]
        );

        if (prodRes.rows.length === 0) {
            throw new Error(`Produto "${dadosIA.item}" não encontrado no cadastro.`);
        }
        
        const produto = prodRes.rows[0];
        
        // Verifica se há estoque suficiente antes de vender
        if (produto.estoque < dadosIA.qtd) {
            throw new Error(`Estoque insuficiente para "${dadosIA.item}". Disponível: ${produto.estoque}`);
        }

        // Cálculo matemático: Preço x Quantidade extraída pela IA
        const valorTotal = produto.preco * dadosIA.qtd;

        // 2. Subtrai a quantidade vendida do estoque atual
        await client.query(
            "UPDATE produtos SET estoque = estoque - $1 WHERE id = $2",
            [dadosIA.qtd, produto.id]
        );

        // 3. Registra o pedido final com o valor financeiro para estatísticas
        await client.query(
            "INSERT INTO pedidos_crescix (whatsapp_id, nome_cliente, detalhes, valor_venda, data_pedido) VALUES ($1, $2, $3, $4, NOW())",
            [whatsapp_id, nome_cliente, `${dadosIA.qtd}x ${dadosIA.item}`, valorTotal]
        );

        // Finaliza a transação com sucesso
        await client.query('COMMIT');
        
        return { 
            total: valorTotal, 
            novoEstoque: produto.estoque - dadosIA.qtd,
            item: dadosIA.item 
        };
    } catch (e) {
        // Em caso de erro (ex: produto não existe), cancela todas as alterações feitas no BEGIN
        await client.query('ROLLBACK');
        throw e;
    } finally {
        // Libera a conexão de volta para o pool
        client.release();
    }
}

// Exportando as duas funções para serem usadas no webhook.js
module.exports = { savePedido, processarVendaAutomatica };