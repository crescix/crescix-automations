const ExcelJS = require('exceljs');

async function gerarExcelFinanceiro(transacoes) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Histórico CrescIX');

    // 1. Define as Colunas
    sheet.columns = [
        { header: 'Data', key: 'data', width: 15 },
        { header: 'Tipo', key: 'tipo', width: 12 },
        { header: 'Item', key: 'item', width: 20 },
        { header: 'Qtd', key: 'qtd', width: 8 },
        { header: 'Valor Unit.', key: 'unit', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
    ];

    // 2. Adiciona os Dados e Formatação
    transacoes.forEach(t => {
        sheet.addRow({
            data: t.created_at.toLocaleDateString('pt-BR'),
            tipo: t.type,
            item: t.item,
            qtd: t.quantity,
            unit: parseFloat(t.amount),
            total: t.amount * t.quantity
        });
    });

    // Estilo básico para o cabeçalho
    sheet.getRow(1).font = { bold: true };

    // Gera o buffer (arquivo em memória)
    return await workbook.xlsx.writeBuffer();
}

module.exports = { gerarExcelFinanceiro };