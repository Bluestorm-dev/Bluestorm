bluestorm/
├─ index.html
├─ manifest.json
├─ sw.js
├─ robots.txt
├─ sitemap.xml                      (optionnel)
│
├─ assets/
│  ├─ images/
│  │  ├─ icons/
│  │  │  ├─ icon-192.png
│  │  │  ├─ icon-512.png
│  │  │  ├─ maskable-192.png
│  │  │  └─ maskable-512.png
│  │  ├─ themes/                    (logos “vrais” adoucis)
│  │  │  ├─ html.svg
│  │  │  ├─ css.svg
│  │  │  ├─ javascript.svg
│  │  │  ├─ figma.svg
│  │  │  ├─ threejs.svg
│  │  │  ├─ blender.svg
│  │  │  ├─ git.svg
│  │  │  └─ cloudflare.svg
│  │  ├─ ui/
│  │  │  ├─ bluestorm-logo.svg      (ton logo)
│  │  │  └─ empty-state.svg
│  │  └─ backgrounds/
│  │     └─ bg-noise.png            (optionnel)
│  │
│  └─ fonts/                        (optionnel)
│
├─ styles/
│  ├─ 00-reset.css
│  ├─ 10-tokens.css                 (couleurs, radius, spacing)
│  ├─ 20-base.css                   (typo, layout global)
│  ├─ 30-components.css             (cards, buttons, chips)
│  ├─ 40-pages.css                  (styles par page)
│  └─ 90-theme-bluestorm.css        (glow, gradients, dark)
│
├─ data/
│  ├─ program.v1.json               (programme 2 ans “source”)
│  ├─ skills.map.json               (mapping programme → compétences)
│  └─ themes.json                   (liste des thèmes/boutons)
│
├─ js/
│  ├─ app.js                        (boot + init + routing)
│  ├─ router.js                     (SPA router hash ou history)
│  ├─ state.js                      (état UI, cache, events)
│  ├─ constants.js                  (constantes globales)
│  ├─ utils/
│  │  ├─ dom.js                      (helpers UI)
│  │  ├─ date.js                     (format dates, time)
│  │  ├─ id.js                       (uuid)
│  │  ├─ validation.js               (validate forms)
│  │  └─ crypto.js                   (option chiffrement sync)
│  │
│  ├─ db/
│  │  ├─ db.js                       (IndexedDB open/upgrade)
│  │  ├─ journal.store.js            (CRUD journal)
│  │  ├─ program.store.js            (programme + progression)
│  │  ├─ flashcards.store.js         (cards + SRS)
│  │  ├─ skills.store.js             (arbre, niveaux, preuves)
│  │  └─ settings.store.js           (prefs, lastSync, deviceId)
│  │
│  ├─ sync/
│  │  ├─ sync.api.js                 (fetch upload/download)
│  │  ├─ sync.snapshot.js            (export/import snapshot JSON)
│  │  ├─ sync.merge.js               (merge par id/updatedAt)
│  │  └─ sync.ui.js                  (écran + bouton sync)
│  │
│  ├─ components/
│  │  ├─ bottomNav.js                (barre basse)
│  │  ├─ themeButtons.js             (grille boutons thèmes)
│  │  ├─ card.js                     (UI card)
│  │  ├─ modal.js                    (confirm, choix merge)
│  │  ├─ toast.js                    (petits messages)
│  │  ├─ progressBar.js              (barres)
│  │  └─ skillTree.js                (arbre compétences)
│  │
│  └─ pages/
│     ├─ cockpit.page.js             (dashboard)
│     ├─ journal.page.js             (liste)
│     ├─ journalNew.page.js          (création entrée)
│     ├─ program.page.js             (blocs/semaines)
│     ├─ week.page.js                (détail semaine + todos)
│     ├─ flashcards.page.js          (révision)
│     ├─ flashcardsList.page.js      (liste/recherche)
│     ├─ skills.page.js              (arbre compétences)
│     ├─ themes.page.js              (stats par thème)
│     ├─ projects.page.js            (mini-projets)
│     ├─ issues.page.js              (problèmes/solutions)
│     └─ settings.page.js            (export/import/sync)
│
└─ backend/                           (séparé, déployé à part)
   ├─ worker.js                       (Cloudflare Worker)
   └─ README.md