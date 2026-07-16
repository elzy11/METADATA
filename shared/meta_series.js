/*
  MetaData — canonical data module for the attention-economy visualizations
  (galaxy / market / tree). ONE copy of every number, shared by all three.

  Sources:
  - DAU_B, ARPU_Q, REV_B: Meta Investor Relations / SEC 10-K filings
  - ENG_PCT: Rival IQ / Socialinsider / Hootsuite benchmark reports
    (blended FB+IG per-follower rate)
  - MIN_DAY: Meta 2016 disclosure ("50 minutes"), eMarketer / Statista
  - INT_DAY: EST, endpoints anchored to early Meta disclosures and
    current benchmark volumes
  - Passivity concept: Verduyn et al. (2015), passive-use literature

  - EU_DAU_Q, EU_REV_Q: Meta earnings / SEC 10-Q regional disclosures
    (Europe segment; regional DAU reported through ~2022, DAP-derived
    estimates after; quarterly, index 0 = Q1 2012 — use seriesQ())
  - STOCK_D: real daily/monthly closing prices, stockanalysis.com
    (S&P Global Market Intelligence) + macrotrends.net, 2012 IPO -> 2026-07-10
  - EVENTS / LATEST_Q: dated news events (CNBC, TIME, NPR, Quartz, Forbes)
    and Meta Q1 2026 earnings (2026-04-29)
  - WEEKEND_FACTOR: authored calibration; direction per engagement
    benchmark reports (lower weekend interaction volume)

  No dependencies — plain JavaScript, module window.MetaData.
*/

(function () {
  'use strict';

  const YEAR0 = 2012;

  // ---- yearly series, 2012–2026 ----
  const DAU_B  = [0.62, 0.79, 0.97, 1.15, 1.35, 1.57, 1.82, 2.26, 2.60, 2.82, 2.96, 3.19, 3.35, 3.57, 3.63];
  const ARPU_Q = [1.54, 2.14, 2.81, 3.73, 4.83, 6.18, 7.37, 8.52, 10.14, 11.57, 10.86, 13.12, 14.25, 16.78, 19.50];
  const ENG_PCT = [1.00, 0.95, 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.38, 0.32, 0.27, 0.22, 0.19, 0.17, 0.15];
  const INT_DAY = [11.0, 10.2, 9.4, 8.6, 7.8, 7.0, 6.2, 5.4, 4.8, 4.3, 3.8, 3.3, 2.9, 2.7, 2.5];
  const MIN_DAY = [28, 30, 32, 34, 36, 38, 40, 42, 46, 48, 49, 50, 51, 52, 52];
  const REV_B  = [5.09, 7.87, 12.47, 17.93, 27.64, 40.65, 55.84, 70.70, 85.97, 117.93, 116.61, 134.90, 164.50, 200.97, 245.0];

  // ---- derived: cumulative revenue since 2012, trapezoid-integrated ----
  const REV_YR = REV_B.map(v => v * 1e9);
  const REV_CUM = [0];
  for (let i = 1; i < REV_YR.length; i++) {
    REV_CUM[i] = REV_CUM[i - 1] + (REV_YR[i - 1] + REV_YR[i]) / 2;
  }

  // ---- model constants ----
  const AVG_SESSION_MIN = 15.8;   // mean session length assumption, minutes
  const ACTIVE_SHARE_2012 = 0.38; // passivity anchor: active-time share in 2012
  const ACTIVE_SHARE_POW = 0.8;   // decay softening exponent

  // ---- v2 additions (ADDITIVE ONLY — nothing above was changed) ----

  // EU quarterly series, index 0 = Q1 2012 (use seriesQ(), NOT series())
  // Values from 2026 onward are trend extrapolations (EST)
  const EU_DAU_Q = [
    0.23, 0.24, 0.25, 0.26, 0.27, 0.28, 0.29, 0.3, 0.31, 0.32,
    0.33, 0.34, 0.35, 0.36, 0.37, 0.37, 0.38, 0.38, 0.39, 0.39,
    0.39, 0.4, 0.4, 0.4, 0.41, 0.41, 0.41, 0.41, 0.41, 0.41,
    0.41, 0.41, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42, 0.42,
    0.42, 0.42, 0.43, 0.43, 0.43, 0.43, 0.43, 0.43, 0.44, 0.44,
    0.44, 0.44, 0.44, 0.44, 0.44, 0.44, 0.44,
  ]; // billions, Europe daily actives (family)

  const EU_REV_Q = [
    0.21, 0.26, 0.28, 0.4, 0.38, 0.45, 0.52, 0.78, 0.72, 0.84,
    0.98, 1.42, 1.26, 1.48, 1.72, 2.42, 2.08, 2.44, 2.84, 3.6,
    3.02, 3.52, 4.1, 5.76, 4.95, 5.14, 5.44, 6.86, 5.82, 6.68,
    7.09, 9.09, 7.22, 8.05, 9.43, 11.48, 9.87, 11.48, 12.9, 15.55,
    10.93, 10, 9.9, 11.73, 11.83, 13.84, 14.98, 17.92, 16.35, 18.2,
    20.14, 23.94, 22.1, 24.8, 26.5, 29.8, 13.5,
  ]; // $B, Europe revenue per quarter

  // weekend attention damping (authored calibration, see header)
  const WEEKEND_FACTOR = 0.72;

  // META (NASDAQ) real closing prices ['YYYY-MM-DD', close]
  // monthly closes 2012-2025 (dated at month end), daily May 2025 ->
  const STOCK_D = [
    ['2012-05-18',38.23], ['2012-06-30',31.1], ['2012-07-31',21.71], ['2012-08-31',18.06],
    ['2012-09-30',21.66], ['2012-10-31',21.11], ['2012-11-30',28], ['2012-12-31',26.62],
    ['2013-01-31',30.98], ['2013-02-28',27.25], ['2013-03-31',25.58], ['2013-04-30',27.77],
    ['2013-05-31',24.35], ['2013-06-30',24.88], ['2013-07-31',36.8], ['2013-08-31',41.29],
    ['2013-09-30',50.23], ['2013-10-31',50.21], ['2013-11-30',47.01], ['2013-12-31',54.65],
    ['2014-01-31',62.57], ['2014-02-28',68.46], ['2014-03-31',60.24], ['2014-04-30',59.78],
    ['2014-05-31',63.3], ['2014-06-30',67.29], ['2014-07-31',72.65], ['2014-08-31',74.82],
    ['2014-09-30',79.04], ['2014-10-31',74.99], ['2014-11-30',77.7], ['2014-12-31',78.02],
    ['2015-01-31',75.91], ['2015-02-28',78.97], ['2015-03-31',82.22], ['2015-04-30',78.77],
    ['2015-05-31',79.19], ['2015-06-30',85.77], ['2015-07-31',94.01], ['2015-08-31',89.43],
    ['2015-09-30',89.73], ['2015-10-31',101.97], ['2015-11-30',104.24], ['2015-12-31',104.66],
    ['2016-01-31',112.21], ['2016-02-29',106.92], ['2016-03-31',114.1], ['2016-04-30',117.58],
    ['2016-05-31',118.81], ['2016-06-30',114.28], ['2016-07-31',123.94], ['2016-08-31',126.12],
    ['2016-09-30',128.27], ['2016-10-31',130.99], ['2016-11-30',118.42], ['2016-12-31',115.05],
    ['2017-01-31',130.32], ['2017-02-28',135.54], ['2017-03-31',142.05], ['2017-04-30',150.25],
    ['2017-05-31',151.46], ['2017-06-30',150.98], ['2017-07-31',169.25], ['2017-08-31',171.97],
    ['2017-09-30',170.87], ['2017-10-31',180.06], ['2017-11-30',177.18], ['2017-12-31',176.46],
    ['2018-01-31',186.89], ['2018-02-28',178.32], ['2018-03-31',159.79], ['2018-04-30',172],
    ['2018-05-31',191.78], ['2018-06-30',194.32], ['2018-07-31',172.58], ['2018-08-31',175.73],
    ['2018-09-30',164.46], ['2018-10-31',151.79], ['2018-11-30',140.61], ['2018-12-31',131.09],
    ['2019-01-31',166.69], ['2019-02-28',161.45], ['2019-03-31',166.69], ['2019-04-30',193.4],
    ['2019-05-31',177.47], ['2019-06-30',193], ['2019-07-31',194.23], ['2019-08-31',185.67],
    ['2019-09-30',178.08], ['2019-10-31',191.65], ['2019-11-30',201.64], ['2019-12-31',205.25],
    ['2020-01-31',201.91], ['2020-02-29',192.47], ['2020-03-31',166.8], ['2020-04-30',204.71],
    ['2020-05-31',225.09], ['2020-06-30',227.07], ['2020-07-31',253.67], ['2020-08-31',293.2],
    ['2020-09-30',261.9], ['2020-10-31',263.11], ['2020-11-30',276.97], ['2020-12-31',273.16],
    ['2021-01-31',258.33], ['2021-02-28',257.62], ['2021-03-31',294.53], ['2021-04-30',325.08],
    ['2021-05-31',328.73], ['2021-06-30',347.71], ['2021-07-31',356.3], ['2021-08-31',379.38],
    ['2021-09-30',339.39], ['2021-10-31',323.57], ['2021-11-30',324.46], ['2021-12-31',336.35],
    ['2022-01-31',313.26], ['2022-02-28',211.03], ['2022-03-31',222.36], ['2022-04-30',200.47],
    ['2022-05-31',193.64], ['2022-06-30',161.25], ['2022-07-31',159.1], ['2022-08-31',162.93],
    ['2022-09-30',135.68], ['2022-10-31',93.16], ['2022-11-30',118.1], ['2022-12-31',120.34],
    ['2023-01-31',148.97], ['2023-02-28',174.94], ['2023-03-31',211.94], ['2023-04-30',240.32],
    ['2023-05-31',264.72], ['2023-06-30',286.98], ['2023-07-31',318.6], ['2023-08-31',295.89],
    ['2023-09-30',300.21], ['2023-10-31',301.27], ['2023-11-30',327.15], ['2023-12-31',353.96],
    ['2024-01-31',390.14], ['2024-02-29',490.13], ['2024-03-31',485.58], ['2024-04-30',430.17],
    ['2024-05-31',466.83], ['2024-06-30',504.22], ['2024-07-31',474.83], ['2024-08-31',521.31],
    ['2024-09-30',572.44], ['2024-10-31',567.58], ['2024-11-30',574.32], ['2024-12-31',585.51],
    ['2025-01-31',689.18], ['2025-02-28',668.2], ['2025-03-31',576.36], ['2025-04-30',549],
    ['2025-05-29',645.05], ['2025-05-30',647.49], ['2025-06-02',670.9], ['2025-06-03',666.85],
    ['2025-06-04',687.95], ['2025-06-05',684.62], ['2025-06-06',697.71], ['2025-06-09',694.06],
    ['2025-06-10',702.4], ['2025-06-11',694.14], ['2025-06-12',693.36], ['2025-06-13',682.87],
    ['2025-06-16',702.12], ['2025-06-17',697.23], ['2025-06-18',695.77], ['2025-06-20',682.35],
    ['2025-06-23',698.53], ['2025-06-24',712.2], ['2025-06-25',708.68], ['2025-06-26',726.09],
    ['2025-06-27',733.63], ['2025-06-30',738.09], ['2025-07-01',719.22], ['2025-07-02',713.57],
    ['2025-07-03',719.01], ['2025-07-07',718.35], ['2025-07-08',720.67], ['2025-07-09',732.78],
    ['2025-07-10',727.24], ['2025-07-11',717.51], ['2025-07-14',720.92], ['2025-07-15',710.39],
    ['2025-07-16',702.91], ['2025-07-17',701.41], ['2025-07-18',704.28], ['2025-07-21',712.965],
    ['2025-07-22',704.81], ['2025-07-23',713.58], ['2025-07-24',714.8], ['2025-07-25',712.68],
    ['2025-07-28',717.63], ['2025-07-29',700], ['2025-07-30',695.21], ['2025-07-31',773.44],
    ['2025-08-01',750.01], ['2025-08-04',776.37], ['2025-08-05',763.46], ['2025-08-06',771.99],
    ['2025-08-07',761.83], ['2025-08-08',769.3], ['2025-08-11',765.87], ['2025-08-12',790],
    ['2025-08-13',780.08], ['2025-08-14',782.13], ['2025-08-15',785.23], ['2025-08-18',767.37],
    ['2025-08-19',751.48], ['2025-08-20',747.72], ['2025-08-21',739.1], ['2025-08-22',754.79],
    ['2025-08-25',753.3], ['2025-08-26',754.1], ['2025-08-27',747.38], ['2025-08-28',751.11],
    ['2025-08-29',738.7], ['2025-09-02',735.11], ['2025-09-03',737.05], ['2025-09-04',748.65],
    ['2025-09-05',752.45], ['2025-09-08',752.3], ['2025-09-09',765.7], ['2025-09-10',751.98],
    ['2025-09-11',750.9], ['2025-09-12',755.59], ['2025-09-15',764.7], ['2025-09-16',779],
    ['2025-09-17',775.715], ['2025-09-18',780.25], ['2025-09-19',778.38], ['2025-09-22',765.16],
    ['2025-09-23',755.4], ['2025-09-24',760.66], ['2025-09-25',748.91], ['2025-09-26',743.75],
    ['2025-09-29',743.4], ['2025-09-30',734.38], ['2025-10-01',717.34], ['2025-10-02',727.05],
    ['2025-10-03',710.56], ['2025-10-06',715.66], ['2025-10-07',713.08], ['2025-10-08',717.84],
    ['2025-10-09',733.51], ['2025-10-10',705.3], ['2025-10-13',715.7], ['2025-10-14',708.65],
    ['2025-10-15',717.55], ['2025-10-16',712.07], ['2025-10-17',716.915], ['2025-10-20',732.17],
    ['2025-10-21',733.27], ['2025-10-22',733.41], ['2025-10-23',734], ['2025-10-24',738.36],
    ['2025-10-27',750.82], ['2025-10-28',751.44], ['2025-10-29',751.67], ['2025-10-30',666.47],
    ['2025-10-31',648.35], ['2025-11-03',637.71], ['2025-11-04',627.32], ['2025-11-05',635.95],
    ['2025-11-06',618.94], ['2025-11-07',621.71], ['2025-11-10',631.76], ['2025-11-11',627.08],
    ['2025-11-12',609.01], ['2025-11-13',609.89], ['2025-11-14',609.46], ['2025-11-17',602.01],
    ['2025-11-18',597.69], ['2025-11-19',590.32], ['2025-11-20',589.15], ['2025-11-21',594.25],
    ['2025-11-24',613.05], ['2025-11-25',636.22], ['2025-11-26',633.61], ['2025-11-28',647.95],
    ['2025-12-01',640.87], ['2025-12-02',647.1], ['2025-12-03',639.6], ['2025-12-04',661.53],
    ['2025-12-05',673.42], ['2025-12-08',666.8], ['2025-12-09',656.96], ['2025-12-10',650.13],
    ['2025-12-11',652.71], ['2025-12-12',644.23], ['2025-12-15',647.51], ['2025-12-16',657.15],
    ['2025-12-17',649.5], ['2025-12-18',664.45], ['2025-12-19',658.77], ['2025-12-22',661.5],
    ['2025-12-23',664.94], ['2025-12-24',667.55], ['2025-12-26',663.29], ['2025-12-29',658.69],
    ['2025-12-30',665.95], ['2025-12-31',660.09], ['2026-01-02',650.41], ['2026-01-05',658.79],
    ['2026-01-06',660.62], ['2026-01-07',648.69], ['2026-01-08',646.06], ['2026-01-09',653.06],
    ['2026-01-12',641.97], ['2026-01-13',631.09], ['2026-01-14',615.52], ['2026-01-15',620.8],
    ['2026-01-16',620.25], ['2026-01-20',604.12], ['2026-01-21',612.96], ['2026-01-22',647.63],
    ['2026-01-23',658.76], ['2026-01-26',672.36], ['2026-01-27',672.97], ['2026-01-28',668.73],
    ['2026-01-29',738.31], ['2026-01-30',716.5], ['2026-02-02',706.41], ['2026-02-03',691.7],
    ['2026-02-04',668.99], ['2026-02-05',670.21], ['2026-02-06',661.46], ['2026-02-09',677.22],
    ['2026-02-10',670.72], ['2026-02-11',668.69], ['2026-02-12',649.81], ['2026-02-13',639.77],
    ['2026-02-17',639.29], ['2026-02-18',643.22], ['2026-02-19',644.78], ['2026-02-20',655.66],
    ['2026-02-23',637.25], ['2026-02-24',639.3], ['2026-02-25',653.69], ['2026-02-26',657.01],
    ['2026-02-27',648.18], ['2026-03-02',653.56], ['2026-03-03',655.08], ['2026-03-04',667.73],
    ['2026-03-05',660.57], ['2026-03-06',644.86], ['2026-03-09',647.39], ['2026-03-10',654.07],
    ['2026-03-11',654.86], ['2026-03-12',638.18], ['2026-03-13',613.71], ['2026-03-16',627.45],
    ['2026-03-17',622.66], ['2026-03-18',615.68], ['2026-03-19',606.7], ['2026-03-20',593.66],
    ['2026-03-23',604.06], ['2026-03-24',592.92], ['2026-03-25',594.89], ['2026-03-26',547.54],
    ['2026-03-27',525.72], ['2026-03-30',536.38], ['2026-03-31',572.13], ['2026-04-01',579.23],
    ['2026-04-02',574.46], ['2026-04-06',573.02], ['2026-04-07',575.05], ['2026-04-08',612.42],
    ['2026-04-09',628.39], ['2026-04-10',629.86], ['2026-04-13',634.53], ['2026-04-14',662.49],
    ['2026-04-15',671.58], ['2026-04-16',676.87], ['2026-04-17',688.55], ['2026-04-20',670.91],
    ['2026-04-21',668.84], ['2026-04-22',674.72], ['2026-04-23',659.15], ['2026-04-24',675.03],
    ['2026-04-27',678.62], ['2026-04-28',671.34], ['2026-04-29',669.12], ['2026-04-30',611.91],
    ['2026-05-01',608.745], ['2026-05-04',610.41], ['2026-05-05',604.96], ['2026-05-06',612.88],
    ['2026-05-07',616.81], ['2026-05-08',609.63], ['2026-05-11',598.86], ['2026-05-12',603],
    ['2026-05-13',616.63], ['2026-05-14',618.43], ['2026-05-15',614.23], ['2026-05-18',611.21],
    ['2026-05-19',602.61], ['2026-05-20',605.06], ['2026-05-21',607.38], ['2026-05-22',610.26],
    ['2026-05-26',612.34], ['2026-05-27',635.255], ['2026-05-28',635.29], ['2026-05-29',632.51],
    ['2026-06-01',600.47], ['2026-06-02',597.63], ['2026-06-03',622.98], ['2026-06-04',627.57],
    ['2026-06-05',593], ['2026-06-08',585.39], ['2026-06-09',584.59], ['2026-06-10',570.98],
    ['2026-06-11',568.43], ['2026-06-12',566.98], ['2026-06-15',593.48], ['2026-06-16',600.21],
    ['2026-06-17',567.58], ['2026-06-18',577.22], ['2026-06-22',563.85], ['2026-06-23',562.2],
    ['2026-06-24',557.67], ['2026-06-25',542.87], ['2026-06-26',550.25], ['2026-06-29',562.6],
    ['2026-06-30',563.29], ['2026-07-01',612.91], ['2026-07-02',582.9], ['2026-07-06',600.29],
    ['2026-07-07',615.58], ['2026-07-08',603.12], ['2026-07-09',631.48], ['2026-07-10',669.21],
  ];
  const STOCK_PREV_CLOSE = { date: '2026-07-10', price: 669.21 };

  // dated market/attention events (annotation cards)
  const EVENTS = [
    {"d": "2012-05-18", "title": "18 MAY 2012 · IPO — WALL STREET MEETS FACEBOOK", "mDir": -1, "mText": "priced at $38, down 53% within four months", "aDir": 1, "aText": "crossed one billion monthly users that same autumn", "quote": "It lost half its value in four months, but gained its first billion users.", "url": "https://money.cnn.com/2012/05/23/technology/facebook-ipo-what-went-wrong/index.htm", "domain": "money.cnn.com"},
    {"d": "2018-03-19", "title": "MAR 2018 · CAMBRIDGE ANALYTICA", "mDir": -1, "mText": "−18% over two weeks · #DeleteFacebook trends worldwide", "aDir": 1, "aText": "daily users +13% year-on-year through the scandal", "quote": "Outrage as it turns out, is also engagement.", "url": "https://www.cnbc.com/2018/03/19/facebook-shares-fall-over-fallout-from-cambridge-analytica-scandal.html", "domain": "cnbc.com"},
    {"d": "2018-07-26", "title": "26 JUL 2018 · GROWTH SLOWS · THE GDPR QUARTER", "mDir": -1, "mText": "−19% in one day · −$119B, the largest single-day loss in history at the time", "aDir": 0, "aText": "1.47 billion people still came back every single day", "quote": "As Wall Street called it the worst day in market history, it grew by fifty million people in that quarter.", "url": "https://money.cnn.com/2018/07/26/technology/business/facebook-stock-drop/index.html", "domain": "money.cnn.com"},
    {"d": "2021-09-14", "title": "SEP 2021 · THE WHISTLEBLOWER FILES", "mDir": -1, "mText": "−13% over the following month", "aDir": 0, "aText": "usage unmoved by the company's own leaked research", "quote": "The research was leaked, read, cited in Congress, and shared on your feed.", "url": "https://time.com/6104351/facebook-stock-whistleblower/", "domain": "time.com"},
    {"d": "2022-02-03", "title": "03 FEB 2022 · APPLE TRACKING CHANGE & FIRST-EVER USER DECLINE", "mDir": -1, "mText": "−26.4% in one day · −$232B, the largest single-day loss in market history", "aDir": -1, "aText": "−0.05% · a million fewer, out of 1.93 billion — a rounding error", "quote": "The market panicked, yet nobody stopped scrolling.", "url": "https://www.cnbc.com/2022/02/03/facebooks-232billion-drop-in-value-sets-all-time-record.html", "domain": "cnbc.com"},
    {"d": "2022-11-04", "title": "NOV 2022 · METAVERSE LOSSES · 11,000 LAYOFFS", "mDir": -1, "mText": "$88 — lowest price since 2015, −76% from peak", "aDir": 1, "aText": "daily users hit an all-time high of 2.0B that same quarter", "quote": "The company lost three quarters of its value, yet it never lost you.", "url": "https://www.npr.org/2022/10/27/1131705422/facebook-meta-earnings-stock-price-fall-metaverse", "domain": "npr.org"},
    {"d": "2023-02-01", "title": "01 FEB 2023 · THE YEAR OF EFFICIENCY", "mDir": 1, "mText": "+23% in one day · buybacks and 21,000 layoffs", "aDir": 1, "aText": "two billion people daily, for the first time", "quote": "They fired the people who built it, yet the people who feed it could stay.", "url": "https://qz.com/meta-earnings-2023-q4-share-buyback-layoffs-1850063732", "domain": "qz.com"},
    {"d": "2024-02-02", "title": "02 FEB 2024 · FIRST DIVIDEND ANNOUNCED", "mDir": 1, "mText": "+20.3% in one day · +$197B, the largest single-day gain ever recorded", "aDir": -1, "aText": "engagement rate at a historic low — extraction per user at a historic high", "quote": "You engaged less than ever, while you were worth more than ever.", "url": "https://www.cnbc.com/2024/02/02/meta-shares-surge-17percent-as-investors-cheer-first-ever-dividend.html", "domain": "cnbc.com"},
    {"d": "2025-08-12", "title": "12 AUG 2025 · ALL-TIME HIGH", "mDir": 1, "mText": "$790 · AI-tuned ads drive record revenue", "aDir": -1, "aText": "engagement rate near its historic floor", "quote": "It was never worth more, yet you never mattered less.", "url": "https://www.cnbc.com/2025/07/30/meta-q2-earnings-report-2025.html", "domain": "cnbc.com"},
    {"d": "2026-03-26", "title": "26 MAR 2026 · THE ADDICTION VERDICT", "mDir": -1, "mText": "−8% in a day · −$300B in March, as a jury rules it harmed mental health through addictive design features", "aDir": 1, "aText": "3.56 billion daily people that same quarter — an all-time high", "quote": "Meta paid the fine, and everything was fine again.", "url": "https://www.forbes.com/sites/tylerroush/2026/03/27/metas-rare-selloff-deepens-after-court-losses-ai-delays-and-metaverses-decline/", "domain": "forbes.com"},
    {"d": "2026-04-29", "title": "29 APR 2026 · THE AI BILL", "mDir": -1, "mText": "−9% in a day · −$175B, as AI spending is raised to $125–145B", "aDir": 1, "aText": "3.56 billion daily people — more than ever", "quote": "The market questioned the spending, while nobody questioned the source.", "url": "https://www.cnbc.com/2026/04/29/meta-q1-earnings-report-2026.html", "domain": "cnbc.com"}
  ];

  // latest reported quarter (hard figures from the earnings release)
  const LATEST_Q = {
    label: 'Q1 2026', dateLabel: 'Apr 29, 2026', date: '2026-04-29',
    rev_b: 56.31, dap_b: 3.56, eu_rev_b: 13.5,
    eu_growth_yoy: 0.39, net_income_b: 26.77,
  };

  // ---- helpers ----
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // linear interpolation on a yearly series at fractional year yf
  function series(arr, yf) {
    const x = clamp(yf - YEAR0, 0, arr.length - 1);
    const i = Math.min(Math.floor(x), arr.length - 2);
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }


  // linear interpolation on a QUARTERLY series (index 0 = Q1 2012) at
  // fractional year yf — companion to series(); do not mix the two
  function seriesQ(arr, yf) {
    const x = clamp((yf - YEAR0) * 4, 0, arr.length - 1);
    const i = Math.min(Math.floor(x), arr.length - 2);
    return arr[i] + (arr[i + 1] - arr[i]) * (x - i);
  }

  // daily rhythm shape (peaks 09:00 / 15:00 local), NORMALIZED so its
  // 24h average is exactly 1 — it redistributes attention, never adds
  function rhythmRaw(h) {
    return 0.22
      + Math.exp(-Math.pow(h - 9, 2) / 5.0)
      + 0.92 * Math.exp(-Math.pow(h - 15, 2) / 7.0);
  }
  let RHYTHM_MEAN = 0;
  const STEPS = 480;
  for (let i = 0; i < STEPS; i++) RHYTHM_MEAN += rhythmRaw((i / STEPS) * 24) / STEPS;
  function rhythm(h) { return rhythmRaw(h) / RHYTHM_MEAN; }

  // v3: weekday-aware rhythm. Sat/Sun damped by WEEKEND_FACTOR, renormalized
  // so the WEEKLY average is exactly 1 (weekdays sit slightly above 1 —
  // the factor redistributes attention across the week, it never deletes any).
  // Use for moments with a REAL calendar date; keep rhythm() for abstract
  // "typical day" loops that have no weekday.
  const WEEK_NORM = (5 + 2 * WEEKEND_FACTOR) / 7;
  function dayFactor(dow) {
    return ((dow === 0 || dow === 6) ? WEEKEND_FACTOR : 1) / WEEK_NORM;
  }
  function rhythmWeek(h, dow) { return rhythm(h) * dayFactor(dow); }

  window.MetaData = {
    version: 4,
    YEAR0: YEAR0,
    estFrom: 2026,

    // series (yearly arrays, index 0 = 2012)
    DAU_B, ARPU_Q, ENG_PCT, INT_DAY, MIN_DAY, REV_B, REV_YR, REV_CUM,

    // interpolation + rhythm
    series, rhythm, seriesQ,
    // v3: weekday-aware rhythm (see note above) + its per-day factor
    rhythmWeek, dayFactor,

    // v2: EU quarterly series + stock + events + latest quarter
    EU_DAU_Q, EU_REV_Q, WEEKEND_FACTOR,
    STOCK_D, STOCK_PREV_CLOSE, EVENTS, LATEST_Q,

    // EU derived metrics (quarterly-interpolated)
    euShare(yf) { return seriesQ(EU_DAU_Q, yf) / series(DAU_B, yf); },
    euArpuYear(yf) { return seriesQ(EU_REV_Q, yf) * 4 / seriesQ(EU_DAU_Q, yf); },
    euRevPerMin(yf) { return seriesQ(EU_REV_Q, yf) * 4e9 / 525960; },

    // concurrent users at fractional year yf and local hour h (0–24):
    // DAP × (daily minutes online ÷ 1440) × normalized rhythm
    concurrent(yf, h) {
      return series(DAU_B, yf) * 1e9 * (series(MIN_DAY, yf) / 1440) * rhythm(h);
    },

    // engagement events per second, absolute
    eventsPerSec(yf) {
      return series(DAU_B, yf) * 1e9 * series(INT_DAY, yf) / 86400;
    },

    // per-user interaction rate per active second (drives event visuals)
    eventsPerActiveSec(yf) {
      return series(INT_DAY, yf) / (series(MIN_DAY, yf) * 60);
    },

    // revenue
    revYr(yf) { return series(REV_YR, yf); },
    revPerSec(yf) { return series(REV_YR, yf) / 31557600; },
    revCum(yf) { return series(REV_CUM, yf); },
    revPerSession(yf) {
      const perUserDay = series(REV_YR, yf) / (series(DAU_B, yf) * 1e9) / 365.25;
      const sessionsPerDay = series(MIN_DAY, yf) / AVG_SESSION_MIN;
      return perUserDay / sessionsPerDay;
    },
    arpuQuarter(yf) { return series(ARPU_Q, yf); },
    arpuYear(yf) { return series(ARPU_Q, yf) * 4; },

    // passivity index, 0–1: share of platform time without conscious action
    passivity(yf) {
      const ratio = series(ENG_PCT, yf) / ENG_PCT[0];
      return 1 - ACTIVE_SHARE_2012 * Math.pow(ratio, ACTIVE_SHARE_POW);
    },

    // v4: live engagement events per MINUTE at a real calendar moment —
    // concurrent users × per-active-second rate × 60, weekend-damped.
    // Conserves the weekly average (equals eventsPerSec × 60 over time).
    // yf = fractional year, h = local hour 0–24, dow = 0(Sun)…6(Sat);
    // omit dow for an abstract "typical day" (no weekend damping).
    // Body uses closure functions (module style) — safe to destructure.
    eventsPerMinLive(yf, h, dow) {
      const df = (dow === undefined) ? 1 : dayFactor(dow);
      const conc = series(DAU_B, yf) * 1e9 * (series(MIN_DAY, yf) / 1440) * rhythm(h);
      const perActiveSec = series(INT_DAY, yf) / (series(MIN_DAY, yf) * 60);
      return conc * df * perActiveSec * 60;
    },
  };
})();
