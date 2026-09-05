'use strict';

const { Op } = require('sequelize');
const {
    Notification, Client,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation
} = require('../../models');
const { nombre, arrondir } = require('./commun');

// =====================================================================
//  Notifications du module tontine.
//
//  Elles passent par le modele Notification existant — many-to-many vers
//  les clients via NotificationEnvoyer — et non par un second systeme
//  parallele. Un utilisateur a une seule boite, pas deux.
//
//  Regle intangible : une notification ne doit JAMAIS faire echouer un
//  mouvement d'argent. Tous les envois se font donc APRES le commit, et
//  toute erreur est avalee et journalisee. Un pot verse dont la
//  notification n'est pas partie reste un pot verse.
// =====================================================================

const CATEGORIE = 'tontine';

const fcfa = (v) => `${Math.round(nombre(v)).toLocaleString('fr-FR')} FCFA`;

class NotificationTontineService {

    /**
     * Envoi de base. Ne leve jamais : le caller est un flux d'argent.
     */
    static async envoyer(clientIds, message, options = {}) {
        try {
            const cibles = (Array.isArray(clientIds) ? clientIds : [clientIds])
                .filter(Boolean)
                .map(Number);
            if (!cibles.length) return null;

            const notification = await Notification.create({
                message,
                dateEnvoie: new Date(),
                Type: options.type || 'system',
                categorie: CATEGORIE,
                lien: options.lien || null
            });

            // addClients pose les lignes de NotificationEnvoyer (lu = false).
            await notification.addClients(cibles);
            return notification;
        } catch (e) {
            console.log('[tontine] notification non envoyee :', e.message);
            return null;
        }
    }

    /** Tous les membres actifs d'un groupe, sauf ceux exclus explicitement. */
    static async _membres(groupeId, sauf = []) {
        const membres = await TontineMembre.findAll({
            where: { groupeId, statut: 'actif' }, attributes: ['clientId']
        });
        const exclus = sauf.map(Number);
        return membres.map(m => m.clientId).filter(id => !exclus.includes(Number(id)));
    }

    // -----------------------------------------------------------------
    //  Evenements de la caisse 1
    // -----------------------------------------------------------------
    static async cycleDemarre(groupe, cycle, beneficiaireId) {
        const beneficiaire = await Client.findByPk(beneficiaireId);
        const lien = { ecran: 'DetailTontine', params: { groupeId: groupe.id } };

        await this.envoyer(
            await this._membres(groupe.id, [beneficiaireId]),
            `« ${groupe.nom} » — cycle ${cycle.numeroCycle} ouvert. ${beneficiaire?.nom || 'Un membre'} recoit le pot ; votre cotisation de ${fcfa(groupe.montantParPeriode)} est attendue.`,
            { lien }
        );
        await this.envoyer(
            beneficiaireId,
            `« ${groupe.nom} » — c'est votre tour au cycle ${cycle.numeroCycle}. Vous recevrez ${fcfa(cycle.montantAttendu)} une fois le pot complet.`,
            { lien }
        );
    }

    static async potVerse(groupe, cycle, beneficiaireId, net, destination) {
        await this.envoyer(
            beneficiaireId,
            destination
                ? `Vous avez recu ${fcfa(net)} de « ${groupe.nom} », verses directement sur « ${destination.nom || destination.type} ».`
                : `Vous avez recu ${fcfa(net)} de « ${groupe.nom} ».`,
            { lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } } }
        );
        await this.envoyer(
            await this._membres(groupe.id, [beneficiaireId]),
            `« ${groupe.nom} » — le pot du cycle ${cycle.numeroCycle} a ete verse. Le cycle suivant demarre.`,
            { lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } } }
        );
    }

    // -----------------------------------------------------------------
    //  Caisse 4 — ce qui presse
    // -----------------------------------------------------------------
    static async amendeInfligee(amende, groupe) {
        await this.envoyer(
            amende.clientId,
            `Amende de ${fcfa(amende.montant)} dans « ${groupe.nom} » (${amende.motif}). Elle doit etre reglee avant votre prochaine cotisation.`,
            { type: 'alerte', lien: { ecran: 'MesAmendes', params: { groupeId: groupe.id } } }
        );
    }

    static async cautionSaisie(clientId, groupe, montant) {
        await this.envoyer(
            clientId,
            `${fcfa(montant)} ont ete preleves sur votre caution dans « ${groupe.nom} » pour couvrir une cotisation impayee.`,
            { type: 'alerte', lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } } }
        );
    }

    static async garantAppele(garantId, defaillantNom, groupe, montant) {
        await this.envoyer(
            garantId,
            `Vous vous etiez porte garant : ${fcfa(montant)} ont ete preleves pour couvrir la cotisation de ${defaillantNom} dans « ${groupe.nom} ».`,
            { type: 'alerte', lien: { ecran: 'DetailTontine', params: { groupeId: groupe.id } } }
        );
    }

    static async membreExclu(clientId, groupe, motif) {
        await this.envoyer(
            clientId,
            `Vous avez ete exclu de « ${groupe.nom} »${motif ? ` — ${motif}` : ''}.`,
            { type: 'alerte', lien: { ecran: 'Communaute' } }
        );
    }

    // -----------------------------------------------------------------
    //  Gouvernance
    // -----------------------------------------------------------------
    static async voteOuvert(vote, groupe) {
        await this.envoyer(
            await this._membres(groupe.id, vote.sujet === 'exclure' ? [vote.cibleId] : []),
            `Scrutin ouvert dans « ${groupe.nom} » : ${vote.sujet.replace(/_/g, ' ')}. Votre voix est attendue.`,
            { lien: { ecran: 'VotesTontine', params: { groupeId: groupe.id } } }
        );
    }

    static async voteResolu(vote, groupe, resultat, detail) {
        await this.envoyer(
            await this._membres(groupe.id),
            `« ${groupe.nom} » — scrutin ${resultat} (${vote.sujet.replace(/_/g, ' ')}). ${detail || ''}`.trim(),
            { lien: { ecran: 'VotesTontine', params: { groupeId: groupe.id } } }
        );
    }

    static async echangePropose(echange, groupe, demandeurNom) {
        await this.envoyer(
            echange.destinataireId,
            `${demandeurNom} propose d'echanger son tour ${echange.tourDemandeur} contre le votre (${echange.tourDestinataire}) dans « ${groupe.nom} »${nombre(echange.montantCompensation) > 0 ? `, avec ${fcfa(echange.montantCompensation)} de compensation` : ''}.`,
            { lien: { ecran: 'EchangeTour', params: { groupeId: groupe.id } } }
        );
    }

    // -----------------------------------------------------------------
    //  Caisse 2
    // -----------------------------------------------------------------
    static async creditDecaisse(demande, groupe) {
        await this.envoyer(
            demande.clientId,
            `Votre credit de ${fcfa(demande.montant)} dans « ${groupe.nom} » a ete decaisse. Premiere echeance a venir.`,
            { lien: { ecran: 'RemboursementCredit', params: { demandeId: demande.id, groupeId: groupe.id } } }
        );
    }

    static async exerciceCloture(groupe, detail) {
        for (const part of detail) {
            if (!part.total) continue;
            await this.envoyer(
                part.clientId,
                `Casse de « ${groupe.nom} » : vous recevez ${fcfa(part.total)} — ${fcfa(part.apports)} d'apports et ${fcfa(part.partProduit)} de produit (${part.quotePart} % de la caisse).`,
                { lien: { ecran: 'CaisseEpargne', params: { groupeId: groupe.id } } }
            );
        }
    }

    // -----------------------------------------------------------------
    //  Rappels — appeles par le planificateur
    // -----------------------------------------------------------------
    /**
     * Rappels de cotisation a J-3, J-1 et le jour de l'echeance.
     *
     * Le but est d'eviter l'amende, pas de la constater : c'est la
     * difference entre une application qui aide et une qui sanctionne.
     */
    static async rappelsCotisations(maintenant = new Date()) {
        const rapport = { j3: 0, j1: 0, jour: 0, retard: 0 };
        const jour = 86400000;

        const jalons = [
            { cle: 'j3', min: 2, max: 3, mot: 'dans 3 jours' },
            { cle: 'j1', min: 0, max: 1, mot: 'demain' },
        ];

        const cycles = await TontineCycle.findAll({
            where: { statut: { [Op.in]: ['actif', 'en_defaut'] } },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });

        for (const cycle of cycles) {
            const reste = new Date(cycle.dateFinPrevue) - maintenant;
            const impayees = await TontineCotisation.findAll({
                where: { cycleId: cycle.id, statut: { [Op.in]: ['attendue', 'partielle', 'en_retard'] } }
            });
            if (!impayees.length) continue;

            const clients = impayees.map(c => c.clientId);
            const du = arrondir(impayees.reduce((s, c) => s + (nombre(c.montantDu) - nombre(c.montantPaye)), 0) / impayees.length);
            const lien = { ecran: 'Cotiser', params: { cycleId: cycle.id, groupeId: cycle.groupeId } };

            if (reste < 0) {
                await this.envoyer(clients,
                    `Cotisation en retard dans « ${cycle.groupe.nom} » : ${fcfa(du)}. Une amende court tant qu'elle n'est pas reglee.`,
                    { type: 'alerte', lien });
                rapport.retard += clients.length;
                continue;
            }

            const jalon = jalons.find(j => reste > j.min * jour && reste <= j.max * jour);
            if (jalon) {
                await this.envoyer(clients,
                    `Votre cotisation de ${fcfa(du)} pour « ${cycle.groupe.nom} » est due ${jalon.mot}.`,
                    { lien });
                rapport[jalon.cle] += clients.length;
            } else if (reste >= 0 && reste <= jour) {
                await this.envoyer(clients,
                    `Dernier jour pour cotiser ${fcfa(du)} dans « ${cycle.groupe.nom} ».`,
                    { type: 'alerte', lien });
                rapport.jour += clients.length;
            }
        }

        return rapport;
    }

    /** Rappel du tour a venir : une bonne nouvelle se prepare aussi. */
    static async rappelsTours(maintenant = new Date()) {
        let envoyes = 0;
        const jour = 86400000;

        const cycles = await TontineCycle.findAll({
            where: { statut: 'actif' },
            include: [{ model: TontineGroupe, as: 'groupe' }]
        });

        for (const cycle of cycles) {
            const reste = new Date(cycle.dateFinPrevue) - maintenant;
            if (reste < 0 || reste > 3 * jour) continue;

            const restantes = await TontineCotisation.count({
                where: { cycleId: cycle.id, statut: { [Op.ne]: 'payee' } }
            });
            await this.envoyer(cycle.beneficiaireId,
                restantes === 0
                    ? `Le pot de « ${cycle.groupe.nom} » est complet : ${fcfa(cycle.montantAttendu)} vous attendent.`
                    : `Votre tour approche dans « ${cycle.groupe.nom} ». Il reste ${restantes} cotisation(s) a rentrer.`,
                { lien: { ecran: 'DetailTontine', params: { groupeId: cycle.groupeId } } });
            envoyes++;
        }
        return { envoyes };
    }
}

module.exports = NotificationTontineService;
