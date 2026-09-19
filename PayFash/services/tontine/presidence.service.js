'use strict';

const { db, Client, TontineGroupe, TontineMembre } = require('../../models');
const { ErreurTontine, exigerGroupeNonGele } = require('./commun');
const { exigerActe } = require('./permissions');
const { journaliser } = require('../audit.service');

// =====================================================================
//  La passation de presidence.
//
//  Elle n'existait pas. Le role s'attribuait a la creation du groupe et
//  ne bougeait plus : un president qui part, qui ne repond plus ou que le
//  groupe veut remplacer laissait la tontine sans moyen de designer son
//  successeur autrement qu'en ecrivant dans la base a la main.
//
//  Deux choses la rendaient impossible a faire proprement :
//
//    - exigerRole accordait au createur du groupe les prerogatives du
//      president « meme si le role a ete reattribue ». Transmettre la
//      presidence n'aurait donc rien retire a l'ancien : deux personnes
//      auraient preside, dont une invisible. Cette exception est levee.
//
//    - rien ne garantissait qu'un groupe garde un president. L'exclusion
//      protegeait le createur, pas le president en exercice.
//
//  Le transfert est une seule ecriture transactionnelle : l'ancien
//  redevient membre et le nouveau devient president, ou rien ne bouge.
//  Un groupe ne passe jamais, meme une fraction de seconde, par un etat
//  sans president ou a deux presidents.
// =====================================================================

class PresidenceService {

    /**
     * Qui preside ce groupe, et qui peut lui succeder.
     */
    static async etat(clientId, groupeId) {
        await exigerActe('consulter', groupeId, clientId);

        const membres = await TontineMembre.findAll({
            where: { groupeId },
            include: [{ model: Client, as: 'client', attributes: ['id', 'nom'] }],
            order: [['id', 'ASC']]
        });

        const president = membres.find(m => m.role === 'president');
        const eligibles = membres.filter(m => m.statut === 'actif' && m.role !== 'president');

        return {
            president: president
                ? { clientId: president.clientId, nom: president.client ? president.client.nom : null }
                : null,
            successeursPossibles: eligibles.map(m => ({
                clientId: m.clientId,
                nom: m.client ? m.client.nom : null,
                role: m.role
            })),
            jeSuisPresident: !!president && president.clientId === parseInt(clientId, 10)
        };
    }

    /**
     * Transmet la presidence a un autre membre actif du meme groupe.
     *
     * `acteur` vaut { clientId } depuis une route — seul le president en
     * exercice peut transmettre — ou { systeme: true } pour un
     * depouillement de vote, ou l'autorisation a ete donnee par le groupe.
     */
    static async transferer(acteur, groupeId, versClientId, motif = null) {
        const cibleId = parseInt(versClientId, 10);
        if (!Number.isInteger(cibleId)) {
            throw new ErreurTontine(400, 'Designez le membre a qui transmettre la presidence');
        }

        return db.transaction(async (t) => {
            const groupe = await TontineGroupe.findByPk(groupeId, { transaction: t, lock: t.LOCK.UPDATE });
            if (!groupe) throw new ErreurTontine(404, 'Groupe introuvable');
            // Un groupe gele ne change pas de direction : le gel est une
            // mesure conservatoire, et la passation deplace le pouvoir de
            // decision sur l'argent suspendu.
            exigerGroupeNonGele(groupe, 'la passation de presidence');

            if (!acteur.systeme) {
                // Seul le president transmet. Le passage par un acte nomme
                // fait que cette regle vit au meme endroit que les autres.
                await exigerActe('transmettrePresidence', groupeId, acteur.clientId, t);
            }

            const sortant = await TontineMembre.findOne({
                where: { groupeId, role: 'president' }, transaction: t, lock: t.LOCK.UPDATE
            });

            const entrant = await TontineMembre.findOne({
                where: { groupeId, clientId: cibleId }, transaction: t, lock: t.LOCK.UPDATE
            });
            if (!entrant) throw new ErreurTontine(404, "Cette personne n'est pas membre du groupe");
            if (entrant.statut !== 'actif') {
                throw new ErreurTontine(409,
                    `Seul un membre actif peut presider — celui-ci est « ${entrant.statut} »`);
            }
            if (sortant && entrant.id === sortant.id) {
                throw new ErreurTontine(409, 'Cette personne preside deja ce groupe');
            }

            // L'ordre compte : on libere la place avant de l'occuper, pour
            // que l'index d'unicite ne voie jamais deux presidents.
            if (sortant) {
                await sortant.update({ role: 'membre' }, { transaction: t });
            }
            await entrant.update({ role: 'president' }, { transaction: t });

            await journaliser({
                acteur: acteur.systeme ? { systeme: true } : { clientId: acteur.clientId },
                action: 'TONTINE_PRESIDENCE_TRANSMISE',
                cible: `TontineGroupe#${groupe.id}`,
                details: {
                    sortantClientId: sortant ? sortant.clientId : null,
                    entrantClientId: entrant.clientId,
                    motif: motif || null
                },
                transaction: t
            });

            return {
                groupe,
                sortantClientId: sortant ? sortant.clientId : null,
                entrantClientId: entrant.clientId,
                motif: motif || null
            };
        }).then(async (r) => {
            // Apres le commit. Une notification qui echoue ne doit pas
            // faire croire que la passation a echoue.
            try {
                const NotificationService = require('./notification.service');
                if (typeof NotificationService.presidenceTransmise === 'function') {
                    await NotificationService.presidenceTransmise(r.groupe, r.sortantClientId, r.entrantClientId);
                }
            } catch (e) {
                console.log('[tontine] notification de passation non envoyee :', e.message);
            }
            return r;
        });
    }
}

module.exports = PresidenceService;
