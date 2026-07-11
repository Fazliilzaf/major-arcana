# ORD-56 — Migrera Imagen 4 → Gemini Image ("Nano Banana") + revision av hela modellregistret till senaste

**Datum:** 2026-07-10 · **Ägare:** Fazli (owner-krav: "vi måste ha de senaste uppdateringarna i våra program") · **Byggare: CODEX** · **Byggrepo:** arcana-ceo-agent · **Status:** FRI ATT STARTA

## Del 1 — Imagen-migration (huvuduppgift)

Imagen 4 (imagen-4.0-generate-001) stängs av Google 2026-08-17. Migrera bildadaptern till Gemini Image-modellen:

- Mål: `gemini-3.1-flash-image` (Googles rekommenderade migrationsmål; fallback-env ARCANA_IMAGEN_MODEL behålls överstyrbar).
- OBS EJ drop-in: anropet byter från `:predict` (generate_images) till `generateContent`; EN bild per anrop; svaret bär bild som inline data. Verifiera payload/response mot https://ai.google.dev/gemini-api/docs/image-generation och https://firebase.google.com/docs/ai-logic/imagen-models-migration — skicka ENDAST dokumenterade fält (lärdom från Veo: regionskänsligt, iterera inte 400-fel).
- Samma Google-nyckel (ARCANA_GOOGLE_API_KEY-värdet). providers.ts-etikett uppdateras ("Nano Banana"/gemini-3.1-flash-image). Fail-closed som idag.

## Del 2 — Modellregister-revision (samma PR eller uppföljande)

Gå igenom lib/creative/model-registry.ts + alla default-modeller mot leverantörernas AKTUELLA rekommendationer och uppgradera till senaste stabila:

- Text: openai-default (idag gpt-4o-mini) + anthropic-default (idag claude-haiku-4-5) — kontrollera senaste kostnadseffektiva rekommendation.
- Analys: gemini-2.0-flash — kontrollera om nyare flash-modell rekommenderas.
- Video: veo-3.1-generate-preview — byt till stabil variant om GA finns.
- Bild: gpt-image-1, flux-2-max — kontrollera aktuella versioner.
  Dokumentera per modell: vald version, källa (docs-URL), datum. Env-överstyrningar behålls så byten framåt är config, inte kod.

## Acceptans

1. Studio-bildgenerering via "Nano Banana" ger riktig bild live; Imagen 4-referensen borta före 2026-08-17.
2. Modellregistret dokumenterat med senaste versioner + källor; inga odokumenterade fält i payloads.
3. Tester uppdaterade (kontraktstest på ny payload). tsc rent, full svit 0 FAIL, build grön. Live-verifiering i Studion.

## Forbidden

Inga tysta fallbacks mellan modeller. Studions design orörd. Frysta arcana-tjänsten. Aldrig git add -A.

## Bilaga: Claudes modellinventering 2026-07-10 (nuvarande vs senaste — verifierad via leverantörsdocs/sök)

| Kategori         | Idag i koden                                                   | Senaste (juli 2026)                                                                                                  | Åtgärd                                                                                                           |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Text OpenAI      | gpt-4o-mini (2024 års modell!)                                 | GPT-5.x-familjen; billigast = GPT-5.4 Nano ($0.075/M in); 4o-mini ersattes redan av 4.1-mini                         | **Uppgradera** default (välj kostnadseffektiv 5.x, t.ex. gpt-5.4-nano/mini — verifiera exakt id i platform-docs) |
| Text Anthropic   | claude-sonnet-4-6 (kod-default; live-env kör claude-haiku-4-5) | claude-sonnet-5 (senaste sonnet); claude-haiku-4-5 är fortsatt senaste haiku                                         | **Uppgradera** kod-default → claude-sonnet-5; haiku-4-5 OK som live-val                                          |
| Analys Google    | gemini-2.0-flash                                               | **Gemini 3.5 Flash GA** (maj 2026); Gemini 3 Flash/3.1 Pro i preview                                                 | **Uppgradera** → gemini-3.5-flash (stabil GA)                                                                    |
| Bild OpenAI      | gpt-image-1                                                    | **gpt-image-2** (april 2026, GPT-5.4-backbone; dall-e-2/3 borttagna ur API:t maj 2026)                               | **Uppgradera** → gpt-image-2                                                                                     |
| Bild BFL         | flux-2-max                                                     | FLUX.2-familjen aktuell: [pro]=flaggskepp $0.03/bild, [klein] jan 2026; "max"-variantens status oklar i öppna källor | **Verifiera** mot docs.bfl.ai/release-notes — byt endast om max fasas ut                                         |
| Bild Google      | imagen-4.0-generate-001 (STÄNGS 2026-08-17)                    | Nano Banana-familjen; gemini-3.1-flash-image rekommenderat migrationsmål, "Nano Banana 2 Lite" nyast/snabbast        | **Migrera** (Del 1) — utvärdera 3.1-flash-image vs Nano Banana 2                                                 |
| Video Google     | veo-3.1-generate-preview                                       | Veo 3.1 är marknadens premier (OpenAI Sora 2 NEDLAGD april 2026); kontrollera om stabil GA-variant ersatt -preview   | **Byt till stabil** variant om GA finns                                                                          |
| Ideogram/Recraft | ideogram-v4 / recraftv4 (vilande)                              | verifieras när nycklar skaffas                                                                                       | —                                                                                                                |

Källor: OpenAI release notes/pricing, Google ai.google.dev models/changelog + Firebase-migrationguide, BFL bfl.ai/blog + docs. Codex: verifiera varje exakt modell-id mot respektive officiella docs INNAN byte (sökresultat ≠ API-id), en PR per leverantör om det blir stort.

## ÄGAR-DIREKTIV 2026-07-10 (förtydligande): välj BÄSTA, inte billigaste

Fazli: "jag vill uppdatera allt till de bästa". Princip per kategori: välj den BÄSTA tillgängliga stabila modellen (kvalitet först), inte budget-varianten:

- Text OpenAI: bästa GA-modellen i GPT-5.x-familjen som passar copy-generering (inte Nano — den är budgetalternativ; verifiera aktuellt flaggskepps-id i platform-docs).
- Text Anthropic: claude-sonnet-5 som default (bästa balanserade); env-öppning för claude-opus-4-8 vid behov.
- Analys: gemini-3.5-flash GA (bästa stabila flash); om Pro-variant är stabil och märkbart bättre för bild/copy-analys, välj den.
- Bild OpenAI: gpt-image-2. Bild Google: bästa Nano Banana-varianten (inte Lite om full varianten är bättre). BFL: bästa FLUX.2-varianten enligt release notes.
- Video: bästa stabila Veo 3.1-varianten.
  ALLA modeller förblir env-överstyrbara (ARCANA\_\*\_MODEL) så kostnadsjustering är config, inte kod. Dokumentera kostnad per modell i PR:en så Fazli ser driftpåverkan.
