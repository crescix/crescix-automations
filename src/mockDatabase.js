// src/mockDatabase.js
// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS EM MEMÓRIA — apenas para testar o fluxo do bot
// Substitui o PostgreSQL durante o desenvolvimento local.
// Quando o banco real estiver pronto, basta trocar o import no index.js.
// ─────────────────────────────────────────────────────────────────────────────

// Simula as tabelas em memória
const db = {
    users: [],        // { id, phone_number, pending_transaction, last_interaction }
    transactions: [], // { id, user_id, type, item, amount, quantity, created_at }
};

let nextUserId = 1;
let nextTransactionId = 1;

/**
 * Simula pool.query() do pg (node-postgres).
 * Suporta apenas as queries usadas pelo dispatcher e userService.
 */
function query(sql, params = []) {
    const s = sql.replace(/\s+/g, ' ').trim().toLowerCase();

    // ── INSERT INTO users ... ON CONFLICT ... RETURNING * ────────────────────
    if (s.includes('insert into users')) {
        const telegramId = params[0];
        let user = db.users.find((u) => u.phone_number === telegramId);

        if (user) {
            user.last_interaction = new Date();
        } else {
            user = {
                id: nextUserId++,
                phone_number: telegramId,
                pending_transaction: null,
                last_interaction: new Date(),
                created_at: new Date(),
            };
            db.users.push(user);
        }

        return Promise.resolve({ rows: [{ ...user }] });
    }

    // ── UPDATE users SET pending_transaction ─────────────────────────────────
    if (s.includes('update users set pending_transaction')) {
        const valor = params[0]; // pode ser JSON string ou NULL
        const userId = params[1];
        const user = db.users.find((u) => u.id === userId);

        if (user) {
            user.pending_transaction = valor
                ? (typeof valor === 'string' ? JSON.parse(valor) : valor)
                : null;
        }

        return Promise.resolve({ rows: [] });
    }

    // ── INSERT INTO transactions ─────────────────────────────────────────────
    if (s.includes('insert into transactions')) {
        const [user_id, type, item, amount, quantity] = params;
        const transaction = {
            id: nextTransactionId++,
            user_id,
            type,
            item,
            amount: Number(amount),
            quantity: Number(quantity),
            created_at: new Date(),
        };
        db.transactions.push(transaction);

        console.log('[MockDB] Transação salva:', transaction);
        return Promise.resolve({ rows: [transaction] });
    }

    // ── SELECT FROM transactions ─────────────────────────────────────────────
    if (s.includes('select') && s.includes('from transactions')) {
        const [userId, dias] = params;
        const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);

        let rows = db.transactions.filter(
            (t) => t.user_id === userId && t.created_at >= limite
        );

        // Filtro por tipo se a query contiver AND type =
        const tipoMatch = sql.match(/AND type = '(\w+)'/i);
        if (tipoMatch) {
            rows = rows.filter((t) => t.type === tipoMatch[1]);
        }

        rows.sort((a, b) => b.created_at - a.created_at);
        return Promise.resolve({ rows });
    }

    // ── Query não mapeada ─────────────────────────────────────────────────────
    console.warn('[MockDB] Query não mapeada:', sql.substring(0, 80));
    return Promise.resolve({ rows: [] });
}

/**
 * Simula initDatabase() — não precisa de Docker nem PostgreSQL.
 * Retorna um objeto com .query() compatível com o pool do pg.
 */
async function initDatabase() {
    console.log('🧪 MockDatabase ativo — dados em memória (apenas para testes)');
    console.log('   Quando o banco real estiver pronto, troque USE_MOCK_DB=false no .env');
    return { query };
}

module.exports = { initDatabase };