'use strict';

const { ErreurTontine } = require('./commun');

// =====================================================================
//  Politique de recouvrement d'un groupe.
//
//  Dans quel ordre MoneyTrack va chercher l'argent d'une cotisation
//  impayee, et apres quel delai. L'ordre etait ecrit en dur dans le
//  planificateur — caution, puis garanties — et nulle part ailleurs :
//  ni le groupe ni le reglement ne pouvaient le changer, et le reglement
//  decrivait autre chose (clause 8).
//
//  Trois sources, toutes de l'argent que le debiteur a lui-meme engage :
//
//    caution      deja au sequestre du groupe ;
//    garanties    epargne ou projet bloques sur son propre compte, avec
//                 son consentement signe ;
//    retenue_pot  prelevee sur le pot qu'il recevra, s'il ne l'a pas
//                 encore recu — au moment du versement, pas avant.
//
//  Il n'y a pas de quatrieme source : jamais le portefeuille courant du
//  membre sans son geste, jamais un autre membre.
//
//  Ce qu'aucune source ne couvre devient un incident de defaut, que le
//  membre peut regulariser lui-meme.
// =====================================================================

const SOURCES = {
    caution: 'la caution deposee a l\'entree',
    garanties: 'les garanties affectees (epargne ou projet bloques avec consentement)',
    retenue_pot: 'une retenue sur le pot du membre, s\'il ne l\'a pas encore recu'
};

// Les groupes crees avant la politique suivaient cet ordre, code en dur.
// Ils le gardent : un reglement signe ne change pas sous les signatures.
const HERITEE = Object.freeze({ ordre: ['caution', 'garanties'], delaiGraceJours: 0 });

// Proposee aux nouveaux groupes.
const PAR_DEFAUT = Object.freeze({ ordre: ['caution', 'garanties', 'retenue_pot'], delaiGraceJours: 0 });

const GRACE_MAX = 30;

class PolitiqueRecouvrement {

    static sources() {
        return Object.entries(SOURCES).map(([code, libelle]) => ({ code, libelle }));
    }

    static parDefaut() {
        return { ordre: [...PAR_DEFAUT.ordre], delaiGraceJours: PAR_DEFAUT.delaiGraceJours };
    }

    /**
     * Valide une politique proposee et la ramene a sa forme canonique.
     * `undefined`/`null` donne la politique par defaut.
     */
    static normaliser(valeur) {
        if (valeur === undefined || valeur === null || valeur === '') return this.parDefaut();
        let p = valeur;
        if (typeof p === 'string') {
            try { p = JSON.parse(p); } catch (e) {
                throw new ErreurTontine(400, 'Politique de recouvrement illisible');
            }
        }
        if (typeof p !== 'object' || Array.isArray(p)) {
            throw new ErreurTontine(400, 'La politique de recouvrement est un objet { ordre, delaiGraceJours }');
        }

        const ordre = p.ordre === undefined ? [...PAR_DEFAUT.ordre] : p.ordre;
        if (!Array.isArray(ordre)) {
            throw new ErreurTontine(400, 'politiqueRecouvrement.ordre est une liste de sources');
        }
        const inconnues = ordre.filter(s => !Object.prototype.hasOwnProperty.call(SOURCES, s));
        if (inconnues.length) {
            throw new ErreurTontine(400,
                `Source de recouvrement inconnue : ${inconnues.join(', ')} (attendu : ${Object.keys(SOURCES).join(', ')})`);
        }
        if (new Set(ordre).size !== ordre.length) {
            throw new ErreurTontine(400, 'Une source de recouvrement ne figure qu\'une fois dans l\'ordre');
        }

        const grace = p.delaiGraceJours === undefined ? 0 : Number(p.delaiGraceJours);
        if (!Number.isInteger(grace) || grace < 0 || grace > GRACE_MAX) {
            throw new ErreurTontine(400, `Le delai de grace est un nombre entier de jours, de 0 a ${GRACE_MAX}`);
        }
        return { ordre: [...ordre], delaiGraceJours: grace };
    }

    /** La politique en vigueur d'un groupe, telle qu'enregistree. */
    static de(groupe) {
        let p = groupe && groupe.politiqueRecouvrement;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
        if (!p || typeof p !== 'object') return { ordre: [...HERITEE.ordre], delaiGraceJours: HERITEE.delaiGraceJours };
        try { return this.normaliser(p); } catch (e) {
            // Une valeur en base qui ne se relit plus ne doit pas bloquer le
            // recouvrement de tout le groupe : on retombe sur l'ordre historique.
            return { ordre: [...HERITEE.ordre], delaiGraceJours: HERITEE.delaiGraceJours };
        }
    }

    static prevoit(groupe, source) {
        return this.de(groupe).ordre.includes(source);
    }

    /** Date a partir de laquelle une cotisation echue peut etre recouvree. */
    static recouvrableA(groupe, dateEcheance) {
        return new Date(new Date(dateEcheance).getTime() + this.de(groupe).delaiGraceJours * 86400000);
    }

    /** La clause du reglement, en francais. */
    static decrire(groupe) {
        const p = this.de(groupe);
        const grace = p.delaiGraceJours > 0
            ? `Passe l'echeance, le membre dispose de ${p.delaiGraceJours} jour(s) pour regler lui-meme ; ensuite, `
            : 'A l\'echeance, ';
        const sources = p.ordre.length
            ? p.ordre.map((s, i) => `${i + 1}) ${SOURCES[s]}`).join(', ')
            : 'aucune source automatique';
        return `${grace}une cotisation impayee est completee, dans cet ordre, par : ${sources}. `
            + 'Seul le montant manquant est preleve. Ce qui reste du devient un incident de defaut, '
            + 'que le membre regularise en payant ; tant qu\'il est ouvert, il ne peut ni recevoir de pot, '
            + 'ni encherir, ni rejoindre une autre tontine.';
    }
}

module.exports = PolitiqueRecouvrement;
