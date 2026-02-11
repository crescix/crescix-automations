// ... (mantenha os imports)
// Dentro do fluxo de CONFIRMADO:
if (intent.includes("CONFIRMADO")) {
    const rascunho = await redis.getDraft(remoteJid);
    const dadosIA = await openai.extrairDadosVenda(rascunho);
    
    // Chama o nome EXATO que está no dbService.js
    const resultado = await db.processarVendaAutomatica(remoteJid, pushName, rascunho, dadosIA);
    
    await whatsapp.sendMessage(remoteJid, `✅ Confirmado!\n💰 Total: R$ ${resultado.total.toFixed(2)}\n📦 Estoque: ${resultado.novoEstoque} unid.`);
    await redis.clearAll(remoteJid);
} 
// ...
// No processamento de áudio (Correção do erro de undefined):
if (data.messageType === "audioMessage" && data.message?.audioMessage?.base64) {
    conteudo = await openai.transcribeAudio(data.message.audioMessage.base64);
}