'use strict';

const { Client, photo } = require('../models');
const Config = require('./config.service');

// =====================================================================
//  Verification d'identite — trois niveaux, et le sens de chacun.
//
//    0  compte cree : rien n'est confirme ;
//    1  email confirme par code : on sait que la personne recoit ce qu'on
//       lui envoie, rien de plus ;
//    2  identite verifiee par un agent, sur une piece deposee. Elle expire
//       (kyc_validite_mois) : une verification ancienne ne vaut plus.
//
//  Le niveau 3 de la conception — « eligible aux operations financieres
//  de tontine » — n'est pas stocke : il se calcule a chaque decision, par
//  EligibiliteService, a partir de ce niveau et du reste.
//
//  Ce que ce service ne fait PAS : capturer la piece, comparer un selfie,
//  detecter une photo d'ecran. C'est le metier d'un fournisseur de KYC ;
//  son choix — cout, conservation des donnees d'identite — n'a pas encore
//  ete fait. D'ici la, l'approbation d'un agent exige au moins qu'une
//  piece ait ete deposee.
// =====================================================================

const LIBELLES = {
    0: 'Compte non confirme',
    1: 'Email confirme',
    2: 'Identite verifiee'
};

class KycService {

    /**
     * Le niveau qui vaut aujourd'hui. Une identite verifiee dont la
     * validite est passee retombe au niveau de l'email.
     */
    static niveauEffectif(client, maintenant = new Date()) {
        const n = Number(client.niveauKyc) || 0;
        if (n >= 2 && client.kycExpireLe && new Date(client.kycExpireLe) <= maintenant) {
            return client.isVerified ? 1 : 0;
        }
        return n;
    }

    static etat(client) {
        const effectif = this.niveauEffectif(client);
        return {
            niveau: effectif,
            libelle: LIBELLES[effectif],
            verifieLe: client.kycVerifieLe || null,
            expireLe: effectif >= 2 ? client.kycExpireLe : null,
            expire: Number(client.niveauKyc) >= 2 && effectif < 2
        };
    }

    /** Niveau exige par la plateforme pour une operation (0 = aucune exigence). */
    static async niveauExige(operation, t = null) {
        return Number(await Config.lire(`tontine_kyc_niveau_${operation}`, 0, t)) || 0;
    }

    /** Email confirme par code : niveau 1, sans jamais faire redescendre un niveau 2. */
    static async marquerEmailConfirme(email) {
        const client = await Client.findOne({ where: { email } });
        if (!client) return null;
        await client.update({
            isVerified: true,
            niveauKyc: Math.max(Number(client.niveauKyc) || 0, 1)
        });
        return client;
    }

    /**
     * Approbation par un agent. Elle exige une piece deposee : on ne
     * certifie pas une identite sur rien — l'approbation ne verifiait
     * jusqu'ici l'existence d'aucun document.
     */
    static async approuver(clientId) {
        const client = await Client.findByPk(clientId);
        if (!client) return { erreur: 404, message: 'Client introuvable' };
        const piece = await photo.findOne({ where: { clientId } });
        if (!piece) {
            return { erreur: 409, message: "Aucune piece d'identite deposee : rien a verifier" };
        }
        const mois = Number(await Config.lire('kyc_validite_mois', 24)) || 24;
        const maintenant = new Date();
        const expire = new Date(maintenant);
        expire.setMonth(expire.getMonth() + mois);
        await client.update({ niveauKyc: 2, kycVerifieLe: maintenant, kycExpireLe: expire });
        return { client, etat: this.etat(client) };
    }

    /**
     * Rejet d'une demande. Il retire l'identite verifiee, pas l'email
     * confirme : le rejet mettait isVerified a faux, si bien qu'une piece
     * refusee annulait aussi la confirmation de l'email.
     */
    static async rejeter(clientId) {
        const client = await Client.findByPk(clientId);
        if (!client) return { erreur: 404, message: 'Client introuvable' };
        await client.update({
            niveauKyc: client.isVerified ? 1 : 0,
            kycVerifieLe: null,
            kycExpireLe: null
        });
        return { client, etat: this.etat(client) };
    }
}

module.exports = KycService;
