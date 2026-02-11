const { createClient } = require('redis');

const client = createClient({
    // No Easypanel, use a URL interna do serviço Redis
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

(async () => {
    await client.connect();
})();

/**
 * HISTÓRICO: Mantém o contexto para o Agente de IA
 */
async function getHistory(chatId) {
    const data = await client.get(`history:${chatId}`);
    return data ? JSON.parse(data) : [];
}

async function saveMessage(chatId, userContent, aiContent) {
    const history = await getHistory(chatId);
    history.push({ role: "user", content: userContent });
    history.push({ role: "assistant", content: aiContent });
    const updatedHistory = history.slice(-10); 
    await client.set(`history:${chatId}`, JSON.stringify(updatedHistory), { EX: 86400 });
}

/**
 * STATUS E RASCUNHOS: Substitui a lógica de "Aguardando Confirmação" do n8n
 */

// Define o estado da conversa (ex: 'aguardando_confirmacao')
async function setStatus(chatId, status) {
    await client.set(`status:${chatId}`, status, { EX: 1800 }); // Expira em 30 min
}

async function getStatus(chatId) {
    return await client.get(`status:${chatId}`);
}

// Salva a transcrição temporária para ser gravada no Postgres após o "Sim"
async function saveDraft(chatId, text) {
    await client.set(`draft:${chatId}`, text, { EX: 1800 });
}

async function getDraft(chatId) {
    return await client.get(`draft:${chatId}`);
}

// Limpa tudo após salvar no banco de dados
async function clearAll(chatId) {
    await client.del(`status:${chatId}`);
    await client.del(`draft:${chatId}`);
}

/**
 * TRAVAS: Segurança contra mensagens duplicadas simultâneas
 */
async function isLocked(chatId) {
    const lock = await client.get(`lock:${chatId}`);
    return lock === 'true';
}

async function setLock(chatId, status) {
    await client.set(`lock:${chatId}`, status.toString(), { EX: 60 });
}

module.exports = { 
    getHistory, 
    saveMessage, 
    isLocked, 
    setLock, 
    setStatus, 
    getStatus, 
    saveDraft, 
    getDraft, 
    clearAll 
};