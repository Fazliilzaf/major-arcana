# ORD-55 — Wira befintlig Veo-video in i Studions kampanjflöde (INGET nybygge)

**Datum:** 2026-07-10 · **Ägare:** Fazli (owner-regel: Studion äger kampanj/film/media; Översikt = beslut/status) · **Byggare: CODEX** · **Byggrepo:** arcana-ceo-agent · **Status:** KÖAD (efter ORD-54)

## Bakgrund (verifierad i kod 2026-07-10)

Studion har video HALVBYGGD sedan tidigare:

- StudioWorkspace.tsx: video-motorväljare finns (kind "video", rad ~31/41/201-210/574) och videoProvider SKICKAS redan i POST till /api/ceo/campaign (rad ~276).
- /api/ceo/campaign/route.ts: validerar videoProvider + fail-closar 409 om ej live (rad ~59-78), echoar providers.video (rad ~211) — men RENDERAR ALDRIG video.
- Video-rendering existerar endast i lib/ceo/orchestrator.ts (steg 9c, kommandoflödet) med färdig Veo 3.1-adapter (lib/creative/video-gen.ts, verifierad skarp 2026-07-10) + persist (lib/store/generated-video.ts).

## Uppgift: koppla ihop det som redan finns — återanvänd, bygg inte om

1. /api/ceo/campaign: efter runCCO, när VIDEO_STORYBOARD finns OCH vald videoProvider är live → rendera via BEFINTLIGA video-gen-adaptern (samma persist-store), returnera `generatedVideo` i svaret (mönster: generatedImage).
2. StudioWorkspace: video-kort i kampanjpaketet (bredvid IG-post/Karusell/Landning/Mail+SMS): "väntar" före generering, spelare vid klar, ÄRLIGT felläge vid Veo-fel (som cockpit), "ej live"-läge när motor saknas. Ingå i samma godkänn-gate/status som övriga assets.
3. Kostnadskontroll: rendering sker ENDAST vid explicit generering (användarens klick på Generera kampanj), aldrig retry-loopar. Befintlig poll-bounds i adaptern återanvänds.
4. Export: video-nedladdning i asset-exporten (mönster: bildexport).

## Acceptans

1. Studio-generering med Veo vald → riktigt video-kort med spelare i kampanjpaketet; utan videoKey → ärligt "ej live"; Veo-fel → ärligt felmeddelande (ordagrant Google-fel).
2. Ingen dubblering: campaign-routen använder SAMMA adapter/store som orchestratorn (ingen ny video-kod).
3. Övriga kampanjpaketet oförändrat. tsc rent, full svit 0 FAIL, build grön. Live-verifiering i Studion.

## Forbidden

Starta EJ före ORD-54 klar. INGEN ny video-adapter/duplicerad logik. Studio-palett/skuggor bevaras (feedback_studio_v2_keep_palette_shadings). Frysta arcana-tjänsten. Aldrig git add -A.

## DESIGNKRAV (owner, ABSOLUT): följ Studions BEFINTLIGA design — hitta INTE på ny

Video-kortet ska vara en exakt syskonkopia av de befintliga kampanjpaket-korten (IG-post/Karusell/Landningssida/Mail+SMS): samma markup-mönster, samma --tokens/palett/skuggor/gradienter, samma kortstorlek och grid-placering (paketet blir 2×2+1 eller 3+2 enligt befintligt grid-beteende), samma statusetiketter ("väntar"/"Utkast"/"Granska"/"Godkänd") och samma typografi. Motorväljar-kortet för Video finns redan och ska ANVÄNDAS som det är. INGA nya färger, inga nya komponentstilar, inga egna påhitt — kopiera mönstret från bildkortet rakt av. Referens: feedback_studio_v2_keep_palette_shadings + feedback_no_palette_changes_without_explicit_request.
