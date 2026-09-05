'use strict';

const {
    db, Client, Portefeuille,
    TontineGroupe, TontineMembre, TontineCycle, TontineCotisation, TontinePoolCredit
} = require('../../models');
const ENV = require('../../config/index');
const TirageService = require('./tirage.service');
const EcheancierService = require('./echeancier.service');
const CycleService = require('./cycle.service');
const { ErreurTontine, nombre } = require('./commun');

const TYPES = ['rotative', 'credit', 'mixte'];
const MODES_ORDRE = ['tirage', 'vote', 'enchere', 'anciennete'];

class GroupeService {

    // -----------------------------------------------------------------
    //  Creation
    // -----------------------------------------------------------------
    static async creerGroupe(clientId, donnees) {
        const {
            nom, description, type = 'rotative', montantParPeriode,
            frequence = 'mensuelle', membresMax, modeOrdre = 'tirage',
            pourcentageCaution, bareme, destinationAmendes, modeAcces = 'prive', dateDebut
        } = donnees;

        if (!nom || !String(nom).trim()) throw new ErreurTontine(400, 'Le nom du groupe est obligatoire');
        if (!TYPES.includes(type)) throw new ErreurTontine(400, `Type invalide (attendu : ${TYPES.join(', ')})`);
        if (!EcheancierService.frequencesValides().includes(frequence)) {
            throw new ErreurTontine(400, `Frequence invalide (attendu : ${EcheancierService.frequencesValides().join(', ')})`);
        }
        if (!MODES_ORDRE.includes(modeOrdre)) throw new ErreurTontine(400, `Mode d'ordre invalide (attendu : ${MODES_ORDRE.join(', ')})`);
        if (!(nombre(montantParPeriode) > 0)) throw new ErreurTontine(400, 'Le montant par periode doit etre strictement positif');
        if (!(parseInt(membresMax, 10) >= 2)) throw new ErreurTontine(400, 'Un groupe compte au minimum 2 membres');

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.create({
                nom: String(nom).trim(),
                description: description || null,
                type,
                montantParPeriode: nombre(montantParPeriode),
                devise: 'XAF',
                frequence,
                membresMax: parseInt(membresMax, 10),
                membresActuels: 1,
                modeOrdre,
                pourcentageCaution: pourcentageCaution !== undefined
                    ? nombre(pourcentageCaution) : ENV.TONTINE_CAUTION_DEFAUT,
                bareme: bareme || null,
                destinationAmendes: destinationAmendes
                    || (type === 'rotative' ? 'pot_cycle' : 'epargne'),
                modeAcces,
                codeInvitation: await this._codeLibre(t),
                statut: 'en_attente',
                createurId: clientId,
                dateDebut: dateDebut || null,
                numeroCycleActuel: 0
            }, { transaction: t });

            // La caisse du groupe est un vrai portefeuille, sans proprietaire.
            const caisse = await Portefeuille.create({
                nom: `Caisse ${groupe.nom}`,
                solde: 0,
                devise: 'XAF',
                typePortefeuille: 'tontine',
                estPrincipal: false,
                estActif: true,
                ClientPortefeuilleId: null,
                groupeTontineId: groupe.id,
                description: 'Caisse de tontine. Ni retrait ni transfert par les routes client.'
            }, { transaction: t });
            await groupe.update({ portefeuilleId: caisse.id }, { transaction: t });

            // Le createur ouvre le bureau
            await TontineMembre.create({
                groupeId: groupe.id,
                clientId,
                role: 'president',
                statut: 'actif',
                dateAdhesion: new Date()
            }, { transaction: t });

            // Caisse 2 : le pool n'existe que si le groupe fait du credit
            if (type === 'credit' || type === 'mixte') {
                await TontinePoolCredit.create({
                    groupeId: groupe.id,
                    tauxInteretDefaut: ENV.TONTINE_TAUX_CREDIT_DEFAUT,
                    derniereMaj: new Date()
                }, { transaction: t });
            }

            return groupe;
        });
    }

    /** Code d'invitation non encore utilise. */
    static async _codeLibre(t) {
        for (let essai = 0; essai < 6; essai++) {
            const code = TirageService.genererCodeInvitation();
            const pris = await TontineGroupe.findOne({ where: { codeInvitation: code }, transaction: t });
            if (!pris) return code;
        }
        throw new ErreurTontine(500, "Impossible de generer un code d'invitation libre");
    }

    // -----------------------------------------------------------------
    //  Consultation
    // -----------------------------------------------------------------
    static async mesGroupes(clientId) {
        const adhesions = await TontineMembre.findAll({
            where: { clientId },
            include: [{ model: TontineGroupe, as: 'groupe' }],
            order: [['createdAt', 'DESC']]
        });

        return Promise.all(adhesions.map(async (m) => {
            const groupe = m.groupe;
            const cycle = groupe.numeroCycleActuel > 0
                ? await TontineCycle.findOne({
                    where: { groupeId: groupe.id, numeroCycle: groupe.numeroCycleActuel }
                })
                : null;

            let maCotisation = null;
            if (cycle) {
                maCotisation = await TontineCotisation.findOne({
                    where: { cycleId: cycle.id, membreId: m.id }
                });
            }

            return {
                groupe,
                monRole: m.role,
                monStatut: m.statut,
                monTour: m.ordreBeneficiaire,
                aiBeneficie: m.aBeneficie,
                cycleEnCours: cycle,
                maCotisation
            };
        }));
    }

    static async detailsGroupe(clientId, groupeId) {
        const membre = await TontineMembre.findOne({ where: { groupeId, clientId } });
        if (!membre) throw new ErreurTontine(403, "Vous n'etes pas membre de ce groupe");

        const groupe = await TontineGroupe.findByPk(groupeId, {
            include: [
                { model: Portefeuille, as: 'caisse', attributes: ['id', 'nom', 'solde', 'devise'] },
                { model: Client, as: 'createur', attributes: ['id', 'nom', 'email'] },
                {
                    model: TontineMembre, as: 'membres',
                    include: [{ model: Client, as: 'client', attributes: ['id', 'nom', 'email', 'telephone'] }]
                },
                { model: TontinePoolCredit, as: 'poolCredit', required: false }
            ],
            order: [[{ model: TontineMembre, as: 'membres' }, 'ordreBeneficiaire', 'ASC']]
        });
        if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');

        const cycle = groupe.numeroCycleActuel > 0
            ? await TontineCycle.findOne({
                where: { groupeId, numeroCycle: groupe.numeroCycleActuel },
                include: [{ model: Client, as: 'beneficiaire', attributes: ['id', 'nom'] }]
            })
            : null;

        return { groupe, cycleEnCours: cycle, monRole: membre.role, monTour: membre.ordreBeneficiaire };
    }

    // -----------------------------------------------------------------
    //  Adhesion
    // -----------------------------------------------------------------
    /**
     * Correctif du piege n.1 de NjanguiPay : la capacite y etait verifiee
     * AVANT l'ouverture de la transaction, l'increment dedans. Deux
     * adhesions simultanees sur la derniere place passaient toutes les
     * deux. Ici le groupe est verrouille et tout est controle dedans.
     */
    static async rejoindreGroupe(clientId, codeInvitation) {
        if (!codeInvitation) throw new ErreurTontine(400, "Code d'invitation manquant");

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findOne({
                where: { codeInvitation: String(codeInvitation).trim().toUpperCase() },
                transaction: t,
                lock: t.LOCK.UPDATE
            });
            if (!groupe) throw new ErreurTontine(404, "Code d'invitation invalide");

            if (groupe.statut !== 'en_attente') {
                throw new ErreurTontine(409, "Ce groupe a deja demarre : l'ordre de passage est fige");
            }

            const dejaMembre = await TontineMembre.findOne({
                where: { groupeId: groupe.id, clientId }, transaction: t
            });
            if (dejaMembre) throw new ErreurTontine(409, 'Vous etes deja membre de ce groupe');

            // Compte reel, pas le compteur denormalise : c'est lui qui fait foi.
            const actuels = await TontineMembre.count({
                where: { groupeId: groupe.id, statut: ['invite', 'actif'] }, transaction: t
            });
            if (actuels >= groupe.membresMax) {
                throw new ErreurTontine(409, 'Ce groupe est complet');
            }

            const membre = await TontineMembre.create({
                groupeId: groupe.id,
                clientId,
                role: 'membre',
                statut: 'actif',
                dateAdhesion: new Date()
            }, { transaction: t });

            await groupe.update({ membresActuels: actuels + 1 }, { transaction: t });
            return { groupe, membre };
        });
    }

    // -----------------------------------------------------------------
    //  Demarrage de la rotation
    // -----------------------------------------------------------------
    static async demarrerGroupe(clientId, groupeId) {
        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, {
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            if (groupe.createurId !== clientId) {
                const moi = await TontineMembre.findOne({ where: { groupeId, clientId }, transaction: t });
                if (!moi || moi.role !== 'president') {
                    throw new ErreurTontine(403, 'Seul le president peut demarrer la tontine');
                }
            }
            if (groupe.statut !== 'en_attente') {
                throw new ErreurTontine(409, `Ce groupe est deja au statut "${groupe.statut}"`);
            }

            const membres = await TontineMembre.findAll({
                where: { groupeId, statut: 'actif' },
                transaction: t, lock: t.LOCK.UPDATE
            });
            if (membres.length < 2) {
                throw new ErreurTontine(409, 'Il faut au moins 2 membres actifs pour demarrer');
            }

            // Ordre de passage
            let ordonnes = membres;
            let preuve = null;
            if (groupe.modeOrdre === 'tirage') {
                ordonnes = TirageService.melanger(membres);
                preuve = TirageService.genererPreuve(ordonnes.map(m => m.id), String(groupe.id));
            } else if (groupe.modeOrdre === 'anciennete') {
                ordonnes = [...membres].sort((a, b) => new Date(a.dateAdhesion) - new Date(b.dateAdhesion));
            } else {
                // 'vote' et 'enchere' : phase 4. En attendant, ordre d'adhesion.
                ordonnes = [...membres].sort((a, b) => a.id - b.id);
            }

            for (let i = 0; i < ordonnes.length; i++) {
                await ordonnes[i].update({ ordreBeneficiaire: i + 1 }, { transaction: t });
            }

            const debut = groupe.dateDebut ? new Date(groupe.dateDebut) : new Date();
            const cycle = await TontineCycle.create({
                groupeId: groupe.id,
                numeroCycle: 1,
                beneficiaireId: ordonnes[0].clientId,
                // Le beneficiaire ne cotise pas pour son propre tour :
                // le pot vaut donc (nb membres - 1) cotisations.
                montantAttendu: nombre(groupe.montantParPeriode) * (ordonnes.length - 1),
                montantCollecte: 0,
                statut: 'actif',
                dateDebut: debut,
                dateFinPrevue: EcheancierService.finDePeriode(debut, groupe.frequence)
            }, { transaction: t });

            await CycleService.genererCotisations(cycle, groupe, ordonnes, t);

            await groupe.update({
                statut: 'actif',
                numeroCycleActuel: 1,
                dateDebut: debut
            }, { transaction: t });

            return {
                cycle,
                groupe,
                preuveTirage: preuve,
                ordre: ordonnes.map(m => ({ membreId: m.id, clientId: m.clientId, tour: m.ordreBeneficiaire }))
            };
        }).then(async (r) => {
            // Apres le commit seulement : une notification ne doit jamais
            // faire echouer le demarrage d'une tontine.
            const NotificationService = require('./notification.service');
            await NotificationService.cycleDemarre(r.groupe, r.cycle, r.cycle.beneficiaireId);
            return r;
        });
    }
}

module.exports = GroupeService;
