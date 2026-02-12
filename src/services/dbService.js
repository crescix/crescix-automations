const { Pool } = require('pg');
const jwt = require('jsonwebtoken'); // Necessário para o sistema de login

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

// --- GESTÃO DE PRODUTOS (UPSERT) ---
async function cadastrarProduto(whatsapp_id, dados) {
    // Se o produto já existe, ele atualiza o preço e SOMA a nova quantidade ao estoque
    const query = `
        INSERT INTO produtos (whatsapp_id, nome, preco, estoque) 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT (whatsapp_id, nome) 
        DO UPDATE SET 
            preco = EXCLUDED.preco, 
            estoque = produtos.estoque + EXCLUDED.estoque;
    `;
    await pool.query(query, [whatsapp_id, dados.item.toLowerCase(), dados.valor, dados.qtd || 0]);
}

// --- PROCESSAMENTO DE VENDA ---
async function processarVendaAutomatica(whatsapp_id, descricao, dados) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Busca o produto
        const prodRes = await client.query(
            'SELECT * FROM produtos WHERE whatsapp_id = $1 AND nome = $2',
            [whatsapp_id, dados.item.toLowerCase()]
        );

        if (prodRes.rows.length === 0) {
            throw new Error(`Produto "${dados.item}" não cadastrado`); // Erro que aparece no log
        }

        const produto = prodRes.rows[0];
        const total = dados.qtd * (dados.valor || produto.preco);

        // 2. Atualiza estoque
        const novoEstoque = produto.estoque - dados.qtd;
        await client.query('UPDATE produtos SET estoque = $1 WHERE id = $2', [novoEstoque, produto.id]);

        // 3. Registra a transação
        await client.query(
            'INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor, item_id, quantidade) VALUES ($1, $2, $3, $4, $5, $6)',
            [whatsapp_id, 'venda', descricao, total, produto.id, dados.qtd]
        );

        await client.query('COMMIT');
        return { total, novoEstoque, alerta: novoEstoque <= 5 ? "⚠️ Estoque baixo!" : null };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// --- RELATÓRIOS E CONSULTAS ---
async function consultarEstoque(whatsapp_id) {
    const res = await pool.query('SELECT nome, estoque FROM produtos WHERE whatsapp_id = $1 ORDER BY nome', [whatsapp_id]);
    return res.rows;
}

async function gerarRelatorioCompleto(whatsapp_id) {
    const res = await pool.query(
        "SELECT tipo, SUM(valor) as total FROM transacoes_crescix WHERE whatsapp_id = $1 AND data >= CURRENT_DATE GROUP BY tipo",
        [whatsapp_id]
    );
    
    const dados = { venda: 0, despesa: 0, custo: 0, entrada: 0 };
    res.rows.forEach(r => dados[r.tipo] = parseFloat(r.total));
    
    return {
        ...dados,
        saldo: dados.venda + dados.entrada - (dados.despesa + dados.custo)
    };
}

// --- AUTENTICAÇÃO DASHBOARD ---
async function gerarCodigoLogin(whatsapp_id) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
        'UPDATE usuarios_crescix SET login_code = $1, code_expires = NOW() + INTERVAL \'10 minutes\' WHERE whatsapp_id = $2',
        [codigo, whatsapp_id]
    );
    return codigo;
}

async function registrarMovimentacao(whatsapp_id, tipo, dados) {
    const query = `
        INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor) 
        VALUES ($1, $2, $3, $4)
    `;
    // O 'dados.item' vem da IA como a descrição do que foi comprado/gasto
    await pool.query(query, [whatsapp_id, tipo.toLowerCase(), dados.item, dados.valor]);
}

// Teste de conexão imediato
pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Erro ao conectar ao Postgres:', err.stack);
    }
    console.log('✅ Conexão com o Banco de Dados CrescIX estável!');
    release();
});

module.exports = {
    verificarOuCadastrarUsuario,
    cadastrarProduto,
    processarVendaAutomatica,
    registrarMovimentacao,
    consultarEstoque,
    gerarRelatorioCompleto,
    gerarCodigoLogin
};