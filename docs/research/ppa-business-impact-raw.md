# PPA Business Impact Raw Research

Research date: 2026-04-25.

This file preserves source links, extracted facts, and assumptions behind `docs/business-impact.md`. Treat it as research material, not final pitch copy.

## Core Product Interpretation

The project's business impact is public-resource optimization:

- Edge devices detect wild boars locally.
- The server receives compact events.
- The dashboard prioritizes where to send a team.
- The public value is fewer blanket patrol hours and better targeted dispatch.

Avoid saying:

- "We stop wild boars."
- "We eradicate PPA."
- "We replace the police."
- "We know the exact cost of the official response."

Preferred wording:

- "We reduce unnecessary static surveillance."
- "We help one on-call team cover more ground."
- "We turn a fixed-cost coverage problem into an event-driven response problem."

## Raw Numbers

### Patrol Cost Proxy

Source: Barcelona 2025 Guardia Urbana fiscal ordinance.

URL: https://ajuntament.barcelona.cat/hisenda/sites/default/files/normativa/2021-01/3.8-taxes-per-prestacions-de-la-guardia-urbana-i-circulacions-especials.pdf?profile=1

Extracted tariff:

- Patrol car with two officers: EUR 109.23/hour.
- Day officer: EUR 64.14/hour.
- Night or holiday officer: EUR 69.18/hour.

Reason to use it:

- It is a public, municipal, Barcelona-area cost anchor.
- It gives a defensible proxy for "one patrol car waiting at one entrance."

Limitations:

- It is a special-service tariff, not necessarily actual marginal cost.
- Actual response teams could be Guardia Urbana, Mossos, local police, civil protection, Agents Rurals, or contractors.
- Vehicle overhead, scheduling, overtime, and command costs are not modeled.

Calculations:

```text
hourly_patrol_proxy = 109.23
hours_per_day = 24
days_per_month = 30

1 entrance  = 1  * 24 * 30 * 109.23 = 78,645.60
10 entrances = 10 * 24 * 30 * 109.23 = 786,456.00
20 entrances = 20 * 24 * 30 * 109.23 = 1,572,912.00

20 entrances, 25% avoided = 393,228.00/month
20 entrances, 50% avoided = 786,456.00/month
20 entrances, 75% avoided = 1,179,684.00/month
```

Open item:

- Verify the actual number of forest entrances/access points used in the demo story. Until then, use variable `entrances` or clearly illustrative examples.

### Outbreak Start

Source: Generalitat PPA situation page.

URL: https://agricultura.gencat.cat/ca/ambits/ramaderia/sanitat-animal/programes-sanitaris/programes-sanitaris-porci/pesta-porcina-africana/situacio-malaltia/

Extracted facts:

- Date confirmed: 2025-11-28.
- First cases: 2 wild boars found dead in Cerdanyola del Valles.
- First detection in Spain since November 1994.

Source: MAPA PPA page.

URL: https://www.mapa.gob.es/es/ganaderia/temas/sanidad-animal-higiene-ganadera/sanidad-animal/enfermedades/peste-porcina-africana/peste_porcina_africana.aspx

Extracted facts:

- MAPA also states Spain confirmed disease presence in wild boars on 2025-11-28 after two infected specimens in Cerdanyola del Valles.

### Latest Official Status Found

Source: MAPA update PDF, 2026-04-22.

URL: https://www.mapa.gob.es/dam/mapa/contenido/ganaderia/temas/sanidad-animal-e-higiene-ganadera/sanidad-animal/noticias-sanidad-animal/documentos-de-noticias/nota-actualizaci-n-situaci-n-ppa_22-04-2026.pdf

Extracted facts:

- Update date: 2026-04-22.
- New cases since 2026-04-16: 16.
- Total foci: 47.
- Total positive wild boars: 284.
- Municipalities with positives: 12.
- Negative animals analyzed: 3,746.
- Commercial pig farms under reinforced controls in zones I and II: 45.
- Domestic pig positives: 0.
- Castellbisbal appeared as a new municipality with a detected case.
- All cases were inside completed perimeter fencing except Castellbisbal.
- Around Castellbisbal, fencing was complete to 4 km from the case and expected to close to 6 km.
- Castellbisbal case was less than 3 km from restricted zone I, forcing zoning changes.

### Current Operational Area And Restrictions

Source: Diario Veterinario operational update, 2026-04-22.

URL: https://www.diarioveterinario.com/t/5853922/cataluna-detecta-nuevos-casos-peste-porcina-africana-activa-7-millones-frenar-brote

Extracted facts:

- New 2026-04-22 cases: 16.
- Castellbisbal moved into the high-risk area.
- High-risk municipalities reported: 19.
- Intensive search area reported: about 1,050 km2.
- Emergency TRAGSA contract: EUR 7M through 2026-12-31.
- Contract resources: 170 staff, 57 Pig Brig traps, 51 off-road vehicles.
- Operational intensive phase: about 20 weeks.
- Since 2025-11-28: 4,030 wild boars analyzed, 284 positive, 3,746 negative.
- Weekly device/control capacity reported: 1,792 total members that week, including intervention and order groups.
- Agents Rurals daily allocation: more than 100 agents.
- Executed perimeter closures reported: 80 km.

Source type note:

- This is trade press, not the official Generalitat page. It appears to report a Generalitat update. Use in pitch only if you need operational-resource color; use MAPA/Govern for official status when possible.

### Public Spending And Aid

Source: Govern emergency package note, 2025-12-09.

URL: https://govern.cat/gov/notes-premsa/772696/govern-aprova-paquet-mesures-urgents-donar-resposta-limpacte-economic-provocat-pesta-porcina-africana-catalunya

Extracted facts:

- Emergency declared for actions to contain, prevent, and mitigate PPA effects.
- Aid/subsidy line: EUR 10M.
- Expandable by another EUR 10M.
- ICF loan line extended to companies affected by PPA.
- Emergency contracting can include vehicles, fuel, drones, thermosensitive cameras, traps, equipment, cleaning, animal-removal services, signage, and support services.

Source: Diario Veterinario operational update, 2026-04-22.

Extracted facts:

- New TRAGSA emergency contract: EUR 7M.
- Reinforcement: 170 staff, 57 traps, 51 vehicles.

Source: RTVE Catalunya, 2025-12-01.

URL: https://www.rtve.es/catalunya/noticies/20251201/arriben-80-militars-ume-frenar-brot-pesta-porcina-collserola/16839019.shtml

Extracted facts:

- UME deployment: 117 personnel and 25 vehicles.
- Context: support control work around Cerdanyola del Valles/Collserola.

### Sector Exposure And Losses

Source: INTERPORC, 2025-09-11.

URL: https://interporc.com/2025/09/11/interporc-destaca-la-flexibilidad-del-porcino-espanol-en-el-cambiante-escenario-internacional/

Extracted facts:

- Spanish pork exports in 2024: 2.72M tonnes.
- Export value in 2024: more than EUR 8.784B.
- China 2024: 539,064 tonnes, EUR 1.097B.

Source: EFE/Investing, 2025-12-01.

URL: https://es.investing.com/news/economy-news/radiografia-del-porcino-catalan-ocho-millones-de-cerdos-y-3200-millones-en-exportaciones-3416586

Extracted facts:

- Catalan pork exports cited around EUR 3.2B.
- About EUR 1B of Catalan exports outside the EU exposed to PPA restrictions, according to the Catalan agriculture minister.

Source: Forbes/Europa Press, 2025-12-01.

URL: https://forbes.es/economia/837637/el-govern-estima-que-la-peste-porcina-pone-en-riesgo-3-000-millones-de-exportaciones-para-cataluna/

Extracted facts:

- Govern estimate: PPA puts EUR 3B in Catalan pork exports at risk.
- Of that, EUR 1B corresponds to non-EU countries.

Source: ARA, 2026-01-13.

URL: https://es.ara.cat/economia/alimentacion/ganaderos-catalanes-cifran-63-m-perdidas-peste-porcina_1_5616848.html

Extracted facts:

- Unio de Pagesos estimated Catalan producer losses at EUR 63M.
- Producers moved from about EUR 20 profit per pig in 2025 to EUR 36 loss per pig after the outbreak, according to the same reporting.
- More than 61,000 heads of livestock were immobilized in Barcelona province.
- The report references 12 months after the latest case for Spain to lose affected-country status.

Source: Cadena SER, 2026-01-28.

URL: https://cadenaser.com/cataluna/2026/01/28/la-peste-porcina-africana-ya-ha-costado-a-los-ganaderos-mas-de-280-millones-de-euros-sercat/

Extracted facts:

- Estimated accumulated producer losses in Spain: more than EUR 280M.
- Weekly loss estimate: almost EUR 42M/week.
- Mercolleida price reduction cited: 30 cents/kg.
- Same report states 12 months must pass after the latest positive before some non-EU trade reopens.

### Market Reopening / Time Penalty

Source: El Pais, 2026-04-22.

URL: https://elpais.com/espana/catalunya/2026-04-22/la-peste-porcina-se-expande-y-ya-son-19-municipios-barceloneses-los-que-prohiben-el-acceso-al-medio-rural.html

Extracted facts:

- Article reports 284 cases and 19 municipalities with risk restrictions after Castellbisbal.
- Article says each new positive delays opening in some international markets by 12 months.
- It also reports the EUR 7M emergency contract, 170 new staff, more than 50 vehicles, and about 50 traps.

Source type note:

- Use this as corroborating media coverage. Prefer MAPA/Govern for official status and spending where possible.

## Pitch Math To Reuse

Short version:

```text
1 patrol car + 2 officers = EUR 109.23/hour proxy
24/7 for 1 entrance for 30 days = EUR 78,646/month
24/7 for 10 entrances for 30 days = EUR 786,456/month
24/7 for 20 entrances for 30 days = EUR 1,572,912/month
```

Slide one-liner:

> guAIta does not replace response teams; it makes them event-driven.

Operational one-liner:

> Every entrance-hour moved from static patrol to edge monitoring frees about EUR 109/hour of public safety capacity.

## Claims To Keep Conservative

- "Cost proxy" instead of "guaranteed savings."
- "Capacity reallocated" instead of "money saved."
- "Source-triggered dispatch" instead of "automated enforcement."
- "No domestic pig positives as of 2026-04-22" instead of "farms are safe."
- "Current official status from MAPA" instead of "latest forever."

## Open Research Items

- Exact count of Collserola access points that were physically controlled during the response.
- Actual agency staffing model for entrance monitoring.
- Actual public spend on police/local access control, separate from agricultural emergency contracts.
- Cost per guAIta station, including enclosure, power, connectivity, maintenance, and installation.
- Legal/privacy constraints for camera-based edge detection in public natural spaces.
- Better official source for the 2026-04-22 TRAGSA operational numbers if Generalitat publishes the original briefing.
