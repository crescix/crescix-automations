const { Pool } = require('pg');
const jwt = require('jsonwebtoken'); // Necessário para o login

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 5432,
});

// --- GESTÃO DE USUÁRIO E LOGIN ---
async function verificarOuCadastrarUsuario(whatsapp_id, nome) {
    const res = await pool.query("SELECT id FROM usuarios_crescix WHERE whatsapp_id = $1", [whatsapp_id]);
    if (res.rows.length === 0) {
        await pool.query("INSERT INTO usuarios_crescix (whatsapp_id, nome) VALUES ($1, $2)", [whatsapp_id, nome]);
        return { isNew: true };
    }
    return { isNew: false };
}

async function gerarCodigoLogin(whatsapp_id) {
    const codigo = Math.floor(100000 + Math.random() * 900000).toString();
    const expiracao = new Date(Date.now() + 10 * 60000); 
    await pool.query("UPDATE usuarios_crescix SET login_code = $1, login_expires = $2 WHERE whatsapp_id = $3", [codigo, expiracao, whatsapp_id]);
    return codigo;
}

async function validarLogin(whatsapp_id, codigo) {
    const res = await pool.query(
        "SELECT id FROM usuarios_crescix WHERE whatsapp_id = $1 AND login_code = $2 AND login_expires > NOW()",
        [whatsapp_id, codigo]
    );
    if (res.rows.length === 0) return null;
    return jwt.sign({ whatsapp_id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// --- LÓGICA DE NEGÓCIO (VENDAS E ESTOQUE) ---
async function processarVendaAutomatica(whatsapp_id, rascunho, dadosIA) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const prodRes = await client.query(
            "SELECT id, preco, estoque, nome FROM produtos WHERE nome ILIKE $1 AND whatsapp_id = $2 FOR UPDATE",
            [`%${dadosIA.item}%`, whatsapp_id]
        );

        if (prodRes.rows.length === 0) throw new Error("Produto não cadastrado.");
        
        const produto = prodRes.rows[0];
        const qtd = dadosIA.qtd || 1;
        const total = produto.preco * qtd;
        const novoEstoque = produto.estoque - qtd;

        await client.query("UPDATE produtos SET estoque = $1 WHERE id = $2", [novoEstoque, produto.id]);
        await client.query(
            "INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor) VALUES ($1, 'venda', $2, $3)",
            [whatsapp_id, `${qtd}x ${produto.nome}`, total]
        );

        await client.query('COMMIT');
        return { total, novoEstoque, alerta: novoEstoque <= 5 ? `⚠️ Estoque crítico: ${produto.nome} (${novoEstoque} unid.)` : "" };
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function consultarEstoque(whatsapp_id) {
    const res = await pool.query("SELECT nome, estoque, preco FROM produtos WHERE whatsapp_id = $1 ORDER BY nome", [whatsapp_id]);
    return res.rows;
}

async function cadastrarProduto(whatsapp_id, dados) {
    // Insere ou atualiza o preço e soma ao estoque existente
    const query = `
        INSERT INTO produtos (whatsapp_id, nome, preco, estoque) 
        VALUES ($1, $2, $3, $4) 
        ON CONFLICT (nome) DO UPDATE 
        SET preco = $3, estoque = produtos.estoque + $4;
    `;
    await pool.query(query, [whatsapp_id, dados.item, dados.valor, dados.qtd || 0]);
}

// --- RELATÓRIOS E ESTATÍSTICAS ---
async function gerarRelatorioCompleto(whatsapp_id) {
    const finRes = await pool.query(
        "SELECT tipo, SUM(valor) as total FROM transacoes_crescix WHERE whatsapp_id = $1 AND data_pedido >= CURRENT_DATE GROUP BY tipo",
        [whatsapp_id]
    );
    let r = { venda: 0, entrada: 0, custo: 0, despesa: 0 };
    finRes.rows.forEach(row => r[row.tipo] = parseFloat(row.total));

    const topRes = await pool.query(
        "SELECT descricao, COUNT(*) as qtd FROM transacoes_crescix WHERE whatsapp_id = $1 AND tipo = 'venda' AND data_pedido >= NOW() - INTERVAL '7 days' GROUP BY descricao ORDER BY qtd DESC LIMIT 5",
        [whatsapp_id]
    );
    return { ...r, saldo: (r.venda + r.entrada) - (r.custo + r.despesa), ranking: topRes.rows };
}

async function buscarHistoricoVendas(whatsapp_id) {
    const res = await pool.query(
        "SELECT TO_CHAR(data_pedido, 'DD/MM') as data, SUM(valor) as total FROM transacoes_crescix WHERE whatsapp_id = $1 AND tipo = 'venda' GROUP BY data, data_pedido ORDER BY data_pedido DESC LIMIT 7",
        [whatsapp_id]
    );
    return res.rows;
}

async function registrarMovimentacao(whatsapp_id, tipo, dados) {
    await pool.query(
        "INSERT INTO transacoes_crescix (whatsapp_id, tipo, descricao, valor) VALUES ($1, $2, $3, $4)",
        [whatsapp_id, tipo.toLowerCase(), dados.item, dados.valor]
    );
}

module.exports = { 
    verificarOuCadastrarUsuario, processarVendaAutomatica, gerarRelatorioCompleto, 
    gerarCodigoLogin, consultarEstoque, cadastrarProduto, registrarMovimentacao, 
    validarLogin, buscarHistoricoVendas 
};