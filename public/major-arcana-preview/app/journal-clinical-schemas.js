(() => {
  'use strict';
  window.ArcanaJournalClinicalSchemaRegistry = Object.freeze({
  "fitness_certificate": {
    "curatiio_bleph": {
      "schemaId": "fitness_certificate:curatiio_bleph",
      "formVariant": "curatiio_bleph",
      "meridiqQuestionaryId": 16389,
      "title": "Friskförsäkran | Ögonlocksplastik",
      "subtitle": "Meridiq mall 16389 · Curatiio",
      "sections": [
        {
          "title": "Friskförsäkran | Ögonlocksplastik",
          "fields": [
            {
              "key": "fornamn_och_efternman",
              "label": "Förnamn och efternman",
              "type": "text",
              "meridiqQuestionId": 450382,
              "meridiqType": "input",
              "required": true,
              "options": null
            },
            {
              "key": "personnummer",
              "label": "Personnummer",
              "type": "text",
              "meridiqQuestionId": 450384,
              "meridiqType": "input",
              "required": true,
              "options": null
            },
            {
              "key": "datum",
              "label": "Datum",
              "type": "text",
              "meridiqQuestionId": 450385,
              "meridiqType": "input",
              "required": true,
              "options": null
            },
            {
              "key": "jag_intygar_harmed_att",
              "label": "Jag intygar härmed att:",
              "type": "checkboxes",
              "meridiqQuestionId": 450386,
              "meridiqType": "checkbox",
              "required": false,
              "options": [
                "Jag känner mig frisk idag och har inga pågående sjukdomssymtom såsom feber, infektion, halsont, hosta, pågående virusinfektion eller annan akut sjukdom.",
                "Jag har inte haft feber, infektion eller annan sjukdom de senaste 14 dagarna som kan påverka ingreppet.",
                "Jag har inte nyligen genomgått någon annan operation eller medicinsk behandling som kan påverka dagens ingrepp, eller",
                "Om ja, jag har informerat behandlande personal om detta.",
                "Jag har uppgett samtliga kända sjukdomar, diagnoser eller medicinska tillstånd som kan vara relevanta för ingreppet, inklusive men inte begränsat till:  hjärt- och kärlsjukdom  blödningsrubbningar  diabetes  neurologiska sjukdomar  autoimmuna sjukdomar  psykisk ohälsa som kan påverka behandlingen",
                "Jag har informerat om alla läkemedel, kosttillskott och naturpreparat jag använder eller nyligen har använt, inklusive blodförtunnande läkemedel (t.ex. Waran, Eliquis, Trombyl), NSAID eller liknande.",
                "Jag har uppgett kända allergier eller överkänslighet mot läkemedel, bedövningsmedel, tejp, latex eller andra relevanta ämnen.",
                "Jag är inte gravid och ammar inte, alternativt har informerat behandlande personal om detta."
              ]
            },
            {
              "key": "jag_bekraftar_att_ovanstaende_uppgifter_ar_fulls",
              "label": "Jag bekräftar att ovanstående uppgifter är fullständiga, korrekta och aktuella per dagens datum.  Jag är medveten om att ofullständiga eller felaktiga uppgifter kan innebära en ökad medicinsk risk och kan medföra att planerat ingrepp behöver skjutas upp eller avbrytas.  Jag samtycker till att Curatiio, utifrån lämnade uppgifter och medicinsk bedömning, avgör om ingreppet kan genomföras på ett säkert sätt.",
              "type": "tristate",
              "meridiqQuestionId": 450387,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "genom_digital_signering_bekraftar_jag_att_ovanst",
              "label": "Genom digital signering bekräftar jag att ovanstående uppgifter är korrekta och aktuella per operationsdagen.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450388,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            }
          ]
        }
      ],
      "emptyDefaults": {
        "fornamn_och_efternman": "",
        "personnummer": "",
        "datum": "",
        "jag_intygar_harmed_att": [],
        "jag_bekraftar_att_ovanstaende_uppgifter_ar_fulls": null,
        "genom_digital_signering_bekraftar_jag_att_ovanst": null,
        "genom_digital_signering_bekraftar_jag_att_ovanstText": ""
      }
    },
    "hair_tp": {
      "schemaId": "fitness_certificate:hair_tp",
      "formVariant": "hair_tp",
      "meridiqQuestionaryId": 16413,
      "title": "Friskförsäkran | TP",
      "subtitle": "Meridiq mall 16413 · Hair TP Clinic",
      "sections": [
        {
          "title": "Friskförsäkran | TP",
          "fields": [
            {
              "key": "jag_har_visat_foljande_giltiga_id_handling_for_k",
              "label": "Jag har visat följande giltiga ID-handling för klinikens personal:",
              "type": "text",
              "meridiqQuestionId": 450966,
              "meridiqType": "select",
              "required": true,
              "options": [
                "Pass",
                "Nationellt ID-kort (utfärdat av Polisen)",
                "Svenskt körkort (utfärdat av Transportstyrelsen)",
                "Svenskt ID-kort (utfärdat av Skatteverket)"
              ]
            },
            {
              "key": "ange_id_nummer",
              "label": "Ange ID-nummer",
              "type": "text",
              "meridiqQuestionId": 450967,
              "meridiqType": "input",
              "required": true,
              "options": null
            },
            {
              "key": "har_du_nagot_av_foljande_sjukdomstillstand_du_ka",
              "label": "Har du något av följande sjukdomstillstånd? Du kan markera flera alternativ.",
              "type": "checkboxes",
              "meridiqQuestionId": 450968,
              "meridiqType": "checkbox",
              "required": true,
              "options": [
                "Blödningsrubbning",
                "Hjärt- eller kärlsjukdom",
                "Diabetes (typ 1 eller typ 2)",
                "Lever- eller njursjukdom",
                "Astma",
                "Epilepsi",
                "Hepatit (A, B eller C)",
                "HIV",
                "Psykisk ohälsa",
                "Pågående infektion eller feber",
                "Jag har inga av ovanstående sjukdomar eller tillstånd."
              ]
            },
            {
              "key": "har_du_nagon_annan_sjukdom_eller_nagot_annat_med",
              "label": "Har du någon annan sjukdom eller något annat medicinskt tillstånd som inte nämnts ovan?  Om ja, beskriv vilket/vilka.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450969,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "upplever_du_att_du_sa_vitt_du_vet_ar_vid_god_hal",
              "label": "Upplever du att du, så vitt du vet, är vid god hälsa och saknar sjukdomar eller tillstånd som kan innebära ökade risker vid behandlingen?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450970,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "tar_du_for_narvarande_eller_har_du_under_de_sena",
              "label": "Tar du för närvarande, eller har du under de senaste 6 månaderna tagit, blodförtunnande läkemedel (t.ex. Warfarin, NOAK eller ASA)? Om ja, ange vilket/vilka:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450971,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "tar_du_for_narvarande_eller_har_du_under_de_sena",
              "label": "Tar du för närvarande, eller har du under de senaste 6 månaderna tagit, några läkemedel? Om ja, ange läkemedlets namn, dosering och orsak:",
              "type": "tristate",
              "meridiqQuestionId": 450972,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "har_du_nagra_kanda_allergier_till_exempel_mot_la",
              "label": "Har du några kända allergier, till exempel mot latex, desinfektionsmedel eller födoämnen? Om ja ange vad/vilka eller läkemedlets namn",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450973,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "har_du_nagra_kanda_allergier_mot_lakemedel_ex_an",
              "label": "Har du några kända allergier mot läkemedel ex antibiotika eller lokalbedövning? Om ja ange vad/vilka eller läkemedlets namn",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450974,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "har_du_tidigare_fatt_komplikation_vid_narkos_ell",
              "label": "Har du tidigare fått komplikation vid narkos eller lokalbedövning?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450975,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "anvander_du_tobak_eller_nikotinprodukter_t_ex_ci",
              "label": "Använder du tobak- eller nikotinprodukter (t.ex. cigaretter, snus, vape)?",
              "type": "tristate",
              "meridiqQuestionId": 451843,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "har_du_intagit_alkohol_eller_narkotiska_preparat",
              "label": "Har du intagit alkohol eller narkotiska preparat under de senaste 48 timmarna före behandlingen?",
              "type": "tristate",
              "meridiqQuestionId": 451844,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "jag_intygar_att",
              "label": "Jag intygar att",
              "type": "checkboxes",
              "meridiqQuestionId": 451845,
              "meridiqType": "checkbox",
              "required": true,
              "options": [
                "Jag intygar att jag, såvitt jag vet, är vid god hälsa och inte har undanhållit någon sjukdom, något tillstånd eller annan information som kan vara av betydelse inför behandlingen.",
                "Jag intygar att jag har uppgett samtliga läkemedel, både receptbelagda och receptfria, som jag tar eller har tagit under de senaste 6 månaderna.",
                "Jag intygar att jag inte har intagit alkohol eller narkotiska preparat under de senaste 48 timmarna före behandlingen och att jag avstår från detta i minst 48 timmar efter ingreppet.",
                "Jag är medveten om att rökning och användning av tobak eller nikotin kan påverka behandlingsresultatet negativt och öka risken för att transplanterade hårsäckar inte överlever. Jag förstår att Hair TP Clinic därför inte kan lämna några resultatgarantier för patienter som använder tobak eller nikotin.",
                "Jag har tagit del av muntlig och skriftlig information om behandlingen, dess syfte, risker, möjliga alternativ och eftervård.",
                "Jag har haft möjlighet att ställa frågor och fått dessa besvarade.",
                "Jag lämnar härmed mitt informerade samtycke till behandlingen.",
                "Jag intygar att ovanstående uppgifter är korrekta och fullständiga.",
                "Jag godkänner denna friskförsäkran."
              ]
            }
          ]
        }
      ],
      "emptyDefaults": {
        "jag_har_visat_foljande_giltiga_id_handling_for_k": "",
        "ange_id_nummer": "",
        "har_du_nagot_av_foljande_sjukdomstillstand_du_ka": [],
        "har_du_nagon_annan_sjukdom_eller_nagot_annat_med": null,
        "har_du_nagon_annan_sjukdom_eller_nagot_annat_medText": "",
        "upplever_du_att_du_sa_vitt_du_vet_ar_vid_god_hal": null,
        "upplever_du_att_du_sa_vitt_du_vet_ar_vid_god_halText": "",
        "tar_du_for_narvarande_eller_har_du_under_de_sena": null,
        "tar_du_for_narvarande_eller_har_du_under_de_senaText": "",
        "har_du_nagra_kanda_allergier_till_exempel_mot_la": null,
        "har_du_nagra_kanda_allergier_till_exempel_mot_laText": "",
        "har_du_nagra_kanda_allergier_mot_lakemedel_ex_an": null,
        "har_du_nagra_kanda_allergier_mot_lakemedel_ex_anText": "",
        "har_du_tidigare_fatt_komplikation_vid_narkos_ell": null,
        "har_du_tidigare_fatt_komplikation_vid_narkos_ellText": "",
        "anvander_du_tobak_eller_nikotinprodukter_t_ex_ci": null,
        "har_du_intagit_alkohol_eller_narkotiska_preparat": null,
        "jag_intygar_att": []
      }
    }
  },
  "health_declaration": {
    "curatiio_bleph": {
      "schemaId": "health_declaration:curatiio_bleph",
      "formVariant": "curatiio_bleph",
      "meridiqQuestionaryId": 16415,
      "title": "Hälsodeklaration | Ögonlocksplastik",
      "subtitle": "Meridiq mall 16415 · Curatiio",
      "sections": [
        {
          "title": "Hälsodeklaration | Ögonlocksplastik",
          "fields": [
            {
              "key": "kannerSigFrisk",
              "label": "Känner du dig generellt vid god hälsa?",
              "type": "tristate",
              "meridiqQuestionId": 450986,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "rokerNikotin",
              "label": "Använder du tobak- eller nikotinprodukter (t.ex. cigaretter, snus, vape)?",
              "type": "tristate",
              "meridiqQuestionId": 450987,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "gravidAmmar",
              "label": "Är du gravid eller ammar?",
              "type": "tristate",
              "meridiqQuestionId": 450988,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "sjukSenaste3Manader",
              "label": "Har du varit sjuk de senaste 3 månaderna? Om ja, ange vad.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450989,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "sjukSenaste3ManaderText"
            },
            {
              "key": "lakemedelNu",
              "label": "Tar du några läkemedel för närvarande? Om ja, ange läkemedlets namn, styrka och dos",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450990,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "lakemedelNuText"
            },
            {
              "key": "blodningsrisk",
              "label": "Har du någon sjukdom eller tar du läkemedel som ger ökad blödningsrisk? Om ja, ange vad.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450991,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "blodningsriskText"
            },
            {
              "key": "kosttillskott",
              "label": "Använder du kosttillskott/naturläkemedel (t.ex. omega-3, fiskolja, ginkgo)? Om ja, ange vilka.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450992,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "kosttillskottText"
            },
            {
              "key": "allergiAstma",
              "label": "Har du någon allergi eller astma? Om ja, ange vilka.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450993,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "allergiAstmaText"
            },
            {
              "key": "allergiAntibiotikaLokalbedovning",
              "label": "Har du kända allergier eller överkänslighet mot antibiotika eller lokalbedövning? Om ja, ange läkemedlets namn.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450994,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "allergiAntibiotikaLokalbedovningText"
            },
            {
              "key": "hjalpmedelForflyttning",
              "label": "Använder du något hjälpmedel för förflyttning, såsom rullstol eller liknande? Om ja, vänligen kontakta kliniken i god tid före besöket.",
              "type": "tristate",
              "meridiqQuestionId": 450995,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "ovrigtHalsa",
              "label": "Finns det något övrigt du anser vi bör känna till om din hälsa? Om ja, förklara.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450996,
              "meridiqType": "yes_no",
              "required": true,
              "textKey": "ovrigtHalsaText"
            },
            {
              "key": "intygarKorrektaUppgifter",
              "label": "Jag bekräftar att jag har besvarat frågorna så korrekt som möjligt.",
              "type": "tristate",
              "meridiqQuestionId": 450997,
              "meridiqType": "yes_no",
              "required": true
            }
          ]
        }
      ],
      "emptyDefaults": {
        "kannerSigFrisk": null,
        "rokerNikotin": null,
        "gravidAmmar": null,
        "sjukSenaste3Manader": null,
        "sjukSenaste3ManaderText": "",
        "lakemedelNu": null,
        "lakemedelNuText": "",
        "blodningsrisk": null,
        "blodningsriskText": "",
        "kosttillskott": null,
        "kosttillskottText": "",
        "allergiAstma": null,
        "allergiAstmaText": "",
        "allergiAntibiotikaLokalbedovning": null,
        "allergiAntibiotikaLokalbedovningText": "",
        "hjalpmedelForflyttning": null,
        "ovrigtHalsa": null,
        "ovrigtHalsaText": "",
        "intygarKorrektaUppgifter": null
      }
    },
    "curatiio_injection": {
      "schemaId": "health_declaration:curatiio_injection",
      "formVariant": "curatiio_injection",
      "meridiqQuestionaryId": 16472,
      "title": "Hälsodeklaration | Estetiska injektionsbehandlingar",
      "subtitle": "Meridiq mall 16472 · Curatiio",
      "sections": [
        {
          "title": "Hälsodeklaration | Estetiska injektionsbehandlingar",
          "fields": [
            {
              "key": "gravidAmmar",
              "label": "Är du gravid eller ammar? ☐ Ja ☐ Nej",
              "type": "tristate",
              "meridiqQuestionId": 452478,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "kandaTillstand",
              "label": "Markera om du har eller har haft något av följande. (Du kan markera flera alternativ)",
              "type": "checkboxes",
              "options": [
                "Pågående infektion (t.ex. feber, herpes, hudinfektion)",
                "Autoimmun sjukdom",
                "Neurologisk sjukdom (t.ex. MS, myastenia gravis)",
                "Sväljsvårigheter",
                "Blödningsrubbning eller lätt att få blåmärken",
                "Diabetes",
                "Epilepsi",
                "Hjärt- eller kärlsjukdom",
                "Aktiv akne, eksem, utslag eller sår i området som ska behandlas",
                "Ärr, tidigare operationer eller implantat i området",
                "Herpesutbrott i ansiktet tidigare",
                "Inget av ovanstående"
              ],
              "meridiqQuestionId": 452479,
              "meridiqType": "checkbox",
              "required": true
            },
            {
              "key": "allergier",
              "label": "Har du allergier (läkemedel, latex, lokalbedövning m.m.)? Om ja, vänligen specificera typ av allergi och reaktion",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 452499,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "allergierText"
            },
            {
              "key": "blodfortunnande",
              "label": "Använder du blodförtunnande läkemedel (t.ex. Waran, Eliquis, Trombyl)? Om ja, vänligen ange läkemedel och dosering",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 452500,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "blodfortunnandeText"
            },
            {
              "key": "receptbelagdaLakemedel",
              "label": "Använder du receptbelagda läkemedel regelbundet? Om ja, vänligen ange läkemedel och dosering",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 452501,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "receptbelagdaLakemedelText"
            },
            {
              "key": "kosttillskottNaturlakemedel",
              "label": "Använder du kosttillskott/naturläkemedel (t.ex. omega-3, ginkgo, vitlök)?",
              "type": "tristate",
              "meridiqQuestionId": 452502,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "tidigareInjektionsbehandlingar",
              "label": "Har du tidigare behandlats med fillers, profilho, botulinumtoxin (Botox/Dysport/Vistabel) eller andra injektionsbehandlingar?",
              "type": "tristate",
              "meridiqQuestionId": 452503,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "tidigareKomplikationer",
              "label": "Har du haft komplikationer eller varit missnöjd vid tidigare behandlingar?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 452504,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "tidigareKomplikationerText"
            },
            {
              "key": "intygarKorrektaUppgifter",
              "label": "Jag intygar att jag har lämnat korrekta och fullständiga uppgifter om min hälsa.",
              "type": "tristate",
              "meridiqQuestionId": 452505,
              "meridiqType": "yes_no",
              "required": true
            }
          ]
        }
      ],
      "emptyDefaults": {
        "gravidAmmar": null,
        "kandaTillstand": [],
        "allergier": null,
        "allergierText": "",
        "blodfortunnande": null,
        "blodfortunnandeText": "",
        "receptbelagdaLakemedel": null,
        "receptbelagdaLakemedelText": "",
        "kosttillskottNaturlakemedel": null,
        "tidigareInjektionsbehandlingar": null,
        "tidigareKomplikationer": null,
        "tidigareKomplikationerText": "",
        "intygarKorrektaUppgifter": null
      }
    },
    "curatiio_ortho": {
      "schemaId": "health_declaration:curatiio_ortho",
      "formVariant": "curatiio_ortho",
      "meridiqQuestionaryId": 14878,
      "title": "Hälsodeklaration | Ortopediska injektionsbehandlingar",
      "subtitle": "Meridiq mall 14878 · Curatiio",
      "sections": [
        {
          "title": "Hälsodeklaration | Ortopediska injektionsbehandlingar",
          "fields": [
            {
              "key": "langdCm",
              "label": "Ange din längd (cm):",
              "type": "text",
              "meridiqQuestionId": 411402,
              "meridiqType": "textbox",
              "required": true
            },
            {
              "key": "viktKg",
              "label": "Ange din vikt (kg):",
              "type": "text",
              "meridiqQuestionId": 411403,
              "meridiqType": "textbox",
              "required": true
            },
            {
              "key": "kannerSigFrisk",
              "label": "Känner du dig frisk?",
              "type": "tristate",
              "meridiqQuestionId": 411404,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "sjukSenaste3Manader",
              "label": "Har du varit sjuk de senaste tre månaderna? Om ja, ange vad",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411405,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "sjukSenaste3ManaderText"
            },
            {
              "key": "gravidAmmar",
              "label": "Är du gravid eller ammar du?",
              "type": "tristate",
              "meridiqQuestionId": 411413,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "lakemedelNu",
              "label": "Tar du några läkemedel just nu, regelbundet eller vid behov? Om ja, vänligen ange läkemedlets namn, styrka (mg/ml) och dosering:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411406,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "lakemedelNuText"
            },
            {
              "key": "blodningsrisk",
              "label": "Har du någon sjukdom eller tar du läkemedel som kan öka blödningsrisken? Om ja, ange vad:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411407,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "blodningsriskText"
            },
            {
              "key": "allergiAstma",
              "label": "Har du någon allergi eller astma? Om ja, ange vilka:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411409,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "allergiAstmaText"
            },
            {
              "key": "vaccinationNyligen",
              "label": "Har du nyligen fått någon vaccination? Om ja, ange vilken och när:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411415,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "vaccinationNyligenText"
            },
            {
              "key": "operationSenasteAret",
              "label": "Har du genomgått en operation eller ett medicinskt ingrepp det senaste året? Om ja, ange diagnos, datum och typ av ingrepp",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411414,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "operationSenasteAretText"
            },
            {
              "key": "kosttillskott",
              "label": "Tar du omega 3, fiskolja eller andra kosttillskott? Om ja, ange vilka:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411408,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "kosttillskottText"
            },
            {
              "key": "rokerNikotin",
              "label": "Röker du?",
              "type": "tristate",
              "meridiqQuestionId": 411410,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "ovrigtHalsa",
              "label": "Finns det något övrigt du anser att vi bör känna till om din hälsa? Om ja, förklara:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 411412,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "ovrigtHalsaText"
            },
            {
              "key": "hjalpmedelForflyttning",
              "label": "Har du behov av anpassning vid förflyttning i samband med ditt besök, såsom rullstol, gånghjälpmedel eller annat praktiskt stöd? Om ja, vänligen kontakta oss i god tid så vi kan förbereda mottagandet på bästa sätt.",
              "type": "tristate",
              "meridiqQuestionId": 411411,
              "meridiqType": "yes_no",
              "required": true
            }
          ]
        }
      ],
      "emptyDefaults": {
        "langdCm": "",
        "viktKg": "",
        "kannerSigFrisk": null,
        "sjukSenaste3Manader": null,
        "sjukSenaste3ManaderText": "",
        "gravidAmmar": null,
        "lakemedelNu": null,
        "lakemedelNuText": "",
        "blodningsrisk": null,
        "blodningsriskText": "",
        "allergiAstma": null,
        "allergiAstmaText": "",
        "vaccinationNyligen": null,
        "vaccinationNyligenText": "",
        "operationSenasteAret": null,
        "operationSenasteAretText": "",
        "kosttillskott": null,
        "kosttillskottText": "",
        "rokerNikotin": null,
        "ovrigtHalsa": null,
        "ovrigtHalsaText": "",
        "hjalpmedelForflyttning": null
      }
    },
    "eng": {
      "schemaId": "health_declaration:eng",
      "formVariant": "eng",
      "meridiqQuestionaryId": 14865,
      "title": "ENG | Health Questionnaire",
      "subtitle": "Meridiq mall 14865 · Both",
      "sections": [
        {
          "title": "ENG | Health Questionnaire",
          "fields": [
            {
              "key": "do_you_suffer_from_any_allergies",
              "label": "Do you suffer from any allergies?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408040,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_an_autoimmune_disease_or_a_disease_t",
              "label": "Do you have an autoimmune disease or a disease that has affected the immune system?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408049,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_diabetes",
              "label": "Do you have diabetes?",
              "type": "tristate",
              "meridiqQuestionId": 408050,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_any_haemophilia",
              "label": "Do you have any haemophilia?",
              "type": "tristate",
              "meridiqQuestionId": 408051,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_acute_rheumatoid_arthritis_or",
              "label": "Do you suffer from acute rheumatoid arthritis or recurrent sore throat?",
              "type": "tristate",
              "meridiqQuestionId": 408052,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_amyotrophic_sclerosis_als_or_",
              "label": "Do you suffer from amyotrophic sclerosis (ALS) or peripheral neuromuscular disorder (nerve disease)?",
              "type": "tristate",
              "meridiqQuestionId": 408053,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_myasthenia_gravis_or_eaton_la",
              "label": "Do you suffer from myasthenia gravis or Eaton-Lambert syndrome (muscle disease)?",
              "type": "tristate",
              "meridiqQuestionId": 408054,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_untreated_epilepsy",
              "label": "Do you suffer from untreated epilepsy?",
              "type": "tristate",
              "meridiqQuestionId": 408055,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_a_tendency_to_develop_large_scars_ke",
              "label": "Do you have a tendency to develop large scars (keloids)?",
              "type": "tristate",
              "meridiqQuestionId": 408056,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_had_any_skin_cancer_before",
              "label": "Have you had any skin cancer before?",
              "type": "tristate",
              "meridiqQuestionId": 408057,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_porphyria_hereditary_disease",
              "label": "Do you suffer from porphyria (hereditary disease)?",
              "type": "tristate",
              "meridiqQuestionId": 408058,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_use_tobacco",
              "label": "Do you use tobacco?",
              "type": "tristate",
              "meridiqQuestionId": 408041,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_suffer_from_abnormal_palpitations_or_othe",
              "label": "Do you suffer from abnormal palpitations or other heart disease?",
              "type": "tristate",
              "meridiqQuestionId": 408059,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_been_to_or_are_you_planning_a_dental_vi",
              "label": "Have you been to or are you planning a dental visit soon? (2 weeks before / 2 weeks after)",
              "type": "tristate",
              "meridiqQuestionId": 408060,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_previously_received_any_aesthetic_treat",
              "label": "Have you previously received any aesthetic treatments (eg laser, peeling, dermabrasion, microneedling, IPL, Chemical Peeling, PRP, etc.)?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408061,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_previously_received_injectable_treatmen",
              "label": "Have you previously received injectable treatments, thread lift or undergone facial surgery of any kind?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408062,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "did_you_experience_any_side_effects_related_to_t",
              "label": "Did you experience any side effects related to the treatment?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408063,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_any_skin_infection_or_inflammatory_s",
              "label": "Do you have any skin infection or inflammatory skin problems (eg herpes, acne, rosacea, etc.)?",
              "type": "tristate",
              "meridiqQuestionId": 408064,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_tattoos_or_permanent_makeup_in_the_t",
              "label": "Do you have tattoos or permanent makeup in the treatment area?",
              "type": "tristate",
              "meridiqQuestionId": 408065,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_tanned_skin_now",
              "label": "Do you have tanned skin now?",
              "type": "tristate",
              "meridiqQuestionId": 408066,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_melasma_or_chloasma_pigmentation",
              "label": "Do you have Melasma or Chloasma (pigmentation)?",
              "type": "tristate",
              "meridiqQuestionId": 408067,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "other_comments_about_your_health",
              "label": "Other comments about your health",
              "type": "text",
              "meridiqQuestionId": 408068,
              "meridiqType": "textbox",
              "required": true,
              "options": null
            },
            {
              "key": "are_you_pregnant_breastfeeding_or_trying_to_conc",
              "label": "Are you pregnant, breastfeeding or trying to conceive?",
              "type": "tristate",
              "meridiqQuestionId": 408042,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "are_you_currently_receiving_any_medical_treatmen",
              "label": "Are you currently receiving any medical treatment?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408043,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "are_you_currently_taking_steroids_acetylsalicyli",
              "label": "Are you currently taking steroids, acetylsalicylic acid (eg Treo or Aspirin) or any anticoagulant (eg Warfarin)?",
              "type": "tristate",
              "meridiqQuestionId": 408044,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_recently_used_any_glycolic_acid_or_reti",
              "label": "Have you recently used any glycolic acid or retinoids (such as isotretinoin or tretinoin)?",
              "type": "tristate",
              "meridiqQuestionId": 408045,
              "meridiqType": "yes_no",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_an_ongoing_infection_in_your_body_or",
              "label": "Do you have an ongoing infection in your body or have you taken antibiotics in the last four weeks?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408046,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "do_you_have_an_ongoing_illness_that_is_physical_",
              "label": "Do you have an ongoing illness that is physical or mental?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408047,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            },
            {
              "key": "have_you_had_problems_with_anxiety_depression_or",
              "label": "Have you had problems with anxiety, depression, or other mental disorders?",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 408048,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "options": null
            }
          ]
        }
      ],
      "emptyDefaults": {
        "do_you_suffer_from_any_allergies": null,
        "do_you_suffer_from_any_allergiesText": "",
        "do_you_have_an_autoimmune_disease_or_a_disease_t": null,
        "do_you_have_an_autoimmune_disease_or_a_disease_tText": "",
        "do_you_have_diabetes": null,
        "do_you_have_any_haemophilia": null,
        "do_you_suffer_from_acute_rheumatoid_arthritis_or": null,
        "do_you_suffer_from_amyotrophic_sclerosis_als_or_": null,
        "do_you_suffer_from_myasthenia_gravis_or_eaton_la": null,
        "do_you_suffer_from_untreated_epilepsy": null,
        "do_you_have_a_tendency_to_develop_large_scars_ke": null,
        "have_you_had_any_skin_cancer_before": null,
        "do_you_suffer_from_porphyria_hereditary_disease": null,
        "do_you_use_tobacco": null,
        "do_you_suffer_from_abnormal_palpitations_or_othe": null,
        "have_you_been_to_or_are_you_planning_a_dental_vi": null,
        "have_you_previously_received_any_aesthetic_treat": null,
        "have_you_previously_received_any_aesthetic_treatText": "",
        "have_you_previously_received_injectable_treatmen": null,
        "have_you_previously_received_injectable_treatmenText": "",
        "did_you_experience_any_side_effects_related_to_t": null,
        "did_you_experience_any_side_effects_related_to_tText": "",
        "do_you_have_any_skin_infection_or_inflammatory_s": null,
        "do_you_have_tattoos_or_permanent_makeup_in_the_t": null,
        "do_you_have_tanned_skin_now": null,
        "do_you_have_melasma_or_chloasma_pigmentation": null,
        "other_comments_about_your_health": "",
        "are_you_pregnant_breastfeeding_or_trying_to_conc": null,
        "are_you_currently_receiving_any_medical_treatmen": null,
        "are_you_currently_receiving_any_medical_treatmenText": "",
        "are_you_currently_taking_steroids_acetylsalicyli": null,
        "have_you_recently_used_any_glycolic_acid_or_reti": null,
        "do_you_have_an_ongoing_infection_in_your_body_or": null,
        "do_you_have_an_ongoing_infection_in_your_body_orText": "",
        "do_you_have_an_ongoing_illness_that_is_physical_": null,
        "do_you_have_an_ongoing_illness_that_is_physical_Text": "",
        "have_you_had_problems_with_anxiety_depression_or": null,
        "have_you_had_problems_with_anxiety_depression_orText": ""
      }
    },
    "hair_tp": {
      "schemaId": "health_declaration:hair_tp",
      "formVariant": "hair_tp",
      "meridiqQuestionaryId": 16414,
      "title": "Hälsodeklaration | Hair TP Clinic",
      "subtitle": "Meridiq mall 16414 · Hair TP Clinic",
      "sections": [
        {
          "title": "Hälsodeklaration | Hair TP Clinic",
          "fields": [
            {
              "key": "rokerNikotin",
              "label": "Använder du tobak- eller nikotinprodukter (t.ex. cigaretter, snus, vape)?",
              "type": "tristate",
              "meridiqQuestionId": 450976,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "gravidAmmar",
              "label": "Är du gravid eller ammar?",
              "type": "tristate",
              "meridiqQuestionId": 450977,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "hjartKarlsjukdom",
              "label": "Har du nu eller tidigare haft hjärt- eller kärlsjukdom (t.ex. hjärtinfarkt, kärlkramp, rytmrubbning)? Om ja, ange vad.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450978,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "hjartKarlsjukdomText"
            },
            {
              "key": "hogtBlodtryck",
              "label": "Har du diagnostiserat högt blodtryck (hypertoni)?",
              "type": "bloodpressure",
              "meridiqQuestionId": 450979,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "ovrigaSjukdomar",
              "label": "Har du någon annan sjukdom som vi bör känna till (t.ex. diabetes, koagulationsrubbning, immunologisk sjukdom)? Om ja, ange vad.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450980,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "ovrigaSjukdomarText"
            },
            {
              "key": "blodsmitta",
              "label": "Har du någon blodöverförbar sjukdom? Om ja, vänligen ange nedan:",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450981,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "blodsmittaText"
            },
            {
              "key": "ovrigtHalsa",
              "label": "Finns det något annat vi bör känna till om din hälsa? Om ja, beskriv",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450982,
              "meridiqType": "yes_no_textbox",
              "required": true
            },
            {
              "key": "lakemedel",
              "label": "Tar du några läkemedel (regelbundet eller vid behov)? Om ja, vänligen ange läkemedlets namn, styrka (mg/ml) och dosering nedan.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450983,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "lakemedelText"
            },
            {
              "key": "blodfortunnande",
              "label": "Tar du blodförtunnande läkemedel? Om ja, vänligen ange läkemedlets namn, styrka (mg/ml) och dosering nedan.",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 450984,
              "meridiqType": "yes_no_textbox",
              "required": true
            },
            {
              "key": "omega3Kosttillskott",
              "label": "Tar du Omega 3, fiskolja eller andra kosttillskott som påverkar blödning?",
              "type": "tristate",
              "meridiqQuestionId": 450985,
              "meridiqType": "yes_no",
              "required": true
            },
            {
              "key": "allergiskLakemedel",
              "label": "Är du allergisk eller överkänslig mot något läkemedel (inklusive lokalbedövning eller antibiotika)? Om ja, ange vilket/vilka och eventuell reaktion",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 451846,
              "meridiqType": "yes_no_textbox",
              "required": true,
              "textKey": "allergiskLakemedelText"
            },
            {
              "key": "langdCm",
              "label": "Ange din längd (cm):",
              "type": "text",
              "meridiqQuestionId": 451847,
              "meridiqType": "input",
              "required": true
            },
            {
              "key": "viktKg",
              "label": "Ange din vikt (kg):",
              "type": "text",
              "meridiqQuestionId": 451848,
              "meridiqType": "input",
              "required": true
            },
            {
              "key": "sarskildaOnskemal",
              "label": "Önskar du att vi fokuserar på något särskilt under konsultationen (t.ex hår, hud eller båda)? Om ja, Beskriv gärna kort",
              "type": "yes_no_textbox",
              "meridiqQuestionId": 451849,
              "meridiqType": "yes_no_textbox",
              "required": true
            }
          ]
        }
      ],
      "emptyDefaults": {
        "rokerNikotin": null,
        "gravidAmmar": null,
        "hjartKarlsjukdom": null,
        "hjartKarlsjukdomText": "",
        "hogtBlodtryck": null,
        "ovrigaSjukdomar": null,
        "ovrigaSjukdomarText": "",
        "blodsmitta": null,
        "blodsmittaText": "",
        "ovrigtHalsa": null,
        "ovrigtHalsaText": "",
        "lakemedel": null,
        "lakemedelText": "",
        "blodfortunnande": null,
        "blodfortunnandeText": "",
        "omega3Kosttillskott": null,
        "allergiskLakemedel": null,
        "allergiskLakemedelText": "",
        "langdCm": "",
        "viktKg": "",
        "sarskildaOnskemal": null,
        "sarskildaOnskemalText": ""
      }
    }
  }
});
})();
