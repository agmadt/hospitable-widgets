# Developer guide

How Hospitable Listing Widgets works inside: the snippet and template format, the data each widget receives, the sample data, the limits, and how to develop and release it. Hosts setting it up only need the [README](../README.md).

## How the parts fit

```
 Your website (Wix, …)                Your Cloudflare account                 Hospitable
 ┌──────────────────────┐   data     ┌──────────────────────────┐  hourly   ┌──────────────┐
 │ snippet: one <div>   │ ─────────▶ │ Worker                   │ ────────▶ │ Public API   │
 │  and one <script>    │  public    │  holds HOSPITABLE_PAT    │  read     │              │
 │  widget.js, template │  JSON      │  KV: last good data      │  only     │              │
 │  ◀─ jsDelivr         │            │  cron: refresh every hour│           │              │
 └──────────────────────┘            └──────────────────────────┘           └──────────────┘
```

1. `widget.js` loads from jsDelivr, so it costs your Worker nothing, and finds each widget on the page. As a widget nears the screen, it asks your Worker for its property's data (one request, shared by every widget of that property) and, at the same time, loads the widget's template and the small modules it needs (calendar, reviews, photo viewer, pager) from jsDelivr.
2. The Worker answers from a 60-second memory cache, then from KV. Only the first request for a data set calls Hospitable; after that, the hourly cron keeps it fresh.
3. `widget.js` fills the template and renders it in a shadow root, so the website's CSS and the widget's CSS can't affect each other.

The Deploy button asks only for the bindings listed under `cloudflare.bindings` in `package.json`, and every one listed there is required, so optional variables stay off that list. Variables added later in the dashboard survive redeploys because `wrangler.jsonc` sets `keep_vars`.

## Snippet format

The builder writes the snippet for you: one element and one script.

```html
<div data-hosp="amenities"
     data-hosp-worker="https://hospitable-widgets.you.workers.dev"
     data-hosp-property="PROPERTY_ID"
     data-hosp-data="property" data-hosp-modules=""
     data-hosp-options="heading=Inside%20the%20villa"
     data-hosp-style="accent=%23c2410c&font=dm-sans&headingFont=lora"
     data-hosp-amenities-limit="8"></div>
<script src="https://cdn.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js" defer></script>
```

`data-hosp` names one of the starter templates in [`widget/templates/`](../widget/templates/), which load from jsDelivr next to `widget.js`. `data-hosp-options` and `data-hosp-style` hold only what you changed from the template's defaults, URL-encoded. Template fixes therefore reach every website through jsDelivr, the same way `widget.js` fixes do.

Several snippets on one page may each carry the `<script>`: `widget.js` notices it is already running and only picks up the new widgets.

If you edit a widget's HTML in the builder, the snippet carries your HTML instead, in a `<template>` that `data-hosp-template` points to:

```html
<template id="hosp-amenities-x7k2">
  <style>:host { --hw-accent: #2e7d32; } h2 { color: var(--hw-accent); }</style>
  <h2>{property_name}</h2>
  <ul>{#amenities}<li>{.}</li>{/amenities}</ul>
</template>
<div data-hosp-template="hosp-amenities-x7k2" data-hosp-worker="…" data-hosp-property="…"></div>
<script src="https://cdn.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js" defer></script>
```

A snippet can pin an exact release instead of `@1`, for example `…/hospitable-widgets@1.1.2/widget/widget.min.js`; `widget.js` then loads its modules and templates from that same release, so nothing on the page changes until the host edits the snippet.

`widget.js` keeps each property's last data in the visitor's browser (localStorage). If the Worker can't be reached, a returning visitor sees that copy and a first-time visitor sees a short "can't be shown right now" message. Snippets made before v1.1 carry a data snapshot in a `<script type="application/json">`, which still works.

### Template tags

| Tag | Does |
| --- | --- |
| `{field}` | Inserts a value, HTML-escaped. Unknown fields render as nothing, never as `{braces}`. |
| `{a.b}` | A nested value, for example `{photo_1.url}`. |
| `{#list}…{/list}` | Repeats for each item. `{.}` is the item itself; `{url}` reads an item's field. Inside a list: `{_number}` (1, 2, …), `{_index}` (0, 1, …), `{_first}`, `{_last}`. |
| `{#flag}…{/flag}` | Shows only when the value is true or not empty. |
| `{^flag}…{/flag}` | Shows only when the value is false or empty. |
| `{#list.0}…{/list.0}` | Shows once when a list has items (a heading above a list, say). |
| `<!--{#rows}-->` | A tag may sit in an HTML comment. Use this between table rows, where the browser would otherwise move the text out of the table. |

`data-hosp-data` and `data-hosp-modules` say what the widget needs. `data-hosp-data` picks the endpoint: every per-property widget fetches the same full URL (`?include=calendar,guide,host,reviews`), so widgets of a property share one request and one browser-cached copy, while `host` alone (without a property) and `properties` have endpoints of their own. `data-hosp-modules` picks the code: a page with only an Amenities widget never downloads the calendar module. The builder writes both attributes. If a hand-written snippet leaves them out, `widget.js` loads `modules/analyze.js` to work them out from the fields the template uses.

### Display choices

Display choices go on the `<div>` as attributes. The data behind them is public anyway, and `widget.js` applies them in the browser:

| Attribute | Effect |
| --- | --- |
| `data-hosp-amenities-limit="8"` | Show the first 8 amenities; `{amenities_more}` holds the rest's count. |
| `data-hosp-guide-titles='{"Local attractions":"Things to do"}'` | Your own names for Knowledge Hub topics. |
| `data-hosp-photos-limit="5"` | Photos on the page; the viewer still shows all of them. |
| `data-hosp-review-ids="id1,id2"` | Exactly these reviews, in this order. |
| `data-hosp-min-rating="4"` | Reviews rated 4 or more. |
| `data-hosp-reviews-limit="6"` | At most 6 reviews. |
| `data-hosp-reviews-sort="highest"` | Highest rated first (default: newest). |
| `data-hosp-reviews-with-text="false"` | Include ratings without text. |
| `data-hosp-months="6"` | Months in the calendar (default 12). |
| `data-hosp-week-start="monday"` | First day of the week (default: the visitor's locale). |
| `data-hosp-locale="de-DE"` | Format dates and prices for this locale (default: the page's language). |
| `data-hosp-data="property,reviews"` | Data sets to fetch: `property`, `calendar`, `reviews`, `guide`, `host`, `properties`. |
| `data-hosp-modules="reviews,pager"` | Modules to load: `calendar`, `reviews`, `lightbox`, `pager`. |
| `data-hosp-eager` | Load right away instead of when the widget nears the screen. |
| `data-hosp-options="key=value&…"` | Template options, for snippets that name a starter (`data-hosp`). |
| `data-hosp-style="accent=%23c2410c&…"` | Colors (`accent`, `text`, `background`), fonts (`font`, `headingFont`), `radius`, `space` and `card` (`card-border`, `card-shadow` or empty). |

### Behaviors

A template can switch on two behaviors with attributes:

- `data-hosp-lightbox` on a container makes its images open a full-screen viewer (arrow keys, swipe, Esc). `data-hosp-open="0"` on a button opens it at a given photo.
- `data-hosp-pager` goes on a container of `data-hosp-page` children, with `data-hosp-prev`, `data-hosp-next` and an optional `data-hosp-page-label`. `data-hosp-per-view="auto"` shows as many pages side by side as fit (minimum width from `data-hosp-min-width`, default 280), and puts the count in the CSS variable `--hosp-per-view`.

### What a page downloads

Formatting is built into `widget.js`. Starter templates come through the `templates` module, and everything else is a module loaded only when a widget on the page uses it. JavaScript sizes as jsDelivr serves them, minified and compressed; each template file adds 1 to 3 KB:

| Widget | JavaScript |
| --- | --- |
| Description, Key facts, Amenities, House rules, Sleeping, The space, Policies, Local guide, Also listed on, Meet your host, Property list, Rating summary | 8.2 KB: `widget.js` + `templates` |
| Photo gallery | 10.8 KB: + `lightbox` (viewer with filmstrip) |
| Availability calendar | 10.2 KB: + `calendar`, `pager` |
| Reviews carousel | 9.9 KB: + `reviews`, `pager` |

`npm run size` prints the current numbers and writes `widget/sizes.json`, which the builder shows hosts. Modules and templates load from the same folder and the exact same version as `widget.js` (`@1` becomes, say, `@1.1.1`), so a cached `widget.js` never meets newer ones. Widgets mount as they come within 400 px of the screen, so a page whose widgets nobody scrolls to costs no Worker request, and widgets of the same property share one request (see [More than one widget](../README.md#more-than-one-widget) in the README).

### Events and API

Each render fires a `hosp:render` event on the element; `detail.state` is `live`, `cached` (the visitor's last copy) or `snapshot` (a pre-v1.1 snippet's own data), and `data-hosp-state` on the element says the same, or `unavailable`. For builders and tests, `window.HospWidgets` has `render`, `renderTo`, `derive`, `fetchData`, `need`, `module` and `scan`, plus `analyze` and `plan` once `need(['analyze'])` has loaded.

### Writing a module

A module is a plain script that registers itself:

```js
HospWidgets.define('mymodule', ['calendar'], function (api) {
  return {
    derive: function (data, opts, ctx) { /* add fields to data */ },
    wire: function (shadowRoot, data) { /* add behavior after each render */ },
  };
});
```

### Starter templates

Each file in [`widget/templates/`](../widget/templates/) starts with a header that describes the widget and its options for the builder:

```html
<!--hw {"name":"Amenities","blurb":"…","height":480,"options":[
 {"key":"heading","label":"Heading","type":"text","default":"What this place offers"},
 {"key":"amenities-limit","label":"Show at most","type":"number","default":"10","target":"attr"}
]} -->
```

- Options without a `target` go in `data-hosp-options` and are applied by the `templates` module: `[[key]]` inserts the value (escaped), `[[#key]]…[[/key]]` keeps a block when the option is on, `[[^key]]…[[/key]]` when it's off, and `[[#key=value]]…[[/key=value]]` when it equals a value. `[[card]]` is the card style.
- Options with `"target":"attr"` become `data-hosp-<key>` display choices.
- Option types: `text`, `textarea`, `url` (https only), `pattern` (a URL that may contain `{id}`), `number`, `select`, `toggle` and `reviews` (a review picker). A text option can name `tokens`, such as `{"count":"amenity_count"}`, so a host may type `{count}`.
- The rest is the template syntax above. Inside tables, wrap tags in comments (`<!--{#rows}-->`), and never put a tag where an attribute name goes: the browser's HTML parser moves or splits them. Tests check both.
- A new starter also needs an entry in the builder's widget catalog.

## Widget data reference

Field names are snake case. A template can use any field of the data sets it touches. `widget.js` also adds the formatted fields listed after each table, in the visitor's language.

Which widget reads which data set: `property` for Description, Key facts, Amenities, Photo gallery, House rules, Sleeping arrangements, The space and the area, Policies and fees and Also listed on; `reviews` for Reviews and Rating summary; `calendar` for Availability calendar and Price from; `guide` for Local guide; `host` for Meet your host; `properties` for Property list.

### `GET /api/properties/:id`: property

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `property_name` | string | `property_name` is the public name, never the internal one |
| `summary`, `description` | string | Line breaks kept: use `white-space: pre-line` |
| `property_type`, `room_type` | string | e.g. `villa`, `entire_home` |
| `city`, `state`, `country` | string | City level only: never the street or coordinates |
| `max_guests`, `bedrooms`, `beds`, `bathrooms` | number | |
| `check_in`, `check_out` | `"HH:MM"` | |
| `currency` | string | ISO 4217 |
| `amenities` | string[] | In Hospitable's order, as one flat list like the API sends. Codes are made readable (`hot_tub` → `Hot tub`, `wifi` → `Wi-Fi`); any other value, such as a custom amenity, is shown as it is. |
| `photos` | `{url, thumbnail_url, caption}[]` | Your order; https only |
| `pets_allowed`, `smoking_allowed`, `events_allowed`, `children_allowed`, `infants_allowed` | boolean or null | |
| `additional_rules` | string | |
| `rooms` | `{name, type, beds: {type, label, quantity}[]}[]` | Rooms with beds only |
| `space`, `neighborhood`, `getting_around` | string | |
| `cancellation_policy`, `payment_terms` | string | One rule per line |
| `fees` | `{name, amount, type: "fixed" or "percent"}[]` | |
| `cleaning_fee`, `security_deposit`, `extra_guest_fee`, `pet_fee` | number | Major units (`90` = $90) |
| `extra_guest_after` | number | Guests included before the extra guest fee |
| `discounts` | `{name, percent}[]` | Weekly and monthly |
| `channels` | `{platform, name, url}[]` | Airbnb, Vrbo, your Hospitable direct site |

Added by `widget.js`: `location`, `guests_label`, `bedrooms_label` (`Studio` for 0), `beds_label`, `bathrooms_label`, `check_in_formatted`, `check_out_formatted`, `property_type_label`, `room_type_label`, `amenity_count`, `amenities_more`, `amenities_all` (the full list, also when the page shows fewer), `photo_count`, `photos_more`, `cover_photo`, `photos_all`, `photo_1` … `photo_5`, `rules` (`{rule, allowed, text}[]`), `rooms[].beds_text`, `room_count`, `fees[].formatted`, `*_fee_formatted`, `security_deposit_formatted`, and per photo `index`, `alt`.

### `GET /api/properties/:id/calendar`

| Field | Type | Notes |
| --- | --- | --- |
| `currency` | string | |
| `calendar` | `{date, available, price, min_stay}[]` | 12 months from today; `price` only on open nights |

Added by `widget.js`: `price_from`, `price_from_formatted`, `min_stay`, `min_stay_label`, `next_available`, `available_nights`, and `months`: `{label, month, year, weekdays: {label}[], weeks: {days: {day, date, label, state, available, booked, past, today, unknown, blank, price, price_formatted, min_stay}[]}[]}[]`. `state` is `available`, `booked`, `past`, `unknown` or `blank`, which works as a class name.

### `GET /api/properties/:id/reviews`

| Field | Type | Notes |
| --- | --- | --- |
| `reviews` | `{id, rating, text, host_response, guest_name, date, platform}[]` | Newest 50; first names only |
| `rating_average` | number | Average of those reviews, out of 5 |
| `review_count` | number | All public reviews |

Added by `widget.js`: per review `stars` (`★★★★☆`), `date_formatted`, `guest_initial`, `platform_label`; and `rating_average_formatted`, `rating_stars`, `rating_percent`, `review_count_label`, `reviews_shown`.

### `GET /api/properties/:id/guide`

`guide`: `{title, items: {title, body}[]}[]`, only for topics named in `PUBLIC_GUIDE_TOPICS`. An item written as `Name: text` is split into `title` and `body`.

### `GET /api/host`

`host_name` (your company name if your Hospitable account is a business, otherwise your name) and `host_picture`. Added: `host_initial`.

### `GET /api/properties`

`properties`: `{id, property_name, photo, city, country, max_guests, bedrooms, currency, price_from}[]`, listed properties only. Added per card: `price_from_formatted`, `guests_label`, `bedrooms_label`; and `property_count`.

Every response also has `mode` (`live` or `dummy`) and `updated_at`. Unknown and unlisted properties return 404.

`GET /api/properties/:id?include=calendar,reviews,guide,host` returns the property merged with those data sets in one response, and `updated_at` is the oldest of the merged sets. `widget.js` always asks for all four, so every widget of a property uses the same URL. If one set can't be loaded, the response still has the others, lists the failed ones in `missing` (for example `["reviews"]`) and isn't cached; `widget.js` shows the widgets that need a missing set from the visitor's last copy.

## Sample data

With `HOSPITABLE_PAT` set to exactly `dummy`, everything runs on [`src/fixtures/dummy.json`](../src/fixtures/dummy.json). Hospitable is never called, the cron does nothing, and every response carries `X-Hosp-Mode: dummy`. `/demo` shows all 16 starters as one-line snippets; it also works in any online iframe tester.

The sample data has the same shape as Hospitable's API:

- Every response follows the response schemas of Hospitable's [OpenAPI spec](https://developer.hospitable.com), copied into [`test/fixtures/hospitable-openapi.json`](../test/fixtures/hospitable-openapi.json). A test checks every sample response against them and fails on any field the spec doesn't list, any wrong type and any missing required field. `npm run openapi` refreshes the copy from Hospitable's published spec.
- Values come from the spec's own examples wherever they work in a widget: the "Relaxing Villa near the sea" (ID `550e8400-e29b-41d4-a716-446655440000`), its policies, fees and deposits, the Berlin address and Airbnb listing of the second property, the user (Johny Doe & Co), the review "Great place we will be back!" and the "Arrival information" topic. Photo URLs (the spec's don't load), `"string"` placeholders and dates are the only replaced values.
- Private fields (Wi-Fi, door codes, street addresses, private feedback, iCal links) hold `SECRET` values. The data goes through the same code as real data, and the tests check that none of these values comes out of any endpoint or reaches KV.

## Limits in detail

`widget.js`, its modules and the templates come from jsDelivr and don't count against the Worker. Cloudflare's CDN can't cache in front of a Worker, because a Worker always runs before the cache, so the browser cache (`Cache-Control: public, max-age` from `CACHE_MINUTES`) is what keeps requests down.

| Free plan limit | Value | What this kit uses |
| --- | --- | --- |
| Worker requests | 100,000 / day | One per property per visitor every 4 hours (`CACHE_MINUTES`), once a widget nears the screen; all widgets of that property share it, across pages |
| KV reads | 100,000 / day | Up to 7 per request when the 60-second memory cache is cold (list, property, photos, calendar, reviews, guide, host; concurrent reads of one key share a KV read); under steady traffic most requests read none. The free ceiling is therefore at least about 14,000 cold requests a day. |
| KV writes | 1,000 / day | Only when data actually changed, plus one status write per hour |
| Subrequests | 50 per run | 1 list call, plus up to 4 calls per property (photos, calendar, reviews, guide) |
| Cron triggers | 5 per account | 1 |

With every widget type in use, about 10 properties fit in one hourly run. Beyond that, the cron works through the properties in rotating batches, and the builder's status says so. For 40 or more properties, use the Workers Paid plan and set `SUBREQUEST_BUDGET` to `900`. When the daily request limit is hit, Cloudflare answers with error 1027 until 00:00 UTC; `widget.js` treats that like an unreachable Worker.

## Development

```sh
npm install
cp .dev.vars.example .dev.vars   # HOSPITABLE_PAT=dummy
npm run dev                      # http://127.0.0.1:8787/demo
npm test                         # Worker (dummy and live, with a fake Hospitable) and widget.js (happy-dom)
npm run size                     # download size of widget.js and each module
```

Trigger the cron locally with `curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"` while `npm run dev` runs. To try live mode, put a real token in `.dev.vars`.

| Path | What it is |
| --- | --- |
| `src/index.js` | Routes and the cron entry point |
| `src/listings.js` | Reading (memory → KV → Hospitable) and the hourly refresh |
| `src/hospitable.js` | Read-only Hospitable API client with a subrequest budget |
| `src/normalize.js` | API responses → public widget data (the allowlist) |
| `src/amenities.js` | Readable labels for amenity codes |
| `src/dummy.js`, `src/fixtures/dummy.json` | Dummy mode |
| `src/demo.js` | The `/demo` page |
| `src/store.js` | Memory cache, change detection, in-memory KV |
| `widget/widget.js` | The script on the host's page: template engine, formatting, data, rendering, module loader |
| `widget/modules/*.js` | Loaded on demand: `templates`, `calendar`, `reviews`, `lightbox`, `pager`, and `analyze` for hand-written snippets |
| `widget/templates/*.html` | The 16 starter templates and their options (a `<!--hw {…} -->` header), plus `_base.css` |
| `widget/sizes.json` | Download size of each file, written by `npm run size`, checked by CI |
| `scripts/warm.mjs` | Run by the Release workflow on each tag: warms jsDelivr and purges `@1` |

### Releasing widget.js

Set the same version in `package.json`, `VERSION` and the header of `widget/widget.js` (a test checks they match), run `npm run size`, and push a `v1.x.y` tag. The Release workflow then runs `scripts/warm.mjs`, which requests every file once so jsDelivr has minified and cached it before the first visitor asks, and purges `@1` so snippets move to the new release right away (otherwise jsDelivr takes up to a few hours). Modules and templates load from `@1.x.y`, so the tag must exist. A breaking change ships as `v2`, and existing snippets keep working.
