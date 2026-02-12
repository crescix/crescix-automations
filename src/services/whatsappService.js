const axios = require('axios');

async function sendMessage(number, text) {
    try {
        const url = `${process.env.WHATSAPP_API_URL}/message/sendText/Crescix`;
        await axios.post(url, {
            number: number.replace(/\D/g, ''),
            text: text
        }, {
            headers: { 'apikey': process.env.WHATSAPP_TOKEN }
        });
    } catch (error) {
        // Isso vai mostrar no Easypanel o motivo real do erro 401 ou 404
        console.error("❌ Erro ao enviar mensagem:", error.response?.data || error.message);
    }
}

module.exports = { sendMessage };