const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const pool = new Pool({
    connectionString: `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}/${process.env.DB_NAME}`,
    ssl: false
});

// --- GESTÃO DE USUÁRIOS ---
async function verificarOuCadastrarUsuario(whatsapp_id, nome) {
    const res = await pool.query(
        'INSERT INTO usuarios_crescix (whatsapp_id, nome) VALUES ($1, $2) ON CONFLICT (whatsapp_id) DO UPDATE SET nome = $2 RETURNING *',
        [whatsapp_id, nome]
    );
    return { user: res.rows[0], isNew: res.rowCount === 1 };
}

// --- GESTÃO DE PRODUTOS ---
async function cadastrarProduto(whatsapp_id, dados) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const prodRes = await client.query(`
            INSERT INTO produtos (whatsapp_id, nome, preco, estoque) 
            VALUES ($1, LOWER(TRIM($2)), $3, $4) 
            ON CONFLICT (whatsapp_id, nome) 
            DO UPDATE SET preco = EXCLUDED.preco, estoque = produtos.estoque + EXCLUDED.estoque
            RETURNING id;
        `, [whatsapp_id, dados.item, dados.valor, dados.qtd || 0]);

        const produtoId = prodRes.rows[0].id;
        if (dados.qtd > 0) {
            await client.query(
                'INSERT INTO historico_estoque (produto_id, quantidade, tipo_movimento) VALUES ($1, $2, $3)',
                [produtoId, dados.qtd, 'entrada']
            );
        }
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally { client.release(); }
}

// --- PROCESSAMENTO DE VENDA (Com Normalização) ---
async function processarVendaAutomatica(whatsapp_id, descricao, dados) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Busca normalizada: ignora espaços e maiúsculas
        const prodRes = await client.query(
            'SELECT * FROM produtos WHERE whatsapp_id = $1 AND LOWER(TRIM(nome)) = LOWER(TRIM($2))',
            [whatsapp_id, dados.item]
        );

        if (prodRes.rows.length === 0) throw new Error(`Produto "${dados.item}" não cadastrado`);

        const produto = prodRes.rows[0];
        const total = dados.qtd * (dados.valor || produto.preco);

        const novoEstoque = produto.estoque - dados.qtd;
        await client.query('UPDATE produtos SET estoque = $1 WHERE id = $2', [novoEstoque, produto.id]);

        const catRes = await client.query("SELECT id FROM categorias WHERE nome = 'Venda direta' LIMIT 1");
        const categoriaId = catRes.rows[0]?.id;

        await client.query(
            'INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor, categoria_id) VALUES ($1, $2, $3, $4, $5)',
            [whatsapp_id, 'venda', descricao, total, categoriaId]
        );

        await client.query(
            'INSERT INTO historico_estoque (produto_id, quantidade, tipo_movimento) VALUES ($1, $2, $3)',
            [produto.id, dados.qtd, 'saida']
        );

        await client.query('COMMIT');
        return { total, novoEstoque, alerta: novoEstoque <= 5 ? "⚠️ Estoque baixo!" : null };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally { client.release(); }
}

// --- CONSULTA DE ESTOQUE (Sempre retorna Array) ---
async function consultarEstoque(whatsapp_id) {
    const res = await pool.query(
        'SELECT nome, estoque, preco FROM produtos WHERE whatsapp_id = $1 ORDER BY nome', 
        [whatsapp_id]
    );
    return res.rows; 
}

// --- OUTRAS FUNÇÕES ---
async function registrarMovimentacao(whatsapp_id, tipo, dados) {
    const catRes = await pool.query(
        "SELECT id FROM categorias WHERE LOWER(nome) = LOWER($1) OR LOWER(tipo) = LOWER($2) LIMIT 1",
        [dados.item, tipo]
    );
    const categoriaId = catRes.rows[0]?.id;

    await pool.query(
        'INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor, categoria_id) VALUES ($1, $2, $3, $4, $5)',
        [whatsapp_id, tipo.toLowerCase(), dados.item, dados.valor, categoriaId]
    );
}

async function gerarRelatorioCompleto(whatsapp_id) {
    const res = await pool.query(
        "SELECT tipo, SUM(valor) as total FROM transacoes_crescix WHERE whatsapp_id = $1 AND data_pedido >= CURRENT_DATE GROUP BY tipo",
        [whatsapp_id]
    );
    const dados = { venda: 0, despesa: 0, custo: 0, entrada: 0 };
    res.rows.forEach(r => dados[r.tipo] = parseFloat(r.total));
    return { ...dados, saldo: dados.venda + dados.entrada - (dados.despesa + dados.custo) };
}

async function gerarCodigoLogin(whatsapp_id) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
        'UPDATE usuarios_crescix SET login_code = $1, login_expires = NOW() + INTERVAL \'10 minutes\' WHERE whatsapp_id = $2',
        [codigo, whatsapp_id]
    );
    return codigo;
}

module.exports = {
    pool,
    verificarOuCadastrarUsuario,
    cadastrarProduto,
    processarVendaAutomatica,
    registrarMovimentacao,
    consultarEstoque,
    gerarRelatorioCompleto,
    gerarCodigoLogin
};