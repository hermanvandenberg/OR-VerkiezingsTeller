# Verkoopwebsite or-verkiezingen.com · technische aanpak

Status: voorwerk (26-11-2026). Niets hiervan staat live. De huidige app blijft ongewijzigd tot na de verkiezingsrun van 30 november t/m 4 december.

## Wat er in deze map staat

| Bestand | Wat |
|---|---|
| `versie-a.html` | Ontwerp A "Vertrouwd": rustig, huisstijl van de app, stembiljet in de kop, prijzen in drie kaarten, veelgestelde vragen. |
| `versie-b.html` | Ontwerp B "Van eerste stap tot nieuwe OR": donker en uitgesproken, de WOR-tijdlijn is het verkoopverhaal. Belooft functies uit het voortraject-plan die nog gebouwd moeten worden (tijdlijn, kandidaatstelling). |
| `versie-c.html` | Ontwerp C "Direct proberen": redactionele stijl, proefstem direct op de voorpagina, vergelijking met papier/formulier, prijscalculator. |
| `demo.html` | Demo-omgeving (prototype): verkiezing, kandidaten, kiezers (max 10), proefstem met bevestigingsvenster, uitslag. |
| `kopen.html` | Koopflow (prototype): pakket, factuurgegevens, betaalwijze, "neem demogegevens mee", licentie vrijgegeven. |
| `demo-opslag.js` | Prototype-opslag in de browser. In het echte product staat dit in Supabase. |
| `versie-d.html` | Ontwerp D "Zakelijk platform": navy en petrol, dashboard in de kop, rollen, beveiliging, prijsvergelijkingstabel. |
| `versie-e.html` | Ontwerp E "Formeel en institutioneel": diepgroen met serif, proces-verbaal in de kop, waarborgen, procedure, wie ziet wat, offerteformulier. |
| `versie-f.html` | Ontwerp F "Product voorop": productvenster met tabbladen, schema van de anonimiteit, prijzen. |
| `index.html` | Overzicht van alle ontwerpen. |

De drie landingspagina's delen dezelfde demo en koopflow. De prijzen (€395 / €595 / €895 excl. btw) zijn een voorstel op basis van het marktonderzoek van 16-11.

## Domeinen

Nu draait de app op `or-verkiezingen.com` zelf. Voorstel na de run:

- `or-verkiezingen.com` → verkoopwebsite (statisch, GitHub Pages of Cloudflare Pages)
- `app.or-verkiezingen.com` → de app (zelfde code als nu)
- de demo is gewoon de app met een organisatie in demostand, dus geen apart domein nodig

Stemlinks die al verstuurd zijn voor de run blijven tot 4 december op het huidige adres nodig. Domein dus pas omzetten na sluiting, en een doorverwijzing laten staan van de oude paden (`stem.html`, `beheer.html`) naar `app.`.

## Van één klant naar meerdere klanten

De app is nu ingericht voor één organisatie per Supabase-project. Om zelf te verkopen met een demo die je meeneemt, is één gedeeld project met meerdere organisaties het handigst:

- Nieuwe tabel `organisaties` (id, naam, status `demo` | `actief` | `verlopen`, pakket, max_kiezers, licentie_tot).
- Elke bestaande tabel (verkiezingen, kandidaten, kiezers, stemmen, logboek, commissie) krijgt een `organisatie_id`.
- RLS-regels krijgen er één voorwaarde bij: je ziet alleen rijen van je eigen organisatie.
- De anonimiteit blijft precies zoals nu: stemmen zonder naam, e-mail of tijdstip, losgekoppeld van wie gestemd heeft.

Alternatief: per klant een eigen Supabase-project. Dat is sneller om mee te beginnen, maar dan moet demodata echt gekopieerd worden en is zelfbediening (kopen zonder tussenkomst van Herman) niet mogelijk.

## Demo

- Koper maakt een account aan met e-mail (magic link). Zonder account kan ook, maar dan staat alles alleen in de browser en is meenemen lastiger. Advies: de demo opent direct zonder account, en vraagt pas om een e-mailadres op het moment dat er iets bewaard moet worden.
- Bij aanmaken: organisatie met status `demo`.
- Beperkingen in demostand, afgedwongen in de database (niet alleen in de schermen):
  - maximaal 10 kiezers
  - mails worden niet echt verstuurd (de edge functions weigeren bij status `demo`)
  - een verkiezing kan niet echt geopend worden, alleen proefstemmen
  - uitslag-pdf krijgt een watermerk "DEMO"
- Demo's zonder aankoop worden na 30 dagen automatisch opgeruimd (cron, zoals de bewaartermijn nu).

## Betalen en licentie

- Betaalprovider: **Mollie** (Nederlands, iDEAL, creditcard, en "betalen op factuur" via Mollie of eigen factuur). Stripe kan ook, maar Mollie past beter bij Nederlandse OR'en en hun inkoopafdelingen.
- Flow:
  1. Koper klikt "Betalen" → edge function `bestelling-aanmaken` maakt een Mollie-betaling aan met `organisatie_id` en pakket in de metadata.
  2. Mollie stuurt de koper naar iDEAL en daarna terug naar `kopen.html?klaar`.
  3. Mollie roept de webhook aan → edge function `mollie-webhook` haalt de betaling op bij Mollie (nooit de webhookdata zelf vertrouwen), en bij `paid`:
     - organisatie naar status `actief`, pakket en `max_kiezers` instellen, `licentie_tot` = vandaag + 12 maanden
     - licentiecode aanmaken (bijv. `ORV-XXXX-XXXX-XXXX`) en vastleggen
     - proefstemmen wissen, de rest (instellingen, logo, kandidaten, kiezers, commissie) blijft staan
     - mail met licentiecode en factuur naar de beheerder
  4. Koos de koper "niet meenemen": de demoverkiezing wordt geleegd.
- Op factuur: licentie direct vrij, maar een verkiezing openen kan pas als de factuur betaald is (status `actief_onbetaald`).
- Facturen: Mollie maakt geen facturen. Koppel Moneybird (of e-Boekhouden) via de webhook, of maak een eenvoudige pdf-factuur met jsPDF zoals de uitslag-pdf nu.

Omdat de demo en het echte product dezelfde database en dezelfde organisatie gebruiken, is "demodata meenemen" niets anders dan het omzetten van één status. Er hoeft niets gekopieerd te worden.

## Volgorde na de run (voorstel)

1. Run 30 nov t/m 4 dec afronden, uitslag veiligstellen.
2. Herman kiest een ontwerp (A, B of C, of een mix).
3. Multi-tenant maken (organisaties + RLS) en testen met twee proeforganisaties.
4. Demostand met beperkingen.
5. Mollie-account (KvK nodig), edge functions voor bestellen en webhook, eerst in testmodus.
6. Verkoopwebsite in het gekozen ontwerp, app naar `app.or-verkiezingen.com`, doorverwijzingen.
7. Privacyverklaring, algemene voorwaarden en een verwerkersovereenkomst (de klant is verwerkingsverantwoordelijke, jij verwerker).
8. Live.

## Open punten voor Herman

- Welk ontwerp, of welke onderdelen uit welk ontwerp.
- Prijzen en pakketgrenzen definitief maken.
- Rechten op de app: afspraak met je werkgever, omdat je hem als OR-voorzitter hebt gebouwd.
- Bedrijfsvorm en KvK-inschrijving (nodig voor Mollie en facturen).
- Wil je echte klantervaringen op de site? Pas na de eerste klanten, met hun toestemming. De citaat-tekst in ontwerp C is een voorbeeld en moet je zelf goedkeuren.
