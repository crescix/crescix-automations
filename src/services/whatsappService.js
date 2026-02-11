const axios = require('axios');

async function sendMessage(number, body) {
    try {
        // Remove caracteres não numéricos do telefone
        const cleanNumber = number.replace(/\D/g, '');
        
        // A URL correta precisa do caminho /message/sendText/NOME_DA_INSTANCIA
        const url = `${process.env.WHATSAPP_API_URL}/message/sendText/Crescix`;
        
        const response = await axios.post(url, {
            number: cleanNumber,
            text: body // A Evolution espera 'text' em vez de 'body' no JSON
        }, {
            headers: {
                'apikey': process.env.WHATSAPP_TOKEN,
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error("❌ Erro ao enviar mensagem via WhatsApp:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = { sendMessage };