const { Portefeuille, Transaction, Client } = require('../../models');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { Op } = require('sequelize');

// Catégories prédéfinies pour la classification automatique
const CATEGORIES_DEPENSES = {
    'alimentaire': ['restaurant', 'supermarché', 'courses', 'nourriture', 'food', 'eat'],
    'transport': ['uber', 'taxi', 'bus', 'train', 'vol', 'avion', 'carburant', 'essence', 'transport'],
    'loyer': ['loyer', 'immobilier', 'hypothèque', 'housing'],
    'factures': ['electricité', 'eau', 'internet', 'téléphone', 'facture', 'bill'],
    'sante': ['pharmacie', 'médecin', 'hopital', 'santé', 'medical', 'health'],
    'shopping': ['amazon', 'vêtements', 'chaussures', 'mode', 'shopping', 'store'],
    'loisir': ['cinéma', 'sport', 'gym', 'musée', 'voyage', 'loisir', 'entertainment'],
    'salaire': ['salaire', 'paye', 'revenu', 'salary'],
    'investissement': ['bourse', 'action', 'crypto', 'investissement', 'investment'],
    'autre': []
};

// Catégoriser automatiquement une transaction
const categoriserTransaction = (description) => {
    if (!description) return 'autre';
    
    const descLower = description.toLowerCase();
    
    for (const [categorie, keywords] of Object.entries(CATEGORIES_DEPENSES)) {
        if (keywords.some(keyword => descLower.includes(keyword))) {
            return categorie;
        }
    }
    
    return 'autre';
};

// ============================================
// EXPORT EXCEL
// ============================================

const exportTransactionsExcel = async (req, res) => {
    const clientId = req.user.id;
    const { dateDebut, dateFin, portefeuilleId, format = 'xlsx' } = req.query;

    try {
        // Récupérer les informations du client
        const client = await Client.findByPk(clientId);
        
        // Construire la requête
        const whereClause = { ClientTransactionId: clientId };
        
        if (dateDebut || dateFin) {
            whereClause.date = {};
            if (dateDebut) whereClause.date[Op.gte] = new Date(dateDebut);
            if (dateFin) whereClause.date[Op.lte] = new Date(dateFin);
        }
        
        if (portefeuilleId) {
            whereClause.PortefeuilleId = portefeuilleId;
        }

        const transactions = await Transaction.findAll({
            where: whereClause,
            order: [['date', 'DESC']],
            include: [{ model: Portefeuille, attributes: ['nom', 'typePortefeuille', 'devise'] }]
        });

        // Créer le workbook Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PayFash';
        workbook.created = new Date();

        // Feuille 1: Transactions
        const sheet = workbook.addWorksheet('Transactions');
        
        // En-têtes
        sheet.columns = [
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Type', key: 'type', width: 20 },
            { header: 'Montant', key: 'montant', width: 15 },
            { header: 'Devise', key: 'devise', width: 10 },
            { header: 'Catégorie IA', key: 'categorie', width: 15 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Statut', key: 'statut', width: 15 },
            { header: 'Frais', key: 'frais', width: 12 },
            { header: 'Portefeuille', key: 'portefeuille', width: 20 }
        ];

        // En-têtes stylisés
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        sheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '3498db' }
        };

        // Ajouter les données
        transactions.forEach(tx => {
            const categorieIA = categoriserTransaction(tx.description);
            sheet.addRow({
                date: tx.date ? tx.date.toISOString().split('T')[0] : '',
                type: tx.type,
                montant: tx.montant,
                devise: tx.devise || 'XAF',
                categorie: categorieIA,
                description: tx.description || '',
                statut: tx.statut || 'Succès',
                frais: tx.frais || 0,
                portefeuille: tx.Portefeuille ? (tx.Portefeuille.nom || tx.Portefeuille.typePortefeuille) : 'N/A'
            });
        });

        // Feuille 2: Statistiques
        const statsSheet = workbook.addWorksheet('Statistiques');
        
        statsSheet.columns = [
            { header: 'Catégorie', key: 'categorie', width: 20 },
            { header: 'Total', key: 'total', width: 15 },
            { header: 'Nombre', key: 'count', width: 10 }
        ];

        // Calculer les statistiques
        const stats = {};
        transactions.forEach(tx => {
            const cat = categoriserTransaction(tx.description);
            if (tx.type === 'dépense' || tx.type === 'transfert_sortant') {
                if (!stats[cat]) stats[cat] = { total: 0, count: 0 };
                stats[cat].total += Math.abs(tx.montant);
                stats[cat].count++;
            }
        });

        Object.entries(stats).forEach(([cat, data]) => {
            statsSheet.addRow({ categorie: cat, total: data.total, count: data.count });
        });

        // Feuille 3: Résumé
        const resumeSheet = workbook.addWorksheet('Résumé');
        
        const totalRecettes = transactions
            .filter(tx => tx.type === 'revenu' || tx.type === 'transfert_entrant')
            .reduce((sum, tx) => sum + tx.montant, 0);
            
        const totalDepenses = transactions
            .filter(tx => tx.type === 'dépense' || tx.type === 'transfert_sortant')
            .reduce((sum, tx) => sum + tx.montant, 0);

        resumeSheet.addRow({ key: 'Période', value: `${dateDebut || 'Début'} - ${dateFin || 'Fin'}` });
        resumeSheet.addRow({ key: 'Total Recettes', value: totalRecettes });
        resumeSheet.addRow({ key: 'Total Dépenses', value: totalDepenses });
        resumeSheet.addRow({ key: 'Solde Net', value: totalRecettes - totalDepenses });
        resumeSheet.addRow({ key: 'Nombre de Transactions', value: transactions.length });

        // Envoyer le fichier
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=transactions_${new Date().toISOString().split('T')[0]}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Erreur export Excel:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du fichier Excel' });
    }
};

// ============================================
// EXPORT PDF
// ============================================

const exportTransactionsPDF = async (req, res) => {
    const clientId = req.user.id;
    const { dateDebut, dateFin, portefeuilleId } = req.query;

    try {
        // Récupérer les informations du client
        const client = await Client.findByPk(clientId);
        
        // Construire la requête
        const whereClause = { ClientTransactionId: clientId };
        
        if (dateDebut || dateFin) {
            whereClause.date = {};
            if (dateDebut) whereClause.date[Op.gte] = new Date(dateDebut);
            if (dateFin) whereClause.date[Op.lte] = new Date(dateFin);
        }
        
        if (portefeuilleId) {
            whereClause.PortefeuilleId = portefeuilleId;
        }

        const transactions = await Transaction.findAll({
            where: whereClause,
            order: [['date', 'DESC']],
            include: [{ model: Portefeuille, attributes: ['nom', 'typePortefeuille', 'devise'] }]
        });

        // Créer le PDF
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relevé_transactions_${new Date().toISOString().split('T')[0]}.pdf`);
        
        doc.pipe(res);

        // En-tête
        doc.fontSize(20).text('PayFash', { align: 'center' });
        doc.fontSize(16).text('Relevé de Transactions', { align: 'center' });
        doc.moveDown();
        
        // Informations client
        doc.fontSize(12);
        doc.text(`Client: ${client.nom}`, { align: 'left' });
        doc.text(`Email: ${client.email}`, { align: 'left' });
        doc.text(`Période: ${dateDebut || 'Début'} - ${dateFin || 'Fin'}`, { align: 'left' });
        doc.text(`Date d'édition: ${new Date().toLocaleDateString('fr-FR')}`, { align: 'left' });
        doc.moveDown();

        // Statistiques rapides
        const totalRecettes = transactions
            .filter(tx => tx.type === 'revenu' || tx.type === 'transfert_entrant')
            .reduce((sum, tx) => sum + tx.montant, 0);
            
        const totalDepenses = transactions
            .filter(tx => tx.type === 'dépense' || tx.type === 'transfert_sortant')
            .reduce((sum, tx) => sum + tx.montant, 0);

        doc.fontSize(14).text('Résumé', { underline: true });
        doc.fontSize(12);
        doc.text(`Total Recettes: ${totalRecettes.toLocaleString('fr-FR')} XAF`);
        doc.text(`Total Dépenses: ${totalDepenses.toLocaleString('fr-FR')} XAF`);
        doc.text(`Solde Net: ${(totalRecettes - totalDepenses).toLocaleString('fr-FR')} XAF`);
        doc.text(`Nombre de Transactions: ${transactions.length}`);
        doc.moveDown();

        // Tableau des transactions
        doc.fontSize(14).text('Détail des Transactions', { underline: true });
        doc.moveDown();

        let yPos = doc.y;
        const tableTop = yPos;
        
        // En-têtes du tableau
        doc.fontSize(10);
        doc.text('Date', 50, yPos);
        doc.text('Type', 120, yPos);
        doc.text('Montant', 200, yPos);
        doc.text('Catégorie', 290, yPos);
        
        doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();
        yPos += 25;

        // Transactions
        transactions.forEach((tx) => {
            if (yPos > 700) {
                doc.addPage();
                yPos = 50;
            }
            
            const categorieIA = categoriserTransaction(tx.description);
            
            doc.text(tx.date ? tx.date.toISOString().split('T')[0] : '-', 50, yPos);
            doc.text(tx.type || '-', 120, yPos);
            doc.text(`${tx.montant.toLocaleString('fr-FR')} XAF`, 200, yPos);
            doc.text(categorieIA, 290, yPos);
            
            yPos += 20;
        });

        // Pied de page
        doc.moveDown(2);
        doc.fontSize(10).text(
            `Document généré automatiquement par PayFash le ${new Date().toLocaleString('fr-FR')}`,
            { align: 'center' }
        );

        doc.end();

    } catch (error) {
        console.error('Erreur export PDF:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du fichier PDF' });
    }
};

// ============================================
// EXPORT RELEVÉ INDIVIDUEL
// ============================================

const exportRelevéPDF = async (req, res) => {
    const clientId = req.user.id;
    const { walletId } = req.params;
    const { dateDebut, dateFin } = req.query;

    try {
        const client = await Client.findByPk(clientId);
        const portefeuille = await Portefeuille.findOne({
            where: { id: walletId, ClientPortefeuilleId: clientId }
        });

        if (!portefeuille) {
            return res.status(404).json({ error: 'Portefeuille introuvable' });
        }

        // Récupérer les transactions du portefeuille
        const whereClause = { 
            ClientTransactionId: clientId,
            [Op.or]: [
                { PortefeuilleId: walletId },
                { description: { [Op.like]: `%${portefeuille.nom || portefeuille.typePortefeuille}%` } }
            ]
        };

        if (dateDebut || dateFin) {
            whereClause.date = {};
            if (dateDebut) whereClause.date[Op.gte] = new Date(dateDebut);
            if (dateFin) whereClause.date[Op.lte] = new Date(dateFin);
        }

        const transactions = await Transaction.findAll({
            where: whereClause,
            order: [['date', 'DESC']]
        });

        // Créer le PDF
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=relevé_${portefeuille.nom || portefeuille.typePortefeuille}_${new Date().toISOString().split('T')[0]}.pdf`);
        
        doc.pipe(res);

        // En-tête
        doc.fontSize(20).text('PayFash', { align: 'center' });
        doc.fontSize(16).text(`Relevé - ${portefeuille.nom || portefeuille.typePortefeuille}`, { align: 'center' });
        doc.moveDown();
        
        doc.fontSize(12);
        doc.text(`Client: ${client.nom}`);
        doc.text(`Portefeuille: ${portefeuille.nom || portefeuille.typePortefeuille}`);
        doc.text(`Devise: ${portefeuille.devise}`);
        doc.text(`Solde actuel: ${portefeuille.solde.toLocaleString('fr-FR')} ${portefeuille.devise}`);
        doc.text(`Période: ${dateDebut || 'Début'} - ${dateFin || 'Fin'}`);
        doc.moveDown();

        // Transactions
        if (transactions.length === 0) {
            doc.text('Aucune transaction pour cette période.');
        } else {
            let totalEntrees = 0;
            let totalSorties = 0;

            transactions.forEach(tx => {
                const categorieIA = categoriserTransaction(tx.description);
                
                if (tx.type === 'revenu' || tx.type === 'transfert_entrant') {
                    totalEntrees += tx.montant;
                } else {
                    totalSorties += tx.montant;
                }

                // Couleur selon le type
                const color = (tx.type === 'revenu' || tx.type === 'transfert_entrant') ? '008000' : 'FF0000';
                
                doc.fontSize(10);
                doc.fillColor(color)
                   .text(`${tx.date ? tx.date.toISOString().split('T')[0] : '-'} | ${tx.type} | ${tx.montant.toLocaleString('fr-FR')} ${portefeuille.devise} | ${categorieIA}`, 50)
                   .fillColor('000000');
                
                if (tx.description) {
                    doc.fontSize(9).text(`   ${tx.description}`, { indent: 20 });
                    doc.fontSize(10);
                }
                doc.moveDown(0.5);
            });

            doc.moveDown();
            doc.fontSize(12).text(`Total Entrées: ${totalEntrees.toLocaleString('fr-FR')} ${portefeuille.devise}`);
            doc.text(`Total Sorties: ${totalSorties.toLocaleString('fr-FR')} ${portefeuille.devise}`);
            doc.text(`Solde: ${(totalEntrees - totalSorties).toLocaleString('fr-FR')} ${portefeuille.devise}`);
        }

        // Pied de page
        doc.moveDown(2);
        doc.fontSize(10).text(
            `Document généré automatiquement par PayFash le ${new Date().toLocaleString('fr-FR')}`,
            { align: 'center' }
        );

        doc.end();

    } catch (error) {
        console.error('Erreur export PDF:', error);
        res.status(500).json({ error: 'Erreur lors de la génération du relevé' });
    }
};

// ============================================
// ANALYSE IA DES DÉPENSES
// ============================================

const analyserDepenses = async (req, res) => {
    const clientId = req.user.id;
    const { periode = '30' } = req.query; // nombre de jours

    try {
        const dateDebut = new Date();
        dateDebut.setDate(dateDebut.getDate() - parseInt(periode));

        const transactions = await Transaction.findAll({
            where: {
                ClientTransactionId: clientId,
                date: { [Op.gte]: dateDebut }
            },
            order: [['date', 'DESC']]
        });

        // Analyser les catégories
        const analyse = {
            periode: `${periode} derniers jours`,
            totalTransactions: transactions.length,
            categories: {},
            tendances: [],
            conseils: []
        };

        // Grouper par catégorie
        transactions.forEach(tx => {
            const categorie = categoriserTransaction(tx.description);
            
            if (!analyse.categories[categorie]) {
                analyse.categories[categorie] = {
                    count: 0,
                    total: 0,
                    moyenne: 0,
                    transactions: []
                };
            }

            const isDepense = tx.type === 'dépense' || tx.type === 'transfert_sortant';
            
            analyse.categories[categorie].count++;
            if (isDepense) {
                analyse.categories[categorie].total += Math.abs(tx.montant);
            }
            analyse.categories[categorie].transactions.push({
                date: tx.date,
                montant: tx.montant,
                type: tx.type,
                description: tx.description
            });
        });

        // Calculer les moyennes
        for (const cat in analyse.categories) {
            analyse.categories[cat].moyenne = analyse.categories[cat].total / analyse.categories[cat].count;
        }

        // Trier par total décroissant
        const categoriesTriees = Object.entries(analyse.categories)
            .filter(([_, data]) => data.total > 0)
            .sort((a, b) => b[1].total - a[1].total);

        // Identifier les principales dépenses
        analyse.topDepenses = categoriesTriees.slice(0, 5).map(([cat, data]) => ({
            categorie: cat,
            total: data.total,
            pourcentage: 0,
            moyenne: data.moyenne
        }));

        // Calculer les pourcentages
        const totalDepenses = analyse.topDepenses.reduce((sum, cat) => sum + cat.total, 0);
        analyse.topDepenses.forEach(cat => {
            cat.pourcentage = totalDepenses > 0 ? ((cat.total / totalDepenses) * 100).toFixed(1) : 0;
        });

        // Générer des conseils basés sur l'analyse
        if (analyse.categories['alimentaire'] && analyse.categories['alimentaire'].total > 100000) {
            analyse.conseils.push({
                type: 'alerte',
                message: 'Vos dépenses alimentaires sont élevées. Considérez la préparation de repas à domicile.'
            });
        }

        if (analyse.categories['transport'] && analyse.categories['transport'].total > 50000) {
            analyse.conseils.push({
                type: 'optimisation',
                message: 'Pensez au covoiturage ou aux transports en commun pour réduire les coûts de transport.'
            });
        }

        const depensesInhabituelles = transactions.filter(tx => 
            (tx.type === 'dépense' || tx.type === 'transfert_sortant') && tx.montant > 200000
        );
        
        if (depensesInhabituelles.length > 0) {
            analyse.conseils.push({
                type: 'info',
                message: `${depensesInhabituelles.length} transaction(s) supérieure(s) à 200 000 XAF détectée(s).`
            });
        }

        // Comparaison avec la période précédente
        const dateDebutPrec = new Date();
        dateDebutPrec.setDate(dateDebutPrec.getDate() - parseInt(periode) * 2);
        
        const transactionsPrec = await Transaction.findAll({
            where: {
                ClientTransactionId: clientId,
                date: { [Op.between]: [dateDebutPrec, dateDebut] }
            }
        });

        const totalPrec = transactionsPrec
            .filter(tx => tx.type === 'dépense' || tx.type === 'transfert_sortant')
            .reduce((sum, tx) => sum + tx.montant, 0);

        const totalActuel = transactions
            .filter(tx => tx.type === 'dépense' || tx.type === 'transfert_sortant')
            .reduce((sum, tx) => sum + tx.montant, 0);

        analyse.evolution = {
            periodePrecedente: totalPrec,
            periodeActuelle: totalActuel,
            variation: totalPrec > 0 ? (((totalActuel - totalPrec) / totalPrec) * 100).toFixed(1) : 0,
            interpretation: totalActuel < totalPrec ? 'Évolution positive - Vous dépensez moins' : 'Évolution à surveiller'
        };

        res.json(analyse);

    } catch (error) {
        console.error('Erreur analyse:', error);
        res.status(500).json({ error: 'Erreur lors de l\'analyse des dépenses' });
    }
};

module.exports = {
    exportTransactionsExcel,
    exportTransactionsPDF,
    exportRelevéPDF,
    analyserDepenses,
    categoriserTransaction
};
