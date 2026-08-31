# Android: paketnamnet är reserverat, appen finns inte

**2026-08-31** · gäller den dag någon börjar bygga en Android-app för kliniken

---

## Läget

Det finns **ingen Android-app** i det här repot. Ingen `build.gradle`, ingen
`AndroidManifest.xml`, ingen Capacitor-konfiguration. Personalytan och
kundportalen är webb, och berörs inte av något nedan.

Men **ett paketnamn är registrerat** i Google Play Console under "Verifiering av
Android-utvecklare", i förväg, inför en eventuell framtida app. Fazli gjorde det
2026-08-31.

Skälet till förhandsregistreringen: Play meddelade 2026-07-15 att appar som inte
är registrerade senast **2026-09-30** tas bort från Google Play globalt, och att
oregistrerade appar från andra butiker inte längre kan installeras på
certifierade Android-enheter i utvalda länder. Att reservera namnet nu betyder
att registreringen aldrig blir det som stoppar en lansering.

## Vad den som bygger appen måste veta

**Paketnamnet i `applicationId` måste stämma exakt** med det registrerade. Ett
annat namn är en annan app i Plays ögon, och den är inte registrerad.

**Signeringsnyckeln måste vara den som kopplats till registreringen.** Byggs
appen med en ny nyckel måste den nyckeln registreras separat innan appen
distribueras — det gäller även appar som sprids utanför Play.

Kravet omfattar alltså:

- appar på Google Play
- appar som distribueras utanför Play
- eventuella extra signeringsnycklar för Play-appar som används vid signering
  utanför Play

## Var det faktiska namnet står

Google Play Console → **Verifiering av Android-utvecklare**. Det står inte i
repot, med flit: registret i Play är sanningen, och en kopia här skulle bara
kunna glida isär från den.

Kontrollera där innan du sätter `applicationId` — inte här.
