const axios = require('axios');

/**
 * Envia mensagem de texto para o usuário via API externa
 */
async function sendMessage(to, text) {
    try {
        const response = await axios.post(`${process.env.WHATSAPP_API_URL}/messages/send`, {
            number: to,
            body: text
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`Mensagem enviada para ${to}`);
        return response.data;
    } catch (error) {
        console.error("Erro ao enviar mensagem para o WhatsApp:", error.response?.data || error.message);
        throw error;
    }
}

module.exports = { sendMessage };