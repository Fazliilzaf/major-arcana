#!/usr/bin/env python3
"""Build Arcana journal schemas from Meridiq questionary + service bindings exports."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "migration" / "meridiq"

QUESTIONARY_VARIANT = {
    16414: ("health_declaration", "hair_tp"),
    16415: ("health_declaration", "curatiio_bleph"),
    14878: ("health_declaration", "curatiio_ortho"),
    16472: ("health_declaration", "curatiio_injection"),
    14865: ("health_declaration", "eng"),
    16413: ("fitness_certificate", "hair_tp"),
    16389: ("fitness_certificate", "curatiio_bleph"),
    16411: ("tp_treatment", "hair_tp"),
    16412: ("prp_treatment", "tp_post_op"),
    14988: ("prp_treatment", "prp_skin"),
    16407: ("follow_up", "4_manader"),
    16409: ("follow_up", "6_manader"),
    16390: ("follow_up", "12_manader"),
    16388: ("bleph_treatment", "curatiio_bleph"),
}

YES_NO_TEXTBOX_FIELDS: dict[int, tuple[str, str | None]] = {
    450978: ("hjartKarlsjukdom", "hjartKarlsjukdomText"),
    450980: ("ovrigaSjukdomar", "ovrigaSjukdomarText"),
    450981: ("blodsmitta", "blodsmittaText"),
    450982: ("ovrigtHalsa", None),
    450983: ("lakemedel", "lakemedelText"),
    450984: ("blodfortunnande", None),
    451846: ("allergiskLakemedel", "allergiskLakemedelText"),
    451849: ("sarskildaOnskemal", None),
    450989: ("sjukSenaste3Manader", "sjukSenaste3ManaderText"),
    450990: ("lakemedelNu", "lakemedelNuText"),
    450991: ("blodningsrisk", "blodningsriskText"),
    450992: ("kosttillskott", "kosttillskottText"),
    450993: ("allergiAstma", "allergiAstmaText"),
    450994: ("allergiAntibiotikaLokalbedovning", "allergiAntibiotikaLokalbedovningText"),
    450996: ("ovrigtHalsa", "ovrigtHalsaText"),
    452499: ("allergier", "allergierText"),
    452500: ("blodfortunnande", "blodfortunnandeText"),
    452501: ("receptbelagdaLakemedel", "receptbelagdaLakemedelText"),
    452504: ("tidigareKomplikationer", "tidigareKomplikationerText"),
    411405: ("sjukSenaste3Manader", "sjukSenaste3ManaderText"),
    411406: ("lakemedelNu", "lakemedelNuText"),
    411407: ("blodningsrisk", "blodningsriskText"),
    411408: ("kosttillskott", "kosttillskottText"),
    411409: ("allergiAstma", "allergiAstmaText"),
    411412: ("ovrigtHalsa", "ovrigtHalsaText"),
    411414: ("operationSenasteAret", "operationSenasteAretText"),
    411415: ("vaccinationNyligen", "vaccinationNyligenText"),
}

YES_NO_FIELDS: dict[int, str] = {
    450976: "rokerNikotin",
    450977: "gravidAmmar",
    450979: "hogtBlodtryck",
    450985: "omega3Kosttillskott",
    450986: "kannerSigFrisk",
    450987: "rokerNikotin",
    450988: "gravidAmmar",
    450995: "hjalpmedelForflyttning",
    450997: "intygarKorrektaUppgifter",
    452478: "gravidAmmar",
    452502: "kosttillskottNaturlakemedel",
    452503: "tidigareInjektionsbehandlingar",
    452505: "intygarKorrektaUppgifter",
    411404: "kannerSigFrisk",
    411413: "gravidAmmar",
    411410: "rokerNikotin",
    411411: "hjalpmedelForflyttning",
    450884: "ingreppTypFaststalld",
    450885: "metodFue",
    450886: "metodDhi",
    450887: "metodKombination",
}

CHECKBOX_FIELDS: dict[int, str] = {
    452479: "kandaTillstand",
}

TEXT_FIELDS: dict[int, str] = {
    411402: "langdCm",
    411403: "viktKg",
    451847: "langdCm",
    451848: "viktKg",
}

TP_YES_NO_TEXTBOX: dict[int, tuple[str, str | None]] = {
    450895: ("ytterligareOmrade", "ytterligareOmradeText"),
    450899: ("fulltFrisk", "fulltFriskText"),
    450901: ("aktuellaLakemedel", "aktuellaLakemedelText"),
    450902: ("ytterligareHalsoinfo", "ytterligareHalsoinfoText"),
    450916: ("ovrigaObservationer", "ovrigaObservationerText"),
}

TP_FIELD_MAP: dict[int, str] = {
    450884: "ingreppTypFaststalld",
    450885: "metodFue",
    450886: "metodDhi",
    450887: "metodKombination",
    450888: "omradeVikar",
    450889: "omradeKrona",
    450890: "omradeFront",
    450891: "omradeHelaSkalpen",
    450892: "omradeSkagg",
    450893: "omradeOgonbryn",
    450894: "omradeArr",
    450897: "giltigLegitimationVisad",
    450898: "informeradRisker",
    450900: "alkoholNarkotika48h",
    450904: "blodtryckMmHg",
    450905: "vitalKlockslag",
    450906: "allmannaAnteckningar",
    450907: "allmantillstandEfter",
    450908: "reaktionLokalbedovning1",
    450909: "reaktionLokalbedovning2",
    450910: "obsLangreHarligne",
    450911: "obsHelaHuvudetRakat",
    450912: "obsDelarRakade",
    450913: "obsKansligAdrenalin",
    450914: "obsOkadBlodning",
    450915: "obsSegHud",
    450918: "lakemedelDalacin",
    450919: "lakemedelBetapred",
    450920: "lakemedelIbuprofen",
    450921: "informeradLakemedelEftervard",
    450923: "graftsSingel",
    450924: "graftsDubbel",
    450925: "graftsTrippel",
    450926: "graftsKvadrupel",
    450927: "graftsTotalt",
    450929: "tidPlanering",
    450930: "tidLokalbedovningDonator",
    450931: "tidExtraktionDonator",
    450932: "tidLokalbedovningMottagare",
    450933: "tidMottagarkanaler",
    450934: "tidImplantationStart",
    450935: "tidImplantationSlut",
    450936: "tidPatientLamnar",
    450938: "bedovningCarbocainMl",
    450939: "bedovningMarcainMl",
    450940: "bedovningAdrenalinMl",
    450941: "bedovningTribonatMl",
}

TP_LEGACY_DEFAULTS = {
    "metod": "",
    "behandlingsomraden": [],
    "observationerUnderIngrepp": [],
    "lakemedelUtlamnade": [],
    "puls": "",
    "slutanteckningar": "",
}

PRP_LEGACY_DEFAULTS = {
    "behandlingsdatum": "",
    "omrade": "",
    "serieNummer": "",
    "serieTotalt": "",
    "antalBlodror": "",
    "mangdPrpMl": "",
    "teknik": "",
    "bedovning": None,
    "bedovningTyp": "",
    "blodtryckMmHg": "",
    "puls": "",
    "lakemedel": "",
    "komplikationer": "",
    "eftervardsrad": "",
    "behandlare": "",
}

FOLLOW_UP_LEGACY_DEFAULTS = {
    "uppfoljningsdatum": "",
    "tillfalle": "",
    "bedomning": "",
    "bilderNotering": "",
    "atgardPlan": "",
    "behandlare": "",
}


def slug_key(label: str, question_id: int) -> str:
    ascii_label = (
        unicodedata.normalize("NFKD", label)
        .encode("ascii", "ignore")
        .decode("ascii")
        .lower()
    )
    slug = re.sub(r"[^a-z0-9]+", "_", ascii_label).strip("_")
    if not slug:
        return f"meridiq_q_{question_id}"
    return slug[:48]


def arcana_field_type(meridiq_type: str, key: str) -> str:
    if meridiq_type == "yes_no":
        if key in {"hogtBlodtryck"}:
            return "bloodpressure"
        return "tristate"
    if meridiq_type == "yes_no_textbox":
        return "yes_no_textbox"
    if meridiq_type == "checkbox":
        return "checkboxes"
    if meridiq_type == "textbox":
        return "text"
    if meridiq_type == "input":
        return "text"
    if meridiq_type == "textarea":
        return "textarea"
    return "text"


def is_tp_section_header(question: dict) -> bool:
    if question.get("type") != "textbox":
        return False
    if question.get("required"):
        return False
    label = (question.get("label") or "").strip()
    if len(label) < 8:
        return False
    letters = [ch for ch in label if ch.isalpha()]
    if not letters:
        return False
    upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
    return upper_ratio >= 0.7


def build_tp_sections(questions: list[dict]) -> list[dict]:
    sections: list[dict] = []
    current = {"title": "Förberedelse & planering", "fields": []}
    for question in questions:
        if is_tp_section_header(question):
            if current["fields"]:
                sections.append(current)
            current = {"title": question["label"].strip(), "fields": []}
            continue
        field = resolve_field(question, "tp_treatment")
        if field:
            current["fields"].append(field)
    if current["fields"]:
        sections.append(current)
    return sections


def resolve_field(question: dict, journal_type: str) -> dict | None:
    qid = question["id"]
    qtype = question["type"]
    label = question.get("label") or ""

    if journal_type == "tp_treatment" and qid in TP_YES_NO_TEXTBOX:
        key, text_key = TP_YES_NO_TEXTBOX[qid]
        field = {
            "key": key,
            "label": label,
            "type": "yes_no_textbox",
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }
        if text_key:
            field["textKey"] = text_key
        return field

    if journal_type == "tp_treatment" and qid in TP_FIELD_MAP:
        key = TP_FIELD_MAP[qid]
        field_type = arcana_field_type(qtype, key)
        if key.startswith("tid") or key == "vitalKlockslag":
            field_type = "time"
        return {
            "key": key,
            "label": label,
            "type": field_type,
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }

    if qid in YES_NO_TEXTBOX_FIELDS:
        key, text_key = YES_NO_TEXTBOX_FIELDS[qid]
        field = {
            "key": key,
            "label": label,
            "type": "yes_no_textbox",
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }
        if text_key:
            field["textKey"] = text_key
        return field

    if qid in CHECKBOX_FIELDS:
        return {
            "key": CHECKBOX_FIELDS[qid],
            "label": label,
            "type": "checkboxes",
            "options": question.get("options") or [],
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }

    if qid in YES_NO_FIELDS:
        key = YES_NO_FIELDS[qid]
        return {
            "key": key,
            "label": label,
            "type": arcana_field_type(qtype, key),
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }

    if qid in TEXT_FIELDS:
        key = TEXT_FIELDS[qid]
        return {
            "key": key,
            "label": label,
            "type": "text",
            "meridiqQuestionId": qid,
            "meridiqType": qtype,
            "required": bool(question.get("required")),
        }

    key = slug_key(label, qid)
    return {
        "key": key,
        "label": label,
        "type": arcana_field_type(qtype, key),
        "meridiqQuestionId": qid,
        "meridiqType": qtype,
        "required": bool(question.get("required")),
        "options": question.get("options") or None,
    }


def empty_defaults(fields: list[dict]) -> dict:
    defaults: dict = {}
    for field in fields:
        key = field["key"]
        ftype = field["type"]
        if ftype in {"checkboxes"}:
            defaults[key] = []
        elif ftype in {"tristate", "yes_no_textbox", "bloodpressure"}:
            defaults[key] = None
            text_key = field.get("textKey")
            if text_key:
                defaults[text_key] = ""
            elif ftype == "yes_no_textbox":
                defaults[f"{key}Text"] = ""
        elif ftype == "checkbox":
            defaults[key] = False
        else:
            defaults[key] = ""
    return defaults


def build_schema(form: dict) -> dict | None:
    api_id = form["apiId"]
    if api_id not in QUESTIONARY_VARIANT:
        return None
    journal_type, form_variant = QUESTIONARY_VARIANT[api_id]
    questions = form.get("questions") or []
    if journal_type == "tp_treatment":
        sections = build_tp_sections(questions)
    else:
        fields = []
        for question in questions:
            field = resolve_field(question, journal_type)
            if field:
                fields.append(field)
        sections = [{"title": form.get("title") or "Formulär", "fields": fields}]

    fields = [field for section in sections for field in section["fields"]]
    defaults = empty_defaults(fields)
    if journal_type == "tp_treatment":
        defaults = {**defaults, **TP_LEGACY_DEFAULTS}
    if journal_type == "prp_treatment":
        defaults = {**defaults, **PRP_LEGACY_DEFAULTS}
    if journal_type == "follow_up":
        defaults = {**defaults, **FOLLOW_UP_LEGACY_DEFAULTS}

    return {
        "schemaId": f"{journal_type}:{form_variant}",
        "journalType": journal_type,
        "formVariant": form_variant,
        "meridiqQuestionaryId": api_id,
        "title": form.get("title"),
        "brand": form.get("brand"),
        "fieldCount": len(fields),
        "sections": sections,
        "emptyDefaults": defaults,
        "meridiqFieldMap": {
            str(field["meridiqQuestionId"]): field["key"] for field in fields if field.get("meridiqQuestionId")
        },
    }


def service_variant_hints(bindings: dict) -> list[dict]:
    hints = []
    variant_by_q = {
        qid: variant
        for qid, (_journal_type, variant) in QUESTIONARY_VARIANT.items()
        if _journal_type == "health_declaration"
    }
    q_by_id = {
        item["questionaryApiId"]: item
        for item in bindings.get("byQuestionary") or []
    }
    for service in bindings.get("services") or []:
        questionnaires = service.get("questionnaires") or []
        if not questionnaires:
            continue
        q = questionnaires[0]
        qid = q.get("questionaryApiId")
        form_variant = None
        for meridiq_qid, variant in variant_by_q.items():
            if meridiq_qid == qid:
                form_variant = variant
                break
        hints.append(
            {
                "meridiqServiceApiId": service["apiId"],
                "serviceName": service.get("name"),
                "journalType": "health_declaration",
                "formVariant": form_variant or "hair_tp",
                "meridiqQuestionaryId": qid,
                "questionaryTitle": q.get("title") or q_by_id.get(qid, {}).get("title"),
            }
        )
    return hints


def render_clinical_schemas_js(schemas: list[dict]) -> str:
    registry = {}
    for schema in schemas:
        journal_type = schema["journalType"]
        variant = schema["formVariant"]
        bucket = registry.setdefault(journal_type, {})
        bucket[variant] = {
            "schemaId": schema["schemaId"],
            "formVariant": variant,
            "meridiqQuestionaryId": schema["meridiqQuestionaryId"],
            "title": schema["title"],
            "subtitle": f"Meridiq mall {schema['meridiqQuestionaryId']} · {schema.get('brand') or ''}".strip(),
            "sections": schema["sections"],
            "emptyDefaults": schema["emptyDefaults"],
        }

    body = json.dumps(registry, ensure_ascii=False, indent=2)
    return f"""(() => {{
  'use strict';
  window.ArcanaJournalClinicalSchemaRegistry = Object.freeze({body});
}})();
"""


def render_bleph_schemas_js(schemas: list[dict]) -> str:
    registry = {}
    for schema in schemas:
        registry[schema["formVariant"]] = {
            "schemaId": schema["schemaId"],
            "formVariant": schema["formVariant"],
            "meridiqQuestionaryId": schema["meridiqQuestionaryId"],
            "title": schema["title"],
            "subtitle": f"Meridiq mall {schema['meridiqQuestionaryId']} · {schema.get('brand') or ''}".strip(),
            "sections": schema["sections"],
            "emptyDefaults": schema["emptyDefaults"],
        }

    body = json.dumps(registry, ensure_ascii=False, indent=2)
    return f"""(() => {{
  'use strict';
  window.ArcanaJournalBlephSchemaRegistry = Object.freeze({body});
}})();
"""


def render_follow_up_schemas_js(schemas: list[dict]) -> str:
    registry = {}
    for schema in schemas:
        registry[schema["formVariant"]] = {
            "schemaId": schema["schemaId"],
            "formVariant": schema["formVariant"],
            "meridiqQuestionaryId": schema["meridiqQuestionaryId"],
            "title": schema["title"],
            "subtitle": f"Meridiq mall {schema['meridiqQuestionaryId']} · {schema.get('brand') or ''}".strip(),
            "sections": schema["sections"],
            "emptyDefaults": schema["emptyDefaults"],
        }

    body = json.dumps(registry, ensure_ascii=False, indent=2)
    return f"""(() => {{
  'use strict';
  window.ArcanaJournalFollowUpSchemaRegistry = Object.freeze({body});
}})();
"""


def render_prp_schemas_js(schemas: list[dict]) -> str:
    registry = {}
    for schema in schemas:
        registry[schema["formVariant"]] = {
            "schemaId": schema["schemaId"],
            "formVariant": schema["formVariant"],
            "meridiqQuestionaryId": schema["meridiqQuestionaryId"],
            "title": schema["title"],
            "subtitle": f"Meridiq mall {schema['meridiqQuestionaryId']} · {schema.get('brand') or ''}".strip(),
            "sections": schema["sections"],
            "emptyDefaults": schema["emptyDefaults"],
        }

    body = json.dumps(registry, ensure_ascii=False, indent=2)
    return f"""(() => {{
  'use strict';
  window.ArcanaJournalPrpSchemaRegistry = Object.freeze({body});
}})();
"""


def render_tp_schemas_js(schemas: list[dict]) -> str:
    registry = {}
    for schema in schemas:
        registry[schema["formVariant"]] = {
            "schemaId": schema["schemaId"],
            "formVariant": schema["formVariant"],
            "meridiqQuestionaryId": schema["meridiqQuestionaryId"],
            "title": schema["title"],
            "subtitle": f"Meridiq mall {schema['meridiqQuestionaryId']} · {schema.get('brand') or ''}".strip(),
            "sections": schema["sections"],
            "emptyDefaults": schema["emptyDefaults"],
        }

    body = json.dumps(registry, ensure_ascii=False, indent=2)
    return f"""(() => {{
  'use strict';
  window.ArcanaJournalTpSchemaRegistry = Object.freeze({body});
}})();
"""


def main() -> None:
    questionary = json.loads((MIGRATION / "questionary-catalog.json").read_text(encoding="utf-8"))
    bindings_path = MIGRATION / "service-bindings-catalog.json"
    bindings = json.loads(bindings_path.read_text(encoding="utf-8")) if bindings_path.exists() else {}

    schemas = []
    for form in questionary.get("forms") or []:
        if not form.get("migrate"):
            continue
        schema = build_schema(form)
        if schema:
            schemas.append(schema)

    schemas.sort(key=lambda item: item["schemaId"])

    tp_schema = next((s for s in schemas if s["schemaId"] == "tp_treatment:hair_tp"), None)
    mapped_tp = 0
    if tp_schema:
        mapped_tp = sum(
            1
            for section in tp_schema["sections"]
            for field in section["fields"]
            if field.get("meridiqQuestionId")
        )

    payload = {
        "exportedAt": "2026-05-25",
        "source": "scripts/migration/buildJournalSchemas.py",
        "schemaCount": len(schemas),
        "stats": {
            "tpTreatmentMeridiqFields": tp_schema["fieldCount"] if tp_schema else 0,
            "tpTreatmentMappedToStoreKeys": mapped_tp,
            "healthDeclarationVariants": sum(1 for s in schemas if s["journalType"] == "health_declaration"),
            "serviceBindingHints": len(service_variant_hints(bindings)),
        },
        "serviceBindingHints": service_variant_hints(bindings),
        "schemas": schemas,
    }

    out = MIGRATION / "journal-schema-catalog.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} ({len(schemas)} schemas)")

    clinical = [
        schema
        for schema in schemas
        if schema["journalType"] in {"health_declaration", "fitness_certificate"}
    ]
    js_out = ROOT / "public/major-arcana-preview/app/journal-clinical-schemas.js"
    js_out.write_text(render_clinical_schemas_js(clinical), encoding="utf-8")
    print(f"Wrote {js_out} ({len(clinical)} clinical schemas)")

    tp = [schema for schema in schemas if schema["journalType"] == "tp_treatment"]
    tp_out = ROOT / "public/major-arcana-preview/app/journal-tp-schemas.js"
    tp_out.write_text(render_tp_schemas_js(tp), encoding="utf-8")
    print(f"Wrote {tp_out} ({len(tp)} tp schemas)")

    prp = [schema for schema in schemas if schema["journalType"] == "prp_treatment"]
    prp_out = ROOT / "public/major-arcana-preview/app/journal-prp-schemas.js"
    prp_out.write_text(render_prp_schemas_js(prp), encoding="utf-8")
    print(f"Wrote {prp_out} ({len(prp)} prp schemas)")

    follow_up = [schema for schema in schemas if schema["journalType"] == "follow_up"]
    follow_out = ROOT / "public/major-arcana-preview/app/journal-follow-up-schemas.js"
    follow_out.write_text(render_follow_up_schemas_js(follow_up), encoding="utf-8")
    print(f"Wrote {follow_out} ({len(follow_up)} follow-up schemas)")

    bleph = [schema for schema in schemas if schema["journalType"] == "bleph_treatment"]
    bleph_out = ROOT / "public/major-arcana-preview/app/journal-bleph-schemas.js"
    bleph_out.write_text(render_bleph_schemas_js(bleph), encoding="utf-8")
    print(f"Wrote {bleph_out} ({len(bleph)} bleph schemas)")


if __name__ == "__main__":
    main()
