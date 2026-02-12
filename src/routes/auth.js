const express = require('express');
const router = express.Router();
const db = require('../services/dbService');
const jwt = require('jsonwebtoken');

router.post("/login", async (req, res) => {
    const { whatsapp_id, code } = req.body;

    try {
        // 1. Busca o usuário e valida o código e a expiração
        const userRes = await db.pool.query(
            'SELECT * FROM usuarios_crescix WHERE whatsapp_id = $1 AND login_code = $2 AND code_expires > NOW()',
            [whatsapp_id, code]
        );

        if (userRes.rows.length === 0) {
            return res.status(401).json({ error: "Código inválido ou expirado." });
        }

        const user = userRes.rows[0];

        // 2. Gera o Token JWT para o Dashboard
        const token = jwt.sign(
            { id: user.id, whatsapp_id: user.whatsapp_id },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        // 3. Limpa o código para não ser usado de novo
        await db.pool.query('UPDATE usuarios_crescix SET login_code = NULL WHERE id = $1', [user.id]);

        res.json({ token, user: { nome: user.nome } });

    } catch (e) {
        res.status(500).json({ error: "Erro interno no servidor." });
    }
});

module.exports = router;