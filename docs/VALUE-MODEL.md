# Value Model

**Status:** Illustrative prototype; legal review required before public release.
**Retrieved:** 2026-09-29

## What the amount means

The popup labels this value an **estimated data-use fee equivalent**. It is not
money earned by a user, compensation owed to a user, or the sale price of any
person's data. GhostPrint does not sell, transmit, or license browsing data.

## Source and method

The model uses Tunnl's public article, [Data Usage Fees: How Much Does It Cost To
Activate Third-Party Audience Data?](https://www.tunnldata.com/blog/third-party-audience-data-usage-fees),
published February 10, 2023 and retrieved September 29, 2026. Tunnl states that
its fee is $1.50 CPM on programmatic display and most DSPs, and separately notes
that providers and platforms can charge different rates. This is a single
provider's reported data-usage fee, not an industry-wide average.

For each page session, GhostPrint multiplies observed tracker request hits by
the source CPM divided by 1,000. Category weights and page-vertical multipliers
are all set to 1.0 as neutral defaults: Tunnl does not publish category- or
page-vertical-specific prices. The hostname-only vertical map currently
recognizes a small set of finance, health, e-commerce, and news domains; all
other domains use the general neutral multiplier.

The figure is intentionally a rough scale illustration. A third-party request
hit is not equivalent to an ad impression, an addressable profile, or a billable
audience activation. The calculation must not be interpreted as an individual
data valuation.

Every numeric model input is stored with its source URL and retrieval date in
[`src/data/value-model.json`](../src/data/value-model.json).

## Review gate

Legal review of the UI wording and methodology has not been completed. Do not
publish or submit the Value Meter for store review until counsel reviews the
copy and that approval is recorded.