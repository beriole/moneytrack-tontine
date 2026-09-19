/**
 * Scenario : l'administration des restrictions et des defauts, par HTTP.
 *
 * Vraie connexion administrateur, vrai verifyAdmin, vrais roles : deux
 * administrateurs temporaires (conformite, support) sont crees puis
 * supprimes. Verifie que le support lit sans pouvoir restreindre, que la
 * conformite pose et leve, que chaque geste est au journal a son nom, et
 * que le back-office sert ses pages.
 *
 * Usage : node scripts/scenario-admin-http.js   (ecoute sur le port 3301)
 */
const R = require('path').join(__dirname, '..') + '/';
require(R + 'config/index');
const express = require(R + 'node_modules/express');
const bcrypt = require(R + 'node_modules/bcrypt');
const { Op } = require(R + 'node_modules/sequelize');
const m = require(R + 'models');
const verifyAdmin = require(R + 'middleware/verifyAdmin');
const vA = typeof verifyAdmin === 'function' ? verifyAdmin : verifyAdmin.verifyAdmin;

const app = express();
app.use(express.json());
app.use('/backoffice', express.static(R + 'backoffice'));
app.use('/api/admin/auth', require(R + 'router/admin/auth.admin'));
app.use('/api/admin/tontine', vA, require(R + 'router/admin/tontine.admin'));
app.use('/api/admin/restriction', vA, require(R + 'router/admin/restrictions.admin'));
app.use('/api/admin/kyc', vA, require(R + 'router/admin/commande.admin'));

let ok = 0, ko = 0;
const verifier = (l, c, d) => { c ? ok++ : ko++; console.log((c ? '  [ok]  ' : '  [KO]  ') + l + (d ? '  — ' + d : '')); };

(async () => {
    await m.db.authenticate();
    const pwd = 'Test@' + Date.now();
    const hash = await bcrypt.hash(pwd, 10);
    const conf = await m.Admin.create({ nom: 'Test', prenom: 'Conformite', email: `conf.${Date.now()}@test.local`, motDePasse: hash, role: 'COMPLIANCE', isActive: true });
    const supp = await m.Admin.create({ nom: 'Test', prenom: 'Support', email: `supp.${Date.now()}@test.local`, motDePasse: hash, role: 'SUPPORT', isActive: true });
    const evalMax = (await m.EvaluationRisque.max('id')) || 0;
    const restrMax = (await m.Restriction.max('id')) || 0;
    const serveur = app.listen(3301);
    const B = 'http://localhost:3301';
    const appel = async (chemin, jeton, opts = {}) => {
        const r = await fetch(B + chemin, {
            method: opts.method || 'GET',
            headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
            body: opts.body ? JSON.stringify(opts.body) : undefined
        });
        let corps = null; try { corps = await r.json(); } catch (e) { }
        return { code: r.status, corps };
    };
    try {
        const login = async (a) => (await appel('/api/admin/auth/login', null, { method: 'POST', body: { email: a.email, motDePasse: pwd } })).corps.data.token;
        const T = await login(conf);
        const TS = await login(supp);
        verifier('connexion des deux administrateurs', !!T && !!TS);

        verifier('sans jeton : 401', (await appel('/api/admin/restriction', null)).code === 401);

        const liste = await appel('/api/admin/restriction', T);
        verifier('liste des restrictions en vigueur', liste.code === 200 && Array.isArray(liste.corps.data), String(liste.code));

        const inc = await appel('/api/admin/tontine/incidents', T);
        verifier('incidents : resume et liste', inc.code === 200 && inc.corps.resume && Array.isArray(inc.corps.incidents),
            JSON.stringify(inc.corps && inc.corps.resume));

        const cli = await m.Client.findOne({ where: { email: 'bertrand@tontine.local' } });
        const sit = await appel(`/api/admin/restriction/client/${cli.id}`, TS);
        const d = sit.corps && sit.corps.data;
        verifier('dossier : KYC, restrictions, risque, decisions (lecture ouverte au support)',
            sit.code === 200 && d.kyc && Array.isArray(d.restrictions) && d.risque && Array.isArray(d.decisions), String(sit.code));
        verifier('le risque consulte est conserve (contexte admin)',
            d.risque.id > evalMax && (await m.EvaluationRisque.findByPk(d.risque.id)).contexte === 'admin');

        const refus = await appel('/api/admin/restriction', TS, { method: 'POST', body: { clientId: cli.id, type: 'JOIN_TONTINE_DISABLED', motif: 'test' } });
        verifier('le support ne pose pas de restriction : 403', refus.code === 403, String(refus.code));

        const sansMotif = await appel('/api/admin/restriction', T, { method: 'POST', body: { clientId: cli.id, type: 'JOIN_TONTINE_DISABLED', motif: ' ' } });
        verifier('sans motif : 400', sansMotif.code === 400, sansMotif.corps && sansMotif.corps.error);

        const pose = await appel('/api/admin/restriction', T, { method: 'POST', body: {
            clientId: cli.id, type: 'JOIN_TONTINE_DISABLED', motif: 'Verification en cours (test HTTP)',
            actifJusqu: new Date(Date.now() + 7 * 86400000).toISOString() } });
        verifier('la conformite pose une restriction : 201', pose.code === 201, String(pose.code));
        const rid = pose.corps && pose.corps.data && pose.corps.data.id;
        const liste2 = await appel('/api/admin/restriction', T);
        verifier('elle apparait dans la liste, avec le client', liste2.corps.data.some(x => x.id === rid && x.client && x.client.id === cli.id));
        const doublon = await appel('/api/admin/restriction', T, { method: 'POST', body: { clientId: cli.id, type: 'JOIN_TONTINE_DISABLED', motif: 'bis' } });
        verifier('pas deux fois la meme : 409', doublon.code === 409, String(doublon.code));

        const leverSupport = await appel(`/api/admin/restriction/${rid}/lever`, TS, { method: 'POST', body: { motif: 'x' } });
        verifier('le support ne leve pas : 403', leverSupport.code === 403);
        const lever = await appel(`/api/admin/restriction/${rid}/lever`, T, { method: 'POST', body: { motif: 'test termine' } });
        verifier('la conformite leve : 200', lever.code === 200, String(lever.code));
        const liste3 = await appel('/api/admin/restriction', T);
        verifier('elle quitte la liste', !liste3.corps.data.some(x => x.id === rid));

        const audit = (await m.AuditLog.findAll({ where: { cible: `Client#${cli.id}`, action: { [Op.in]: ['RESTRICTION_POSEE', 'RESTRICTION_LEVEE'] } } }))
            .filter(a => { const dd = typeof a.details === 'string' ? JSON.parse(a.details) : a.details; return dd && dd.restrictionId === rid; });
        verifier('pose et levee au journal d audit, au nom de l administrateur',
            audit.length === 2 && audit.every(a => a.adminEmail === conf.email || a.acteurId === conf.id),
            audit.map(a => `${a.action} par ${a.adminEmail || a.acteurLibelle}`).join(', '));

        const kyc = await appel('/api/admin/kyc/demandeAky', T);
        verifier('file KYC : repond', kyc.code === 200 && Array.isArray(kyc.corps.data), `${kyc.code} ${kyc.corps && kyc.corps.meta ? 'total ' + kyc.corps.meta.total : ''}`);

        const js = await fetch(B + '/backoffice/app.js');
        const src = await js.text();
        verifier('le back-office sert la nouvelle page', js.status === 200 && src.includes('PAGES.defauts') && src.includes('restriction-poser'));
    } catch (e) {
        ko++; console.log('  [KO]  interrompu : ' + (e.stack || e.message));
    } finally {
        await m.Restriction.destroy({ where: { id: { [Op.gt]: restrMax }, clientId: (await m.Client.findOne({ where: { email: 'bertrand@tontine.local' } })).id } });
        await m.EvaluationRisque.destroy({ where: { id: { [Op.gt]: evalMax }, contexte: 'admin' } });
        await conf.destroy(); await supp.destroy();
        serveur.close();
        await m.db.close();
        console.log('\n' + (ko === 0 ? 'SCENARIO REUSSI — tous les controles passent' : 'SCENARIO EN ECHEC — ' + ko + ' controle(s)'));
        process.exit(ko ? 1 : 0);
    }
})();
