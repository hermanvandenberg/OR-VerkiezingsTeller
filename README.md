# OR-VerkiezingsTeller

Digitaal stemmen voor (tussentijdse) OR-verkiezingen. Iedere collega krijgt een mail met een persoonlijke stemlink, kiest op de stempagina een kandidaat of "onthouden" en bevestigt. Naam of e-mailadres invullen is niet nodig: de persoonlijke link is genoeg. De kiescommissie volgt de opkomst, handelt meldingen af en ziet de uitslag. De beheerder richt alles in.

## Wat zit erin

| Pagina | Voor wie | Wat |
|---|---|---|
| `stem.html#<link>` | Iedere collega | Kandidaattegels naast elkaar, onthouden, bevestigingsvenster |
| `index.html` | Commissie en beheerder | Inloggen, account aanmaken (alleen na uitnodiging), tweestapsverificatie |
| `dashboard.html` | Kiescommissie | Opkomst, uitslag (na sluiting of live, te downloaden als PDF), meldingen, logboek |
| `beheer.html` | Alleen de beheerder | Verkiezing, data en tijden, herinneringen, kandidaten met foto, e-maillijst, versturen, commissie, logo en huisstijl |

De website zelf staat op GitHub Pages. Stemmen, accounts en logboek staan in **Supabase** (database met inlog), omdat GitHub Pages zelf niets kan opslaan.

## Zo werkt de beveiliging

- **Eén stem per persoon.** Elke collega krijgt een eigen link. Die bestaat uit een willekeurige code plus een handtekening met een geheime sleutel in de database; raden is praktisch onmogelijk. Na het stemmen werkt de link niet meer, ook niet als twee pogingen tegelijk binnenkomen.
- **Meldingen** voor de commissie bij: opnieuw proberen met een gebruikte link, veel ongeldige links in korte tijd, een mail die niet verstuurd kon worden.
- **Stemmen zijn niet te wijzigen of te verwijderen**, door niemand. Stemmen worden zonder tijdstip opgeslagen.
- **Logboek**: elke handeling van beheerder en commissie wordt vastgelegd en kan niet worden aangepast. Alleen de beheerder kan het logboek leegmaken na het testen, en alleen zolang er geen verkiezing loopt of afgelopen is (zie "Na het testen: namen en logboek").
- **Alleen uitgenodigde adressen** kunnen een account maken. Inloggen kan alleen met tweestapsverificatie (code-app op de telefoon). De sessie stopt als je de browser sluit.
- **Rollen**: alleen de beheerder kan verkiezingen inrichten, lijsten inladen en commissieleden uitnodigen. Commissieleden kunnen kijken en meldingen afhandelen. De kiezerslijst is alleen voor de beheerder zichtbaar.
- **Vast na de start**: starttijd, zichtbaarheid van de uitslag en kandidaten. Het eindmoment kan nog verlengd worden (en dat staat in het logboek).

### Stemgeheim

De stemming is volledig anoniem. Een stem wordt opgeslagen zonder naam, e-mailadres of tijdstip; bij de kiezer wordt alleen bijgehouden *dat* die gestemd heeft. Niemand, ook de beheerder niet, kan terugzien wie op wie heeft gestemd.

### Eerlijk over de grenzen

- Wie het Supabase-project beheert, kan technisch gezien in de database kijken, maar vindt daar geen koppeling tussen kiezer en keuze.
- Bij **Word-afdruk samenvoegen** heeft de beheerder een lijst met alle links in handen. Wie die lijst heeft, kan namens anderen stemmen. Verwijder de lijst na gebruik en ook de verzonden mails uit "Verzonden items". Bij **Outlook automatisch** ziet niemand de links.
- De stemlink is de enige controle: collega's vullen geen naam of e-mailadres in. Wie zijn link doorstuurt, laat een ander namens zich stemmen. Zet daarom in de uitnodiging dat de link persoonlijk is (dat staat er standaard al in). Al eerder geïnstalleerd? Voer dan eenmalig [`supabase/updates/005-stembiljet-zonder-naam.sql`](supabase/updates/005-stembiljet-zonder-naam.sql) uit in de **SQL Editor**.
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
4. De standaard mailserver van Supabase verstuurt maar een paar mails per uur, vanaf een Supabase-adres. Stel liever een eigen afzender in, zie "Commissieleden uitnodigen per mail".

### 3. Website koppelen aan Supabase
Zet in [`js/config.js`](js/config.js) de **Project URL** en de **anon public key** (Supabase > Project Settings > API). Die sleutel mag openbaar zijn. Zet hier **nooit** de `service_role` sleutel.

### 4. GitHub Pages aanzetten
In deze repository: **Settings > Pages > Deploy from a branch > main / (root)**. Na een minuut staat de site op `https://<gebruikersnaam>.github.io/OR-VerkiezingsTeller/`. (Gratis GitHub Pages vereist een openbare repository; dat is veilig, er staan geen geheimen in.)

### 5. Eerste keer inloggen
Ga naar `.../index.html#registreren`, maak een account met het adres uit stap 1, bevestig via de mail, log in en scan de QR-code met Microsoft Authenticator of Google Authenticator. Je komt op het beheerscherm.

### 6. In het beheerscherm
Het beheerscherm heeft links tabbladen (op een telefoon bovenaan): Verkiezing, Kandidaten, E-maillijst, Versturen, Kiescommissie en Huisstijl. Het laatst gekozen tabblad wordt onthouden. Rechtsboven (en onderaan de stempagina) kies je de weergave: **Licht**, **Donker** of **Auto** (volgt de instelling van je apparaat).

1. **Huisstijl en website**: vul de naam van de OR en het websiteadres in en upload het logo (PNG, JPG of WebP). Bij **Thema** kun je de website van je bedrijf invullen en op **Thema ophalen** klikken: de app stelt dan kleuren, een lettertype en een logo voor (zie "Thema uit de bedrijfswebsite"). Je kunt de kleuren en het lettertype ook zelf kiezen. Het thema geldt voor alle pagina's, de mails en het Word-sjabloon. Het logo staat alleen op de stempagina, in de mails en in het Word-sjabloon; de inlogpagina, het beheerscherm en de commissiepagina tonen een vast OR-icoon (een stembus).
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

## Na het testen: namen en logboek

**Namen aanpassen.** Ga in het beheerscherm naar **Kiescommissie** en klik naast een naam op **Wijzigen**. Dat kan voor jezelf en voor elk commissielid. De wijziging staat in het logboek.

**Logboek leegmaken.** Klaar met testen? Verwijder eerst je testverkiezingen. Klik daarna bij **Kiescommissie** op **Logboek leegmaken**. Dit kan alleen als er geen verkiezing loopt of afgelopen is; een verkiezing die nog moet beginnen mag blijven staan. Er blijft één regel staan dat jij het logboek hebt geleegd. Alleen de beheerder ziet deze knop, en de database staat het ook alleen de beheerder toe.

**Uitslag als PDF.** Na sluiting staat in het dashboard de knop **Uitslag downloaden (PDF)**. De PDF heeft het logo en de kleuren van de huisstijl, de stemmen per kandidaat, de opkomst en ruimte voor de handtekeningen van de kiescommissie.

**Al eerder geïnstalleerd?** Voer dan eenmalig [`supabase/updates/006-namen-en-logboek.sql`](supabase/updates/006-namen-en-logboek.sql) uit in de **SQL Editor**.

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

## Verzamelmails gebruiken voor de e-maillijst

Iedere collega krijgt een eigen, persoonlijke stemlink. Daarom kun je de stemmail niet naar een verzamelmail (distributiegroep) sturen. Je kunt wel de leden van een verzamelmail in één keer in de e-maillijst zetten. Dubbele adressen worden er vanzelf uit gehaald, ook als iemand in meerdere verzamelmails zit.

**Zonder hulp van IT: kopiëren uit Outlook**
1. Maak in Outlook een nieuwe e-mail en typ bij **Aan** de naam van de verzamelmail.
2. Klik op het **plusje (+)** voor de naam, of klik met de rechtermuisknop en kies **Uitvouwen**. Bevestig met **OK**.
3. Klik in het veld Aan, druk op **Ctrl+A** en dan op **Ctrl+C**.
4. Ga in de app naar **E-maillijst**, plak in **Of plak adressen uit Outlook** en klik **Adressen inlezen**. Herhaal dit voor elke verzamelmail; je kunt ze ook allemaal tegelijk plakken.
5. Sluit de e-mail in Outlook zonder te versturen.

**Met de Microsoft 365-koppeling: zoeken in de app**

Heeft IT de app-registratie voor "Outlook automatisch" al gemaakt (zie stap 7B)? Dan kan de app verzamelmails ook zelf opzoeken. IT voegt daarvoor eenmalig toe:
1. API-machtigingen **Microsoft Graph > Application > GroupMember.Read.All** en **User.ReadBasic.All**, met **admin consent**. Deze machtigingen geven alleen leesrecht.
2. In Supabase: **Edge Functions > Deploy a new function > Via editor**, naam `groep-leden`, plak [`supabase/functions/groep-leden/index.ts`](supabase/functions/groep-leden/index.ts). Laat **Verify JWT** aan staan. De functie gebruikt dezelfde geheimen `MS_TENANT_ID`, `MS_CLIENT_ID` en `MS_CLIENT_SECRET`.
supabase/functions/commissie-uitnodigen/index.ts     uitnodigingsmail voor commissieleden
supabase/mail-sjablonen/                              Nederlandse mailtekst voor Supabase

Daarna typ je in **E-maillijst > Of zoek een verzamelmail in Microsoft 365** een deel van de naam, klik je op de juiste verzamelmail en controleer je het voorbeeld. Je kunt meerdere verzamelmails na elkaar ophalen en daarna in één keer toevoegen. Alleen jij als beheerder kunt deze functie gebruiken. Leden van groepen binnen de verzamelmail worden meegenomen. Dynamische distributiegroepen worden niet ondersteund; kopieer die uit Outlook.

## Commissieleden uitnodigen per mail

Voeg je in de tab **Kiescommissie** iemand toe, dan krijgt diegene direct een uitnodigingsmail. Met de link in die mail kiest het lid een wachtwoord en stelt het tweestapsverificatie in. Daarna staat er **Actief** bij het lid. Bij wie nog **Uitgenodigd** staat, kun je met **Uitnodiging opnieuw mailen** een nieuwe mail sturen. Alleen jij als beheerder kunt uitnodigen, en alleen adressen die in de lijst van de kiescommissie staan.

**Eenmalig instellen in Supabase (ongeveer 10 minuten):**
1. **SQL Editor**: plak [`supabase/updates/004-commissie-uitnodigen.sql`](supabase/updates/004-commissie-uitnodigen.sql) en klik **Run**.
2. **Edge Functions > Deploy a new function > Via editor**, naam `commissie-uitnodigen`. Plak [`supabase/functions/commissie-uitnodigen/index.ts`](supabase/functions/commissie-uitnodigen/index.ts), laat **Verify JWT** aan staan en klik **Deploy**. Geheimen zijn niet nodig.
3. **Authentication > Emails > Invite user**: zet het onderwerp op `Uitnodiging kiescommissie OR-verkiezing` en plak bij *Message body* de tekst uit [`supabase/mail-sjablonen/uitnodiging-commissie.html`](supabase/mail-sjablonen/uitnodiging-commissie.html). Klik **Save**.
4. **Authentication > URL Configuration**: controleer dat bij *Redirect URLs* `https://or-verkiezingen.com/index.html` staat (of `https://or-verkiezingen.com/**`).
5. Vul in de app bij **Huisstijl en website** het adres `https://or-verkiezingen.com` in, als dat er nog niet staat.

**Eigen afzender: noreply@or-verkiezingen.com**

Standaard komen de mails van een adres van Supabase, en Supabase verstuurt er maar een paar per uur. Netter en betrouwbaarder is een eigen afzender via een mailservice in Europa, bijvoorbeeld [Brevo](https://www.brevo.com) (gratis tot 300 mails per dag):
1. Maak een gratis account bij Brevo.
2. Ga naar **Senders, Domains & Dedicated IPs > Domains > Add a domain** en vul `or-verkiezingen.com` in. Kies voor zelf de DNS-records toevoegen. Brevo toont nu een paar records: een TXT-record met een `brevo-code`, een DKIM-record en een DMARC-record.
3. Log in bij TransIP, ga naar **Domeinen > or-verkiezingen.com > DNS** en voeg elk record toe zoals Brevo het toont (type, naam en waarde precies overnemen). Klik op **Opslaan**.
4. Klik in Brevo op **Authenticate this domain**. Dit kan tot een paar uur duren; daarna staat het domein op groen.
5. Voeg bij **Senders** de afzender `noreply@or-verkiezingen.com` toe, met als naam bijvoorbeeld `OR-verkiezing`.
6. Ga in Brevo naar **SMTP & API > SMTP** en maak een **SMTP key** aan. Noteer de *SMTP server* (`smtp-relay.brevo.com`), de *poort* (`587`), de *login* en de *key*.
7. In Supabase: **Authentication > Emails > SMTP Settings** > zet **Enable custom SMTP** aan en vul in: afzender `noreply@or-verkiezingen.com`, naam `OR-verkiezing`, host `smtp-relay.brevo.com`, poort `587`, gebruikersnaam = de login van Brevo, wachtwoord = de SMTP key. Klik **Save**.
8. Zet onder **Authentication > Rate Limits** het aantal mails per uur op bijvoorbeeld 30.

Vanaf dan komen ook de bevestigingsmails en de mails voor "Wachtwoord vergeten" van `noreply@or-verkiezingen.com`.

## Talen

Elke pagina, ook de stempagina, heeft onderaan of rechtsboven een keuze **NL / EN / DE**. Bij het eerste bezoek kiest de app de taal van de browser (Nederlands, Engels of Duits, anders Nederlands). Een gemaakte keuze wordt per browser onthouden.

Alleen de vaste teksten van de app worden vertaald. Wat je zelf invult (titel, toelichting, namen en teksten van kandidaten) blijft zoals je het schreef. De mails en het Word-sjabloon blijven Nederlands.

Teksten aanpassen of toevoegen: `js/vertalingen.js` bevat per Nederlandse tekst de Engelse en Duitse vertaling. In de code staan de teksten als `t("Nederlandse tekst")`.

## Bestanden

Na een wijziging in `css/` of `js/`: verhoog het versienummer `?v=...` in alle HTML-bestanden en `import`-regels (overal hetzelfde), zodat browsers niet de oude versie uit hun cache gebruiken.

```
index.html, stem.html, dashboard.html, beheer.html   de pagina's
css/stijl.css                                         opmaak
js/config.js                                          Supabase-adres en publieke sleutel
js/*.js                                               logica per pagina
supabase/schema.sql                                   database, rechten en regels
supabase/cron.sql                                     planner voor automatisch mailen (optie B)
supabase/functions/mail-verwerken/index.ts           mailfunctie via Microsoft Graph (optie B)
supabase/functions/thema-ophalen/                     thema voorstellen uit de bedrijfswebsite
supabase/functions/groep-leden/index.ts              leden van een verzamelmail ophalen uit Microsoft 365
supabase/updates/                                     aanvullingen voor een bestaande database
```
