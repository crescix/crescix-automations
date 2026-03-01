// src/services/userService.js

/**
 * Busca ou cria um usuário no Postgres usando o ID do Telegram.
 * Retorna o usuário com pending_transaction já como objeto (ou null).
 */
async function getOrCreateUser(pool, telegramId) {
    const query = `
        INSERT INTO users (phone_number, created_at)
        VALUES ($1, NOW())
        ON CONFLICT (phone_number) DO UPDATE SET last_interaction = NOW()
        RETURNING *;
    `;

    try {
        const res = await pool.query(query, [telegramId]);
        const user = res.rows[0];

        // O PostgreSQL pode retornar o campo como string — garante que seja objeto
        if (user.pending_transaction && typeof user.pending_transaction === 'string') {
            try {
                user.pending_transaction = JSON.parse(user.pending_transaction);
            } catch {
                user.pending_transaction = null;
            }
        }

        return user;
    } catch (err) {
        console.error('[userService] Erro ao buscar/criar usuário:', err);
        throw err;
    }
}

module.exports = { getOrCreateUser };