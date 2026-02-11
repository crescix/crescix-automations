require('dotenv').config();
console.log('--- CHECK DE AMBIENTE DA CRESCIX ---');
console.log('PORTA:', process.env.PORT || 'Não detectada (usando 3000)');
console.log('OPENAI_KEY:', process.env.OPENAI_API_KEY ? '✅ CARREGADA' : '❌ VAZIA');
console.log('REDIS:', process.env.REDIS_URL ? '✅ CARREGADA' : '❌ VAZIA');
console.log('POSTGRES:', process.env.DB_HOST ? '✅ CARREGADA' : '❌ VAZIA');
console.log('------------------------------------');
const express = require('express');
const bodyParser = require('body-parser');
const webhookRoutes = require('./src/routes/webhook');

const app = express();
app.use(bodyParser.json({ limit: '50mb' })); // Aumentado para suportar Base64 de áudio

app.use('/webhook', webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor CrescIX rodando na porta ${PORT}`));