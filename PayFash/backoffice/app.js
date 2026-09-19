/* =====================================================================
 *  MoneyTrack — Back-office
 *
 *  Quarante-six routes d'administration existaient sans la moindre
 *  interface : le RBAC a six roles, le maker-checker a deux personnes et
 *  le journal d'audit ne s'utilisaient qu'au curl. Ce fichier est cette
 *  interface.
 *
 *  Deux principes de fond :
 *
 *  1. Le serveur reste la seule autorite. Masquer un bouton n'est pas une
 *     securite : `requireRole` decide, et une action interdite revient en
 *     403 meme si l'interface l'a laissee passer. Le role sert ici a ne
 *     pas proposer ce qui sera refuse — c'est du confort, pas un controle.
 *
 *  2. Les operations financieres sensibles n'ont pas de bouton
 *     « executer ». Rembourser et ajuster un portefeuille DEPOSENT une
 *     demande (202) qu'un SECOND administrateur approuve depuis l'ecran
 *     Validations. L'interface dit ce qu'elle fait : « Demander », jamais
 *     « Rembourser ».
 * ===================================================================== */

'use strict';

const BASE = '/api/admin';
const CLE_JETON = 'moneytrack_admin_token';

const etat = {
    jeton: localStorage.getItem(CLE_JETON) || null,
    admin: null,
    page: null,
};

/* ------------------------------------------------------------------ Client HTTP */

/**
 * Un appel a l'API d'administration.
 *
 * Normalise les deux enveloppes du back-end : la plupart des routes
 * repondent { success, data, meta }, celles de la tontine renvoient
 * l'objet nu. On rend les deux exploitables sans que l'appelant ait a
 * savoir laquelle il interroge.
 */
async function api(chemin, options = {}) {
    const reponse = await fetch(BASE + chemin, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            ...(etat.jeton ? { Authorization: 'Bearer ' + etat.jeton } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (reponse.status === 401) {
        deconnecter('Session expirée — reconnectez-vous.');
        throw new Error('Session expirée');
    }

    const type = reponse.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
        if (!reponse.ok) throw new Error(`Erreur ${reponse.status}`);
        return reponse;
    }

    const corps = await reponse.json();
    if (!reponse.ok) {
        throw new Error(corps.error || corps.message || `Erreur ${reponse.status}`);
    }
    // { success, data } -> data ; sinon le corps tel quel
    return Object.prototype.hasOwnProperty.call(corps, 'data') ? corps.data : corps;
}

/** Variante qui conserve l'enveloppe complete — utile pour `meta` (pagination). */
async function apiComplet(chemin) {
    const reponse = await fetch(BASE + chemin, {
        headers: { Authorization: 'Bearer ' + etat.jeton },
    });
    if (reponse.status === 401) { deconnecter('Session expirée.'); throw new Error('Session expirée'); }
    const corps = await reponse.json();
    if (!reponse.ok) throw new Error(corps.error || `Erreur ${reponse.status}`);
    return corps;
}

/* ------------------------------------------------------------------ Presentation */

const echapper = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const fcfa = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' FCFA';
};

const nombre = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '0';
};

const date = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—'
        : d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const dateHeure = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '—'
        : d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// Les couleurs de statut reprennent `statutCouleur` du module mobile,
// pour qu'un groupe suspendu ait la meme teinte des deux cotes.
const TEINTES = {
    actif: 'succes', payee: 'succes', payé: 'succes', 'Succès': 'succes', approuve: 'succes',
    APPROUVE: 'succes', SUCCESSFUL: 'succes', resolu: 'succes', 'résolu': 'succes',
    complete: 'succes', remboursee: 'succes', decaissee: 'accent', approuvee: 'succes',
    suspendu: 'danger', impayee: 'danger', due: 'danger', en_defaut: 'danger', rejete: 'danger',
    REJETE: 'danger', rejetee: 'danger', FAILED: 'danger', 'Annulée': 'danger', EXPIRED: 'danger',
    en_attente: 'warning', EN_ATTENTE: 'warning', partielle: 'warning', PENDING: 'warning',
    'En confirmation': 'warning', A_VERIFIER: 'warning', 'A verifier': 'warning', ouvert: 'warning',
    termine: 'neutre', annulee: 'neutre', REFUNDED: 'neutre', 'remboursée': 'neutre',
    regle: 'succes', FAIBLE: 'succes', MODERE: 'warning', ELEVE: 'danger',
    ELIGIBLE: 'succes', NON_ELIGIBLE: 'danger',
};

const pastille = (valeur) => {
    if (valeur === null || valeur === undefined || valeur === '') return '<span class="faible">—</span>';
    const teinte = TEINTES[valeur] || 'accent';
    return `<span class="pastille p-${teinte}">${echapper(valeur)}</span>`;
};

const LIBELLE_ROLE = {
    SUPER_ADMIN: 'Super administrateur',
    ADMIN_FINANCE: 'Administrateur financier',
    SUPPORT: 'Agent de support',
    COMPLIANCE: 'Agent de conformité',
    MARKETING: 'Agent marketing',
};

/* ------------------------------------------------------------------ Retours visuels */

function toast(message, genre = 'info') {
    const boite = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + genre;
    el.textContent = message;
    boite.appendChild(el);
    setTimeout(() => el.remove(), 5200);
}

const voile = () => document.getElementById('voile');

function ouvrirModale(html, large = false) {
    document.getElementById('modale').classList.toggle('large', large);
    document.getElementById('modale').innerHTML = html;
    voile().classList.add('visible');
}

function fermerModale() {
    voile().classList.remove('visible');
    document.getElementById('modale').innerHTML = '';
}

/**
 * Confirmation avant une action irreversible. Le libelle du bouton dit
 * l'action elle-meme — jamais « OK » : on doit pouvoir lire ce qu'on
 * s'apprete a faire au moment de le faire.
 */
function confirmer({ titre, texte, libelle, genre = 'danger', champ }) {
    return new Promise((resoudre) => {
        ouvrirModale(`
            <h3>${echapper(titre)}</h3>
            <p class="sous">${texte}</p>
            ${champ ? `<label class="label">${echapper(champ)}</label>
                       <input class="champ" id="champ-confirmation" placeholder="Facultatif">` : ''}
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton ${genre}" id="confirmer-oui">${echapper(libelle)}</button>
            </div>`);
        document.getElementById('confirmer-oui').onclick = () => {
            const saisie = document.getElementById('champ-confirmation');
            const valeur = saisie ? saisie.value.trim() : '';
            fermerModale();
            resoudre({ ok: true, valeur });
        };
        voile().querySelector('[data-fermer]').onclick = () => { fermerModale(); resoudre({ ok: false }); };
    });
}

/** Enveloppe une action : retour visuel systematique, succes comme echec. */
async function agir(action, messageSucces) {
    try {
        const r = await action();
        toast(messageSucces || r?.message || 'Opération effectuée', 'succes');
        await afficherPage(etat.page, true);
        return r;
    } catch (e) {
        toast(e.message, 'erreur');
    }
}

/* ------------------------------------------------------------------ Roles */

/**
 * L'administrateur peut-il exercer cette action ?
 * Reproduit `requireRole` du serveur : SUPER_ADMIN passe toujours.
 * Sert uniquement a griser un bouton — le serveur tranche.
 */
function peut(...roles) {
    if (!etat.admin) return false;
    if (etat.admin.role === 'SUPER_ADMIN') return true;
    return roles.includes(etat.admin.role);
}

/** Bouton desactive avec l'explication du refus, plutot que masque. */
function boutonGarde(html, roles, attributs = '') {
    if (peut(...roles)) return html.replace('%%ATTR%%', attributs);
    const noms = roles.map((r) => LIBELLE_ROLE[r] || r).join(' ou ');
    return html.replace('%%ATTR%%', `disabled title="Réservé à : ${noms}"`);
}

/* ------------------------------------------------------------------ Navigation */

const ICONES = {
    dashboard: '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>',
    tontine: '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>',
    utilisateurs: '<path d="M16 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 0a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3 0-8 1.5-8 4.5V21h10v-2.5c0-1.4.6-2.6 1.5-3.5C10.4 13.3 9.1 13 8 13zm8 0c-1 0-2.2.2-3.3.7 1.1 1 1.8 2.2 1.8 3.8V21h9v-3.5c0-3-5-4.5-7.5-4.5z"/>',
    kyc: '<path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1 14-4-4 1.4-1.4L11 13.2l5.6-5.6L18 9l-7 7z"/>',
    litiges: '<path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/>',
    transactions: '<path d="M7 7h10v3l5-4-5-4v3H5v6h2V7zm10 10H7v-3l-5 4 5 4v-3h12v-6h-2v4z"/>',
    validations: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>',
    aml: '<path d="M15.5 14h-.8l-.3-.3a6.5 6.5 0 1 0-.7.7l.3.3v.8l5 5 1.5-1.5-5-5zm-6 0a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9z"/>',
    plans: '<path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2h18zM3 10v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8H3zm4 6h4v-2H7v2z"/>',
    notifications: '<path d="M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6v-5a6 6 0 0 0-5-5.9V4a1 1 0 1 0-2 0v1.1A6 6 0 0 0 6 11v5l-2 2v1h16v-1l-2-2z"/>',
    defauts: '<path d="M12 2 2 7v6c0 5 4.3 8.7 10 9 5.7-.3 10-4 10-9V7L12 2zm1 14h-2v-2h2v2zm0-4h-2V7h2v5z"/>',
    config: '<path d="m19.4 13-.1-1 .1-1 2-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L14.8 3H9.2l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4 2 1.6-.1 1 .1 1-2 1.6 2 3.4 2.5-1c.5.4 1.1.8 1.7 1l.4 2.9h5.6l.4-2.9c.6-.2 1.2-.6 1.7-1l2.5 1 2-3.4-2-1.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"/>',
    admins: '<path d="M12 1 3 5v6c0 5.6 3.8 10.7 9 12 5.2-1.3 9-6.4 9-12V5l-9-4zm0 6a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm0 6.5c1.7 0 5 .9 5 2.5v1.4A9.6 9.6 0 0 1 12 20a9.6 9.6 0 0 1-5-2.6V16c0-1.6 3.3-2.5 5-2.5z"/>',
};

const MENU = [
    { groupe: 'Pilotage' },
    { id: 'dashboard', titre: 'Tableau de bord' },
    { id: 'tontine', titre: 'Tontines' },
    { groupe: 'Clients' },
    { id: 'utilisateurs', titre: 'Utilisateurs' },
    { id: 'kyc', titre: 'Vérifications KYC' },
    { id: 'litiges', titre: 'Litiges' },
    { id: 'defauts', titre: 'Défauts et restrictions' },
    { groupe: 'Finance' },
    { id: 'transactions', titre: 'Transactions' },
    { id: 'validations', titre: 'Validations' },
    { id: 'aml', titre: 'Anti-fraude' },
    { groupe: 'Plateforme' },
    { id: 'plans', titre: "Plans d'abonnement" },
    { id: 'notifications', titre: 'Notifications' },
    { id: 'config', titre: 'Configuration', reserve: ['SUPER_ADMIN'] },
    { id: 'admins', titre: 'Administrateurs', reserve: ['SUPER_ADMIN'] },
];

function construireNavigation() {
    const nav = document.getElementById('nav');
    nav.innerHTML = MENU.map((e) => {
        if (e.groupe) return `<div class="nav-groupe">${e.groupe}</div>`;
        if (e.reserve && !peut(...e.reserve)) return '';
        return `<button class="nav-item" data-page="${e.id}">
                    <svg viewBox="0 0 24 24" fill="currentColor">${ICONES[e.id] || ''}</svg>
                    <span>${e.titre}</span>
                </button>`;
    }).join('');

    nav.querySelectorAll('[data-page]').forEach((b) => {
        b.onclick = () => { location.hash = '#/' + b.dataset.page; };
    });
}

function marquerActif(id) {
    document.querySelectorAll('.nav-item').forEach((b) => {
        b.classList.toggle('actif', b.dataset.page === id);
    });
}

/* ------------------------------------------------------------------ Fabriques */

const enTete = (titre, sous, actions = '') => `
    <div class="entete-page">
        <div class="rangee">
            <div>
                <h2>${echapper(titre)}</h2>
                <p>${sous}</p>
            </div>
            <div>${actions}</div>
        </div>
    </div>`;

const tuile = (etiquette, valeur, detail, genre = '') => `
    <div class="tuile ${genre}">
        <div class="etiquette">${echapper(etiquette)}</div>
        <div class="valeur">${valeur}</div>
        ${detail ? `<div class="detail">${detail}</div>` : ''}
    </div>`;

const vide = (texte) => `<div class="vide"><div class="grand">◇</div>${echapper(texte)}</div>`;

const tableau = (colonnes, lignes) => {
    if (!lignes.length) return vide('Aucune donnée à afficher.');
    return `<div class="enveloppe-table"><table>
        <thead><tr>${colonnes.map((c) => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${lignes.join('')}</tbody>
    </table></div>`;
};

const ligneDetail = (cle, val) => `<div class="ligne-detail"><span class="cle">${echapper(cle)}</span><span class="val">${val}</span></div>`;

/** Graphique en barres, sans dependance : la valeur maximale fait 100 %. */
function barres(donnees) {
    if (!donnees.length) return vide('Aucune donnée.');
    const max = Math.max(...donnees.map((d) => Math.abs(Number(d.valeur) || 0)), 1);
    return `<div class="barres">${donnees.map((d) => `
        <div class="barre-ligne">
            <div class="nom">${echapper(d.nom || '—')}</div>
            <div class="piste"><div class="remplissage" style="width:${(Math.abs(Number(d.valeur) || 0) / max) * 100}%"></div></div>
            <div class="valeur">${d.affichage ?? nombre(d.valeur)}</div>
        </div>`).join('')}</div>`;
}

function pagination(meta, action) {
    if (!meta || (meta.totalPages || 1) <= 1) return '';
    const page = meta.page || 1;
    const total = meta.totalPages || 1;
    return `<div class="pagination">
        <span class="etat">Page ${page} sur ${total} — ${nombre(meta.total)} entrée(s)</span>
        <div>
            <button class="bouton fantome petit" data-action="${action}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Précédent</button>
            <button class="bouton fantome petit" data-action="${action}" data-page="${page + 1}" ${page >= total ? 'disabled' : ''}>Suivant</button>
        </div>
    </div>`;
}

/* =====================================================================
 *  PAGES
 * ===================================================================== */

const PAGES = {};

/* ---------------------------------------------------- Tableau de bord */
PAGES.dashboard = async () => {
    const [s, c] = await Promise.all([api('/dashboard/stats'), api('/dashboard/charts')]);
    const u = s.utilisateurs || {};
    const f = s.finances || {};
    const p = s.produits || {};

    return `
        ${enTete('Tableau de bord', `Bonjour ${echapper(etat.admin.nom)} — vue d'ensemble de la plateforme.`)}

        <div class="grille c4">
            ${tuile('Utilisateurs', nombre(u.total), `${nombre(u.actifs)} actifs · ${nombre(u.verifies)} vérifiés`)}
            ${tuile('Nouveaux (30 j)', nombre(u.nouveaux30j), 'inscriptions du mois', 'accent')}
            ${tuile('Encours portefeuilles', fcfa(f.encoursWallets), 'argent détenu pour les clients')}
            ${tuile('Revenu plateforme', fcfa(f.revenuPlateforme), 'commissions réellement encaissées', 'succes')}
        </div>

        <div class="grille c2" style="margin-top:14px">
            <div class="carte">
                <h3>Volume et écritures</h3>
                ${ligneDetail('Volume des transactions', fcfa(f.volumeTransactions))}
                ${ligneDetail("Nombre d'écritures", nombre(f.nbTransactions))}
                ${ligneDetail('Somme de la colonne « frais »', fcfa(f.benefices))}
                <div class="info" style="margin:14px 0 0">
                    La colonne « frais » a longtemps porté un défaut de 100,3 FCFA que rien ne débitait.
                    Sur une base ancienne, ce chiffre contient du revenu fantôme : le revenu réel est
                    la commission prélevée sur les pots de tontine.
                </div>
            </div>
            <div class="carte">
                <h3>Catalogue</h3>
                ${ligneDetail("Plans d'abonnement", nombre(p.plans))}
                ${ligneDetail('Épargnes ouvertes', nombre(p.epargnes))}
                ${ligneDetail('Projets', nombre(p.projets))}
            </div>
        </div>

        <div class="grille c2">
            <div class="carte">
                <h3>Écritures par type</h3>
                ${barres((c.transactionsParType || []).map((t) => ({
                    nom: t.type, valeur: t.montant, affichage: fcfa(t.montant),
                })))}
            </div>
            <div class="carte">
                <h3>Écritures par statut</h3>
                ${barres((c.transactionsParStatut || []).map((t) => ({ nom: t.statut, valeur: t.nombre })))}
            </div>
        </div>

        <div class="carte">
            <h3>Portefeuilles par type</h3>
            ${barres((c.walletsParType || []).map((w) => ({
                nom: w.typePortefeuille, valeur: w.solde, affichage: fcfa(w.solde),
            })))}
        </div>`;
};

/* ---------------------------------------------------- Tontines */
PAGES.tontine = async (params = {}) => {
    const page = params.page || 1;
    const statut = params.statut || '';
    const q = params.q || '';

    const [s, a, g] = await Promise.all([
        api('/tontine/stats'),
        api('/tontine/anomalies'),
        api(`/tontine/groupes?page=${page}&taille=25${statut ? '&statut=' + statut : ''}${q ? '&q=' + encodeURIComponent(q) : ''}`),
    ]);

    const groupes = g.groupes || g.data || [];
    const alerte = s.sante && s.sante.alerte;

    const lignes = groupes.map((gr) => `
        <tr>
            <td><strong>${echapper(gr.nom)}</strong><div class="faible mono">${echapper(gr.codeInvitation || '')}</div></td>
            <td>${pastille(gr.statut)}</td>
            <td>${echapper(gr.frequence || '—')}</td>
            <td class="num">${nombre(gr.membresActuels ?? gr.membres ?? 0)}</td>
            <td class="num">${fcfa(gr.montantParPeriode)}</td>
            <td class="num">${fcfa(gr.soldeCaisse ?? gr.encours ?? 0)}</td>
            <td class="actions">
                <button class="bouton fantome petit" data-action="tontine-detail" data-id="${gr.id}">Détail</button>
                ${gr.statut === 'suspendu'
                    ? `<button class="bouton succes petit" data-action="degeler" data-id="${gr.id}" data-nom="${echapper(gr.nom)}">Dégeler</button>`
                    : `<button class="bouton danger petit" data-action="geler" data-id="${gr.id}" data-nom="${echapper(gr.nom)}">Geler</button>`}
            </td>
        </tr>`);

    return `
        ${enTete('Tontines', 'Surveillance des groupes, de leur discipline et de leur trésorerie.',
            `<button class="bouton secondaire petit" data-action="export-tontine">Exporter en Excel</button>`)}

        ${alerte ? `<div class="alerte"><div class="titre">Santé des groupes</div>${echapper(alerte)}</div>` : ''}

        <div class="grille c4">
            ${tuile('Groupes', nombre(s.groupes?.total), `${nombre(s.groupes?.actifs)} actifs · ${nombre(s.groupes?.termines)} terminés`)}
            ${tuile('Encours des caisses', fcfa(s.encoursCaisses), 'argent immobilisé dans les groupes', 'accent')}
            ${tuile('Taux de défaut', (s.cotisations?.tauxDefaut ?? 0) + ' %',
                `${nombre(s.cotisations?.impayees)} cotisations impayées`,
                (s.cotisations?.tauxDefaut ?? 0) > 15 ? 'danger' : 'succes')}
            ${tuile('Frais perçus', fcfa(s.fraisPerçus ?? s.fraisPercus), 'commission sur les pots versés', 'succes')}
        </div>

        <div class="grille c4" style="margin-top:14px">
            ${tuile('Cautions bloquées', fcfa(s.cautionsBloquees), 'séquestre des groupes')}
            ${tuile('Amendes dues', fcfa(s.amendesDues), 'à reverser aux membres lésés', 'warning')}
            ${tuile('Cycles en défaut', nombre(s.cycles?.enDefaut), `sur ${nombre(s.cycles?.total)} cycles`,
                (s.cycles?.enDefaut ?? 0) > 0 ? 'danger' : 'succes')}
            ${tuile('Volume versé', fcfa(s.volumeVerse), 'pots distribués depuis le début')}
        </div>

        <div class="carte">
            <h3>Anomalies détectées (${nombre(a.total ?? (a.anomalies || []).length)})</h3>
            ${(a.anomalies || []).length
                ? tableau(['Gravité', 'Groupe', 'Constat'], (a.anomalies || []).map((an) => `
                    <tr>
                        <td>${pastille(an.gravite)}</td>
                        <td>${echapper(an.groupe || an.nom || '—')}</td>
                        <td>${echapper(an.message || an.description || '—')}</td>
                    </tr>`))
                : `<div class="info">Aucune anomalie. Les cotisations, les caisses et les rotations sont cohérentes.</div>`}
        </div>

        <div class="carte">
            <h3>Groupes</h3>
            <div class="filtres">
                <input class="champ" id="filtre-q" placeholder="Rechercher un groupe…" value="${echapper(q)}">
                <select class="champ" id="filtre-statut">
                    <option value="">Tous les statuts</option>
                    ${['en_attente', 'actif', 'termine', 'suspendu'].map((v) =>
                        `<option value="${v}" ${statut === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <button class="bouton petit" data-action="filtrer-tontine">Filtrer</button>
            </div>
            ${tableau(['Groupe', 'Statut', 'Fréquence', 'Membres', 'Cotisation', 'Caisse', ''], lignes)}
            ${pagination({ page, totalPages: Math.ceil((g.total || 0) / (g.taille || 25)), total: g.total }, 'page-tontine')}
        </div>`;
};

/* ---------------------------------------------------- Utilisateurs */
PAGES.utilisateurs = async (params = {}) => {
    const page = params.page || 1;
    const search = params.search || '';
    const reponse = await apiComplet(`/utilisateur?page=${page}&limit=20${search ? '&search=' + encodeURIComponent(search) : ''}`);
    const clients = reponse.data || [];

    const lignes = clients.map((c) => `
        <tr>
            <td><strong>${echapper(c.nom)}</strong><div class="faible">${echapper(c.email)}</div></td>
            <td class="mono">${echapper(c.telephone || '—')}</td>
            <td>${c.isVerified ? '<span class="pastille p-succes">Vérifié</span>' : '<span class="pastille p-warning">Non vérifié</span>'}</td>
            <td>${c.isActive === false ? '<span class="pastille p-danger">Désactivé</span>' : '<span class="pastille p-succes">Actif</span>'}</td>
            <td>${date(c.createdAt)}</td>
            <td class="actions">
                <button class="bouton fantome petit" data-action="client-detail" data-id="${c.id}">Dossier</button>
                <button class="bouton secondaire petit" data-action="basculer-client" data-id="${c.id}" data-actif="${c.isActive !== false}">
                    ${c.isActive === false ? 'Réactiver' : 'Désactiver'}
                </button>
                ${boutonGarde(`<button class="bouton danger petit" data-action="supprimer-client" data-id="${c.id}" data-nom="${echapper(c.nom)}" %%ATTR%%>Supprimer</button>`, ['SUPER_ADMIN'])}
            </td>
        </tr>`);

    return `
        ${enTete('Utilisateurs', 'Comptes clients de la plateforme.')}

        <div class="carte">
            <div class="filtres">
                <input class="champ" id="filtre-recherche" placeholder="Nom ou adresse électronique…" value="${echapper(search)}">
                <button class="bouton petit" data-action="filtrer-utilisateurs">Rechercher</button>
            </div>
            ${tableau(['Client', 'Téléphone', 'Vérification', 'Statut', 'Inscrit le', ''], lignes)}
            ${pagination(reponse.meta, 'page-utilisateurs')}
        </div>`;
};

/* ---------------------------------------------------- KYC */
PAGES.kyc = async (params = {}) => {
    const page = params.page || 1;
    const reponse = await apiComplet(`/kyc/demandeAky?page=${page}&limit=20`);
    const demandes = reponse.data || [];

    const lignes = demandes.map((c) => `
        <tr>
            <td><strong>${echapper(c.nom)}</strong><div class="faible">${echapper(c.email)}</div></td>
            <td class="mono">${echapper(c.telephone || '—')}</td>
            <td>${echapper(c.kyc?.libelle || '—')}${c.kyc?.expire ? ' <span class="pastille p-warning">expirée</span>' : ''}</td>
            <td>${date(c.createdAt)}</td>
            <td class="actions">
                <button class="bouton fantome petit" data-action="kyc-detail" data-id="${c.id}">Instruire</button>
                ${boutonGarde(`<button class="bouton succes petit" data-action="kyc-approuver" data-id="${c.id}" data-nom="${echapper(c.nom)}" %%ATTR%%>Approuver</button>`, ['COMPLIANCE'])}
                ${boutonGarde(`<button class="bouton danger petit" data-action="kyc-rejeter" data-id="${c.id}" data-nom="${echapper(c.nom)}" %%ATTR%%>Rejeter</button>`, ['COMPLIANCE'])}
            </td>
        </tr>`);

    return `
        ${enTete('Vérifications KYC', "Comptes qui ont déposé une pièce d'identité et attendent la vérification (niveau 2).")}

        <div class="info">
            <div class="titre">Ce que chaque niveau permet</div>
            <strong>Niveau 1 — email confirmé</strong> (par code, sans instruction) : recharger et retirer.
            <strong>Niveau 2 — identité vérifiée</strong> sur pièce, pour une durée limitée : exigé seulement pour les opérations
            de tontine où la configuration le demande (paramètres <span class="mono">tontine_kyc_niveau_*</span>, à 0 par défaut).
            Approuver exige une pièce déposée ; rejeter retire l'identité, pas la confirmation d'email.
            Aucun parcours de dépôt de pièce n'existe encore dans l'application : tant qu'il manque, cette file reste vide.
        </div>

        <div class="carte">
            <h3>En attente (${nombre(reponse.meta?.total ?? demandes.length)})</h3>
            ${tableau(['Client', 'Téléphone', 'Niveau actuel', 'Inscrit le', ''], lignes)}
            ${pagination(reponse.meta, 'page-kyc')}
        </div>`;
};

/* ---------------------------------------------------- Defauts et restrictions */
PAGES.defauts = async (params = {}) => {
    const statut = params.statut ?? 'ouvert';
    const [inc, restr] = await Promise.all([
        api(`/tontine/incidents${statut ? '?statut=' + statut : ''}`),
        api('/restriction'),
    ]);
    const r = inc.resume || {};
    const sources = (liste) => (liste || [])
        .map((a) => `${echapper(a.source)} ${a.montant > 0 ? fcfa(a.montant) : '—'}`).join(' · ') || '—';

    const lignesIncidents = (inc.incidents || []).map((i) => `
        <tr>
            <td><strong>${echapper(i.client?.nom || 'client ' + i.clientId)}</strong><div class="faible">${echapper(i.client?.email || '')}</div></td>
            <td>${echapper(i.groupe || '—')}</td>
            <td class="num">${fcfa(i.resteDu)}<div class="faible">sur ${fcfa(i.montantInitial)}</div></td>
            <td>${date(i.ouvertLe)}${i.regleLe ? `<div class="faible">réglé le ${date(i.regleLe)}</div>` : ''}</td>
            <td class="faible">${sources(i.sourcesEssayees)}</td>
            <td>${pastille(i.statut)}${i.modeReglement ? `<div class="faible">${echapper(i.modeReglement)}</div>` : ''}</td>
            <td class="actions"><button class="bouton fantome petit" data-action="client-detail" data-id="${i.clientId}">Dossier</button></td>
        </tr>`);

    const lignesRestrictions = (restr || []).map((x) => `
        <tr>
            <td><strong>${echapper(x.client?.nom || '—')}</strong><div class="faible">${echapper(x.client?.email || '')}</div></td>
            <td>${echapper(x.libelle)}</td>
            <td>${echapper(x.motif)}</td>
            <td>${date(x.depuis)}</td>
            <td>${x.jusqua ? date(x.jusqua) : '<span class="faible">levée explicite</span>'}</td>
            <td class="actions">
                <button class="bouton fantome petit" data-action="client-detail" data-id="${x.client?.id}">Dossier</button>
                ${boutonGarde(`<button class="bouton secondaire petit" data-action="restriction-lever" data-id="${x.id}" data-nom="${echapper(x.client?.nom || '')}" %%ATTR%%>Lever</button>`, ['COMPLIANCE'])}
            </td>
        </tr>`);

    return `
        ${enTete('Défauts et restrictions',
            "Ce que le recouvrement n'a pas couvert, et les opérations fermées à certains clients.")}

        <div class="grille c4">
            ${tuile('Incidents ouverts', nombre(r.ouverts), 'échéances non couvertes par les garanties', r.ouverts > 0 ? 'danger' : 'succes')}
            ${tuile('Reste dû', fcfa(r.totalDu), 'aux groupes ou aux membres lésés', r.totalDu > 0 ? 'warning' : '')}
            ${tuile('Plus ancien', r.plusAncien ? date(r.plusAncien) : '—', 'incident encore ouvert')}
            ${tuile('Réglés sur 30 jours', nombre(r.regles30j), 'par le membre, un recouvrement ou une retenue', 'succes')}
        </div>

        <div class="carte">
            <h3>Incidents de défaut</h3>
            <div class="filtres">
                <select class="champ" id="filtre-incidents">
                    ${[['ouvert', 'Ouverts'], ['regle', 'Réglés'], ['', 'Tous']].map(([v, l]) =>
                        `<option value="${v}" ${statut === v ? 'selected' : ''}>${l}</option>`).join('')}
                </select>
                <button class="bouton petit" data-action="filtrer-incidents">Filtrer</button>
            </div>
            ${tableau(['Membre', 'Groupe', 'Reste dû', 'Ouvert le', 'Sources déjà sollicitées', 'Statut', ''], lignesIncidents)}
            <p class="aide">Un incident se règle de lui-même : quand le membre régularise, quand une nouvelle garantie est mobilisée, ou par retenue sur son pot. Tant qu'il est ouvert, le membre ne peut ni recevoir de pot, ni enchérir, ni rejoindre une tontine.</p>
        </div>

        <div class="carte">
            <h3>Restrictions en vigueur (${nombre((restr || []).length)})</h3>
            ${tableau(['Client', 'Restriction', 'Motif', 'Depuis', "Jusqu'au", ''], lignesRestrictions)}
            <p class="aide">Une restriction ferme une seule opération ; le reste du compte fonctionne. Pour en poser une, ouvrez le dossier du client.</p>
        </div>`;
};

/* ---------------------------------------------------- Litiges */
PAGES.litiges = async (params = {}) => {
    const page = params.page || 1;
    const statut = params.statut || '';
    const reponse = await apiComplet(`/litige/litige?page=${page}&limit=20${statut ? '&statut=' + statut : ''}`);
    const litiges = reponse.data || [];

    const lignes = litiges.map((l) => `
        <tr>
            <td class="mono">#${l.id}</td>
            <td>${echapper(l.Client?.nom || '—')}<div class="faible">${echapper(l.Client?.email || '')}</div></td>
            <td>${echapper((l.description || '').slice(0, 90))}${(l.description || '').length > 90 ? '…' : ''}</td>
            <td>${pastille(l.statut)}</td>
            <td>${date(l.createdAt)}</td>
            <td class="actions">
                <button class="bouton fantome petit" data-action="litige-detail" data-id="${l.id}">Voir</button>
                ${l.statut !== 'résolu' && l.statut !== 'resolu'
                    ? `<button class="bouton succes petit" data-action="litige-resoudre" data-id="${l.id}">Résoudre</button>` : ''}
            </td>
        </tr>`);

    return `
        ${enTete('Litiges', 'Réclamations ouvertes par les clients depuis l\'application.')}
        <div class="carte">
            <div class="filtres">
                <select class="champ" id="filtre-litige">
                    <option value="">Tous les statuts</option>
                    <option value="ouvert" ${statut === 'ouvert' ? 'selected' : ''}>Ouverts</option>
                    <option value="résolu" ${statut === 'résolu' ? 'selected' : ''}>Résolus</option>
                </select>
                <button class="bouton petit" data-action="filtrer-litiges">Filtrer</button>
            </div>
            ${tableau(['N°', 'Client', 'Objet', 'Statut', 'Ouvert le', ''], lignes)}
            ${pagination(reponse.meta, 'page-litiges')}
        </div>`;
};

/* ---------------------------------------------------- Transactions */
PAGES.transactions = async (params = {}) => {
    const page = params.page || 1;
    const type = params.type || '';
    const reponse = await apiComplet(`/transaction/transaction?page=${page}&limit=20${type ? '&type=' + encodeURIComponent(type) : ''}`);
    const lignes0 = reponse.data || [];

    let benefices = null;
    if (peut('ADMIN_FINANCE')) {
        try { benefices = await api('/transaction/benefices'); } catch (e) { /* role insuffisant : on n'affiche rien */ }
    }

    const lignes = lignes0.map((t) => `
        <tr>
            <td class="mono">#${t.id}</td>
            <td>${echapper(t.clienttransaction?.nom || t.Client?.nom || '—')}</td>
            <td>${echapper(t.type || '—')}</td>
            <td class="num">${fcfa(t.montant)}</td>
            <td>${pastille(t.statut)}</td>
            <td class="mono faible">${echapper(t.reference || '—')}</td>
            <td>${dateHeure(t.date || t.createdAt)}</td>
            <td class="actions">
                ${boutonGarde(`<button class="bouton secondaire petit" data-action="demander-remboursement" data-id="${t.id}" data-montant="${t.montant}" %%ATTR%%>Demander un remboursement</button>`, ['ADMIN_FINANCE'])}
            </td>
        </tr>`);

    return `
        ${enTete('Transactions', 'Grand livre de la plateforme.',
            `<button class="bouton secondaire petit" data-action="exporter-transactions">Exporter en Excel</button>
             ${boutonGarde(`<button class="bouton petit" data-action="ajuster-portefeuille" %%ATTR%%>Ajuster un portefeuille</button>`, ['ADMIN_FINANCE'])}`)}

        ${benefices ? `<div class="grille c3">
            ${tuile('Somme des frais', fcfa(benefices.beneficesTotal), 'colonne « frais » — contient du revenu fantôme sur une base ancienne')}
            ${tuile('Revenu plateforme', fcfa(benefices.revenuPlateforme), 'commission réellement encaissée', 'succes')}
            ${tuile('Volume total', fcfa(benefices.volumeTotal), `${nombre((benefices.parType || []).length)} type(s) d'écriture`)}
        </div>` : ''}

        <div class="info">
            <div class="titre">Aucune exécution directe</div>
            Un remboursement ou un ajustement de portefeuille <strong>dépose une demande</strong> (réponse 202).
            Elle n'est exécutée qu'après approbation par un <strong>second</strong> administrateur, depuis l'écran Validations.
        </div>

        <div class="carte">
            <div class="filtres">
                <select class="champ" id="filtre-type">
                    <option value="">Tous les types</option>
                    ${['recharge', 'retrait', 'transfert', 'cotisation', 'versement', 'amende', 'frais_plateforme', 'remboursement']
                        .map((v) => `<option value="${v}" ${type === v ? 'selected' : ''}>${v}</option>`).join('')}
                </select>
                <button class="bouton petit" data-action="filtrer-transactions">Filtrer</button>
            </div>
            ${tableau(['N°', 'Client', 'Type', 'Montant', 'Statut', 'Référence', 'Date', ''], lignes)}
            ${pagination(reponse.meta, 'page-transactions')}
        </div>`;
};

/* ---------------------------------------------------- Validations (maker-checker) */
PAGES.validations = async () => {
    const actions = await api('/validation/pending');
    const liste = Array.isArray(actions) ? actions : (actions.data || []);

    const LIBELLE_TYPE = {
        REFUND: 'Remboursement de transaction',
        WALLET_ADJUST: 'Ajustement de portefeuille',
        TONTINE_VERSEMENT_FORCE: 'Versement forcé du pot',
    };

    const lignes = liste.map((a) => {
        const moi = etat.admin && a.demandeurId === etat.admin.id;
        const charge = typeof a.payload === 'string' ? a.payload : JSON.stringify(a.payload);
        return `
        <tr>
            <td class="mono">#${a.id}</td>
            <td><strong>${echapper(LIBELLE_TYPE[a.type] || a.type)}</strong>
                <div class="faible mono">${echapper(charge.slice(0, 80))}</div></td>
            <td>${echapper(a.demandeurEmail || '—')}</td>
            <td>${dateHeure(a.createdAt)}</td>
            <td class="actions">
                ${moi
                    ? `<span class="pastille p-warning" title="Le validateur doit être différent du demandeur">Votre demande</span>`
                    : boutonGarde(`<button class="bouton succes petit" data-action="valider-approuver" data-id="${a.id}" %%ATTR%%>Approuver</button>`, ['ADMIN_FINANCE'])}
                ${moi ? '' : boutonGarde(`<button class="bouton danger petit" data-action="valider-rejeter" data-id="${a.id}" %%ATTR%%>Rejeter</button>`, ['ADMIN_FINANCE'])}
            </td>
        </tr>`;
    });

    return `
        ${enTete('Validations', 'Opérations financières sensibles en attente d\'un second administrateur.')}

        <div class="info">
            <div class="titre">Maker-checker</div>
            Le validateur doit être <strong>différent du demandeur</strong>. Vos propres demandes vous sont
            présentées, mais vous ne pouvez pas les approuver : le serveur refuserait en 403.
            Chaque approbation est inscrite au journal d'audit sous votre nom.
        </div>

        <div class="carte">
            <h3>En attente (${liste.length})</h3>
            ${tableau(['N°', 'Opération', 'Demandée par', 'Déposée le', ''], lignes)}
        </div>`;
};

/* ---------------------------------------------------- Anti-fraude */
PAGES.aml = async () => {
    const d = await api('/aml/suspectes');
    const seuils = d.seuils || {};

    const lignesMontant = (d.montantEleve || []).map((t) => `
        <tr>
            <td class="mono">#${t.id}</td>
            <td>${echapper(t.clienttransaction?.nom || '—')}<div class="faible">${echapper(t.clienttransaction?.email || '')}</div></td>
            <td>${echapper(t.type || '—')}</td>
            <td class="num"><strong>${fcfa(t.montant)}</strong></td>
            <td>${dateHeure(t.date || t.createdAt)}</td>
        </tr>`);

    const lignesVelocite = (d.velociteSuspecte || []).map((v) => `
        <tr>
            <td class="mono">client #${echapper(v.ClientTransactionId)}</td>
            <td class="num">${nombre(v.nombre)}</td>
            <td class="num">${fcfa(v.volume)}</td>
            <td><button class="bouton fantome petit" data-action="client-detail" data-id="${v.ClientTransactionId}">Dossier</button></td>
        </tr>`);

    return `
        ${enTete('Anti-fraude', 'Détection par montant et par vélocité.')}

        <div class="grille c3">
            ${tuile('Alertes', nombre(d.nbAlertes), 'montant élevé + vélocité', d.nbAlertes > 0 ? 'warning' : 'succes')}
            ${tuile('Seuil de montant', fcfa(seuils.montant), 'configurable dans Configuration')}
            ${tuile('Seuil de vélocité', nombre(seuils.velocite24h) + ' / 24 h', 'écritures par client')}
        </div>

        <div class="carte">
            <h3>Montants élevés</h3>
            ${tableau(['N°', 'Client', 'Type', 'Montant', 'Date'], lignesMontant)}
        </div>

        <div class="carte">
            <h3>Vélocité sur 24 heures</h3>
            ${tableau(['Client', 'Écritures', 'Volume', ''], lignesVelocite)}
        </div>`;
};

/* ---------------------------------------------------- Plans */
PAGES.plans = async () => {
    const plans = await api('/produit/produit');

    const lignes = (plans || []).map((p) => `
        <tr>
            <td><strong>${echapper(p.nom)}</strong><div class="faible">${echapper((p.description || '').slice(0, 70))}</div></td>
            <td class="num">${fcfa(p.prix)}</td>
            <td class="num">${nombre(p.abonnes)}</td>
            <td>${date(p.createdAt)}</td>
            <td class="actions">
                ${boutonGarde(`<button class="bouton secondaire petit" data-action="plan-modifier" data-id="${p.id}" data-nom="${echapper(p.nom)}" data-prix="${p.prix}" data-description="${echapper(p.description || '')}" %%ATTR%%>Modifier</button>`, ['MARKETING'])}
                ${boutonGarde(`<button class="bouton danger petit" data-action="plan-supprimer" data-id="${p.id}" data-nom="${echapper(p.nom)}" %%ATTR%%>Supprimer</button>`, ['MARKETING'])}
            </td>
        </tr>`);

    return `
        ${enTete("Plans d'abonnement", 'Catalogue proposé dans l\'onglet « Souscrire » de l\'application.',
            boutonGarde(`<button class="bouton petit" data-action="plan-creer" %%ATTR%%>+ Nouveau plan</button>`, ['MARKETING']))}

        <div class="info">
            Cette page s'appelle <span class="mono">/api/admin/produit</span> pour des raisons historiques :
            elle gère des <strong>plans</strong>, pas des produits marchands. La boutique a été retirée du projet ;
            les plans sont restés.
        </div>

        <div class="carte">
            ${tableau(['Plan', 'Prix', 'Abonnés', 'Créé le', ''], lignes)}
        </div>`;
};

/* ---------------------------------------------------- Notifications */
PAGES.notifications = async () => {
    const reponse = await apiComplet('/notification/notification?page=1&limit=30');
    const notifications = reponse.data || [];

    const lignes = notifications.map((n) => `
        <tr>
            <td class="mono">#${n.id}</td>
            <td>${echapper((n.message || '').slice(0, 110))}</td>
            <td>${pastille(n.Type || n.type)}</td>
            <td>${dateHeure(n.dateEnvoie || n.createdAt)}</td>
        </tr>`);

    return `
        ${enTete('Notifications', 'Messages diffusés aux utilisateurs.',
            boutonGarde(`<button class="bouton petit" data-action="campagne" %%ATTR%%>+ Nouvelle campagne</button>`, ['MARKETING']))}
        <div class="carte">
            ${tableau(['N°', 'Message', 'Type', 'Envoyée le'], lignes)}
            ${pagination(reponse.meta, 'page-notifications')}
        </div>`;
};

/* ---------------------------------------------------- Configuration */
PAGES.config = async () => {
    const configs = await api('/config/config');

    const groupes = {};
    (configs || []).forEach((c) => {
        const cat = c.categorie || 'Général';
        (groupes[cat] = groupes[cat] || []).push(c);
    });

    return `
        ${enTete('Configuration', 'Paramètres système. Toute modification est journalisée.')}
        ${Object.entries(groupes).map(([cat, liste]) => `
            <div class="carte">
                <h3>${echapper(cat)}</h3>
                ${tableau(['Clé', 'Valeur', 'Type', 'Description', ''], liste.map((c) => `
                    <tr>
                        <td class="mono">${echapper(c.cle)}</td>
                        <td><strong>${echapper(c.valeur)}</strong></td>
                        <td class="faible">${echapper(c.type || 'string')}</td>
                        <td class="faible">${echapper(c.description || '—')}</td>
                        <td class="actions">
                            ${boutonGarde(`<button class="bouton secondaire petit" data-action="config-modifier" data-cle="${echapper(c.cle)}" data-valeur="${echapper(c.valeur)}" %%ATTR%%>Modifier</button>`, ['SUPER_ADMIN'])}
                        </td>
                    </tr>`))}
            </div>`).join('') || vide('Aucun paramètre enregistré.')}`;
};

/* ---------------------------------------------------- Administrateurs */
PAGES.admins = async () => {
    const admins = await api('/auth/admins');

    const lignes = (admins || []).map((a) => `
        <tr>
            <td><strong>${echapper(a.nom)} ${echapper(a.prenom || '')}</strong><div class="faible">${echapper(a.email)}</div></td>
            <td><span class="pastille p-violet">${echapper(LIBELLE_ROLE[a.role] || a.role)}</span></td>
            <td>${a.isActive === false ? '<span class="pastille p-danger">Désactivé</span>' : '<span class="pastille p-succes">Actif</span>'}</td>
            <td>${dateHeure(a.lastLogin)}</td>
        </tr>`);

    return `
        ${enTete('Administrateurs', 'Comptes du back-office et rôles RBAC.',
            boutonGarde(`<button class="bouton petit" data-action="admin-creer" %%ATTR%%>+ Nouvel administrateur</button>`, ['SUPER_ADMIN']))}

        <div class="info">
            <div class="titre">Six rôles</div>
            ${Object.entries(LIBELLE_ROLE).map(([c, l]) => `<span class="mono">${c}</span> ${l}`).join(' · ')}.
            Le super administrateur franchit toutes les gardes de rôle.
        </div>

        <div class="carte">
            ${tableau(['Administrateur', 'Rôle', 'Statut', 'Dernière connexion'], lignes)}
        </div>`;
};

/* =====================================================================
 *  ACTIONS
 * ===================================================================== */

/**
 * Situation d'un client dans son dossier : restrictions, risque, decisions.
 * Le risque est une mesure, pas une decision : il est montre avec ses
 * facteurs, jamais comme un verdict.
 */
function situationClient(id, c, sit) {
    const restrictions = sit.restrictions || [];
    const risque = sit.risque;
    const facteur = (f) => `<li class="${f.points > 0 ? 'plus' : f.points < 0 ? 'moins' : 'zero'}">
        <span class="marque-f">${f.points > 0 ? '+' : ''}${f.points}</span><span>${echapper(f.libelle)}</span></li>`;
    const decisions = (sit.decisions || []).slice(0, 8);

    return `
        <h4>Restrictions en vigueur</h4>
        ${restrictions.length ? restrictions.map((r) => `
            <div class="ligne-detail">
                <span class="cle">${echapper(r.libelle)}<div class="faible">${echapper(r.motif)} — depuis le ${date(r.depuis)}${r.jusqua ? `, jusqu'au ${date(r.jusqua)}` : ''}</div></span>
                <span class="val">${boutonGarde(`<button class="bouton secondaire petit" data-action="restriction-lever" data-id="${r.id}" data-nom="${echapper(c.nom)}" %%ATTR%%>Lever</button>`, ['COMPLIANCE'])}</span>
            </div>`).join('') : '<p class="faible">Aucune : toutes les opérations sont ouvertes.</p>'}
        <div style="margin-top:10px">
            ${boutonGarde(`<button class="bouton danger petit" data-action="restriction-poser" data-client="${id}" data-nom="${echapper(c.nom)}" %%ATTR%%>Poser une restriction</button>`, ['COMPLIANCE'])}
        </div>

        ${risque ? `
        <h4>Risque financier ${pastille(risque.niveau)} <span class="faible">score ${risque.score}/100 · ${echapper(risque.versionMoteur)}${risque.id ? ' · évaluation n°' + risque.id : ''}</span></h4>
        ${risque.donneesSuffisantes ? '' : '<p class="faible">Historique insuffisant : la mesure est indicative.</p>'}
        <ul class="facteurs">${(risque.facteurs || []).map(facteur).join('') || '<li class="zero"><span class="marque-f">0</span><span>Aucun facteur notable</span></li>'}</ul>
        ${ligneDetail('Engagement mensuel', fcfa(risque.donnees?.engagementMensuel))}
        ${ligneDetail('Reste à verser, toutes tontines', fcfa(risque.donnees?.expositionTotale))}
        ${ligneDetail('Disponible / bloqué', `${fcfa(risque.donnees?.disponible)} / ${fcfa(risque.donnees?.bloque)}`)}
        <p class="aide">Le risque ne décide rien : ce sont les contrôles d'éligibilité ci-dessous qui autorisent ou refusent. Cette consultation est conservée avec ses données.</p>` : ''}

        <h4>Dernières décisions d'éligibilité</h4>
        ${decisions.length ? tableau(['Date', 'Opération', 'Résultat', 'Motifs'], decisions.map((x) => `
            <tr>
                <td>${dateHeure(x.date)}</td>
                <td>${echapper(x.operation)}</td>
                <td>${pastille(x.resultat)}</td>
                <td class="faible">${echapper((x.refus || []).join(' ; ') || '—')}</td>
            </tr>`)) : '<p class="faible">Aucune décision enregistrée.</p>'}`;
}

const ACTIONS = {
    /* --- Tontine --- */
    'filtrer-tontine': () => {
        const q = document.getElementById('filtre-q').value.trim();
        const statut = document.getElementById('filtre-statut').value;
        afficherPage('tontine', true, { q, statut });
    },
    'page-tontine': (el) => afficherPage('tontine', true, { page: Number(el.dataset.page) }),

    'tontine-detail': async (el) => {
        const g = await api(`/tontine/groupes/${el.dataset.id}`);
        const gr = g.groupe || g;
        ouvrirModale(`
            <h3>${echapper(gr.nom || 'Groupe')}</h3>
            <p class="sous">Fiche complète du groupe.</p>
            ${ligneDetail('Statut', pastille(gr.statut))}
            ${ligneDetail('Type', echapper(gr.type || '—'))}
            ${ligneDetail('Cotisation par période', fcfa(gr.montantParPeriode))}
            ${ligneDetail('Fréquence', echapper(gr.frequence || '—'))}
            ${ligneDetail('Membres', nombre(gr.membresActuels ?? (g.membres || []).length))}
            ${ligneDetail('Mode d\'ordre', echapper(gr.modeOrdre || '—'))}
            ${ligneDetail('Cycle courant', nombre(gr.cycleActuel ?? '—'))}
            ${ligneDetail('Caisse', fcfa(g.soldeCaisse ?? gr.soldeCaisse))}
            ${ligneDetail('Créé le', date(gr.createdAt))}
            <div class="modale-actions"><button class="bouton fantome" data-fermer>Fermer</button></div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
    },

    geler: async (el) => {
        const r = await confirmer({
            titre: 'Geler ce groupe ?',
            texte: `« ${echapper(el.dataset.nom)} » ne pourra plus faire circuler d'argent : cotisations, versements, apports et décaissements sont suspendus. Les soldes ne bougent pas — c'est une mesure conservatoire, pas une sanction. Régler une amende ou rembourser un crédit reste possible.`,
            libelle: 'Geler le groupe',
            champ: 'Motif (inscrit au journal d\'audit)',
        });
        if (r.ok) agir(() => api(`/tontine/groupes/${el.dataset.id}/geler`, { method: 'POST', body: { motif: r.valeur } }), 'Groupe gelé');
    },

    degeler: async (el) => {
        const r = await confirmer({
            titre: 'Dégeler ce groupe ?',
            texte: `« ${echapper(el.dataset.nom)} » retrouvera son fonctionnement normal.`,
            libelle: 'Dégeler', genre: 'succes',
            champ: 'Motif',
        });
        if (r.ok) agir(() => api(`/tontine/groupes/${el.dataset.id}/degeler`, { method: 'POST', body: { motif: r.valeur } }), 'Groupe dégelé');
    },

    'export-tontine': () => telecharger('/tontine/export', 'tontines.xlsx'),

    /* --- Utilisateurs --- */
    'filtrer-utilisateurs': () => afficherPage('utilisateurs', true, { search: document.getElementById('filtre-recherche').value.trim() }),
    'page-utilisateurs': (el) => afficherPage('utilisateurs', true, { page: Number(el.dataset.page) }),

    'client-detail': async (el) => {
        const id = el.dataset.id;
        // La situation (KYC, restrictions, risque, decisions) ne doit pas
        // empecher d'ouvrir le dossier si elle echoue.
        const [d, sit] = await Promise.all([
            api(`/utilisateur/${id}/detail`),
            api(`/restriction/client/${id}`).catch((e) => ({ erreur: e.message })),
        ]);
        const c = d.client || d;
        const pf = d.portefeuilles || d.wallets || [];
        const verification = sit.kyc
            ? echapper(sit.kyc.libelle) + (sit.kyc.expire ? ' <span class="pastille p-warning">expirée</span>' : '')
            : (c.isVerified ? 'Email confirmé' : 'Non vérifié');
        ouvrirModale(`
            <h3>${echapper(c.nom || 'Client')}</h3>
            <p class="sous">${echapper(c.email || '')}</p>
            ${ligneDetail('Téléphone', echapper(c.telephone || '—'))}
            ${ligneDetail('Vérification', verification)}
            ${ligneDetail('Actif', c.isActive === false ? 'Non' : 'Oui')}
            ${ligneDetail('Inscrit le', date(c.createdAt))}
            ${pf.length ? `<h4>Portefeuilles</h4>
                ${pf.map((p) => ligneDetail(p.nom || p.typePortefeuille, fcfa(p.solde))).join('')}` : ''}
            ${sit.erreur
                ? `<div class="alerte" style="margin-top:16px"><div class="titre">Situation indisponible</div>${echapper(sit.erreur)}</div>`
                : situationClient(id, c, sit)}
            ${d.statistiques ? `<h4>Activité</h4>
                ${Object.entries(d.statistiques).map(([k, v]) => ligneDetail(k, echapper(v))).join('')}` : ''}
            <div class="modale-actions"><button class="bouton fantome" data-fermer>Fermer</button></div>`, true);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        // Les boutons de la modale vivent hors de #page : on les relie ici.
        document.getElementById('modale').querySelectorAll('[data-action]').forEach((b) => {
            b.onclick = (ev) => ACTIONS[b.dataset.action] && ACTIONS[b.dataset.action](b, ev);
        });
    },

    'restriction-poser': async (el) => {
        const types = await api('/restriction/types');
        ouvrirModale(`
            <h3>Restreindre ${echapper(el.dataset.nom)}</h3>
            <p class="sous">Une restriction ferme une seule opération. Le client continue de consulter, de payer ce qu'il doit et de contester. Il verra le motif, et la pose est inscrite au journal d'audit.</p>
            <label class="label" for="r-type">Opération à fermer</label>
            <select class="champ" id="r-type">
                ${types.map((t) => `<option value="${echapper(t.type)}">Ne peut plus ${echapper(t.libelle)}</option>`).join('')}
            </select>
            <label class="label" for="r-motif">Motif</label>
            <textarea class="champ" id="r-motif" placeholder="Ce que le client lira : pourquoi, et comment en sortir"></textarea>
            <label class="label" for="r-fin">Jusqu'au (facultatif)</label>
            <input class="champ" type="date" id="r-fin">
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton danger" id="r-poser">Poser la restriction</button>
            </div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        document.getElementById('r-poser').onclick = async () => {
            const motif = document.getElementById('r-motif').value.trim();
            if (!motif) { toast('Le motif est obligatoire : le client doit savoir pourquoi.', 'erreur'); return; }
            const type = document.getElementById('r-type').value;
            const fin = document.getElementById('r-fin').value;
            fermerModale();
            await agir(() => api('/restriction', {
                method: 'POST',
                body: {
                    clientId: Number(el.dataset.client), type, motif,
                    actifJusqu: fin ? new Date(fin + 'T23:59:59').toISOString() : undefined,
                },
            }), 'Restriction posée');
        };
    },

    'restriction-lever': async (el) => {
        const r = await confirmer({
            titre: 'Lever cette restriction ?',
            texte: `${echapper(el.dataset.nom)} retrouvera l'opération fermée.`,
            libelle: 'Lever la restriction', genre: 'succes',
            champ: "Motif de la levée (journal d'audit)",
        });
        if (r.ok) agir(() => api(`/restriction/${el.dataset.id}/lever`, { method: 'POST', body: { motif: r.valeur } }), 'Restriction levée');
    },

    'filtrer-incidents': () => afficherPage('defauts', true, { statut: document.getElementById('filtre-incidents').value }),

    'basculer-client': async (el) => {
        const actif = el.dataset.actif === 'true';
        const r = await confirmer({
            titre: actif ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?',
            texte: actif
                ? "Le client ne pourra plus se connecter ni utiliser l'application. Ses engagements de tontine, eux, continuent de courir. Pour fermer une seule opération, posez plutôt une restriction depuis son dossier."
                : 'Le client retrouvera l\'usage complet de son compte.',
            libelle: actif ? 'Désactiver' : 'Réactiver',
            genre: actif ? 'danger' : 'succes',
        });
        if (r.ok) agir(() => api(`/utilisateur/${el.dataset.id}`, { method: 'PATCH', body: { isActive: !actif } }),
            actif ? 'Compte désactivé' : 'Compte réactivé');
    },

    'supprimer-client': async (el) => {
        const r = await confirmer({
            titre: 'Supprimer définitivement ?',
            texte: `Le compte de <strong>${echapper(el.dataset.nom)}</strong> et ses données seront supprimés. Cette action est irréversible. Préférez la désactivation si le client a des engagements en cours.`,
            libelle: 'Supprimer définitivement',
        });
        if (r.ok) agir(() => api(`/utilisateur/${el.dataset.id}`, { method: 'DELETE' }), 'Compte supprimé');
    },

    /* --- KYC --- */
    'page-kyc': (el) => afficherPage('kyc', true, { page: Number(el.dataset.page) }),

    'kyc-detail': async (el) => {
        const d = await api(`/kyc/demandeAkyc/${el.dataset.id}`);
        const c = d.client || d;
        ouvrirModale(`
            <h3>${echapper(c.nom || 'Demande')}</h3>
            <p class="sous">Instruction de la demande de vérification.</p>
            ${ligneDetail('Adresse électronique', echapper(c.email || '—'))}
            ${ligneDetail('Téléphone', echapper(c.telephone || '—'))}
            ${ligneDetail('Inscrit le', date(c.createdAt))}
            ${ligneDetail('Pièce fournie', d.document?.fourni ? '<span class="pastille p-succes">Oui</span>' : '<span class="pastille p-warning">Non</span>')}
            ${!d.document?.fourni ? `<div class="alerte" style="margin-top:16px"><div class="titre">Aucune pièce</div>Ce compte n'a téléversé aucun justificatif. Approuver sans pièce revient à vérifier sur parole.</div>` : ''}
            <div class="modale-actions"><button class="bouton fantome" data-fermer>Fermer</button></div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
    },

    'kyc-approuver': async (el) => {
        const r = await confirmer({
            titre: 'Approuver la vérification ?',
            texte: `<strong>${echapper(el.dataset.nom)}</strong> pourra recharger et retirer de l'argent réel. Vérifiez la pièce justificative avant d'approuver.`,
            libelle: 'Approuver', genre: 'succes',
        });
        if (r.ok) agir(() => api(`/kyc/demandeAkyc/${el.dataset.id}/approuve`, { method: 'PATCH' }), 'Vérification approuvée');
    },

    'kyc-rejeter': async (el) => {
        const r = await confirmer({
            titre: 'Rejeter la demande ?',
            texte: `<strong>${echapper(el.dataset.nom)}</strong> restera non vérifié et ne pourra ni recharger ni retirer.`,
            libelle: 'Rejeter',
            champ: 'Motif du rejet',
        });
        if (r.ok) agir(() => api(`/kyc/demandeAkyc/${el.dataset.id}/rejeter`, { method: 'PATCH', body: { motif: r.valeur } }), 'Demande rejetée');
    },

    /* --- Litiges --- */
    'filtrer-litiges': () => afficherPage('litiges', true, { statut: document.getElementById('filtre-litige').value }),
    'page-litiges': (el) => afficherPage('litiges', true, { page: Number(el.dataset.page) }),

    'litige-detail': async (el) => {
        const l = await api(`/litige/litige/${el.dataset.id}`);
        ouvrirModale(`
            <h3>Litige #${echapper(l.id)}</h3>
            <p class="sous">${echapper(l.Client?.nom || '')} — ${echapper(l.Client?.email || '')}</p>
            ${ligneDetail('Statut', pastille(l.statut))}
            ${ligneDetail('Ouvert le', dateHeure(l.createdAt))}
            <div class="carte" style="margin-top:14px;background:var(--base)">${echapper(l.description || '—')}</div>
            <div class="modale-actions"><button class="bouton fantome" data-fermer>Fermer</button></div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
    },

    'litige-resoudre': async (el) => {
        const r = await confirmer({
            titre: 'Marquer ce litige comme résolu ?',
            texte: 'Le client verra le litige clos. Assurez-vous que la réclamation a bien été traitée.',
            libelle: 'Marquer résolu', genre: 'succes',
        });
        if (r.ok) agir(() => api(`/litige/litige/${el.dataset.id}/resoudre`, { method: 'PATCH', body: { statut: 'résolu' } }), 'Litige résolu');
    },

    /* --- Transactions --- */
    'filtrer-transactions': () => afficherPage('transactions', true, { type: document.getElementById('filtre-type').value }),
    'page-transactions': (el) => afficherPage('transactions', true, { page: Number(el.dataset.page) }),
    'exporter-transactions': () => telecharger('/export/transactions.xlsx', 'transactions.xlsx'),

    'demander-remboursement': async (el) => {
        const r = await confirmer({
            titre: 'Déposer une demande de remboursement',
            texte: `Écriture #${echapper(el.dataset.id)} — ${fcfa(el.dataset.montant)}.<br><br>
                    Cette action <strong>n'exécute rien</strong> : elle dépose une demande qu'un second
                    administrateur devra approuver. Les écritures de tontine ne se remboursent pas par cette voie.`,
            libelle: 'Déposer la demande', genre: 'secondaire',
            champ: 'Motif',
        });
        if (r.ok) agir(() => api(`/transaction/${el.dataset.id}/rembourser`, { method: 'POST', body: { motif: r.valeur } }),
            'Demande déposée — un second administrateur doit l\'approuver');
    },

    'ajuster-portefeuille': () => {
        ouvrirModale(`
            <h3>Ajuster un portefeuille</h3>
            <p class="sous">Dépose une demande soumise à l'approbation d'un second administrateur.
               Une caisse de tontine ne s'ajuste pas ici.</p>
            <label class="label">Identifiant du portefeuille</label><input class="champ" id="aj-wallet" type="number">
            <label class="label">Montant</label><input class="champ" id="aj-montant" type="number" min="1">
            <label class="label">Sens</label>
            <select class="champ" id="aj-sens">
                <option value="credit">Créditer</option>
                <option value="debit">Débiter</option>
            </select>
            <label class="label">Motif</label><input class="champ" id="aj-motif" placeholder="Obligatoire pour l'audit">
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton" id="aj-valider">Déposer la demande</button>
            </div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        document.getElementById('aj-valider').onclick = () => {
            const corps = {
                walletId: Number(document.getElementById('aj-wallet').value),
                montant: Number(document.getElementById('aj-montant').value),
                sens: document.getElementById('aj-sens').value,
                motif: document.getElementById('aj-motif').value.trim(),
            };
            if (!corps.walletId || !(corps.montant > 0)) return toast('Portefeuille et montant sont requis', 'erreur');
            fermerModale();
            agir(() => api('/transaction/wallet/ajuster', { method: 'POST', body: corps }), 'Demande déposée');
        };
    },

    /* --- Validations --- */
    'valider-approuver': async (el) => {
        const r = await confirmer({
            titre: 'Approuver et exécuter ?',
            texte: `L'opération sera <strong>exécutée immédiatement</strong> et inscrite au journal d'audit sous votre nom.`,
            libelle: 'Approuver et exécuter', genre: 'succes',
        });
        if (r.ok) agir(() => api(`/validation/${el.dataset.id}/approuver`, { method: 'POST' }), 'Opération validée et exécutée');
    },

    'valider-rejeter': async (el) => {
        const r = await confirmer({
            titre: 'Rejeter la demande ?',
            texte: 'Aucun mouvement ne sera effectué.',
            libelle: 'Rejeter',
            champ: 'Motif du rejet',
        });
        if (r.ok) agir(() => api(`/validation/${el.dataset.id}/rejeter`, { method: 'POST', body: { motif: r.valeur } }), 'Demande rejetée');
    },

    /* --- Plans --- */
    'plan-creer': () => formulairePlan(),
    'plan-modifier': (el) => formulairePlan({
        id: el.dataset.id, nom: el.dataset.nom, prix: el.dataset.prix, description: el.dataset.description,
    }),
    'plan-supprimer': async (el) => {
        const r = await confirmer({
            titre: 'Supprimer ce plan ?',
            texte: `« ${echapper(el.dataset.nom)} » disparaîtra du catalogue. Les souscriptions en cours ne sont pas annulées.`,
            libelle: 'Supprimer',
        });
        if (r.ok) agir(() => api(`/produit/produit/${el.dataset.id}`, { method: 'DELETE' }), 'Plan supprimé');
    },

    /* --- Notifications --- */
    'page-notifications': (el) => afficherPage('notifications', true, { page: Number(el.dataset.page) }),
    campagne: () => {
        ouvrirModale(`
            <h3>Nouvelle campagne</h3>
            <p class="sous">Le message part à <strong>tous les comptes actifs</strong>.</p>
            <label class="label">Message</label>
            <textarea class="champ" id="ca-message" placeholder="Texte affiché dans l'application…"></textarea>
            <label class="label">Type</label>
            <select class="champ" id="ca-type">
                <option value="system">Système</option>
                <option value="promo">Promotion</option>
                <option value="alerte">Alerte</option>
            </select>
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton" id="ca-valider">Envoyer</button>
            </div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        document.getElementById('ca-valider').onclick = () => {
            const message = document.getElementById('ca-message').value.trim();
            if (!message) return toast('Le message est requis', 'erreur');
            fermerModale();
            agir(() => api('/notification/campagne', {
                method: 'POST',
                body: { message, type: document.getElementById('ca-type').value, cible: 'all' },
            }), 'Campagne envoyée');
        };
    },

    /* --- Configuration --- */
    'config-modifier': (el) => {
        ouvrirModale(`
            <h3>Modifier un paramètre</h3>
            <p class="sous"><span class="mono">${echapper(el.dataset.cle)}</span></p>
            <label class="label">Valeur</label>
            <input class="champ" id="cfg-valeur" value="${echapper(el.dataset.valeur)}">
            <p class="aide">La modification est inscrite au journal d'audit.</p>
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton" id="cfg-valider">Enregistrer</button>
            </div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        document.getElementById('cfg-valider').onclick = () => {
            const valeur = document.getElementById('cfg-valeur').value;
            fermerModale();
            agir(() => api(`/config/config/${encodeURIComponent(el.dataset.cle)}`, { method: 'PATCH', body: { valeur } }), 'Paramètre enregistré');
        };
    },

    /* --- Administrateurs --- */
    'admin-creer': () => {
        ouvrirModale(`
            <h3>Nouvel administrateur</h3>
            <p class="sous">Le rôle détermine ce que le serveur laissera passer.</p>
            <label class="label">Nom</label><input class="champ" id="ad-nom">
            <label class="label">Prénom</label><input class="champ" id="ad-prenom">
            <label class="label">Adresse électronique</label><input class="champ" id="ad-email" type="email">
            <label class="label">Mot de passe</label><input class="champ" id="ad-mdp" type="password">
            <label class="label">Rôle</label>
            <select class="champ" id="ad-role">
                ${Object.entries(LIBELLE_ROLE).map(([c, l]) => `<option value="${c}">${l}</option>`).join('')}
            </select>
            <div class="modale-actions">
                <button class="bouton fantome" data-fermer>Annuler</button>
                <button class="bouton" id="ad-valider">Créer</button>
            </div>`);
        voile().querySelector('[data-fermer]').onclick = fermerModale;
        document.getElementById('ad-valider').onclick = () => {
            const corps = {
                nom: document.getElementById('ad-nom').value.trim(),
                prenom: document.getElementById('ad-prenom').value.trim(),
                email: document.getElementById('ad-email').value.trim(),
                motDePasse: document.getElementById('ad-mdp').value,
                role: document.getElementById('ad-role').value,
            };
            if (!corps.nom || !corps.email || corps.motDePasse.length < 8) {
                return toast('Nom, adresse et mot de passe (8 caractères) sont requis', 'erreur');
            }
            fermerModale();
            agir(() => api('/auth/create', { method: 'POST', body: corps }), 'Administrateur créé');
        };
    },
};

function formulairePlan(plan) {
    const edition = !!plan;
    ouvrirModale(`
        <h3>${edition ? 'Modifier le plan' : 'Nouveau plan'}</h3>
        <p class="sous">Catalogue proposé à la souscription dans l'application.</p>
        <label class="label">Nom</label><input class="champ" id="pl-nom" value="${echapper(plan?.nom || '')}">
        <label class="label">Description</label><textarea class="champ" id="pl-desc">${echapper(plan?.description || '')}</textarea>
        <label class="label">Prix (FCFA)</label><input class="champ" id="pl-prix" type="number" min="0" value="${echapper(plan?.prix ?? '')}">
        <div class="modale-actions">
            <button class="bouton fantome" data-fermer>Annuler</button>
            <button class="bouton" id="pl-valider">${edition ? 'Enregistrer' : 'Créer'}</button>
        </div>`);
    voile().querySelector('[data-fermer]').onclick = fermerModale;
    document.getElementById('pl-valider').onclick = () => {
        const corps = {
            nom: document.getElementById('pl-nom').value.trim(),
            description: document.getElementById('pl-desc').value.trim(),
            prix: Number(document.getElementById('pl-prix').value),
        };
        if (!corps.nom || !Number.isFinite(corps.prix)) return toast('Nom et prix sont requis', 'erreur');
        fermerModale();
        agir(() => (edition
            ? api(`/produit/produitUpdate/${plan.id}`, { method: 'PATCH', body: corps })
            : api('/produit/produitadd', { method: 'POST', body: corps })),
            edition ? 'Plan enregistré' : 'Plan créé');
    };
}

/**
 * Telechargement d'un fichier protege par jeton.
 *
 * Un <a href> ne porte pas d'en-tete Authorization : on recupere donc le
 * fichier par fetch, puis on le remet au navigateur via une URL objet.
 */
async function telecharger(chemin, nomFichier) {
    try {
        toast('Préparation du fichier…');
        const reponse = await fetch(BASE + chemin, { headers: { Authorization: 'Bearer ' + etat.jeton } });
        if (!reponse.ok) throw new Error(`Export refusé (${reponse.status})`);
        const blob = await reponse.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = nomFichier;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        toast('Fichier téléchargé', 'succes');
    } catch (e) {
        toast(e.message, 'erreur');
    }
}

/* =====================================================================
 *  ROUTAGE
 * ===================================================================== */

async function afficherPage(id, silencieux = false, params = {}) {
    const cible = PAGES[id] ? id : 'dashboard';
    etat.page = cible;
    marquerActif(cible);
    const conteneur = document.getElementById('page');
    if (!silencieux) conteneur.innerHTML = '<div class="chargement">Chargement…</div>';
    try {
        conteneur.innerHTML = await PAGES[cible](params);
    } catch (e) {
        conteneur.innerHTML = `<div class="alerte"><div class="titre">Chargement impossible</div>${echapper(e.message)}</div>`;
    }
    document.getElementById('barre-laterale').classList.remove('ouverte');
}

function router() {
    const id = (location.hash || '#/dashboard').replace('#/', '');
    afficherPage(id);
}

/* =====================================================================
 *  SESSION
 * ===================================================================== */

async function entrer(admin) {
    etat.admin = admin;
    document.getElementById('ecran-connexion').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    document.getElementById('nom-admin').textContent = `${admin.nom} ${admin.prenom || ''}`.trim();
    document.getElementById('role-admin').textContent = LIBELLE_ROLE[admin.role] || admin.role;
    document.getElementById('avatar').textContent = (admin.nom || '?').charAt(0).toUpperCase();
    construireNavigation();
    router();
}

function deconnecter(message) {
    etat.jeton = null;
    etat.admin = null;
    localStorage.removeItem(CLE_JETON);
    document.getElementById('app').classList.remove('visible');
    document.getElementById('ecran-connexion').style.display = 'flex';
    if (message) {
        document.getElementById('erreur-connexion').innerHTML =
            `<div class="alerte"><div class="titre">Session terminée</div>${echapper(message)}</div>`;
    }
}

document.getElementById('form-connexion').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const bouton = document.getElementById('bouton-connexion');
    const erreur = document.getElementById('erreur-connexion');
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    erreur.innerHTML = '';
    try {
        const reponse = await fetch(BASE + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: document.getElementById('email').value.trim(),
                motDePasse: document.getElementById('motDePasse').value,
            }),
        });
        const corps = await reponse.json();
        if (!reponse.ok) throw new Error(corps.error || 'Identifiants invalides');
        etat.jeton = corps.data.token;
        localStorage.setItem(CLE_JETON, etat.jeton);
        await entrer(corps.data.admin);
    } catch (e) {
        erreur.innerHTML = `<div class="alerte"><div class="titre">Connexion refusée</div>${echapper(e.message)}</div>`;
    } finally {
        bouton.disabled = false;
        bouton.textContent = 'Se connecter';
    }
});

document.getElementById('bouton-deconnexion').onclick = () => deconnecter();
document.getElementById('bascule').onclick = () =>
    document.getElementById('barre-laterale').classList.toggle('ouverte');

// Delegation : les pages sont reconstruites a chaque affichage, rattacher
// les ecouteurs un a un a chaque rendu serait une source de fuites.
document.getElementById('page').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, ev);
});

voile().addEventListener('click', (ev) => { if (ev.target === voile()) fermerModale(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fermerModale(); });
window.addEventListener('hashchange', router);

/* --- Reprise de session : un jeton en memoire ne vaut que s'il est encore valide --- */
(async () => {
    if (!etat.jeton) return;
    try {
        await entrer(await api('/auth/me'));
    } catch (e) {
        deconnecter();
    }
})();
