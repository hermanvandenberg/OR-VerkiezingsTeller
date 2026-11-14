# OR-VerkiezingsTeller

Digitaal stemmen voor (tussentijdse) OR-verkiezingen. Iedere collega krijgt een mail met een persoonlijke stemlink, kiest op de stempagina een kandidaat of "onthouden", vult naam en e-mail in en bevestigt. De kiescommissie volgt de opkomst, handelt meldingen af en ziet de uitslag. De beheerder richt alles in.

## Wat zit erin

| Pagina | Voor wie | Wat |
|---|---|---|
| `stem.html#<link>` | Iedere collega | Kandidaattegels naast elkaar, onthouden, naam en e-mail, bevestigingsvenster |
| `index.html` | Commissie en beheerder | Inloggen, account aanmaken (alleen na uitnodiging), tweestapsverificatie |
| `dashboard.html` | Kiescommissie | Opkomst, uitslag (na sluiting of live), meldingen, stemmers tonen, logboek |
| `beheer.html` | Alleen de beheerder | Verkiezing, data en tijden, herinneringen, kandidaten met foto, e-maillijst, versturen, commissie, logo |

De website zelf staat op GitHub Pages. Stemmen, accounts en logboek staan in **Supabase** (database met inlog), omdat GitHub Pages zelf niets kan opslaan.

## Zo werkt de beveiliging

- **Eén stem per persoon.** Elke collega krijgt een eigen link. Die bestaat uit een willekeurige code plus een handtekening met een geheime sleutel in de database; raden is praktisch onmogelijk. Na het stemmen werkt de link niet meer, ook niet als twee pogingen tegelijk binnenkomen.
- **Ander e-mailadres ingevuld?** Dan wordt de stem apart gezet en telt pas mee als de commissie hem goedkeurt. Bij afkeuren vervalt de stem en kan de echte collega opnieuw stemmen met een nieuwe link (stuur een herinnering).
- **Meldingen** voor de commissie bij: afwijkend e-mailadres, opnieuw proberen met een gebruikte link, veel ongeldige links in korte tijd, een mail die niet verstuurd kon worden.
- **Stemmen zijn niet te wijzigen of te verwijderen**, door niemand. Stemmen worden zonder tijdstip opgeslagen.
- **Logboek**: elke handeling van beheerder en commissie wordt vastgelegd en kan niet worden aangepast.
- **Alleen uitgenodigde adressen** kunnen een account maken. Inloggen kan alleen met tweestapsverificatie (code-app op de telefoon). De sessie stopt als je de browser sluit.
- **Rollen**: alleen de beheerder kan verkiezingen inrichten, lijsten inladen en commissieleden uitnodigen. Commissieleden kunnen kijken en meldingen afhandelen. De kiezerslijst is alleen voor de beheerder zichtbaar.
- **Vast na de start**: starttijd, stemgeheim, zichtbaarheid van de uitslag en kandidaten. Het eindmoment kan nog verlengd worden (en dat staat in het logboek).

### Stemgeheim

Per verkiezing kies je:

- **Anoniem, tonen mogelijk** (standaard). De koppeling stemmer-keuze wordt bewaard, maar is pas zichtbaar als twee commissieleden akkoord geven. Ieder akkoord en iedere keer bekijken staat in het logboek. De stempagina vertelt dit aan de kiezer.
- **Volledig geheim.** De koppeling wordt nooit opgeslagen. Stemmers tonen kan dan niet.

De WOR vraagt dat het kiesreglement een geheime stemming waarborgt. Check jullie kiesreglement voordat je "tonen mogelijk" gebruikt.

### Eerlijk over de grenzen

- Wie het Supabase-project beheert (eigenaar van het account), kan technisch gezien in de database kijken. Bij "volledig geheim" valt daar niets te koppelen.
- Bij **Word-afdruk samenvoegen** heeft de beheerder een lijst met alle links in handen. Wie die lijst heeft, kan namens anderen stemmen. Verwijder de lijst na gebruik en ook de verzonden mails uit "Verzonden items". Bij **Outlook automatisch** ziet niemand de links.
- Bij "uitslag live" kan iemand die de tussenstand vaak ververst en weet wie net gestemd heeft, iets afleiden. Kies daarom bij voorkeur "pas na sluiting".

## Installatie (eenmalig, ongeveer 30 minuten)

### 1. Supabase-project maken
1. Maak een gratis account op [supabase.com](https://supabase.com) en een nieuw project. Kies als regio **Central EU (Frankfurt)** en een sterk databasewachtwoord.
2. Open **SQL Editor**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql), vervang **onderaan** `JOUW-EMAIL@BEDRIJF.NL` door jouw e-mailadres, en klik **Run**.

### 2. Inloggen instellen
In Supabase onder **Authentication**:
1. **Sign In / Providers > Email**: laat "Confirm email" aan. Zet de minimale wachtwoordlengte op 12.
2. **URL Configuration**: zet de *Site URL* op het adres van je website (stap 4), bijvoorbeeld `https://hermanvandenberg.github.io/OR-VerkiezingsTeller/index.html`, en voeg hetzelfde adres toe bij *Redirect URLs*.
3. **Multi-Factor**: controleer dat TOTP (authenticator-app) aan staat.
4. Tip: de standaard mailserver van Supabase verstuurt maar een paar mails per uur. Voor 5 commissieleden is dat genoeg; anders stel je onder **SMTP Settings** je eigen mailserver in.

### 3. Website koppelen aan Supabase
Zet in [`js/config.js`](js/config.js) de **Project URL** en de **anon public key** (Supabase > Project Settings > API). Die sleutel mag openbaar zijn. Zet hier **nooit** de `service_role` sleutel.

### 4. GitHub Pages aanzetten
In deze repository: **Settings > Pages > Deploy from a branch > main / (root)**. Na een minuut staat de site op `https://<gebruikersnaam>.github.io/OR-VerkiezingsTeller/`. (Gratis GitHub Pages vereist een openbare repository; dat is veilig, er staan geen geheimen in.)

### 5. Eerste keer inloggen
Ga naar `.../index.html#registreren`, maak een account met het adres uit stap 1, bevestig via de mail, log in en scan de QR-code met Microsoft Authenticator of Google Authenticator. Je komt op het beheerscherm.

### 6. In het beheerscherm
1. **Huisstijl en website**: vul de naam van de OR en het websiteadres in en upload het logo (PNG, JPG of WebP).
2. **Verkiezing**: titel, toelichting, start en einde (datum en tijd), stemgeheim, wanneer de uitslag zichtbaar is, verzendwijze en herinneringsmomenten.
3. **Kandidaten**: naam, functie, tekst en foto.
4. **E-maillijst**: sleep een Excel- of CSV-bestand erin (ook een export van Outlook-contactpersonen), of plak adressen uit Outlook. Je ziet eerst hoeveel geldig, dubbel en ongeldig zijn.
5. **Kiescommissie**: vul naam en e-mail in (max. 5) en stuur ze de registratielink die eronder staat.

### 7. Uitnodigingen versturen: kies een van beide

**A. Word-afdruk samenvoegen (werkt altijd)**
1. Klik **Download uitnodigingslijst**. Je krijgt een CSV met de kolommen `naam`, `voornaam`, `email`, `link`, `sluit`.
2. Word > **Verzendlijsten > Afdruk samenvoegen starten > E-mailberichten** > **Adressen selecteren > Bestaande lijst gebruiken** > kies de CSV.
3. Schrijf de mail. Voeg via **Samenvoegveld invoegen** `voornaam`, `link` en `sluit` toe. Maak van de link een hyperlink: selecteer de tekst, Ctrl+K, en gebruik het veld `link` (of zet het veld gewoon als tekst in de mail; Outlook maakt er dan zelf een link van).
4. **Voltooien en samenvoegen > E-mailberichten verzenden**, veld *Aan* = `email`, indeling HTML.
5. Op de herinneringsmomenten: **Download herinneringslijst** (alleen wie nog niet stemde) en herhaal.
6. Verwijder daarna de CSV-bestanden en de verzonden mails (zie "Eerlijk over de grenzen").

**B. Outlook automatisch (vraagt eenmalig hulp van IT)**

IT doet in Microsoft Entra / Microsoft 365:
1. **App-registratie** maken (bijvoorbeeld "OR-VerkiezingsTeller"), een **client secret** aanmaken.
2. API-machtiging **Microsoft Graph > Application > Mail.Send** toevoegen en **admin consent** geven.
3. De app beperken tot alleen de mailbox van de voorzitter, met een *Application Access Policy* of *RBAC for Applications* in Exchange Online. Zonder deze stap mag de app vanaf elke mailbox mailen.
4. Aan jou doorgeven: Tenant ID, Client ID en Client secret.

Daarna in Supabase:
1. **Edge Functions > Deploy a new function > Via editor**, naam `mail-verwerken`, plak [`supabase/functions/mail-verwerken/index.ts`](supabase/functions/mail-verwerken/index.ts) en zet **Verify JWT** uit (de functie controleert zelf een geheim).
2. **Edge Functions > Secrets**: voeg toe `CRON_GEHEIM` (zelf verzonnen, minstens 32 tekens), `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_AFZENDER` (jouw e-mailadres).
3. **SQL Editor**: plak [`supabase/cron.sql`](supabase/cron.sql), vul de functie-URL en hetzelfde `CRON_GEHEIM` in, en klik **Run**.
4. Zet bij de verkiezing de verzendwijze op **Outlook automatisch** en klik **Uitnodigingen versturen**. Er gaan ongeveer 25 mails per minuut uit; herinneringen gaan vanzelf op de ingestelde momenten.

## Een volgende verkiezing

Klik in het beheerscherm op **Nieuwe verkiezing**. Oude verkiezingen blijven als archief bewaard, met hun uitslag en logboek. Een verkiezing kan ook meer dan twee kandidaten hebben.

**Beheer overdragen** aan een nieuw OR-lid: laat diegene als commissielid uitnodigen en een account maken, en voer dan in de SQL Editor uit:

```sql
update public.toegang set rol = 'beheerder' where email = 'nieuw@bedrijf.nl';
update public.toegang set rol = 'commissie' where email = 'oud@bedrijf.nl';  -- of: delete ...
```

## Bestanden

```
index.html, stem.html, dashboard.html, beheer.html   de pagina's
css/stijl.css                                         opmaak
js/config.js                                          Supabase-adres en publieke sleutel
js/*.js                                               logica per pagina
supabase/schema.sql                                   database, rechten en regels
supabase/cron.sql                                     planner voor automatisch mailen (optie B)
supabase/functions/mail-verwerken/index.ts           mailfunctie via Microsoft Graph (optie B)
```
