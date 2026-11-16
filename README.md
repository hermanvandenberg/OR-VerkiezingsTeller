# OR-VerkiezingsTeller

Digitaal stemmen voor (tussentijdse) OR-verkiezingen. Iedere collega krijgt een mail met een persoonlijke stemlink, kiest op de stempagina een kandidaat of "onthouden", vult naam en e-mail in en bevestigt. De kiescommissie volgt de opkomst, handelt meldingen af en ziet de uitslag. De beheerder richt alles in.

## Wat zit erin

| Pagina | Voor wie | Wat |
|---|---|---|
| `stem.html#<link>` | Iedere collega | Kandidaattegels naast elkaar, onthouden, naam en e-mail, bevestigingsvenster |
| `index.html` | Commissie en beheerder | Inloggen, account aanmaken (alleen na uitnodiging), tweestapsverificatie |
| `dashboard.html` | Kiescommissie | Opkomst, uitslag (na sluiting of live), meldingen, logboek |
| `beheer.html` | Alleen de beheerder | Verkiezing, data en tijden, herinneringen, kandidaten met foto, e-maillijst, versturen, commissie, logo en huisstijl |

De website zelf staat op GitHub Pages. Stemmen, accounts en logboek staan in **Supabase** (database met inlog), omdat GitHub Pages zelf niets kan opslaan.

## Zo werkt de beveiliging

- **Eén stem per persoon.** Elke collega krijgt een eigen link. Die bestaat uit een willekeurige code plus een handtekening met een geheime sleutel in de database; raden is praktisch onmogelijk. Na het stemmen werkt de link niet meer, ook niet als twee pogingen tegelijk binnenkomen.
- **Ander e-mailadres ingevuld?** Dan wordt de stem apart gezet en telt pas mee als de commissie hem goedkeurt. Bij afkeuren vervalt de stem en kan de echte collega opnieuw stemmen met een nieuwe link (stuur een herinnering).
- **Meldingen** voor de commissie bij: afwijkend e-mailadres, opnieuw proberen met een gebruikte link, veel ongeldige links in korte tijd, een mail die niet verstuurd kon worden.
- **Stemmen zijn niet te wijzigen of te verwijderen**, door niemand. Stemmen worden zonder tijdstip opgeslagen.
- **Logboek**: elke handeling van beheerder en commissie wordt vastgelegd en kan niet worden aangepast.
- **Alleen uitgenodigde adressen** kunnen een account maken. Inloggen kan alleen met tweestapsverificatie (code-app op de telefoon). De sessie stopt als je de browser sluit.
- **Rollen**: alleen de beheerder kan verkiezingen inrichten, lijsten inladen en commissieleden uitnodigen. Commissieleden kunnen kijken en meldingen afhandelen. De kiezerslijst is alleen voor de beheerder zichtbaar.
- **Vast na de start**: starttijd, zichtbaarheid van de uitslag en kandidaten. Het eindmoment kan nog verlengd worden (en dat staat in het logboek).

### Stemgeheim

De stemming is volledig anoniem. Een stem wordt opgeslagen zonder naam, e-mailadres of tijdstip; bij de kiezer wordt alleen bijgehouden *dat* die gestemd heeft. Niemand, ook de beheerder niet, kan terugzien wie op wie heeft gestemd.

Eén uitzondering, alleen zolang het duurt: een stem met een afwijkend e-mailadres wordt apart gezet tot de commissie besluit. Tot dat moment weet de database bij welke melding die stem hoort (de commissie ziet de keuze niet). Zodra de commissie goed- of afkeurt, wordt die verwijzing gewist.

### Eerlijk over de grenzen

- Wie het Supabase-project beheert, kan technisch gezien in de database kijken, maar vindt daar geen koppeling tussen kiezer en keuze.
- Bij **Word-afdruk samenvoegen** heeft de beheerder een lijst met alle links in handen. Wie die lijst heeft, kan namens anderen stemmen. Verwijder de lijst na gebruik en ook de verzonden mails uit "Verzonden items". Bij **Outlook automatisch** ziet niemand de links.
- Bij "uitslag live" kan iemand die de tussenstand vaak ververst en weet wie net gestemd heeft, iets afleiden. Kies daarom bij voorkeur "pas na sluiting".

## Installatie (eenmalig, ongeveer 30 minuten)

### 1. Supabase-project maken
1. Maak een gratis account op [supabase.com](https://supabase.com) en een nieuw project. Kies als regio **Central EU (Frankfurt)** en een sterk databasewachtwoord.
2. Open **SQL Editor**, plak de inhoud van [`supabase/schema.sql`](supabase/schema.sql), vervang **onderaan** `JOUW-EMAIL@BEDRIJF.NL` door jouw e-mailadres, en klik **Run**.

### 2. Inloggen instellen
In Supabase onder **Authentication**:
1. **Sign In / Providers > Email**: laat "Confirm email" aan. Zet de minimale wachtwoordlengte op 12.
2. **URL Configuration**: zet de *Site URL* op het adres van je website (stap 4), bijvoorbeeld `https://hermanvandenberg.github.io/OR-VerkiezingsTeller/index.html`, en voeg hetzelfde adres toe bij *Redirect URLs*. Gebruik je een eigen domeinnaam, zie dan "Eigen domeinnaam".
3. **Multi-Factor**: controleer dat TOTP (authenticator-app) aan staat.
4. Tip: de standaard mailserver van Supabase verstuurt maar een paar mails per uur. Voor 5 commissieleden is dat genoeg; anders stel je onder **SMTP Settings** je eigen mailserver in.

### 3. Website koppelen aan Supabase
Zet in [`js/config.js`](js/config.js) de **Project URL** en de **anon public key** (Supabase > Project Settings > API). Die sleutel mag openbaar zijn. Zet hier **nooit** de `service_role` sleutel.

### 4. GitHub Pages aanzetten
In deze repository: **Settings > Pages > Deploy from a branch > main / (root)**. Na een minuut staat de site op `https://<gebruikersnaam>.github.io/OR-VerkiezingsTeller/`. (Gratis GitHub Pages vereist een openbare repository; dat is veilig, er staan geen geheimen in.)

### 5. Eerste keer inloggen
Ga naar `.../index.html#registreren`, maak een account met het adres uit stap 1, bevestig via de mail, log in en scan de QR-code met Microsoft Authenticator of Google Authenticator. Je komt op het beheerscherm.

### 6. In het beheerscherm
Het beheerscherm heeft links tabbladen (op een telefoon bovenaan): Verkiezing, Kandidaten, E-maillijst, Versturen, Kiescommissie en Huisstijl. Het laatst gekozen tabblad wordt onthouden. Rechtsboven (en onderaan de stempagina) kies je de weergave: **Licht**, **Donker** of **Auto** (volgt de instelling van je apparaat).

1. **Huisstijl en website**: vul de naam van de OR en het websiteadres in en upload het logo (PNG, JPG of WebP). Bij **Thema** kun je de website van je bedrijf invullen en op **Thema ophalen** klikken: de app stelt dan kleuren, een lettertype en een logo voor (zie "Thema uit de bedrijfswebsite"). Je kunt de kleuren en het lettertype ook zelf kiezen. Het thema geldt voor alle pagina's, de mails en het Word-sjabloon.
2. **Verkiezing**: titel, toelichting, start en einde (datum en tijd), wanneer de uitslag zichtbaar is, verzendwijze, herinneringsmomenten en de datum waarop de stemmen worden vernietigd (zie "Bewaartermijn").
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

## Thema uit de bedrijfswebsite

De knop **Thema ophalen** bekijkt de voorpagina van de bedrijfswebsite en zoekt de huisstijlkleuren, het lettertype en het logo. Dat gebeurt via een kleine functie in Supabase, omdat een browser andere websites niet zelf mag uitlezen. Je ziet altijd eerst een voorstel met voorbeeld; pas bij **Huisstijl opslaan** wordt het bewaard. Kleuren worden zo nodig iets donkerder of lichter gemaakt, zodat tekst goed leesbaar blijft.

Eenmalig instellen in Supabase:
1. **Al eerder geïnstalleerd?** Plak dan eerst [`supabase/updates/001-thema.sql`](supabase/updates/001-thema.sql) in de **SQL Editor** en klik **Run**. (Bij een nieuwe installatie zit dit al in `schema.sql`.)
2. **Edge Functions > Deploy a new function > Via editor**, naam `thema-ophalen`. Plak [`index.ts`](supabase/functions/thema-ophalen/index.ts), voeg met **Add file** een tweede bestand `herken.ts` toe en plak [`herken.ts`](supabase/functions/thema-ophalen/herken.ts). Laat **Verify JWT** aan staan en klik **Deploy**.

Alleen de beheerder (ingelogd met tweestapsverificatie) kan de functie gebruiken. Hij haalt alleen gewone openbare websites op (geen interne adressen), maximaal een paar seconden en een paar MB.

Is het lettertype van de website niet vrij beschikbaar (zoals bij veel grote bedrijven), dan kies je zelf een vergelijkbaar lettertype uit de lijst.

## Bewaartermijn: stemmen vernietigen

Bij elke verkiezing staat een datum **Stemmen vernietigen op**. Standaard is dat 3 maanden na sluiting; je kunt de datum zelf aanpassen, zolang hij na het einde van de stemming ligt. Op die dag wordt automatisch gewist:

- alle stemmen;
- de kiezerslijst: namen, e-mailadressen en wie er gestemd heeft;
- de meldingen en de mailwachtrij;
- e-mailadressen van kiezers in het logboek.

De **uitslag in aantallen** (per kandidaat, onthouden, opkomst) blijft bewaard, net als de kandidaten en het logboek, met de regel "stemmen vernietigd". Na sluiting kun je ook eerder vernietigen met de knop **Stemmen nu vernietigen** in het beheerscherm. Vernietigen kan niet ongedaan worden gemaakt.

Het vernietigen gebeurt elke nacht om 03:15 via de planner van Supabase (pg_cron), en voor de zekerheid ook als iemand het beheer- of commissiescherm opent.

**Al eerder geïnstalleerd?** Plak dan eenmalig [`supabase/updates/002-bewaartermijn.sql`](supabase/updates/002-bewaartermijn.sql) in de **SQL Editor** en klik **Run**. Bestaande verkiezingen krijgen dan de standaarddatum van 3 maanden na sluiting.

## Een volgende verkiezing

Klik in het beheerscherm op **Nieuwe verkiezing**. Oude verkiezingen blijven als archief bewaard, met hun uitslag en logboek. Een verkiezing kan ook meer dan twee kandidaten hebben.

**Een verkiezing verwijderen**, bijvoorbeeld een testverkiezing: kies de verkiezing in het beheerscherm en klik **Verwijderen**. Typ ter bevestiging de naam van de verkiezing over. Kandidaten, kiezerslijst, stemmen, meldingen en uitslag gaan dan weg; huisstijl, logo en de commissie blijven staan. Al eerder geïnstalleerd? Voer dan eenmalig [`supabase/updates/003-verkiezing-verwijderen.sql`](supabase/updates/003-verkiezing-verwijderen.sql) uit in de **SQL Editor**.

**Beheer overdragen** aan een nieuw OR-lid: laat diegene als commissielid uitnodigen en een account maken, en voer dan in de SQL Editor uit:

```sql
update public.toegang set rol = 'beheerder' where email = 'nieuw@bedrijf.nl';
update public.toegang set rol = 'commissie' where email = 'oud@bedrijf.nl';  -- of: delete ...
```

## Eigen domeinnaam

Je kunt de website op een eigen adres zetten, bijvoorbeeld `https://or-verkiezingen.com` in plaats van `https://<gebruikersnaam>.github.io/OR-VerkiezingsTeller`. Doe de stappen in deze volgorde.

**1. DNS bij de partij waar je de domeinnaam kocht.** Voeg deze records toe en verwijder eventuele andere A-, AAAA- of CNAME-records voor het hoofddomein (`@`) en `www`, zoals een parkeerpagina:

| Type | Naam | Waarde |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | `<gebruikersnaam>.github.io` |

Het kan een paar minuten tot een paar uur duren voordat dit overal werkt.

**2. GitHub.** In deze repository: **Settings > Pages > Custom domain**, vul de domeinnaam in (zonder `https://` en zonder `www`) en klik **Save**. GitHub zet dan zelf een bestand `CNAME` in de repository. Wacht tot de controle groen is en vink **Enforce HTTPS** aan. (Is dat vakje grijs, wacht dan nog even; GitHub maakt eerst een certificaat aan.)

**3. Supabase.** Onder **Authentication > URL Configuration**: zet de *Site URL* op `https://<jouw-domein>/index.html` en voeg bij *Redirect URLs* `https://<jouw-domein>/**` toe. Laat het oude github.io-adres er voorlopig ook in staan.

**4. In de app.** Open de app via het nieuwe adres, ga naar **Beheer > Huisstijl en website** en zet **Adres van deze website** op `https://<jouw-domein>`. Klik **Huisstijl opslaan**. Nieuwe stemlinks, herinneringen en de registratielink voor de commissie gebruiken dan het nieuwe adres.

Stemlinks die al verstuurd zijn met het oude github.io-adres blijven werken: GitHub stuurt ze automatisch door naar het nieuwe adres.

Extra beveiliging (aanbevolen): verifieer de domeinnaam in je GitHub-profiel onder **Settings > Pages > Add a domain**. GitHub geeft je dan een TXT-record om bij je DNS toe te voegen. Daarmee kan niemand anders jouw domeinnaam aan een eigen GitHub-site koppelen.

## Bestanden

```
index.html, stem.html, dashboard.html, beheer.html   de pagina's
css/stijl.css                                         opmaak
js/config.js                                          Supabase-adres en publieke sleutel
js/*.js                                               logica per pagina
supabase/schema.sql                                   database, rechten en regels
supabase/cron.sql                                     planner voor automatisch mailen (optie B)
supabase/functions/mail-verwerken/index.ts           mailfunctie via Microsoft Graph (optie B)
supabase/functions/thema-ophalen/                     thema voorstellen uit de bedrijfswebsite
supabase/updates/                                     aanvullingen voor een bestaande database
```
