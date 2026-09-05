'use strict';

const crypto = require('crypto');

// =====================================================================
//  Tirage au sort de l'ordre de passage.
//
//  Porte tel quel depuis NjanguiPay (lottery.service.js) : ce service ne
//  depend d'aucun modele, et sa logique etait deja correcte.
//
//  Le point important est le rejet du biais modulo : prendre
//  octetAleatoire % n rend les premieres valeurs plus probables que les
//  dernieres. Dans une tontine, un biais sur l'ordre de passage est un
//  avantage financier reel (manger tot vaut mieux que manger tard).
// =====================================================================

class TirageService {
    /**
     * Melange de Fisher-Yates avec une source cryptographique.
     * Chaque permutation a exactement la meme probabilite.
     */
    static melanger(elements) {
        const melange = [...elements];
        for (let i = melange.length - 1; i > 0; i--) {
            const j = this.entierAleatoire(0, i);
            [melange[i], melange[j]] = [melange[j], melange[i]];
        }
        return melange;
    }

    /**
     * Entier aleatoire dans [min, max], sans biais modulo.
     */
    static entierAleatoire(min, max) {
        const etendue = max - min + 1;
        if (etendue <= 1) return min;

        const octets = Math.ceil(Math.log2(etendue) / 8) || 1;
        const plafond = Math.floor(256 ** octets / etendue) * etendue;

        let valeur;
        do {
            valeur = crypto.randomBytes(octets).readUIntBE(0, octets);
        } while (valeur >= plafond);

        return min + (valeur % etendue);
    }

    /**
     * Empreinte du tirage, a afficher aux membres.
     * Permet a chacun de verifier a posteriori que l'ordre n'a pas ete
     * rejoue apres coup.
     */
    static genererPreuve(resultat, sel) {
        return crypto
            .createHash('sha256')
            .update(JSON.stringify(resultat) + (sel || ''))
            .digest('hex');
    }

    /**
     * Code d'invitation court et non devinable.
     */
    static genererCodeInvitation() {
        return crypto.randomBytes(4).toString('hex').toUpperCase();
    }
}

module.exports = TirageService;
