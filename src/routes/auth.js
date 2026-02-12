const express = require('express');
const router = express.Router();
const db = require('../services/dbService');

router.post('/login', async (req, res) => {
    const { whatsapp_id, codigo } = req.body;
    const token = await db.validarLogin(whatsapp_id, codigo);

    if (!token) {
        return res.status(401).json({ error: "Código inválido ou expirado." });
    }

    res.json({ auth: true, token }); // Este token é o que o front-end vai guardar
});

module.exports = router;