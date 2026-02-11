require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const webhookRoutes = require('./routes/webhook');

const app = express();
app.use(bodyParser.json({ limit: '50mb' })); // Aumentado para suportar Base64 de áudio

app.use('/webhook', webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor CrescIX rodando na porta ${PORT}`));