const axios = require('axios');

async function sendMessage(number, text) {
    const url = `${process.env.WHATSAPP_API_URL}/message/sendText/Crescix`;
    await axios.post(url, {
        number: number.replace(/\D/g, ''),
        text: text
    }, {
        headers: { 'apikey': process.env.WHATSAPP_TOKEN }
    });
}

module.exports = { sendMessage };