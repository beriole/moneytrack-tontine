'use strict';

// =====================================================================
//  Calcul des dates de cycle.
//
//  Porte depuis NjanguiPay (schedule.service.js), adapte a l'ENUM
//  francais des frequences.
// =====================================================================

const AVANCE = {
    hebdomadaire: (d) => d.setDate(d.getDate() + 7),
    quinzaine: (d) => d.setDate(d.getDate() + 14),
    mensuelle: (d) => d.setMonth(d.getMonth() + 1),
    trimestrielle: (d) => d.setMonth(d.getMonth() + 3)
};

class EcheancierService {
    /**
     * Genere `nombre` dates successives a partir de `debut`.
     */
    static genererDates(debut, frequence, nombre) {
        const avancer = AVANCE[frequence];
        if (!avancer) throw new Error(`Frequence inconnue : ${frequence}`);

        const dates = [];
        const courante = new Date(debut);

        for (let i = 0; i < nombre; i++) {
            dates.push(new Date(courante));
            avancer(courante);
        }
        return dates;
    }

    /**
     * Date de fin d'une periode qui demarre a `debut`.
     */
    static finDePeriode(debut, frequence) {
        const [, fin] = this.genererDates(debut, frequence, 2);
        return fin;
    }

    static frequencesValides() {
        return Object.keys(AVANCE);
    }
}

module.exports = EcheancierService;
