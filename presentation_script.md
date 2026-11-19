# India Renewable Outlook: 10-minute presentation script

About 1,400 words of speech, at a relaxed 140 words a minute. Times are cumulative. Lines in *[brackets]* are cues, not speech. Poster section numbers are given so you can point at it.

---

## 0:00 – 0:45 · Opening and the question *(Abstract, section 1)*

Good morning. Our question is simple to say and hard to answer: how much solar, wind, bio-mass, small hydro and waste-to-energy capacity will each of India's 34 states and union territories have by 2047, and what will it cost?

State-level forecasts matter because that is where land, grid and investment decisions get made. A national number doesn't tell you where to build a transmission line. So we set ourselves three goals: forecast every state and every source to 2047, let a planner change the economic assumptions and see the effect live, and explain every single forecast.

## 0:45 – 2:00 · The data, and what was wrong with it *(sections 2 and 3)*

We were given 635 rows: 34 states, 2006 to 2024, installed megawatts for five sources, plus zone, population and GSDP. We added one outside source, the Central Electricity Authority's transmission reports from 2018-19 to 2025-26. That is 3,392 lines, and we mapped 94% of them to a state.

The first thing we found was the most important. Only 34% of the values are fresh reports. The rest are copies of the previous year. In 2023 and 2024 only 15 of 34 states report anything new. Nineteen states, including big ones like Rajasthan and Tamil Nadu, are frozen at their 2022 numbers.

*[Point to Table 1.]*

That matters because any model trained on this data naively learns that growth stops, since a frozen state looks like zero growth. There were four other problems. National solar goes 53.9, 54.1, then 97 gigawatts, a reporting gap, not a real jump. GSDP jumps 2.2 times in 2011 because the base year changed. The 2024 GSDP is a placeholder that shows minus 0.2% for every state. And a few values drop for no reason, like Bihar solar falling from 390 to 239 megawatts.

We fixed each one: we only learn from fresh reports, we measure growth across the gap, we rebase old GSDP, we impute 2024 GSDP from recent growth, and our forecasts never go down.

## 2:00 – 3:00 · What the data tells us *(section 4)*

Before modelling, four patterns shaped everything.

Solar is 64% of capacity, and its growth rate is slowing, from about 0.5 a year to about 0.2.

Capacity is concentrated. Five states hold 71% of it, and 14 states have no wind at all.

Zones differ hugely. Solar per unit of GSDP is 14 times higher in the West than in the North-East.

And the surprising one: a state's solar growth is explained by how far it is behind its own zone, a correlation of minus 0.67, and hardly at all by how fast its economy grows, minus 0.09. Lagging states catch up with their neighbours. That one finding became the core of our model.

## 3:00 – 4:45 · The model *(section 5)*

*[Point to Fig. 1, the six steps.]*

The pipeline has six steps. We take the raw panel, clean it, and fit one growth regression per source, using only pairs of fresh reports. Then we nowcast. For the 19 frozen states we roll them forward from their last real report to 2024. That moves India from 169 gigawatts on paper to 197, which matches what the grid actually shows. Then we forecast to 2047 and serve it through an API.

*[Point to the equation.]*

Each year, a state's growth is the sum of four parts. First, a national trend that fades with a three-year half-life, because solar growth is already slowing. Second, its GSDP growth times beta. Third, a catch-up term, kappa times the log of how far below its zone's intensity it sits. And fourth, for solar and wind, a transmission index from the CEA line data, because you can't connect a solar park without lines.

The fitted numbers make sense. Solar responds strongly to catch-up. Wind responds to GSDP, with beta about 1. For bio-mass and small hydro the simpler rule backtests better, so we use that, and waste-to-energy is held flat because it only appears from 2018.

Why not machine learning? We started with a tree ensemble. Trees can't extrapolate beyond the capacity levels they've seen, and the frozen states taught ours that growth stops. It was our worst model.

## 4:45 – 6:15 · How well does it work? *(section 6)*

*[Point to Fig. 2.]*

We tested honestly. We trained on data up to 2016, 2018 and 2020, forecast the years after, and scored only fresh values, because scoring frozen copies would reward a model that predicts no growth.

Our model scores 29% weighted error. Just carrying the last value forward scores 44.7%. Our original tree model scored 51.3%. Every part of the model earns its place: remove catch-up and error rises to 33%, remove transmission and it rises to 31%.

By source, wind and small hydro are very accurate, around 10%. Solar is 40%, because solar is where almost all the growth happens. Waste-to-energy is 63%, but it is tiny.

*[Point to Table 3.]*

On the most recent cut-offs, adding transmission cuts error from 35% to 29%. To be fair, we tried three ways of measuring transmission and kept the best, so part of that gain is selection.

Finally, a reality check from outside our data. The grid operator's real-time data shows peak solar output of 71 to 87 gigawatts this year. Our model says 214 gigawatts installed, so peak output is about 40% of capacity. That is physically plausible, at the low end, which tells us 2026 may be slightly high.

## 6:15 – 7:15 · The forecast *(section 7)*

*[Point to Fig. 4.]*

Under each state's recent GSDP growth, India goes from 197 gigawatts today to 384 in 2030, 462 in 2035 and 597 by 2047, three times today. Solar is 71% of that, growing from 131 to 424 gigawatts. Wind roughly triples to 157.

Transmission mainly lifts the near term. Rajasthan added 3,451 kilometres of lines in 2025-26 and Gujarat 1,830, and without that term 2047 would be 506 instead of 597.

We also price it: capital cost and annual cost from CERC and MNRE benchmarks, adjusted by zone.

## 7:15 – 8:00 · Why does it say that? *(section 8)*

*[Point to Fig. 5.]*

Every forecast comes with an exact explanation. We compute SHAP values over all 2,048 combinations of inputs, so the parts add up to the forecast exactly.

Take Gujarat in 2035, at 6% GSDP growth: 92.7 gigawatts. The average scenario is 11.4. Gujarat's existing solar base adds 27, being in the West zone adds 22, the size of its economy adds 17, its wind base adds 14, and its own transmission adds about 3.

And population always gets exactly zero, because the model doesn't use it. That is a built-in check that the explanation is honest.

## 8:00 – 9:15 · Live demo

*[Switch to renewable-energy-2047.vercel.app.]*

This is the dashboard, live on Vercel. The map is the forecast as a heatmap; darker means more capacity.

*[Drag the year slider from 2024 to 2047.]* Watch the West and South fill in.

*[Click Gujarat.]* The globe flies to Gujarat. On the right: capacity, cost, and the same SHAP breakdown we just saw.

*[Move the GSDP slider up.]* If Gujarat's economy grows faster, capacity rises, mostly wind, which is what the model learned. The map recolours and the explanation updates.

*[Switch scope to India.]* And the same works for a zone or for the whole country.

## 9:15 – 10:00 · Limits, next steps, close *(sections 9 and 10)*

We want to be clear about the limits. Nineteen states' 2024 values are our estimates, not observations. Our backtests only check four to eight years ahead, so 2047 depends on the trend half-life: five years instead of three would double the remaining solar growth. And costs use fixed 2024 prices.

Next, we would pull MNRE's monthly state reports to replace the estimates, publish ranges instead of a single line, and add solar and wind resource potential and planned green-corridor lines.

To sum up: by learning only from real reports and letting states catch up with their zone, we cut forecast error from 45% to 29%. India reaches about 600 gigawatts of these five sources by 2047, led by solar in the West. And every number is explained and live in the dashboard. Thank you.

---

## Likely questions

**Why does population have zero effect?** Population didn't predict growth once GSDP and zone were in the model, so we left it out. The slider still works, and the map can show watts per person.

**How does this compare with India's 500 GW non-fossil target for 2030?** We forecast 384 GW for 2030, but the target also counts large hydro and nuclear, which aren't in our five sources, so the two numbers aren't directly comparable.

**Why a three-year half-life?** It backtested best: two years gives 31.1%, five years gives 37.9%. It is the biggest single assumption for 2047, which is why ranges are our first next step.

**How do you know the nowcast is right?** It takes India from 169 to 197 GW, and the grid's real-time peak solar output is consistent with that level. It is still an estimate.

**What is WAPE?** Weighted absolute percentage error: total absolute error divided by total actual capacity, so big states count more than tiny ones.

**Why exact SHAP rather than sampling?** With 11 inputs there are only 2,048 combinations, so we can compute it exactly in about a second, and the parts add up to the forecast.
