# SyndicPlus — Moteur de parcours par catégories (V2)

Statut : spécification, **non implémentée**. À confronter aux contrats, délégations, missions du gardien et textes applicables. Aucun ordre réel automatique.

## Décision structurante
Une catégorie de parcours n'est **pas** la catégorie technique (électricité/plomberie). Un même incident technique peut être mineur ou urgent. Le routage combine :
- **Sécurité / gravité** : danger potentiel, urgence, ordinaire.
- **Périmètre** : parties communes, privatif, origine incertaine.
- **Contrat** : prestataire sous contrat, astreinte, prestataire libre, absence de contrat.
- **Gardien** : présent et en service, autorisé à constater, autorisé à petit entretien, absent / remplaçant.
- **Autorité** : enveloppe préautorisée vérifiée, devis/approbation, décision AG ou délégation, aucune autorisation.
- **Communication** : qui voit, qui est informé, qui doit décider ; président du conseil syndical jamais approbateur automatique.
- **Échéance / blocage** : responsable de prochaine action, repli horodaté.

## Six parcours réutilisables

| Code | Parcours | Déclencheur type | Premier interlocuteur | Condition de passage au syndic | Info conseil syndical |
| --- | --- | --- | --- | --- | --- |
| P1 | Petit entretien avec gardien | Éclairage simple, propreté, encombrant mineur, petit réglage non dangereux | Gardien en service et dans ses missions | Travaux hors missions, absence de solution autorisée, coût non préautorisé | Bilan, pas de push systématique |
| P2 | Maintenance sous contrat | Chauffage collectif, ascenseur, VMC, portail, interphone, IRVE | Mainteneur contractuel ou procédure de gardien prévue | Prestataire indisponible, panne prolongée, dépassement du contrat ou arbitrage | Impact collectif significatif, récurrence, coût |
| P3 | Diagnostic puis devis | Infiltration non urgente, réparation importante, façade sans danger immédiat | Gardien pour constat sûr si prévu, puis gestionnaire | Devis requis avant engagement | Selon consultation/importance |
| P4 | Sinistre non urgent | Dégât des eaux limité, dégradations avec assurance | Constat autorisé, gestionnaire pour sinistre/assurance | Toujours pour actes d'assurance et arbitrages relevant du syndic | Si parties communes, impact significatif |
| P5 | Urgence / sécurité | Eau + électricité, fumée, inondation, chute d'éléments, personne bloquée | Procédure de sécurité et astreinte sans délai | Gestionnaire alerté immédiatement en parallèle | Président CS informé de l'urgence ; gardien en service alerté en parallèle |
| P6 | Travaux votés / projet | Rénovation lourde, chantier accepté, opérations pluri-entreprises | Gestionnaire / procédure projet | Décisions légales, marchés, contrôle des délégations | Suivi et consultation selon compétences, vérification terrain lorsque désigné |

## Affectation indicative des 36 scénarios

Cette classification est **par défaut**, révisée dès que la situation réelle change. Une gravité P5 prime sur toute autre catégorie.

| Scénario | Parcours initial | Exception / bifurcation |
| --- | --- | --- |
| 1 Ampoule couloir | P1 | Odeur de brûlé / danger : P5 |
| 2 Panne électrique collective | P2/P3 | Danger : P5 |
| 3 Fuite légère | P1/P3 | Extension dommages : P4 ; fuite majeure : P5 |
| 4 Fuite majeure | P5 | Jamais de gardien préalable obligatoire |
| 5 Chauffage localisé | P2 si collectif, sinon orientation privatif | Coupure générale importante : escalade |
| 6 Chauffage collectif arrêté | P2 | Risque particulier : P5 |
| 7 Ascenseur | P2 | Personne bloquée : P5 |
| 8 Porte d'entrée | P1/P2 | Sûreté compromise : P5 selon gravité |
| 9 Interphone | P2 | Petit constat gardien possible |
| 10 Dégât des eaux | P4 | Danger : P5 |
| 11 Toiture infiltration | P3/P4 | Chute / risque immédiat : P5 |
| 12 Nettoyage | P1 | Répétition : analyse prestataire |
| 13 Encombrants | P1 | Produits dangereux : procédure spécifique |
| 14 VMC collective | P2 | Risque sanitaire grave : P5 |
| 15 Incendie | P5 | Secours en priorité |
| 16 Rénovation importante | P6 | Danger chantier : P5 |
| 17 Canalisation bouchée | P1/P2 | Refoulement important : P5 |
| 18 Eau chaude collective | P2 | Risque sanitaire : P5 |
| 19 Suspicion sanitaire eau | P5 | Diagnostic par spécialiste |
| 20 Intrusion porte forcée | P5/P3 | Police et sûreté selon situation |
| 21 Badge perdu | P1 administratif contrôlé | Vérification identité obligatoire |
| 22 Portail parking | P2 | Écrasement / danger : P5 |
| 23 Inondation sous-sol | P5 | Personnel ne pénètre pas en zone dangereuse |
| 24 Alarme incendie | P5 | Procédure incendie |
| 25 Éclairage de sécurité | P2/P3 | Danger avéré : P5 |
| 26 Garde-corps instable | P5 | Périmètre sécurisé |
| 27 Chute façade | P5 | Balisage et secours appropriés |
| 28 Infiltration privative incertaine | P4 | Sécurité avant recherche de responsabilité |
| 29 Nuisances sonores | P3 administratif | Pas de diagnostic/espionnage IA |
| 30 Vandalisme | P4/P3 | Intrusion en cours : P5 |
| 31 Nuisibles | P2/P3 | Risque sanitaire grave : P5 |
| 32 Arbre dangereux | P5/P3 | Si danger de chute : P5 |
| 33 IRVE collective | P2 | Risque électrique : P5 |
| 34 Photovoltaïque | P2 | Risque électrique/incendie : P5 |
| 35 Suspicion amiante/plomb | P5 / arrêt travaux | Spécialiste qualifié |
| 36 Travaux votés en retard | P6 | Relances / réserves sans inventer pénalités |

## Transitions et autorisations

- **P1 gardien résout** : compte rendu, vérification adaptée si nécessaire, clôture selon règle approuvée. Aucun passage gestionnaire automatique.
- **P1 gardien ne résout pas** : recherche prestataire sous contrat ou enveloppe *effectivement* préautorisée ; si admissible, proposition d'affectation automatique ; sinon décision gestionnaire et devis.
- **P2** : respecter les droits du contrat (périmètre, astreinte, limites) et le prestataire habituel. Ne pas inventer une préautorisation.
- **P3** : pas d'ordre de travaux avant validation de la personne habilitée, consultation/AG si requise.
- **P4** : gestion administrative/assurance séparée de la réparation technique ; ne pas déduire les responsabilités.
- **P5** : urgence traitée immédiatement, notifications en parallèle : gestionnaire, président CS, gardien si en service ; en son absence, remplaçant/astreinte. N'attendre aucune notification accusée pour démarrer la mise en sécurité.
- **P6** : délibérations, devis, décisions, suivi des prestations, réserves et réception juridique distincts.
- Chaque parcours possède un responsable de prochaine action, un délai et un repli. Un dossier sans prochaine action est considéré bloqué.

## Preuves et clôture

Technicien : déclaration d'intervention réalisée et compte rendu. Gardien / président CS : contrôle apparent ou réserves uniquement si désigné par la copropriété. Gestionnaire : suites administratives. Un président ne possède pas de pouvoir automatique de réception juridique. Silence ≠ acceptation.

## Travaux d'implémentation
1. Définir `routeCategory` et `routeReasons`, séparés de `trade` et `severity`.
2. Implémenter les règles pures déterministes, priorité sécurité P5.
3. Ajouter `procedureConfig` par immeuble (gardien, horaires, contact suppléant, contrats, notifications, plafonds vérifiés et délégations).
4. Ajouter l'écran de simulation de 6 parcours, actions uniquement fictives.
5. Tests table-driven pour les 36 scénarios, les gardiens absents, les cas préautorisés/non autorisés, réserves et changement de gravité.
6. Plus tard, l'IA propose la classification, fournit ses raisons et laisse le moteur de procédures déterminer l'autorisation.

La documentation ne vaut ni contrôle juridique d'un mandat ni décision de travaux.
