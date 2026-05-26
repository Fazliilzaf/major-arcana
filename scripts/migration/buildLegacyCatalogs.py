#!/usr/bin/env python3
"""Build Cliento resource/addon catalogs and Cliento↔Meridiq↔Arcana triple map."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "migration"
CLIENTO = MIGRATION / "cliento"
MERIDIQ = MIGRATION / "meridiq"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def enrich_cliento_resources(compact: dict) -> dict:
    svc_by_id = compact["serviceById"]
    resources = []
    for res in compact["resources"]:
        rid = res["resId"]
        linked = []
        for item in compact["mappings"].get(rid, []):
            sid = item["srvId"]
            meta = svc_by_id.get(sid, {})
            linked.append(
                {
                    "srvId": sid,
                    "name": meta.get("name", ""),
                    "groupName": meta.get("groupName"),
                    "webShowInBooking": item["webShow"],
                    "webAllowBooking": item["webAllow"],
                }
            )
        linked.sort(key=lambda x: x["srvId"])
        resources.append(
            {
                **res,
                "serviceCount": len(linked),
                "services": linked,
            }
        )

    return {
        "exportedAt": "2026-05-25",
        "source": "Cliento locations API",
        "serviceGroups": compact["groups"],
        "resourceGroups": compact["resourceGroups"],
        "count": len(resources),
        "resources": resources,
    }


def build_addon_catalog(compact: dict) -> dict:
    addon_group = compact["addons"]["group"]
    return {
        "exportedAt": "2026-05-25",
        "source": "Cliento locations API /services/ groups",
        "group": addon_group,
        "count": compact["addons"]["count"],
        "services": [],
        "note": "Tilläggstjänster-grupp (id 8504) finns men har inga serviceIds konfigurerade 2026-05-25.",
    }


def meridiq_by_category(catalog: dict) -> dict[str, list]:
    out: dict[str, list] = {}
    for svc in catalog["services"]:
        cat = svc["category"]
        out.setdefault(cat, []).append(svc)
    return out


def cliento_by_group(catalog: dict) -> dict[str, list]:
    out: dict[str, list] = {}
    for svc in catalog["services"]:
        brand = svc.get("brand") or svc.get("groupName") or "Unknown"
        out.setdefault(brand, []).append(svc)
    return out


def ids_from_meridiq(services: list) -> list[int]:
    return sorted({s["apiId"] for s in services})


def ids_from_cliento(services: list) -> list[str]:
    return sorted({s["srvId"] for s in services})


# Canonical Arcana buckets — hand-verified anchors + category expansion
TRIPLE_RULES: list[dict] = [
    {
        "arcanaServiceId": "consultation-online",
        "label": "Online konsultation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "44939",
        "clientoResIds": ["9259"],
        "meridiqPrimary": 7079,
        "meridiqCategories": ["Konsultationer · Hair TP Clinic"],
        "meridiqNameIncludes": ["Onlinekonsultation", "videosamtal"],
        "confidence": "exact",
        "journalTypes": ["health_declaration"],
    },
    {
        "arcanaServiceId": "consultation-physical",
        "label": "Fysisk konsultation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "31779",
        "clientoResIds": ["7533"],
        "meridiqPrimary": 7078,
        "meridiqCategories": ["Konsultationer · Hair TP Clinic"],
        "meridiqNameIncludes": ["Fysisk", "kliniken"],
        "confidence": "exact",
        "journalTypes": ["health_declaration", "fitness_certificate"],
    },
    {
        "arcanaServiceId": "followup-transplant",
        "label": "Uppföljning hårtransplantation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "63017",
        "clientoResIds": ["11458", "10326"],
        "meridiqPrimary": 7130,
        "meridiqCategories": ["Uppföljning · Hair TP Clinic"],
        "confidence": "exact",
        "journalTypes": ["follow_up"],
        "notes": "Cliento intern kalender: 31788 TP uppföljning (ej online).",
    },
    {
        "arcanaServiceId": "fue",
        "label": "FUE hårtransplantation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "31785",
        "clientoResIds": ["6677"],
        "meridiqPrimary": 7092,
        "meridiqCategories": ["FUE Hårtransplantation"],
        "confidence": "category",
        "journalTypes": ["tp_treatment", "fitness_certificate"],
    },
    {
        "arcanaServiceId": "dhi",
        "label": "DHI hårtransplantation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "47778",
        "clientoResIds": ["6677"],
        "meridiqPrimary": 7097,
        "meridiqCategories": ["DHI Hårtransplantation"],
        "confidence": "category",
        "journalTypes": ["tp_treatment", "fitness_certificate"],
    },
    {
        "arcanaServiceId": "beard",
        "label": "Skäggtransplantation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "51522",
        "clientoResIds": ["6677"],
        "meridiqPrimary": 7127,
        "meridiqCategories": ["DHI Skäggtransplantation", "FUE Skäggtransplantation"],
        "confidence": "category",
        "journalTypes": ["tp_treatment"],
    },
    {
        "arcanaServiceId": "eyebrow",
        "label": "Ögonbrynstransplantation",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "50561",
        "clientoResIds": ["6677"],
        "meridiqPrimary": 7104,
        "meridiqCategories": ["DHI Ögonbrynstransplantation"],
        "confidence": "fuzzy",
        "journalTypes": ["tp_treatment"],
        "notes": "Cliento 50561 = PRP TP ögonbryn; Meridiq 7104 = DHI ögonbrynstransplantation.",
    },
    {
        "arcanaServiceId": "prp-hair",
        "label": "PRP hår",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "31775",
        "clientoResIds": [],
        "meridiqPrimary": 7112,
        "meridiqCategories": ["PRP · Hår"],
        "confidence": "exact",
        "journalTypes": ["prp_treatment"],
    },
    {
        "arcanaServiceId": "prp-skin",
        "label": "PRP hud",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "50556",
        "clientoResIds": [],
        "meridiqPrimary": 7117,
        "meridiqCategories": ["PRP · Hud"],
        "confidence": "category",
        "journalTypes": ["prp_treatment"],
    },
    {
        "arcanaServiceId": "microneedling",
        "label": "Microneedling + PRP",
        "brand": "Hair TP Clinic",
        "clientoPrimary": "50558",
        "clientoResIds": [],
        "meridiqPrimary": 7121,
        "meridiqCategories": ["Microneedling med Dermapen"],
        "confidence": "category",
        "journalTypes": ["prp_treatment"],
    },
    {
        "arcanaServiceId": "consultation-curatiio-aesthetic",
        "label": "Konsultation estetiska injektioner",
        "brand": "Curatiio",
        "clientoPrimary": None,
        "clientoResIds": [],
        "meridiqPrimary": 8694,
        "meridiqCategories": ["Konsultationer · Curatiio"],
        "meridiqNameIncludes": ["Estetiska injektioner"],
        "confidence": "meridiq-only",
        "journalTypes": ["health_declaration"],
    },
    {
        "arcanaServiceId": "consultation-bleph",
        "label": "Konsultation ögonlocksplastik",
        "brand": "Curatiio",
        "clientoPrimary": "36607",
        "clientoResIds": [],
        "meridiqPrimary": 7080,
        "meridiqCategories": ["Konsultationer · Curatiio"],
        "meridiqNameIncludes": ["Ögonlocksplastik"],
        "confidence": "exact",
        "journalTypes": ["health_declaration", "fitness_certificate"],
    },
    {
        "arcanaServiceId": "consultation-ortho",
        "label": "Konsultation ortopedi",
        "brand": "Curatiio",
        "clientoPrimary": "50767",
        "clientoResIds": ["10300"],
        "meridiqPrimary": 7081,
        "meridiqCategories": ["Konsultationer · Curatiio"],
        "meridiqNameIncludes": ["Ortoped"],
        "confidence": "exact",
        "journalTypes": ["health_declaration"],
    },
    {
        "arcanaServiceId": "bleph-upper",
        "label": "Övre ögonlocksplastik",
        "brand": "Curatiio",
        "clientoPrimary": "38376",
        "clientoResIds": [],
        "meridiqPrimary": 7085,
        "meridiqCategories": ["Ögonlocksplastik · Curatiio"],
        "meridiqNameIncludes": ["Övre"],
        "confidence": "exact",
        "journalTypes": ["bleph_treatment"],
    },
    {
        "arcanaServiceId": "bleph-lower",
        "label": "Nedre ögonlocksplastik",
        "brand": "Curatiio",
        "clientoPrimary": "57998",
        "clientoResIds": [],
        "meridiqPrimary": 7082,
        "meridiqCategories": ["Ögonlocksplastik · Curatiio"],
        "meridiqNameIncludes": ["Nedre"],
        "confidence": "exact",
        "journalTypes": ["bleph_treatment"],
    },
    {
        "arcanaServiceId": "bleph-combined",
        "label": "Kombinerad ögonlocksplastik",
        "brand": "Curatiio",
        "clientoPrimary": "58000",
        "clientoResIds": [],
        "meridiqPrimary": 7105,
        "meridiqCategories": ["Ögonlocksplastik · Curatiio"],
        "meridiqNameIncludes": ["Övre och nedre"],
        "confidence": "exact",
        "journalTypes": ["bleph_treatment"],
    },
    {
        "arcanaServiceId": "botox",
        "label": "Botox",
        "brand": "Curatiio",
        "clientoPrimary": "64399",
        "clientoResIds": [],
        "meridiqPrimary": 7382,
        "meridiqCategories": ["Estetiska injektioner · Curatiio"],
        "meridiqNameIncludes": ["Botox"],
        "confidence": "category",
        "journalTypes": ["health_declaration"],
        "notes": "Cliento Botox-tjänster ligger i groupName Hair TP Clinic — troligen felgruppering.",
    },
    {
        "arcanaServiceId": "fillers",
        "label": "Fillers",
        "brand": "Curatiio",
        "clientoPrimary": None,
        "clientoResIds": [],
        "meridiqPrimary": 7377,
        "meridiqCategories": ["Estetiska injektioner · Curatiio"],
        "meridiqNameIncludes": ["Fillers"],
        "confidence": "meridiq-only",
        "journalTypes": ["health_declaration"],
    },
    {
        "arcanaServiceId": "profhilo",
        "label": "Profhilo",
        "brand": "Curatiio",
        "clientoPrimary": None,
        "clientoResIds": [],
        "meridiqPrimary": 7379,
        "meridiqCategories": ["Estetiska injektioner · Curatiio"],
        "meridiqNameIncludes": ["Profhilo"],
        "confidence": "meridiq-only",
        "journalTypes": ["health_declaration"],
    },
    {
        "arcanaServiceId": "ortho-treatment",
        "label": "Ortopedisk PRP/PRF",
        "brand": "Curatiio",
        "clientoPrimary": "50766",
        "clientoResIds": ["10300"],
        "meridiqPrimary": 7109,
        "meridiqCategories": ["Ortopedi · Curatiio"],
        "confidence": "category",
        "journalTypes": ["health_declaration"],
    },
]


def normalize_cat(name: str) -> str:
    return re.sub(r"\s+", " ", name.replace("|", "·")).strip()


def pick_meridiq_services(rule: dict, by_cat: dict) -> list:
    picked = []
    for cat in rule.get("meridiqCategories", []):
        norm = normalize_cat(cat)
        for key, services in by_cat.items():
            if normalize_cat(key) == norm:
                picked.extend(services)
    includes = rule.get("meridiqNameIncludes") or []
    if includes:
        filtered = [s for s in picked if any(inc.lower() in s["name"].lower() for inc in includes)]
        if filtered:
            picked = filtered
    if rule.get("meridiqPrimary") and not picked:
        for services in by_cat.values():
            for s in services:
                if s["apiId"] == rule["meridiqPrimary"]:
                    picked = [s]
    return picked


def build_triple_map(cliento_catalog: dict, meridiq_catalog: dict) -> dict:
    by_cat = meridiq_by_category(meridiq_catalog)
    cliento_services = {s["srvId"]: s for s in cliento_catalog["services"]}
    mapped_cliento: set[str] = set()
    mapped_meridiq: set[int] = set()
    entries = []

    for rule in TRIPLE_RULES:
        m_services = pick_meridiq_services(rule, by_cat)
        m_ids = ids_from_meridiq(m_services) or ([rule["meridiqPrimary"]] if rule.get("meridiqPrimary") else [])
        mapped_meridiq.update(m_ids)

        c_primary = rule.get("clientoPrimary")
        c_ids = [c_primary] if c_primary else []
        if c_primary:
            mapped_cliento.add(c_primary)

        entries.append(
            {
                "arcanaServiceId": rule["arcanaServiceId"],
                "label": rule["label"],
                "brand": rule["brand"],
                "confidence": rule["confidence"],
                "journalTypes": rule.get("journalTypes", []),
                "notes": rule.get("notes"),
                "cliento": {
                    "primarySrvId": c_primary,
                    "srvIds": c_ids,
                    "resIds": rule.get("clientoResIds", []),
                    "primaryName": cliento_services.get(c_primary, {}).get("name") if c_primary else None,
                },
                "meridiq": {
                    "primaryApiId": rule.get("meridiqPrimary"),
                    "apiIds": m_ids,
                    "count": len(m_ids),
                    "categories": rule.get("meridiqCategories", []),
                },
            }
        )

    unmapped_cliento = [
        s for s in cliento_catalog["services"] if s["srvId"] not in mapped_cliento
    ]
    unmapped_meridiq = [
        s for s in meridiq_catalog["services"] if s["apiId"] not in mapped_meridiq
    ]

    return {
        "exportedAt": "2026-05-25",
        "source": "buildLegacyCatalogs.py",
        "mappedBuckets": len(entries),
        "entries": entries,
        "unmappedCliento": {
            "count": len(unmapped_cliento),
            "services": [
                {
                    "srvId": s["srvId"],
                    "name": s["name"],
                    "brand": s.get("brand"),
                    "onlineVisible": s.get("onlineVisible"),
                }
                for s in unmapped_cliento
            ],
        },
        "unmappedMeridiq": {
            "count": len(unmapped_meridiq),
            "services": [
                {
                    "apiId": s["apiId"],
                    "name": s["name"],
                    "category": s["category"],
                }
                for s in unmapped_meridiq
            ],
        },
    }


def main():
    compact_path = MIGRATION / "cliento-compact-export.json"
    if not compact_path.exists():
        raise SystemExit(f"Missing {compact_path} — run browser export first")

    compact = load_json(compact_path)
    cliento_catalog = load_json(MIGRATION / "cliento-service-catalog.json")
    meridiq_catalog = load_json(MIGRATION / "meridiq-service-catalog.json")

    save_json(CLIENTO / "resource-catalog.json", enrich_cliento_resources(compact))
    save_json(CLIENTO / "addon-catalog.json", build_addon_catalog(compact))
    save_json(MIGRATION / "service-triple-map.json", build_triple_map(cliento_catalog, meridiq_catalog))

    print("Wrote:")
    print(" -", CLIENTO / "resource-catalog.json")
    print(" -", CLIENTO / "addon-catalog.json")
    print(" -", MIGRATION / "service-triple-map.json")


if __name__ == "__main__":
    main()
