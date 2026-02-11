const { createClient } = require('redis');

// Configuração do cliente usando a variável de ambiente do Easypanel
const client = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('❌ Erro no Cliente Redis:', err));

// Conexão assíncrona obrigatória na v4 do node-redis
(async () => {
    if (!client.isOpen) {
        await client.connect();
    }
})();

/**
 * HISTÓRICO: Gerencia o contexto da conversa para a IA
 */
async function getHistory(chatId) {
    const data = await client.get(`history:${chatId}`);
    return data ? JSON.parse(data) : [];
}

async function saveMessage(chatId, userContent, aiContent) {
    const history = await getHistory(chatId);
    history.push({ role: "user", content: userContent });
    history.push({ role: "assistant", content: aiContent });
    
    // Mantém apenas as últimas 10 mensagens para economia de tokens
    const updatedHistory = history.slice(-10); 
    await client.set(`history:${chatId}`, JSON.stringify(updatedHistory), { EX: 86400 }); // Expira em 24h
}

/**
 * ESTADOS E RASCUNHOS: Fluxo de confirmação da CrescIX
 */
async function setStatus(chatId, status) {
    await client.set(`status:${chatId}`, status, { EX: 1800 }); // 30 min
}

async function getStatus(chatId) {
    return await client.get(`status:${chatId}`);
}

async function saveDraft(chatId, text) {
    await client.set(`draft:${chatId}`, text, { EX: 1800 });
}

async function getDraft(chatId) {
    return await client.get(`draft:${chatId}`);
}

// Limpa o rascunho e o status após o pedido ir para o Postgres
async function clearAll(chatId) {
    await client.del([`status:${chatId}`, `draft:${chatId}`, `lock:${chatId}`]);
}

/**
 * TRAVAS (LOCKS): O "Escudo" contra Webhook Retries
 */
async function isLocked(chatId) {
    const lock = await client.get(`lock:${chatId}`);
    return lock === 'true';
}

async function setLock(chatId, status) {
    if (status === true) {
        // Ativa a trava por segurança (expira em 60s se o servidor cair)
        await client.set(`lock:${chatId}`, 'true', { EX: 60 });
    } else {
        // Remove a trava IMEDIATAMENTE após o fim do processamento
        await client.del(`lock:${chatId}`);
    }
}

module.exports = { 
    getHistory, saveMessage, isLocked, setLock, 
    setStatus, getStatus, saveDraft, getDraft, clearAll 
};