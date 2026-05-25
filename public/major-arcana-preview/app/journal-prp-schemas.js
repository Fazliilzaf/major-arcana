(() => {
  'use strict';
  window.ArcanaJournalPrpSchemaRegistry = Object.freeze({
  "prp_skin": {
    "schemaId": "prp_treatment:prp_skin",
    "formVariant": "prp_skin",
    "meridiqQuestionaryId": 14988,
    "title": "Journal | PRP, PRF, Microneedling",
    "subtitle": "Meridiq mall 14988 · Hair TP Clinic",
    "sections": [
      {
        "title": "Journal | PRP, PRF, Microneedling",
        "fields": [
          {
            "key": "har_patientens_halsodeklaration_granskats_infor_",
            "label": "Har patientens hälsodeklaration granskats inför behandlingen?",
            "type": "tristate",
            "meridiqQuestionId": 411231,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "vilken_behandling_utfors_vid_detta_tillfalle",
            "label": "Vilken behandling utförs vid detta tillfälle?",
            "type": "checkboxes",
            "meridiqQuestionId": 411232,
            "meridiqType": "checkbox",
            "required": false,
            "options": [
              "PRP Hår - Mini",
              "PRP Hår - Standard",
              "PRP Hår - XL",
              "PRP Hår - Skägg",
              "PRP Hår - Ögonbryn",
              "PRP Hud - Ansikte",
              "PRP Hud - Hals",
              "PRP Hud - Dekolletage",
              "PRP Hud - Händer",
              "PRP Hud + Microneedling - Ansikte",
              "PRP Hud + Microneedling - Hals",
              "PRP Hud + Microneedling - Dekolletage",
              "PRP Hud + Microneedling - Händer",
              "PRF Hud - Ansikte",
              "PRF Hud - Under ögon",
              "PRF + Microneedling - Ansikte"
            ]
          },
          {
            "key": "onskar_patienten_lagga_till_ytterligare_behandli",
            "label": "Önskar patienten lägga till ytterligare behandlingsområden, utöver det som valts ovan? Om ja, ange område(n)",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411233,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "vilken_behandling_i_ordningen_ar_detta_ange_enda",
            "label": "Vilken behandling i ordningen är detta? (ange endast siffra, t.ex. 1, 2, 3)",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411399,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "har_patienten_informerats_om_risker_biverkningar",
            "label": "Har patienten informerats om risker, biverkningar och hur behandlingen genomförs?",
            "type": "tristate",
            "meridiqQuestionId": 411251,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "ar_patienten_fullt_frisk_om_nej_ange_sjukdomar",
            "label": "Är patienten fullt frisk? Om nej, ange sjukdomar",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411253,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "anvander_patienten_nagra_lakemedel_for_narvarand",
            "label": "Använder patienten några läkemedel för närvarande, regelbundet eller vid behov? Om ja, ange läkemedlets namn, styrka (mg/ml), dosering och orsak",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411252,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "finns_det_nagon_ytterligare_information_om_patie",
            "label": "Finns det någon ytterligare information om patientens hälsa som är relevant för behandlingen? Om ja, ange vad",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411254,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "observationer_hos_patienten_efter_behandlingen",
            "label": "Observationer hos patienten efter behandlingen",
            "type": "checkboxes",
            "meridiqQuestionId": 411255,
            "meridiqType": "checkbox",
            "required": true,
            "options": [
              "Allt ok",
              "Nålrädd",
              "Svårstucken",
              "Svaga kärl",
              "Rädd för blod",
              "Eksem / Psoriasis",
              "Övrigt"
            ]
          },
          {
            "key": "ovriga_observationer",
            "label": "Övriga observationer",
            "type": "text",
            "meridiqQuestionId": 411257,
            "meridiqType": "textbox",
            "required": false,
            "options": null
          },
          {
            "key": "anvandes_bedovningssalva_om_ja_ange_vilken",
            "label": "Användes bedövningssalva? Om ja, ange vilken",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 411256,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "allmanna_anteckningar",
            "label": "Allmänna anteckningar",
            "type": "text",
            "meridiqQuestionId": 451115,
            "meridiqType": "textbox",
            "required": true,
            "options": null
          }
        ]
      }
    ],
    "emptyDefaults": {
      "har_patientens_halsodeklaration_granskats_infor_": null,
      "vilken_behandling_utfors_vid_detta_tillfalle": [],
      "onskar_patienten_lagga_till_ytterligare_behandli": null,
      "onskar_patienten_lagga_till_ytterligare_behandliText": "",
      "vilken_behandling_i_ordningen_ar_detta_ange_enda": null,
      "vilken_behandling_i_ordningen_ar_detta_ange_endaText": "",
      "har_patienten_informerats_om_risker_biverkningar": null,
      "ar_patienten_fullt_frisk_om_nej_ange_sjukdomar": null,
      "ar_patienten_fullt_frisk_om_nej_ange_sjukdomarText": "",
      "anvander_patienten_nagra_lakemedel_for_narvarand": null,
      "anvander_patienten_nagra_lakemedel_for_narvarandText": "",
      "finns_det_nagon_ytterligare_information_om_patie": null,
      "finns_det_nagon_ytterligare_information_om_patieText": "",
      "observationer_hos_patienten_efter_behandlingen": [],
      "ovriga_observationer": "",
      "anvandes_bedovningssalva_om_ja_ange_vilken": null,
      "anvandes_bedovningssalva_om_ja_ange_vilkenText": "",
      "allmanna_anteckningar": "",
      "behandlingsdatum": "",
      "omrade": "",
      "serieNummer": "",
      "serieTotalt": "",
      "antalBlodror": "",
      "mangdPrpMl": "",
      "teknik": "",
      "bedovning": null,
      "bedovningTyp": "",
      "blodtryckMmHg": "",
      "puls": "",
      "lakemedel": "",
      "komplikationer": "",
      "eftervardsrad": "",
      "behandlare": ""
    }
  },
  "tp_post_op": {
    "schemaId": "prp_treatment:tp_post_op",
    "formVariant": "tp_post_op",
    "meridiqQuestionaryId": 16412,
    "title": "Journal | TP Efterbehandling (PRP)",
    "subtitle": "Meridiq mall 16412 · Hair TP Clinic",
    "sections": [
      {
        "title": "Journal | TP Efterbehandling (PRP)",
        "fields": [
          {
            "key": "hur_manga_prp_efterbehandlingar_har_genomforts_h",
            "label": "Hur många PRP-efterbehandlingar har genomförts hittills? Ange siffra:",
            "type": "text",
            "meridiqQuestionId": 450942,
            "meridiqType": "textbox",
            "required": true,
            "options": null
          },
          {
            "key": "har_kunden_blivit_informerad_om_risker_biverknin",
            "label": "Har kunden blivit informerad om risker, biverkningar och hur behandlingen genomförs?",
            "type": "tristate",
            "meridiqQuestionId": 450943,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "genomfor_kunden_prp_for_att_paskynda_lakningspro",
            "label": "Genomför kunden PRP för att påskynda läkningsprocessen och stimulera hårtillväxten?",
            "type": "tristate",
            "meridiqQuestionId": 450944,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "ar_kunden_fullt_frisk",
            "label": "Är kunden fullt frisk?",
            "type": "tristate",
            "meridiqQuestionId": 450945,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "tar_kunden_nagra_lakemedel_om_ja_ange_lakemedel_",
            "label": "Tar kunden några läkemedel? Om ja, ange läkemedel, styrka och anledning:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450946,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "finns_det_nagot_annat_vi_bor_veta_om_kundens_hal",
            "label": "Finns det något annat vi bör veta om kundens hälsa? Om ja, ange vad:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450947,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "status_pa_sarskorpor",
            "label": "Status på sårskorpor?",
            "type": "text",
            "meridiqQuestionId": 450948,
            "meridiqType": "textbox",
            "required": true,
            "options": null
          },
          {
            "key": "har_kunden_fatt_sarskilda_uppmaningar_om_ja_ange",
            "label": "Har kunden fått särskilda uppmaningar? Om ja, ange vilka:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450949,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "forekommer_det_nagon_form_av_kanselbortfall_hos_",
            "label": "Förekommer det någon form av känselbortfall hos patienten? Om ja, beskriv område eller omfattning (Inget/Lite/Mycket)",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450950,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "upplever_patienten_att_allt_ar_ok",
            "label": "Upplever patienten att allt är ok?",
            "type": "tristate",
            "meridiqQuestionId": 450951,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "upplever_patienten_klada",
            "label": "Upplever patienten klåda?",
            "type": "tristate",
            "meridiqQuestionId": 450952,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "har_patienten_svart_att_sova",
            "label": "Har patienten svårt att sova?",
            "type": "tristate",
            "meridiqQuestionId": 450953,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "ar_patienten_om_i_donationsomradet",
            "label": "Är patienten öm i donationsområdet?",
            "type": "tristate",
            "meridiqQuestionId": 450954,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "har_det_forekommit_blodning",
            "label": "Har det förekommit blödning?",
            "type": "tristate",
            "meridiqQuestionId": 450955,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "upplever_patienten_spanningshuvudvark",
            "label": "Upplever patienten spänningshuvudvärk?",
            "type": "tristate",
            "meridiqQuestionId": 450956,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "har_patienten_kommit_at_eller_slagit_i_transplan",
            "label": "Har patienten kommit åt eller slagit i transplantationsområdet?",
            "type": "tristate",
            "meridiqQuestionId": 450957,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "forekommer_nagot_annat_besvar_om_ja_ange_vad",
            "label": "Förekommer något annat besvär? Om ja, ange vad:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450958,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "var_allt_normalt_hos_patienten_efter_behandlinge",
            "label": "Var allt normalt hos patienten efter behandlingen?",
            "type": "tristate",
            "meridiqQuestionId": 450959,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "var_patienten_nalradd",
            "label": "Var patienten nålrädd?",
            "type": "tristate",
            "meridiqQuestionId": 450960,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "var_patienten_svarstucken",
            "label": "Var patienten svårstucken?",
            "type": "tristate",
            "meridiqQuestionId": 450961,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "har_patienten_svaga_karl",
            "label": "Har patienten svaga kärl?",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450962,
            "meridiqType": "yes_no_textbox",
            "required": false,
            "options": null
          },
          {
            "key": "var_patienten_radd_for_blod",
            "label": "Var patienten rädd för blod?",
            "type": "tristate",
            "meridiqQuestionId": 450963,
            "meridiqType": "yes_no",
            "required": true,
            "options": null
          },
          {
            "key": "forekom_nagot_annat_av_betydelse_om_ja_ange_vad",
            "label": "Förekom något annat av betydelse? Om ja, ange vad:",
            "type": "yes_no_textbox",
            "meridiqQuestionId": 450964,
            "meridiqType": "yes_no_textbox",
            "required": true,
            "options": null
          },
          {
            "key": "allmanna_anteckningar",
            "label": "Allmänna anteckningar",
            "type": "text",
            "meridiqQuestionId": 450965,
            "meridiqType": "textbox",
            "required": true,
            "options": null
          }
        ]
      }
    ],
    "emptyDefaults": {
      "hur_manga_prp_efterbehandlingar_har_genomforts_h": "",
      "har_kunden_blivit_informerad_om_risker_biverknin": null,
      "genomfor_kunden_prp_for_att_paskynda_lakningspro": null,
      "ar_kunden_fullt_frisk": null,
      "tar_kunden_nagra_lakemedel_om_ja_ange_lakemedel_": null,
      "tar_kunden_nagra_lakemedel_om_ja_ange_lakemedel_Text": "",
      "finns_det_nagot_annat_vi_bor_veta_om_kundens_hal": null,
      "finns_det_nagot_annat_vi_bor_veta_om_kundens_halText": "",
      "status_pa_sarskorpor": "",
      "har_kunden_fatt_sarskilda_uppmaningar_om_ja_ange": null,
      "har_kunden_fatt_sarskilda_uppmaningar_om_ja_angeText": "",
      "forekommer_det_nagon_form_av_kanselbortfall_hos_": null,
      "forekommer_det_nagon_form_av_kanselbortfall_hos_Text": "",
      "upplever_patienten_att_allt_ar_ok": null,
      "upplever_patienten_klada": null,
      "har_patienten_svart_att_sova": null,
      "ar_patienten_om_i_donationsomradet": null,
      "har_det_forekommit_blodning": null,
      "upplever_patienten_spanningshuvudvark": null,
      "har_patienten_kommit_at_eller_slagit_i_transplan": null,
      "forekommer_nagot_annat_besvar_om_ja_ange_vad": null,
      "forekommer_nagot_annat_besvar_om_ja_ange_vadText": "",
      "var_allt_normalt_hos_patienten_efter_behandlinge": null,
      "var_patienten_nalradd": null,
      "var_patienten_svarstucken": null,
      "har_patienten_svaga_karl": null,
      "har_patienten_svaga_karlText": "",
      "var_patienten_radd_for_blod": null,
      "forekom_nagot_annat_av_betydelse_om_ja_ange_vad": null,
      "forekom_nagot_annat_av_betydelse_om_ja_ange_vadText": "",
      "allmanna_anteckningar": "",
      "behandlingsdatum": "",
      "omrade": "",
      "serieNummer": "",
      "serieTotalt": "",
      "antalBlodror": "",
      "mangdPrpMl": "",
      "teknik": "",
      "bedovning": null,
      "bedovningTyp": "",
      "blodtryckMmHg": "",
      "puls": "",
      "lakemedel": "",
      "komplikationer": "",
      "eftervardsrad": "",
      "behandlare": ""
    }
  }
});
})();
