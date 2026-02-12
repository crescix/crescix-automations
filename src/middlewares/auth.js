const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = decoded; // Salva os dados do motorista no request
        next();
    } catch (err) {
        res.status(400).json({ error: 'Token inválido.' });
    }
}

module.exports = verificarToken;