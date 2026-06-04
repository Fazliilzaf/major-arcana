(() => {
  'use strict';
  window.ArcanaJournalTpSchemaRegistry = Object.freeze({
  "hair_tp": {
    "schemaId": "tp_treatment:hair_tp",
    "formVariant": "hair_tp",
    "meridiqQuestionaryId": 16411,
    "title": "Journal | TP Behandling",
    "subtitle": "Meridiq mall 16411 · Hair TP Clinic",
    "sections": [
      {
        "title": "FÖRBEREDELSE & PLANERING INFÖR INGREPP",
        "fields": [
          {
            "key": "ingreppTypFaststalld",
            "label": "Är typ av ingrepp (metod och område) fastställd?",
            "type": "tristate",
            "meridiqQuestionId": 450884,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "metodFue",
            "label": "Ska metoden FUE (Follicular Unit Extraction) användas?",
            "type": "tristate",
            "meridiqQuestionId": 450885,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "metodDhi",
            "label": "Ska metoden DHI (Direct Hair Implantation) användas?",
            "type": "tristate",
            "meridiqQuestionId": 450886,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "metodKombination",
            "label": "Ska en kombination av metoderna DHI och FUE användas?",
            "type": "tristate",
            "meridiqQuestionId": 450887,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeVikar",
            "label": "Ska vikar behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450888,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeKrona",
            "label": "Ska kronan behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450889,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeFront",
            "label": "Ska fronten behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450890,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeHelaSkalpen",
            "label": "Ska hela skalpen behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450891,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeSkagg",
            "label": "Ska skäggområdet behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450892,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeOgonbryn",
            "label": "Ska ögonbrynen behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450893,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "omradeArr",
            "label": "Ska ärrvävnad behandlas vid detta ingrepp?",
            "type": "tristate",
            "meridiqQuestionId": 450894,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "ytterligareOmrade",
            "label": "Ska något ytterligare område behandlas vid detta ingrepp utöver det som redan angivits? Om ja, ange vilket:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450895,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "textKey": "ytterligareOmradeText"
          }
        ]
      },
      {
        "title": "PATIENTSTATUS & INFORMATION",
        "fields": [
          {
            "key": "giltigLegitimationVisad",
            "label": "Har patienten visat giltig legitimation?",
            "type": "tristate",
            "meridiqQuestionId": 450897,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "informeradRisker",
            "label": "Har patienten blivit informerad om risker och hur ingreppet kommer att genomföras?",
            "type": "tristate",
            "meridiqQuestionId": 450898,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "fulltFrisk",
            "label": "Är patienten fullt frisk? Om nej, ange sjukdomar",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450899,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "textKey": "fulltFriskText"
          },
          {
            "key": "alkoholNarkotika48h",
            "label": "Har patienten konsumerat alkohol eller narkotiska preparat de senaste 48 timmarna?",
            "type": "tristate",
            "meridiqQuestionId": 450900,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "aktuellaLakemedel",
            "label": "Använder patienten några läkemedel just nu, regelbundet eller vid behov? Om ja, vänligen ange läkemedlets namn, styrka (mg/ml), dosering och orsak:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450901,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "textKey": "aktuellaLakemedelText"
          },
          {
            "key": "ytterligareHalsoinfo",
            "label": "Finns det något ytterligare vi bör veta om patientens hälsa? Om ja, ange vad:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450902,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "textKey": "ytterligareHalsoinfoText"
          }
        ]
      },
      {
        "title": "STATUS & OBSERVATIONER FÖRE INGREPP",
        "fields": [
          {
            "key": "blodtryckMmHg",
            "label": "Vad var patientens blodtryck och puls vid mätningstillfället?",
            "type": "text",
            "meridiqQuestionId": 450904,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "vitalKlockslag",
            "label": "Vilket klockslag togs blodtrycket?",
            "type": "time",
            "meridiqQuestionId": 450905,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "allmannaAnteckningar",
            "label": "Allmänna anteckningar",
            "type": "text",
            "meridiqQuestionId": 450906,
            "meridiqType": "textbox",
            "required": false
          },
          {
            "key": "allmantillstandEfter",
            "label": "Status på patientens allmäntillstånd efter ingreppet? Normalt, medtagen, trött?",
            "type": "text",
            "meridiqQuestionId": 450907,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "reaktionLokalbedovning1",
            "label": "Hur reagerade patient på lokalbedövning 1? Normalt eller känslig?",
            "type": "text",
            "meridiqQuestionId": 450908,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "reaktionLokalbedovning2",
            "label": "Hur reagerade patient på lokalbedövning 2? Normalt eller känslig?",
            "type": "text",
            "meridiqQuestionId": 450909,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "obsLangreHarligne",
            "label": "Tog det längre tid än vanligt att rita hårlinjen?",
            "type": "tristate",
            "meridiqQuestionId": 450910,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "obsHelaHuvudetRakat",
            "label": "Har hela huvudet rakats inför ingreppet?",
            "type": "tristate",
            "meridiqQuestionId": 450911,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "obsDelarRakade",
            "label": "Har endast delar av huvudet rakats inför ingreppet?",
            "type": "tristate",
            "meridiqQuestionId": 450912,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "obsKansligAdrenalin",
            "label": "Reagerade patienten känsligt på adrenalin?",
            "type": "tristate",
            "meridiqQuestionId": 450913,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "obsOkadBlodning",
            "label": "Visade patienten ökad blödningsbenägenhet under ingreppet?",
            "type": "tristate",
            "meridiqQuestionId": 450914,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "obsSegHud",
            "label": "Var huden svårarbetad eller seg?",
            "type": "tristate",
            "meridiqQuestionId": 450915,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "ovrigaObservationer",
            "label": "Förekom andra relevanta observationer vid ingreppet? Om ja, ange vad",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450916,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "textKey": "ovrigaObservationerText"
          }
        ]
      },
      {
        "title": "LÄKEMEDEL",
        "fields": [
          {
            "key": "lakemedelDalacin",
            "label": "Har patienten fått Dalacin?",
            "type": "tristate",
            "meridiqQuestionId": 450918,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "lakemedelBetapred",
            "label": "Har patienten fått Betapred?",
            "type": "tristate",
            "meridiqQuestionId": 450919,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "lakemedelIbuprofen",
            "label": "Har patienten fått Ibuprofen?",
            "type": "tristate",
            "meridiqQuestionId": 450920,
            "meridiqType": "yes_no",
            "required": true
          },
          {
            "key": "informeradLakemedelEftervard",
            "label": "Har kund informerats om medicin och eftervård?",
            "type": "tristate",
            "meridiqQuestionId": 450921,
            "meridiqType": "yes_no",
            "required": true
          }
        ]
      },
      {
        "title": "GRAFTS SOM TRANSPLANTERATS",
        "fields": [
          {
            "key": "graftsSingel",
            "label": "Antal singel grafts som transplanterats:",
            "type": "text",
            "meridiqQuestionId": 450923,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "graftsDubbel",
            "label": "Antal dubbel grafts som transplanterats:",
            "type": "text",
            "meridiqQuestionId": 450924,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "graftsTrippel",
            "label": "Antal trippel grafts som transplanterats:",
            "type": "text",
            "meridiqQuestionId": 450925,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "graftsKvadrupel",
            "label": "Antal kvadrupel grafts som transplanterats:",
            "type": "text",
            "meridiqQuestionId": 450926,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "graftsTotalt",
            "label": "Totalt antal grafts som transplanterats:",
            "type": "text",
            "meridiqQuestionId": 450927,
            "meridiqType": "textbox",
            "required": true
          }
        ]
      },
      {
        "title": "TIDSREGISTRERING I PROCEDUREN",
        "fields": [
          {
            "key": "tidPlanering",
            "label": "Starttid för planering (bilder och ritning)",
            "type": "time",
            "meridiqQuestionId": 450929,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidLokalbedovningDonator",
            "label": "Starttid för lokalbedövning i donationsområde:",
            "type": "time",
            "meridiqQuestionId": 450930,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidExtraktionDonator",
            "label": "Starttid för extraktion från donationsområde:",
            "type": "time",
            "meridiqQuestionId": 450931,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidLokalbedovningMottagare",
            "label": "Starttid för lokalbedövning i mottagarområde:",
            "type": "time",
            "meridiqQuestionId": 450932,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidMottagarkanaler",
            "label": "Starttid för kanalpreparering i mottagarområde:",
            "type": "time",
            "meridiqQuestionId": 450933,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidImplantationStart",
            "label": "Starttid för implantation av grafts:",
            "type": "time",
            "meridiqQuestionId": 450934,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidImplantationSlut",
            "label": "Sluttid för implantation av grafts:",
            "type": "time",
            "meridiqQuestionId": 450935,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "tidPatientLamnar",
            "label": "Tidpunkt då patienten lämnar behandlingsrummet:",
            "type": "time",
            "meridiqQuestionId": 450936,
            "meridiqType": "textbox",
            "required": true
          }
        ]
      },
      {
        "title": "ANVÄNDNING AV LÄKEMEDEL",
        "fields": [
          {
            "key": "bedovningCarbocainMl",
            "label": "Användning av läkemedel - Carbokain adrenalin 20/mg/ml 5micro (ml):",
            "type": "text",
            "meridiqQuestionId": 450938,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "bedovningMarcainMl",
            "label": "Användning av läkemedel - Marcain, 5mg/ml (ml):",
            "type": "text",
            "meridiqQuestionId": 450939,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "bedovningAdrenalinMl",
            "label": "Användning av läkemedel - Adrenalin, 1mg/ml NaCI solution (ml):",
            "type": "text",
            "meridiqQuestionId": 450940,
            "meridiqType": "textbox",
            "required": true
          },
          {
            "key": "bedovningTribonatMl",
            "label": "Användning av läkemedel - Tribonat:",
            "type": "text",
            "meridiqQuestionId": 450941,
            "meridiqType": "textbox",
            "required": true
          }
        ]
      }
    ],
    "emptyDefaults": {
      "ingreppTypFaststalld": null,
      "metodFue": null,
      "metodDhi": null,
      "metodKombination": null,
      "omradeVikar": null,
      "omradeKrona": null,
      "omradeFront": null,
      "omradeHelaSkalpen": null,
      "omradeSkagg": null,
      "omradeOgonbryn": null,
      "omradeArr": null,
      "ytterligareOmrade": null,
      "ytterligareOmradeText": "",
      "giltigLegitimationVisad": null,
      "informeradRisker": null,
      "fulltFrisk": null,
      "fulltFriskText": "",
      "alkoholNarkotika48h": null,
      "aktuellaLakemedel": null,
      "aktuellaLakemedelText": "",
      "ytterligareHalsoinfo": null,
      "ytterligareHalsoinfoText": "",
      "blodtryckMmHg": "",
      "vitalKlockslag": "",
      "allmannaAnteckningar": "",
      "allmantillstandEfter": "",
      "reaktionLokalbedovning1": "",
      "reaktionLokalbedovning2": "",
      "obsLangreHarligne": null,
      "obsHelaHuvudetRakat": null,
      "obsDelarRakade": null,
      "obsKansligAdrenalin": null,
      "obsOkadBlodning": null,
      "obsSegHud": null,
      "ovrigaObservationer": null,
      "ovrigaObservationerText": "",
      "lakemedelDalacin": null,
      "lakemedelBetapred": null,
      "lakemedelIbuprofen": null,
      "informeradLakemedelEftervard": null,
      "graftsSingel": "",
      "graftsDubbel": "",
      "graftsTrippel": "",
      "graftsKvadrupel": "",
      "graftsTotalt": "",
      "tidPlanering": "",
      "tidLokalbedovningDonator": "",
      "tidExtraktionDonator": "",
      "tidLokalbedovningMottagare": "",
      "tidMottagarkanaler": "",
      "tidImplantationStart": "",
      "tidImplantationSlut": "",
      "tidPatientLamnar": "",
      "bedovningCarbocainMl": "",
      "bedovningMarcainMl": "",
      "bedovningAdrenalinMl": "",
      "bedovningTribonatMl": "",
      "metod": "",
      "behandlingsomraden": [],
      "observationerUnderIngrepp": [],
      "lakemedelUtlamnade": [],
      "puls": "",
      "slutanteckningar": ""
    }
  }
});
})();
