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
        console.log("✅ Resposta enviada com sucesso!");
    } catch (error) {
        // Isso vai imprimir o erro exato no log do Easypanel
        console.error("❌ Erro ao enviar para WhatsApp:", error.response?.data || error.message);
    }
}
module.exports = { sendMessage };