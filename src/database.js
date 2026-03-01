// src/database.js
// ─────────────────────────────────────────────────────────────────────────────
// BANCO DE DADOS REAL (PostgreSQL)
// Usado em produção. Tem retry automático para aguardar o PostgreSQL subir
// no Docker antes de tentar conectar.
// ─────────────────────────────────────────────────────────────────────────────
const { Pool } = require('pg');

/**
 * Conecta ao PostgreSQL com retry automático.
 * Tenta até MAX_RETRIES vezes com RETRY_DELAY ms de espera entre tentativas.
 * Resolve o problema de o Node subir antes do PostgreSQL no Docker.
 */
async function initDatabase() {
    const MAX_RETRIES = 10;
    const RETRY_DELAY = 3000; // 3 segundos entre tentativas

    const pool = new Pool({
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'crescix',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
    });

    for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
        try {
            const client = await pool.connect();

            // Cria as tabelas se ainda não existirem
            await client.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id                  SERIAL PRIMARY KEY,
                    phone_number        VARCHAR(50) UNIQUE NOT NULL,
                    pending_transaction JSONB,
                    last_interaction    TIMESTAMP,
                    created_at          TIMESTAMP DEFAULT NOW()
                );
            `);

            await client.query(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id         SERIAL PRIMARY KEY,
                    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    type       VARCHAR(20) NOT NULL,
                    item       VARCHAR(100),
                    amount     NUMERIC(10, 2),
                    quantity   INTEGER DEFAULT 1,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `);

            client.release();
            console.log(`✅ PostgreSQL conectado (tentativa ${tentativa}/${MAX_RETRIES})`);
            return pool;

        } catch (err) {
            console.warn(`⏳ PostgreSQL não está pronto ainda (tentativa ${tentativa}/${MAX_RETRIES}): ${err.message}`);

            if (tentativa === MAX_RETRIES) {
                throw new Error(`Não foi possível conectar ao banco após ${MAX_RETRIES} tentativas.`);
            }

            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
    }
}

module.exports = { initDatabase };