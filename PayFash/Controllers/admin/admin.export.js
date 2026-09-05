const ExcelJS = require('exceljs');
const { Transaction, Client } = require('../../models/index');
const { logAction } = require('./audit');

// GET /api/admin/export/transactions.xlsx
const exportTransactions = async (req, res) => {
    try {
        const transactions = await Transaction.findAll({
            include: [{ model: Client, as: 'clienttransaction', attributes: ['nom', 'email'] }],
            order: [['createdAt', 'DESC']],
            limit: 5000
        });

        const wb = new ExcelJS.Workbook();
        wb.creator = 'MoneyTrack Admin';
        const ws = wb.addWorksheet('Transactions');
        ws.columns = [
            { header: 'ID', key: 'id', width: 8 },
            { header: 'Date', key: 'date', width: 22 },
            { header: 'Client', key: 'client', width: 24 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Type', key: 'type', width: 16 },
            { header: 'Montant (FCFA)', key: 'montant', width: 16 },
            { header: 'Frais', key: 'frais', width: 10 },
            { header: 'Statut', key: 'statut', width: 18 },
            { header: 'Description', key: 'description', width: 40 },
        ];
        ws.getRow(1).font = { bold: true };

        transactions.forEach(t => {
            ws.addRow({
                id: t.id,
                date: t.date ? new Date(t.date).toLocaleString('fr-FR') : '',
                client: t.clienttransaction?.nom || '',
                email: t.clienttransaction?.email || '',
                type: t.type,
                montant: t.montant,
                frais: t.frais,
                statut: t.statut,
                description: t.description || ''
            });
        });

        await logAction(req, 'EXPORT_TRANSACTIONS', 'Transaction', { lignes: transactions.length });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="transactions.xlsx"');
        await wb.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('exportTransactions:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
};

module.exports = { exportTransactions };
