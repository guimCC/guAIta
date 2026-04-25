# Business Impact

Research date: 2026-04-25. Latest official outbreak status used: 2026-04-22.

## Positioning

guAIta should be framed as a public resource optimization system, not as a promise to stop wild boars or eradicate African swine fever (PPA).

The strongest message is:

> Replace blanket forest-entrance surveillance with edge-AI monitoring and targeted dispatch, so police, civil protection, and wildlife teams spend time where there is observed risk.

For the demo, the system helps answer:

- Which access point needs attention now?
- Which detections justify dispatch?
- Which patrol hours can be avoided or reallocated?
- Which field action is recommended and why?

## Patrol Cost Model

Barcelona's 2025 fiscal ordinance for Guardia Urbana special services lists a patrol car with two officers at EUR 109.23 per hour. This is a tariff-based cost proxy, not a claim about the exact internal cost of every agency or operation.

Use this formula for static entrance coverage:

```text
monthly static cost = entrances * hours_per_day * days * EUR 109.23
```

Illustrative 24/7 coverage for a 30-day month:

| Static coverage model | Monthly cost proxy |
| --- | ---: |
| 1 entrance | EUR 78,646 |
| 10 entrances | EUR 786,456 |
| 20 entrances | EUR 1,572,912 |

Illustrative savings if guAIta reduces static coverage at 20 monitored entrances:

| Avoided static coverage | Patrol time reallocated |
| --- | ---: |
| 25% | EUR 393,228/month |
| 50% | EUR 786,456/month |
| 75% | EUR 1,179,684/month |

Demo-safe wording:

> Every entrance-hour moved from "patrol car waiting" to "edge AI monitoring plus on-call response" represents about EUR 109/hour of public safety capacity that can be reallocated.

Do not claim that guAIta eliminates police costs. Claim that it helps target them.

## Outbreak Context

The Catalonia PPA outbreak was confirmed on 2025-11-28 after two infected wild boars were found dead in Cerdanyola del Valles. Generalitat states this was Spain's first detection since November 1994.

As of the MAPA update on 2026-04-22:

| Metric | Status |
| --- | ---: |
| Positive wild boars | 284 |
| Official foci/outbreaks | 47 |
| Municipalities with positive wild boars | 12 |
| Negative animals analyzed | 3,746 |
| Commercial pig farms under reinforced controls | 45 |
| Domestic pig positives | 0 |

Geographic containment and spread markers:

- Initial response used a high-risk zone around the first focus and broader surveillance/restriction zoning.
- Public reporting and sector coverage commonly describe a 6 km high-risk/control radius and a 20 km affected/surveillance radius from the initial focus.
- The 2026-04-22 MAPA update says the Castellbisbal case was outside completed perimeter fencing, with fencing complete to 4 km from that case and a planned closure to 6 km.
- The same MAPA update says the Castellbisbal case was less than 3 km from restricted zone I, forcing zoning changes.
- Generalitat-linked reporting on 2026-04-22 described an intensive search area of about 1,050 km2 and 80 km of executed perimeter closures.

## Economic Stakes

Use these numbers to show why earlier detection and targeted field operations matter:

| Impact area | Number |
| --- | ---: |
| Spanish pork exports in 2024 | > EUR 8.784B |
| Catalan pork exports at risk, as described by the Govern | ~ EUR 3B |
| Catalan non-EU pork exports exposed | ~ EUR 1B |
| Catalan producer losses estimated by Unio de Pagesos on 2026-01-13 | EUR 63M |
| Spanish producer losses estimated by Unio de Pagesos on 2026-01-28 | > EUR 280M |
| Ongoing loss rate estimated in the same reporting | ~ EUR 42M/week |

The cost is not only the current response operation. Export restrictions and market reopening timelines make late detection expensive: sector reporting states that 12 months must pass after the latest positive before some non-EU trade can reopen.

## Public Spending Already Activated

| Public response item | Amount or resources |
| --- | ---: |
| Generalitat aid line | EUR 10M |
| Potential aid expansion | + EUR 10M |
| ICF credit access for affected companies | included in emergency package |
| Emergency TRAGSA control contract reported 2026-04-22 | EUR 7M |
| TRAGSA reinforcement reported 2026-04-22 | 170 staff, 57 traps, 51 vehicles |
| Initial UME deployment reported 2025-12-01 | 117 personnel, 25 vehicles |

## Demo KPI

Track public-resource impact in the dashboard as:

```text
avoided static patrol hours = monitored entrances * static coverage hours avoided
estimated capacity reallocated = avoided static patrol hours * EUR 109.23
```

This KPI supports the product story without overstating disease-control outcomes. guAIta detects on-device, sends compact events, and helps public teams deploy capacity where the risk is visible.

## Source Index

- MAPA PPA page: https://www.mapa.gob.es/es/ganaderia/temas/sanidad-animal-higiene-ganadera/sanidad-animal/enfermedades/peste-porcina-africana/peste_porcina_africana.aspx
- MAPA update, 2026-04-22: https://www.mapa.gob.es/dam/mapa/contenido/ganaderia/temas/sanidad-animal-e-higiene-ganadera/sanidad-animal/noticias-sanidad-animal/documentos-de-noticias/nota-actualizaci-n-situaci-n-ppa_22-04-2026.pdf
- Generalitat situation page: https://agricultura.gencat.cat/ca/ambits/ramaderia/sanitat-animal/programes-sanitaris/programes-sanitaris-porci/pesta-porcina-africana/situacio-malaltia/
- Govern emergency package, 2025-12-09: https://govern.cat/gov/notes-premsa/772696/govern-aprova-paquet-mesures-urgents-donar-resposta-limpacte-economic-provocat-pesta-porcina-africana-catalunya
- Barcelona Guardia Urbana tariff, 2025: https://ajuntament.barcelona.cat/hisenda/sites/default/files/normativa/2021-01/3.8-taxes-per-prestacions-de-la-guardia-urbana-i-circulacions-especials.pdf?profile=1
- INTERPORC export context, 2025-09-11: https://interporc.com/2025/09/11/interporc-destaca-la-flexibilidad-del-porcino-espanol-en-el-cambiante-escenario-internacional/
- EFE/Investing Catalan pork-sector context, 2025-12-01: https://es.investing.com/news/economy-news/radiografia-del-porcino-catalan-ocho-millones-de-cerdos-y-3200-millones-en-exportaciones-3416586
- Forbes/Europa Press Govern export-risk reporting, 2025-12-01: https://forbes.es/economia/837637/el-govern-estima-que-la-peste-porcina-pone-en-riesgo-3-000-millones-de-exportaciones-para-cataluna/
- ARA producer-loss reporting, 2026-01-13: https://es.ara.cat/economia/alimentacion/ganaderos-catalanes-cifran-63-m-perdidas-peste-porcina_1_5616848.html
- Cadena SER producer-loss reporting, 2026-01-28: https://cadenaser.com/cataluna/2026/01/28/la-peste-porcina-africana-ya-ha-costado-a-los-ganaderos-mas-de-280-millones-de-euros-sercat/
- Diario Veterinario operational update, 2026-04-22: https://www.diarioveterinario.com/t/5853922/cataluna-detecta-nuevos-casos-peste-porcina-africana-activa-7-millones-frenar-brote
- RTVE UME deployment reporting, 2025-12-01: https://www.rtve.es/catalunya/noticies/20251201/arriben-80-militars-ume-frenar-brot-pesta-porcina-collserola/16839019.shtml
