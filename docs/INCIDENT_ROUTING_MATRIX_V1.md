# SyndicPlus — Matrice de routage des incidents V1

**Statut : conception uniquement, à valider avec cabinets pilotes et conseil juridique.**
**Périmètre :** parties communes, maintenance et travaux ; données fictives dans le laboratoire.
L'objectif est de ne jamais bloquer un dossier dans un circuit unique.

## Acteurs
- Résident : déclare, complète, suit ses propres signalements.
- Gardien : constate et facilite l'accès **uniquement dans ses missions et horaires** ; pas de décision financière implicite.
- Prestataire : diagnostique, planifie, produit des preuves ; pas de dépassement de devis autorisé.
- Gestionnaire/syndic : supervise, décide et commande dans le cadre de ses attributions légales/contractuelles.
- Président/conseil syndical : suivi, assistance, contrôle, consultation quand requise ; **aucun pouvoir général de commande**.
- IA : aide à qualifier et à préparer ; la procédure et les droits sont validés séparément.

## Codes
- G : gardien (si présent, mission/horaire compatibles) ; sinon circuit de repli.
- S : syndic/gestionnaire ; P : prestataire habilité ; CS : conseil syndical ; AG : assemblée générale.
- CS-info : notification utile, sans requête de décision.
- CS-consult : consultation requise par une règle documentée, seuil voté ou délégation en vigueur.
- Le numéro d'urgence d'un prestataire sous contrat doit être utilisé lorsque la procédure le prévoit.

## Matrice de départ (chaque ligne configurable par immeuble)

| # | Signalement | Première action suggérée | Gardien | Syndic | Conseil syndical | Contrôles |
|---|---|---|---|---|---|---|
| 1 | Ampoule ou luminaire isolé | G constate ou P maintenance | Optionnel | Si autorisation nécessaire | Bilan groupé | Danger électrique => circuit 2 |
| 2 | Panne électrique collective | Sécurisation, S et P électricien | Accès seul si sûr | Immédiat | CS-info si collectif | Ne pas manipuler une installation dangereuse |
| 3 | Fuite légère | G constate si possible, sinon S/P | Optionnel | Selon origine/contrat | CS-info si collectif | Identifier privatif/commun sans présumer |
| 4 | Fuite majeure/inondation | Mise en sécurité et S/P urgence | Ne bloque jamais | Immédiat | CS-info prioritaire | Eau + électricité : danger immédiat |
| 5 | Chauffage insuffisant localisé | Qualifier privatif/collectif, contrat CVC | Observation seulement | Si collectif | Selon impact | Contrat d'entretien prioritaire |
| 6 | Chauffage collectif arrêté | S et chauffagiste/astreinte | Accès chaufferie si autorisé | Immédiat | CS-info selon ampleur | Occupants vulnérables, température, durée |
| 7 | Ascenseur en panne | Ascensoriste via procédure contractuelle | Affichage / constat si sûr | Suivi | CS-info si durée ou répétition | Personne bloquée => consignes d'urgence |
| 8 | Porte d'entrée ne ferme plus | G constate ou serrurier contractuel | Optionnel | Si sécurité/commande | CS-info si risque | Accès immeuble/sûreté |
| 9 | Interphone collectif | Prestataire sous contrat | Peut vérifier portée | Suivi | Si panne durable | Éviter tickets doublons |
| 10 | Dégât des eaux avec dommages | Sécuriser, S, assurance selon dossier | Photos si mission autorisée | Supervision | Si parties communes/significatif | Technique et assurance suivis séparément |
| 11 | Infiltration toiture | S et couvreur compétent | Observation sans risque | Décision / devis | Consultation selon procédure | Travail en hauteur interdit au gardien non habilité |
| 12 | Propreté défaillante | G ou entreprise d'entretien | Selon missions | Si répétition | Bilan / répétition | Contrat de nettoyage |
| 13 | Encombrants | G ou prestataire agréé | Selon missions | Si dépense/action | Si récurrent | Cadre contractuel, pas d'improvisation |
| 14 | Ventilation VMC collective | Maintenance spécialisée | Vérification simple éventuelle | Si panne collective | Si prolongée | Qualité de l'air / accès |
| 15 | Incendie ou fumée | Secours, mise en sécurité et S | Pas d'intervention dangereuse | Immédiat | CS-info prioritaire | Ne pas attendre l'IA |
| 16 | Rénovation importante | S prépare décision et pièces | Accès si besoin | Gestion procédures | CS-consult selon textes | AG/délégation nécessaire selon travaux |

## Ordre des règles (priorité décroissante)
1. **Sécurité et secours.** Un signalement de danger potentiel escalade vers un humain et la procédure d'urgence immédiatement, sans attendre un gardien ni une approbation IA.
2. **Contrat de maintenance et astreinte.** Ascenseur, CVC, porte automatique, etc. : suivre les consignes et prestataires déjà contractuels.
3. **Attributions légales et votes.** Le syndic reste l'organe de gestion ; conseil syndical et AG interviennent selon les textes, seuils, décisions et délégations dûment vérifiés.
4. **Missions du gardien et disponibilités.** Visite de constat seulement si prévue et sûre ; si absent/hors horaires, plan alternatif immédiat.
5. **Politique de communication.** Ne notifier que les personnes concernées et autorisées.
6. **Relances.** Un responsable, une échéance et une action suivante sont toujours identifiés. Escalade graduée en cas de silence.

## États indépendants à conserver
- **Gravité** : danger potentiel / important / ordinaire.
- **Prise en charge** : non pris / pris en charge / bloqué / terminé.
- **Responsable de prochaine action** : G, P, S, résident, CS/AG si procédure.
- **Action demandée** : constater, répondre, confirmer RDV, devis, autoriser, informer, clôturer.
- **Échéance** : heure/date ; justification du délai et circuit de repli.
- **Information** : destinataires + motif + horodatage.
- **Autorisation** : fondement contractuel/légal/AG, autoriseur identifié, preuve.

## Champs de configuration par copropriété
`guardian.present`, `guardian.scope`, `guardian.hours`, `guardian.backup`,
`maintenance_contracts` (équipement, fournisseur, téléphone d'astreinte, périmètre),
`emergency_contacts`, `notification_policy`, `consultation_thresholds`,
`valid_delegations` (décision, durée, justificatif), `escalation_rules`,
`resident_channels`, `document_access_policy`.

Tous les pouvoirs et seuils doivent être **explicitement saisis et validés** par le syndic. Ne jamais les inférer automatiquement d'un texte libre sans vérification.

## Critères du futur moteur
- Incident d'ascenseur sous contrat → chemin ascensoriste direct ; panne récurrente → analyse + CS-info selon règle.
- Ampoule simple avec gardien autorisé → constat gardien ; gardien absent → délégation à P/S selon règle, sans dossier bloqué.
- Fuite avec eau près de l'électricité → escalade sécurité immédiate, pas de simple ticket.
- Gros travaux → pas de validation automatique sur la base d'un simple montant.
- Président du CS n'est jamais traité comme un gestionnaire pouvant engager librement une dépense.
- Notifications et consultation ne sont jamais confondues.
- Aucun prestataire n'engage de dépense complémentaire sans autorisation applicable.
- Toute recommandation IA indique sa raison, la règle et les sources disponibles.
- Toute action est tracée ; rien n'est envoyé à une personne extérieure depuis le laboratoire.


## Scénarios complémentaires (17 à 36) — à confirmer par les copropriétés pilotes

| # | Signalement | Premier circuit proposé | Gardien | Syndic / décision | Conseil syndical | Vigilance |
|---|---|---|---|---|---|---|
| 17 | Canalisation bouchée / refoulement | Mise en sécurité puis plombier selon contrat | Constat sans exposition | Pilote interventions communes | Info si dégâts collectifs | Eaux usées, locaux impactés |
| 18 | Eau chaude collective absente | Exploitant ECS / astreinte contractuelle | Relais occupants si prévu | Suivi et escalade | Info si large impact | Température, légionelles, interruption |
| 19 | Suspicion de légionelles / eau impropre | Procédure sanitaire et professionnels qualifiés | Aucun prélèvement improvisé | Escalade immédiate | Info contrôlée | Ne pas diagnostiquer via IA |
| 20 | Serrure de hall forcée / intrusion | Mise en sûreté ; serrurier / forces de l'ordre si nécessaire | Constat sans confrontation | Coordination et preuves | Info sécurité | Conserver preuve, données sensibles |
| 21 | Badge ou accès individuel perdu | Procédure d'identité / habilitation | Remise selon mandat | Contrôle droits d'accès | Pas de notification | Ne pas délivrer l'accès sur simple demande |
| 22 | Portail parking bloqué | Mainteneur contractuel | Vérification visuelle sûre | Suivi | Si immobilisation collective | Risque d'écrasement / désenclavement |
| 23 | Inondation parking sous-sol | Procédure urgence, pompage qualifié | Pas d'accès dangereux | Urgence et sinistre | Info prioritaire | Risques électriques et structurels |
| 24 | Détection incendie / alarme sécurité | Consignes de sécurité, secours si nécessaire | Missions sécurité autorisées uniquement | Immédiat | Information appropriée | Ne pas neutraliser alarme sans autorisation |
| 25 | Éclairage de sécurité défaillant | Prestataire sécurité / électricien compétent | Simple signalement | Priorité à qualifier | Info si impact majeur | Obligations de sécurité et périodicité |
| 26 | Garde-corps instable / chute possible | Balisage sûr, mise en sécurité, entreprise qualifiée | Signale et éloigne si sûr | Urgence et arbitrage | Information prioritaire | Danger pour personnes, pas d'attente |
| 27 | Façade : chute d'enduit ou élément | Sécurisation et diagnostic compétent | Ne pas intervenir en hauteur | Urgence / commande appropriée | Info prioritaire | Périmètre et risque voie publique |
| 28 | Infiltration en appartement d'origine incertaine | Collecte preuves, recherche cause, syndic si parties communes | Constat si mission prévue | Orientation assurance/technique | Si impact commun | Ne pas attribuer la responsabilité par IA |
| 29 | Nuisances sonores / trouble de voisinage | Informations et orientation humaine | Observation limitée à ses missions | Qualification juridique | Selon récurrence collective | Vie privée, pas de surveillance abusive |
| 30 | Dégradation volontaire / vandalisme | Mise en sécurité, constat documenté | Signalement | Assurances / police selon situation | Info si coût collectif | Accusations non vérifiées interdites |
| 31 | Présence de nuisibles | Entreprise spécialisée selon contrat | Constat si compatible | Plan coordonné si collectif | Si infestation répétée | Données habitants et produits biocides |
| 32 | Arbre dangereux / branche tombée | Mise en sécurité, élagueur qualifié | Balisage si sûr | Décision et suivi | Info si danger ou travaux importants | Risque chute / espace public |
| 33 | Bornes de recharge IRVE en panne | Mainteneur IRVE selon contrat | Simple constat | Suivi contrat / accès | Si service collectif impacté | Habilitation électrique, données utilisateurs |
| 34 | Panne photovoltaïque collective | Installateur/mainteneur habilité | Aucun accès toiture / électrique | Vérifie contrat et garantie | Info si impact financier significatif | Pas de manipulation haute tension |
| 35 | Suspicion amiante/plomb lors de travaux | Arrêt / sécurisation de la zone, expert compétent | Pas de prélèvement | Vérifie diagnostics et obligations | Consultation selon travaux | Ne jamais déclarer absence de risque via IA |
| 36 | Travaux votés en retard / entreprise absente | Gestionnaire relance selon marché | Constat terrain si prévu | Vérifie contrat, réception, pénalités éventuelles | Rapport d'avancement | Ne pas inventer pénalités ni actes juridiques |

### Scénarios transversaux à tester sur chacun des circuits

- Gardien absent, en congé, en dehors de ses heures ou sans compétence requise : route alternative sans attente indéfinie.
- Prestataire sous contrat injoignable : escalade vers procédure d'astreinte ou gestionnaire, sans commander un autre prestataire hors autorisation.
- Plusieurs résidents signalent le même équipement : proposer le rattachement au dossier existant sans effacer les déclarations individuelles.
- Incident déclaré dans une partie privative avec conséquences communes incertaines : demander une vérification, ne pas présumer de la responsabilité.
- Conseil syndical informé mais sans pouvoir de commander : distinguer notification, consultation et autorisation.
- Urgence le soir, week-end ou jour férié : basculer vers les contacts réellement configurés, pas vers un numéro inventé.
- Prestataire termine sans preuve suffisante et résident conteste : statut « résolution à confirmer », validation humaine avant clôture.
- Incident récurrent : déclencher une suggestion d'analyse des causes et des coûts, pas automatiquement un nouveau marché.


## Rectification — fuite importante (règle prioritaire)

Une **fuite importante** génère trois informations obligatoires (si coordonnées et configuration renseignées) : **gestionnaire du syndic**, **président du conseil syndical de l'immeuble** et **gardien en service**. La notification du gardien est conditionnée à sa présence et à ses horaires ; si absent, hors service ou injoignable, activer le **relais/astreinte prédéfini** sans bloquer la procédure.

Séparer **notification**, **constat**, **décision** et **intervention** :
1. Le système signale immédiatement le risque et affiche les consignes de sécurité appropriées.
2. Les alertes pertinentes sont déclenchées en parallèle, sans attendre une réponse du gardien.
3. En journée, le gardien peut se déplacer pour un constat **sans danger et dans ses missions** ; il n'est pas requis pour autoriser le dépannage d'urgence.
4. Le gestionnaire supervise et décide selon ses pouvoirs ; le président est informé, mais une notification ne vaut ni consultation formelle ni autorisation de dépense.
5. Le prestataire d'urgence ou sous contrat est contacté dans les limites de la procédure validée ; aucune dépense n'est engagée par un moteur IA non habilité.
6. Tous les accusés de réception, actions, blocages et retours sont historisés. Absence de réponse => escalade paramétrée.

**Cas à vérifier** : fuite importante en heures ouvrées, absence gardien, nuit/week-end, gardien injoignable, danger électrique concomitant, résident ne répond pas, prestataire d'astreinte ne répond pas. La matrice fournit une conception et non une autorisation juridique ou technique.

## Références réglementaires
- https://www.service-public.gouv.fr/particuliers/vosdroits/F2608
- https://www.service-public.gouv.fr/particuliers/vosdroits/F2610
- https://www.service-public.gouv.fr/particuliers/vosdroits/F2606

**Suite :** tester ces circuits sur 10–20 cas fictifs auprès de gestionnaires et gardiens ; coder ensuite le moteur de procédure déterministe et l'interface de configuration.
