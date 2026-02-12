require('dotenv').config();
const express = require('express');
const app = express();
const webhookRoutes = require('./src/routes/webhook');

app.use(express.json({ limit: '50mb' }));
app.use('/api/webhook', webhookRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor CrescIX rodando na porta ${PORT}`));