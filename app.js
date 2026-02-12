require('dotenv').config();
const express = require('express');
const app = express();

// Importação das rotas
const webhookRoutes = require('./src/routes/webhook');
const authRoutes = require('./src/routes/auth'); // Nova rota de login
const dashboardRoutes = require('./src/routes/dashboard'); // Nova rota de gráficos

app.use(express.json({ limit: '50mb' }));

// Ajuste da rota do Webhook para bater com a Evolution API
app.use('/webhook', webhookRoutes); 

// Registro das rotas da API Web
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Erro Não Tratado (Rejection):', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Erro Fatal (Exception):', error.message);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor CrescIX rodando na porta ${PORT}`));