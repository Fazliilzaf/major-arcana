'use strict';

/**
 * En kanonisk plats för "starta en app på en tillfällig port, gör ett anrop,
 * stäng ner".
 *
 * VARFÖR DEN FINNS. Tjugoen testfiler implementerade samma sak för hand, och
 * tolv av anropen till server.close() väntades aldrig in. Det är samma
 * duplikationsfel som --cc-rgb, kortreceptet och färgtripletterna, fast i
 * testinfrastrukturen: mönstret fanns på tjugoen ställen och var rätt på nio.
 *
 * VAD ETT OINVÄNTAT close() FAKTISKT GÖR. server.close() är asynkront. Det
 * slutar ta emot nya anslutningar direkt, men lyssnaren släpper inte porten
 * förrän händelseloopen kört klart stängningen. Ett test som inte väntar går
 * vidare till nästa medan den gamla servern fortfarande håller sin port, och i
 * en svit som kör tvåhundra filer parallellt ackumuleras de. Node avslutar
 * dessutom inte processen medan handtag är öppna, så en läcka kan hålla en
 * testprocess vid liv efter att sista testet passerat.
 *
 * ÄRLIGT OM ORSAKSSAMBANDET. Sviten gav ett rött test en gång, och tre olika
 * utfall på tre körningar. Jag har INTE lyckats reproducera det: tolv riktade
 * stresskörningar av just de här filerna och tre fulla sviter var alla gröna.
 * Att inte invänta close() är alltså en bevisad defekt men en OBEVISAD orsak
 * till just det felet. Den här filen fixar defekten. Skulle flakigheten
 * återkomma efteråt är hypotesen motbevisad, och det är i sig värt något —
 * då vet nästa person att leta någon annanstans.
 */

const { once } = require('node:events');

/**
 * Starta appen på en ledig port och lämna basadressen till `run`. Servern
 * stängs — och stängningen INVÄNTAS — oavsett hur `run` slutar.
 *
 * @param {import('http').Server|Function} app  express-app eller http.Server
 * @param {(bas: string) => Promise<unknown>} run
 */
async function medServer(app, run) {
  const server = app.listen(0, '127.0.0.1');
  // Vänta in 'listening' innan address() läses. Utan det kan address() ge null
  // på en långsam maskin, och felet blir ett obegripligt "port of null".
  await once(server, 'listening');
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    // Ordningen spelar roll, och det är inte uppenbart.
    //
    // server.close() väntar på att ALLA öppna anslutningar avslutas. En
    // keep-alive-anslutning som ingen stänger gör därför att löftet aldrig
    // resolvar, och testet hänger i stället för att gå vidare — alltså ett
    // värre symptom än det oinväntade close() som fixen skulle lösa.
    //
    // Löftet skapas FÖRST och anslutningarna rivs sedan, så att
    // closeAllConnections garanterat körs innan vi börjar vänta.
    // opsClientoBookingsImport.test.js hade redan hittat det här och gjorde
    // rätt när jag trodde att den gjorde fel — min detektor läste
    // "server.close(resolve)" inuti ett new Promise som ett oinväntat anrop.
    const stangd = new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    await stangd;
  }
}

/**
 * Ett enskilt anrop mot en app. Bekvämlighetslager ovanpå medServer för de
 * tester som bara vill göra en request.
 *
 * Svarskroppen läses HELT innan servern stängs. Gör man tvärtom hinner
 * socketen stängas mitt i läsningen och fetch kastar ett fel som ser ut som
 * ett applikationsfel men inte är det.
 */
async function anrop(app, metod, sokvag, { body, headers } = {}) {
  return medServer(app, async (bas) => {
    const res = await fetch(`${bas}${sokvag}`, {
      method: metod,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      text,
      json() {
        return JSON.parse(text);
      },
    };
  });
}

module.exports = { medServer, anrop };
