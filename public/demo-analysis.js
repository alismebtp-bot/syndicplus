/* SyndicPlus — assistant de qualification fictif.
   Moteur local à règles : ni modèle IA connecté ni diagnostic professionnel. */
(function(){
  'use strict';
  const highRisk = [
    {re:/\b(fumee|fumée|incendie|feu|flamme|brul[eé]|brûl[eé])\b/i, reason:'Fumée, incendie ou brûlure signalés'},
    {re:/\b(electrocut|électrocut|etincelle|étincelle|tableau electrique|tableau électrique)\b/i,reason:'Risque électrique possible'},
    {re:/\b(coinc[eé]|bloqu[eé].*ascenseur|ascenseur.*bloqu[eé])\b/i,reason:'Personne potentiellement bloquée'},
    {re:/\b(gaz|odeur de gaz)\b/i,reason:'Risque lié au gaz'},
    {re:/\b(inondation|eau.*prise|eau.*electri|eau.*électri)\b/i,reason:'Dégât des eaux potentiellement dangereux'}
  ];
  const contexts = [
    {re:/\b(fuite|eau|canalisation|plomberie)\b/i,category:'Plomberie'},
    {re:/\b(chauffage|radiateur|chaudi[eè]re)\b/i,category:'Chauffage'},
    {re:/\b(ampoule|luminaire|éclairage|eclairage|lumi[eè]re)\b/i,category:'Éclairage'},
    {re:/\b(ascenseur|monte.charges)\b/i,category:'Ascenseur'}
  ];
  function evaluate(type,location,description){
    const text=[type,location,description].join(' ');
    const hazards=highRisk.filter(x=>x.re.test(text)).map(x=>x.reason);
    const inferred=contexts.find(x=>x.re.test(text));
    const category=inferred?.category||type||'Autre';
    const missing=[];
    if(!/(\d+(er|e|ème|eme)?\s*(étage|etage)|palier|hall|local|couloir|appartement|bâtiment|batiment)/i.test(location))missing.push('Préciser la zone exacte de l’immeuble');
    if(description.trim().length<25)missing.push('Ajouter des détails sur la panne');
    if(!/\b(depuis|hier|aujourd|heure|jour|semaine|mois)\b/i.test(description))missing.push('Préciser depuis quand le problème existe');
    const risk=hazards.length>0;
    return {
      category,
      priority:risk?'Danger potentiel — examen immédiat':'À qualifier',
      reasons:hazards,
      missing,
      nextAction:risk?'Appliquer la procédure d’urgence et prévenir immédiatement un humain compétent. En cas de danger immédiat, appeler les secours appropriés.':'Vérifier les informations et envisager la prise en charge par le prestataire habituel.',
      engine:'Règles locales — démonstration, sans modèle IA'
    };
  }
  function addText(parent,tag,text){const e=document.createElement(tag);e.textContent=text;parent.append(e);return e;}
  function display(card,d){
    const a=d.analysis||evaluate(d.type,d.location,d.description);
    const panel=document.createElement('div');panel.className='note';panel.dataset.analysis='true';
    addText(panel,'strong','Analyse proposée (simulation)');
    addText(panel,'p','Catégorie : '+a.category+' · Priorité : '+a.priority);
    addText(panel,'p','Prochaine action : '+a.nextAction);
    if(a.reasons.length)addText(panel,'p','Signaux à vérifier : '+a.reasons.join('; '));
    if(a.missing.length)addText(panel,'p','Informations à compléter : '+a.missing.join('; '));
    addText(panel,'small',a.engine);
    card.append(panel);
  }
  window.syndicDemoAnalysis={evaluate,display};
})();