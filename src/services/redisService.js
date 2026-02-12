const { createClient } = require('redis');
const client = createClient({ url: process.env.REDIS_URL });

client.on('error', err => console.error('❌ Erro no Redis:', err));
client.connect();

module.exports = {
    // Gestão de Status e Rascunhos
    getStatus: (id) => client.get(`status:${id}`),
    setStatus: (id, status) => client.set(`status:${id}`, status, { EX: 3600 }),
    getDraft: (id) => client.get(`draft:${id}`),
    saveDraft: (id, text) => client.set(`draft:${id}`, text, { EX: 3600 }),
    clearAll: async (id) => {
        await client.del(`status:${id}`);
        await client.del(`draft:${id}`);
    },

    // Sistema de Travas (Lock) para evitar duplicidade
    isLocked: async (id) => {
        const lock = await client.get(`lock:${id}`);
        return lock === 'true';
    },
    setLock: async (id, value) => {
        if (value) {
            // Expira em 30 segundos automaticamente por segurança
            await client.set(`lock:${id}`, 'true', { EX: 30 });
        } else {
            await client.del(`lock:${id}`);
        }
    }
};