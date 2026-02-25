# WorkLog – PDF print modulis

Šajā paketē ir **tikai drukas skats** (`print.html`), kas lasa datus no `localStorage` atslēgām:
- `worklog.entries.v2`
- `worklog.settings.v2`

Tas ir neatkarīgs no pārējās lietotnes un **nepārraksta** datus.

## Kā testēt lokāli (bez GitHub)

### Variants A: Python 3 vienrindnieks
```bash
python -m http.server 8080
```
Atver pārlūkā: <http://localhost:8080/print.html>

### Variants B: VS Code "Live Server" (Extensions → Live Server)
- Atver mapi ar failiem
- Labajā apakšā klikšķini **Go Live**
- Atver `print.html`

### iPhone testēšana
- Pārliecinies, ka dators un iPhone ir vienā Wi‑Fi tīklā
- Atver datorā: `http://JŪSU_DATORA_IP:8080/print.html` (piem., `http://192.168.1.10:8080/print.html`)
- iPhone Safari ievadi to pašu adresi
- Spied **Share → Print → (pinch out)** un **Save to Files** (vai citādi saglabā PDF)

## Kā pieslēgt pie galvenās lapas
Galvenajā lapā (`index.html`) pievieno saiti vai pogu uz `print.html`. Piemēram:
```html
<a href="./print.html" target="_blank" rel="noopener">Saglabāt PDF</a>
```
Vai JS: atver jaunu tabu un ļauj lietotājam izvēlēties mēnesi.

## Dizains
- Virsraksta zils panelis un saraksta gaiši zils panelis ar noapaļotām malām – kā paraugā.
- Stundu "čipi" ar krāsām:
  - zils – mazāk nekā slieksnis (pēc noklusējuma 8h)
  - zaļš – tieši slieksnis
  - oranžs – vairāk par slieksni **vai** brīvdiena/svētki ar stundām
  - pelēks – brīvdiena/svētki bez stundām (parasti netiek rādīts, jo sarakstā ir tikai dienas ar ierakstiem)

## Ikonas
Mapē `icons/` ir vienkārši vietturētāji (PNG), ja vēlies, samaini pret savām ikonām.
