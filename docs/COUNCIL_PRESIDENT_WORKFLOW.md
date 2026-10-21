# Rôle opérationnel du président du conseil syndical — extension V2

## Principe
Le président peut être un **coordinateur de consultation et de suivi**, pas seulement destinataire de notifications. Ses actions dans SyndicPlus doivent être définies par la politique de la copropriété et différenciées des actes d'engagement juridique.

## Capacités UI
- Voir les dossiers collectifs où le conseil syndical est associé.
- Contacter les prestataires / transmettre une demande de devis lorsque la procédure du cabinet l'autorise.
- Préparer une visite sur site, partager les informations nécessaires et enregistrer les échanges.
- Recevoir, centraliser et comparer plusieurs devis (prix HT/TTC, portée, exclusions, garanties, délai, conditions).
- Émettre un avis, demander un complément ou proposer une option.
- Suivre le planning et les comptes rendus des travaux.
- Confirmer la bonne exécution apparente ou signaler des réserves, sans confondre avec réception juridique.
- Voir l'historique et préparer une synthèse pour le conseil syndical et le syndic.

## Circuits par parcours
- P1 : information exceptionnelle si répétition/impact ; pas de sollicitation automatique.
- P2 : suivi des contrats et pannes collectives lorsque utile.
- P3 : collecte des devis et avis du conseil ; décision/commande par personne habilitée.
- P4 : suivi des dommages collectifs et échanges autorisés, traitement assurance relevant de l'acteur compétent.
- P5 : information d'urgence en parallèle du syndic et du gardien en service ; aucun délai de sécurité.
- P6 : rôle central dans la préparation, consultation, comparaison, suivi et réserves, avec respect des décisions d'AG.

## Distinction de permissions
1. `request_quote` : solliciter une proposition commerciale sans engager la copropriété.
2. `receive_quote` : enregistrer la proposition et ses pièces.
3. `compare_and_recommend` : analyser et formuler un avis sans attribution du marché.
4. `consult_council` : demander les avis/mises en concurrence selon les seuils votés.
5. `authorize_expenditure` : action à part, interdite par défaut ; autorisation seulement avec délégation et procédure légales vérifiées, jamais du fait de la simple fonction de président.
6. `issue_purchase_order` : réservé aux représentants/mandataires effectivement habilités.
7. `confirm_apparent_completion` : constater la bonne exécution apparente et les réserves, sans réception juridique automatique.

## Garde-fous
- Historiser provenance, rôle, montant, justificatif de délégation, auteur et validation.
- Ne pas assimiler avis du président à une décision collective du conseil. Certaines délégations exigent un vote du conseil.
- Ne pas assimiler collecte de devis à commande de travaux.
- Ne pas imposer le président à tous les dossiers, mais l'inclure dans P3/P6 lorsque désigné.
- Informer le syndic des décisions et demandes qui requièrent son intervention.
- Prévoir les absences et remplaçants désignés.

## Références à vérifier pour chaque organisation
- Conseil syndical et délégations : https://www.service-public.gouv.fr/particuliers/vosdroits/F2610
- Décision de travaux, marchés et mise en concurrence : https://www.anil.org/votre-besoin/gerer-un-bien/copropriete/travaux-de-la-prise-de-decision-a-la-realisation/
