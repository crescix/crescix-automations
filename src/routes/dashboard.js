const express = require('express');
const router = express.Router();
const db = require('../services/dbService');
const auth = require('../middlewares/auth');

// Rota protegida para estatísticas gerais
router.get('/stats', auth, async (req, res) => {
    try {
        const whatsapp_id = req.usuario.whatsapp_id;
        const dados = await db.gerarRelatorioCompleto(whatsapp_id);
        
        // Retorna o saldo calculado:
        // $$Saldo = (Vendas + Entradas) - (Custos + Despesas)$$
        res.json(dados);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Rota para o gráfico de faturamento semanal
router.get('/grafico-vendas', auth, async (req, res) => {
    try {
        const whatsapp_id = req.usuario.whatsapp_id;
        const historico = await db.buscarHistoricoVendas(whatsapp_id); 
        res.json(historico);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;