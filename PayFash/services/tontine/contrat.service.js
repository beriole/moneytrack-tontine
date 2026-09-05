'use strict';

const crypto = require('crypto');
const {
    db, Client,
    TontineGroupe, TontineMembre, TontineContrat, TontineSignature
} = require('../../models');
const { ErreurTontine, nombre, exigerRole } = require('./commun');

// =====================================================================
//  Le reglement interieur signe.
//
//  Porte depuis NjanguiPay (Contract + ContractSignature). C'est la piece
//  qui tranche un litige entre membres : un texte fige, hache, et signe
//  nominativement.
//
//  Le hash porte sur le CONTENU. Toute modification produit un hash
//  different, donc une nouvelle version a faire resigner : on ne peut pas
//  changer les regles sous les signatures deja recueillies.
// =====================================================================

class ContratService {

    static hacher(contenu) {
        return crypto.createHash('sha256').update(String(contenu), 'utf8').digest('hex');
    }

    /**
     * Rend lisible ce sur quoi les membres s'engagent, a partir des
     * parametres reels du groupe. Sert de base si aucun texte n'est fourni.
     */
    static texteParDefaut(groupe) {
        const b = groupe.bareme || {};
        return [
            `REGLEMENT INTERIEUR — ${groupe.nom}`,
            '',
            `1. Cotisation : ${nombre(groupe.montantParPeriode)} ${groupe.devise} par periode (${groupe.frequence}).`,
            `2. Ordre de passage determine par : ${groupe.modeOrdre}.`,
            `3. Caution a l'entree : ${nombre(groupe.pourcentageCaution)} % de la cotisation.`,
            `4. Le beneficiaire du tour ne cotise pas pour son propre tour.`,
            `5. Amendes — retard : ${b.retard || 1000}, absence : ${b.absence || 2000}, indiscipline : ${b.indiscipline || 5000}.`,
            `6. Les amendes alimentent : ${groupe.destinationAmendes === 'epargne' ? "la caisse d'epargne du groupe" : 'le pot du cycle en cours'}.`,
            `7. Une amende impayee bloque la cotisation suivante.`,
            `8. En cas de defaut : amende, puis saisie de la caution, puis appel au garant, puis exclusion votee.`,
            `9. Le versement du pot exige que toutes les cotisations du cycle soient soldees.`,
            `10. La caution est restituee une fois toutes les dettes eteintes.`
        ].join('\n');
    }

    /**
     * Genere une version. Une version en cours de signature est remplacee ;
     * une version deja signee est amendee, et l'ancienne reste consultable.
     */
    static async generer(acteur, groupeId, contenu) {
        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            await exigerRole(groupeId, acteur.clientId, ['president', 'secretaire'], t,
                'rediger le reglement interieur');

            const texte = contenu && String(contenu).trim()
                ? String(contenu).trim()
                : this.texteParDefaut(groupe);
            const hash = this.hacher(texte);

            const precedent = await TontineContrat.findOne({
                where: { groupeId }, order: [['version', 'DESC']], transaction: t, lock: t.LOCK.UPDATE
            });

            if (precedent && precedent.hashContenu === hash) {
                throw new ErreurTontine(409, 'Ce texte est identique a la version en vigueur');
            }

            if (precedent && precedent.statut === 'en_attente_signatures') {
                // Personne n'a fini de signer : on remplace au lieu d'empiler.
                await TontineSignature.destroy({ where: { contratId: precedent.id }, transaction: t });
                await precedent.update({ contenu: texte, hashContenu: hash, dateGeneration: new Date() },
                    { transaction: t });
                return { contrat: precedent, remplace: true };
            }

            if (precedent) await precedent.update({ statut: 'amende' }, { transaction: t });

            const contrat = await TontineContrat.create({
                groupeId,
                version: precedent ? precedent.version + 1 : 1,
                contenu: texte,
                hashContenu: hash,
                statut: 'en_attente_signatures',
                dateGeneration: new Date(),
                contratAmendeId: precedent ? precedent.id : null
            }, { transaction: t });

            return { contrat, remplace: false };
        });
    }

    static async signer(clientId, contratId, adresseIp) {
        return db.transaction(async (t) => {
            const contrat = await TontineContrat.findByPk(contratId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!contrat) throw new ErreurTontine(404, 'Reglement introuvable');
            if (contrat.statut === 'amende') throw new ErreurTontine(409, 'Cette version a ete remplacee');

            const membre = await exigerRole(contrat.groupeId, clientId, [], t);
            if (membre.statut !== 'actif') throw new ErreurTontine(403, 'Seul un membre actif peut signer');

            const deja = await TontineSignature.findOne({ where: { contratId, clientId }, transaction: t });
            if (deja) throw new ErreurTontine(409, 'Vous avez deja signe cette version');

            const signeLe = new Date();
            // L'empreinte lie le texte, le signataire et l'instant : elle ne
            // vaut que pour cette version du reglement.
            const empreinte = crypto.createHash('sha256')
                .update(`${contrat.hashContenu}|${clientId}|${signeLe.toISOString()}`)
                .digest('hex');

            const signature = await TontineSignature.create({
                contratId, clientId, empreinte, signeLe, adresseIp: adresseIp || null
            }, { transaction: t });

            const actifs = await TontineMembre.count({
                where: { groupeId: contrat.groupeId, statut: 'actif' }, transaction: t
            });
            const signatures = await TontineSignature.count({ where: { contratId }, transaction: t });

            let complet = false;
            if (signatures >= actifs) {
                await contrat.update({ statut: 'signe', dateSignatureComplete: new Date() }, { transaction: t });
                complet = true;
            }

            return { signature, signatures, actifs, complet };
        });
    }

    static async courant(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);

        const contrat = await TontineContrat.findOne({
            where: { groupeId },
            order: [['version', 'DESC']],
            include: [{
                model: TontineSignature, as: 'signatures',
                include: [{ model: Client, as: 'signataire', attributes: ['id', 'nom'] }]
            }]
        });
        if (!contrat) throw new ErreurTontine(404, "Ce groupe n'a pas encore de reglement interieur");

        const actifs = await TontineMembre.count({ where: { groupeId, statut: 'actif' } });
        const signes = contrat.signatures.map(s => s.clientId);
        const manquants = await TontineMembre.findAll({
            where: { groupeId, statut: 'actif' },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }]
        });

        return {
            contrat,
            avancement: `${contrat.signatures.length}/${actifs}`,
            manquants: manquants
                .filter(m => !signes.includes(m.clientId))
                .map(m => ({ clientId: m.clientId, nom: m.client ? m.client.nom : null }))
        };
    }

    static async versions(clientId, groupeId) {
        await exigerRole(groupeId, clientId, [], null);
        return TontineContrat.findAll({
            where: { groupeId },
            attributes: ['id', 'version', 'hashContenu', 'statut', 'dateGeneration', 'dateSignatureComplete'],
            order: [['version', 'DESC']]
        });
    }
}

module.exports = ContratService;
