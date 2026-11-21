# India Renewable Outlook: 10-minute presentation script

About 1,400 words of speech, at a relaxed 140 words a minute. Times are cumulative. Lines in *[brackets]* are cues, not speech. Poster section numbers are given so you can point at it.

---

## 0:00 – 0:45 · Opening and the question *(Abstract, section 1)*

Good morning. Our question is simple to say and hard to answer: how much solar, wind, bio-mass, small hydro and waste-to-energy capacity will each of India's 34 states and union territories have by 2047, and what will it cost?

State-level forecasts matter because that is where land, grid and investment decisions get made. A national number doesn't tell you where to build a transmission line. So we set ourselves three goals: forecast every state and every source to 2047, let a planner change the economic assumptions and see the effect live, and explain every single forecast.

## 0:45 – 2:00 · The data, and what was wrong with it *(sections 2 and 3)*

We were given 635 rows: 34 states, 2006 to 2024, installed megawatts for five sources, plus zone, population and GSDP. We added one outside source, the Central Electricity Authority's transmission reports from 2018-19 to 2025-26. That is 3,392 lines, and we mapped 94% of them to a state.

The first thing we found was the most important. Only about a third of the values are fresh reports. The rest are copies of the previous year. In 2023 and 2024 only 15 of 34 states report anything new. Nineteen states, including big ones like Rajasthan and Tamil Nadu, are frozen. Many of their 2022 numbers are copies of 2021 too, stored at lower precision: Rajasthan's 12,564.87 megawatts reappears as 12,564.867188.

*[Point to Table 1.]*

That matters because any model trained on this data naively learns that growth stops, since a frozen state looks like zero growth. There were four other problems. National solar goes 53.9, 54.1, then 97 gigawatts, a reporting gap, not a real jump. GSDP jumps 2.2 times in 2011 because the base year changed. The 2024 GSDP is a placeholder that shows minus 0.2% for every state. And a few values drop for no reason, like Bihar solar falling from 390 to 239 megawatts.

We fixed each one: we only learn from fresh reports and treat those precision copies as repeats, we measure growth across the gap, we rebase old GSDP, we impute 2024 GSDP from recent growth, and our forecasts never go down.

We also checked what a repeat means. When solar finally reports again after a gap, it jumps by about three years' worth of growth, so the repeats were a reporting delay. Wind, bio-mass and small hydro jump by less than one year's worth, so those repeats are real pauses. So we only fill in the missing years for solar.

## 2:00 – 3:00 · What the data tells us *(section 4)*

Before modelling, four patterns shaped everything.

Solar is 64% of capacity, and its growth rate is slowing, from about 0.5 a year to about 0.2.

Capacity is concentrated. Five states hold 71% of it, and 14 states have no wind at all.

Zones differ hugely. Solar per unit of GSDP is 14 times higher in the West than in the North-East.

And the surprising one: a state's solar growth is explained by how far it is behind its own zone, a correlation of minus 0.67, and hardly at all by how fast its economy grows, minus 0.09. Lagging states catch up with their neighbours. That one finding became the core of our model.

## 3:00 – 4:45 · The model *(section 5)*

*[Point to Fig. 1, the six steps.]*

The pipeline has six steps. We take the raw panel, clean it, and fit one growth regression per source, using only pairs of fresh reports. Then we nowcast. For frozen states we roll solar forward from its last real report to 2024. That moves India from 169 gigawatts on paper to 206. To test it, we hid 2023 and 2024 for the 14 states that did report and nowcast them instead: the nowcast was off by 22%, about 10% low. Trusting the frozen number would be off by 67%. Then we forecast to 2047 and serve it through an API.

*[Point to the equation.]*

Each year, a state's growth is the sum of four parts. First, a national trend that fades with a four-year half-life, because solar growth is already slowing. Second, its GSDP growth times beta. Third, a catch-up term, kappa times the log of how far below its zone's intensity it sits. And fourth, for solar and wind, a transmission index from the CEA line data, because you can't connect a solar park without lines.

The fitted numbers make sense. Solar responds strongly to catch-up. Wind responds to GSDP, with beta about 1. For bio-mass and small hydro the simpler rule backtests better, so we use that, and waste-to-energy is held flat because it only appears from 2018.

Why not machine learning? We started with a tree ensemble. Trees can't extrapolate beyond the capacity levels they've seen, and the frozen states taught ours that growth stops. It was our worst model.

## 4:45 – 6:15 · How well does it work? *(section 6)*

*[Point to Fig. 2.]*

We tested honestly. We trained on data up to 2016, 2018 and 2020, forecast the years after, and scored only fresh values, because scoring frozen copies would reward a model that predicts no growth.

Our model scores 28.6% weighted error, and 23.6% on the most recent cut-offs. Just carrying the last value forward scores 46%. Our original tree model scored 51%. We also tried gradient-boosted trees, neural networks, an LSTM and a Transformer; all scored between 37% and 61%. With 34 states and at most 19 years each, structure beats flexibility. Removing catch-up raises error to 34%, and removing transmission to 31%.

By source, wind and small hydro are very accurate, around 10%. Solar is 39%, because solar is where almost all the growth happens. Waste-to-energy is 65%, but it is tiny.

We set the trend's half-life so the model isn't biased five to eight years out. With three years it under-forecast those horizons by about 20%; with four, by about 7%. The error that remains at long range is state by state, not national: lagging states get pushed up too much and leaders like Gujarat held back.

*[Point to Table 3.]*

On the most recent cut-offs, adding transmission cuts error from 33% to 24%. To be fair, we tried three ways of measuring transmission and kept the best, so part of that gain is selection.

Finally, a reality check from outside our data. The grid operator's real-time data shows peak solar output of 71 to 87 gigawatts this year. Our model says 266 gigawatts installed, so peak output is only about a third of capacity. That is low, which tells us our 2026 solar is probably too high.

## 6:15 – 7:15 · The forecast *(section 7)*

*[Point to Fig. 4.]*

Under the Viksit Bharat outlook, a $30 trillion economy by 2047, India goes from 206 gigawatts in 2024 to 511 in 2030, 696 in 2035 and 998 by 2047, almost five times today, generating about 2,050 terawatt-hours a year. Solar is 80% of that, growing from 145 to 794 gigawatts. Wind roughly quadruples to 187.

Transmission mainly lifts the near term. Rajasthan added 3,451 kilometres of lines in 2025-26 and Gujarat 1,830, and without that term 2047 would be 801 instead of 998.

We also price it: capital cost and annual cost from CERC and MNRE benchmarks, adjusted by zone.

## 7:15 – 8:00 · Why does it say that? *(section 8)*

*[Point to Fig. 5.]*

Every forecast comes with an exact explanation. We compute SHAP values over all 2,048 combinations of inputs, so the parts add up to the forecast exactly.

Take Gujarat in 2035, at 6% GSDP growth: 95 gigawatts. The average scenario is 16.5. Gujarat's existing solar base adds 28, the size of its economy adds 19, being in the West zone adds 15, its wind base adds 13, and its own transmission adds about 4.

And population always gets exactly zero, because the model doesn't use it. That is a built-in check that the explanation is honest.

## 8:00 – 9:15 · Live demo

*[Switch to renewable-energy-2047.vercel.app.]*

This is the dashboard, live on Vercel. The map is the forecast as a heatmap; darker means more capacity.

*[Drag the year slider from 2024 to 2047.]* Watch the West and South fill in.

*[Click Gujarat.]* The globe flies to Gujarat. On the right: capacity, cost, and the same SHAP breakdown we just saw.

*[Move the GSDP slider up.]* If Gujarat's economy grows faster, capacity rises, mostly wind, which is what the model learned. The map recolours and the explanation updates.

*[Switch scope to India.]* And the same works for a zone or for the whole country.

## 9:15 – 10:00 · Limits, next steps, close *(sections 9 and 10)*

We want to be clear about the limits. Nineteen states' 2024 values are our estimates, not observations. Our backtests only check four to eight years ahead, so 2047 depends on the trend half-life: three years gives 782 gigawatts, five gives 1,292, and we use four, which gives 998. And costs use fixed 2024 prices.

Next, we would pull MNRE's monthly state reports to replace the estimates, publish ranges instead of a single line, and add solar and wind resource potential and planned green-corridor lines.

To sum up: by learning only from real reports and letting states catch up with their zone, we cut forecast error from 46% to under 29%. India reaches about 1,000 gigawatts of these five sources by 2047, 998 in our central case, led by solar in the West. And every number is explained and live in the dashboard. Thank you.

---

## Likely questions

**Why does population have zero effect?** Population didn't predict growth once GSDP and zone were in the model, so we left it out. The slider still works, and the map can show watts per person.

**How does this compare with India's 500 GW non-fossil target for 2030?** We forecast 511 GW for 2030, but the target also counts large hydro and nuclear, which aren't in our five sources, so the two numbers aren't directly comparable.

**Why a four-year half-life?** It makes the backtest unbiased five to eight years out: three years under-forecast those horizons by about 20%. Overall error barely moves, 28.2% with three years and 28.6% with four. It is the biggest single assumption for 2047, which is why ranges are our first next step.

**How do you know the nowcast is right?** We tested it: for the 14 states that did report in 2023 and 2024, we hid those years and nowcast them. It was off by 22%, about 10% low, against 67% for trusting the frozen value. It takes India from 169 to 206 GW. It is still an estimate.

**How does 998 GW compare with the 2,000+ GW government roadmap?** The roadmap counts coal, gas, nuclear and large hydro, which aren't in our data. Its solar and wind part is about 1,500 to 1,600 GW. Our model would need about 12% real growth a year to get near that from economics alone, so the gap is policy ambition our history can't see.

**What is WAPE?** Weighted absolute percentage error: total absolute error divided by total actual capacity, so big states count more than tiny ones.

**Why exact SHAP rather than sampling?** With 11 inputs there are only 2,048 combinations, so we can compute it exactly in about a second, and the parts add up to the forecast.
