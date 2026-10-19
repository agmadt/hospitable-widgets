# Hospitable Listing Widgets

Show always-current listing content from [Hospitable](https://hospitable.com) on your own website: photos, amenities, reviews, an availability calendar and more. You don't write code or look after a server.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/agmadt/hospitable-widgets)

Design your widget in the [builder](https://hospitable-widget.adhityoagam.com/), deploy your own Worker with the button above, and paste one snippet into Wix, Squarespace, WordPress, Webflow or any website. When you change your listing in Hospitable, your website catches up within the hour.

The Worker runs on Cloudflare's free plan, which covers about 100,000 page views a day. Your Hospitable token lives only in your own Cloudflare account; the builder, the snippet and website visitors never see it. Wi-Fi details, door codes, the house manual, guests' last names and your address are filtered out before anything is stored. If Hospitable is down, your site shows the last good data, and if the Worker is down, it shows a snapshot saved in the snippet.

- [How it works](#how-it-works)
- [Setup, step by step](#setup-step-by-step)
- [The 16 widgets](#the-16-widgets)
- [Try it with sample data](#try-it-with-sample-data)
- [Snippet and template syntax](#snippet-and-template-syntax)
- [Widget data reference](#widget-data-reference)
- [Privacy](#privacy)
- [Settings](#settings)
- [Limits and what happens when something fails](#limits-and-what-happens-when-something-fails)
- [Updating your Worker](#updating-your-worker)
- [Development](#development)

## How it works

```
 Your website (Wix, …)                Your Cloudflare account                 Hospitable
 ┌──────────────────────┐   data     ┌──────────────────────────┐  hourly   ┌──────────────┐
 │ snippet: one <div>   │ ─────────▶ │ Worker                   │ ────────▶ │ Public API   │
 │  and one <script>    │  public    │  holds HOSPITABLE_PAT    │  read     │              │
 │  widget.js, template │  JSON      │  KV: last good data      │  only     │              │
 │  ◀─ jsDelivr         │            │  cron: refresh every hour│           │              │
 └──────────────────────┘            └──────────────────────────┘           └──────────────┘
```

1. `widget.js` loads from jsDelivr, so it costs your Worker nothing, and finds each widget on the page. As a widget nears the screen, it asks your Worker for its data in one request and, at the same time, loads the widget's template and the small modules it needs (calendar, reviews, photo viewer, pager) from jsDelivr.
2. The Worker answers from a 60-second memory cache, then from KV. Only the first request for a data set calls Hospitable; after that, the hourly cron keeps it fresh.
3. `widget.js` fills your template and renders it in a shadow root, so your website's CSS and the widget's CSS can't affect each other.

## Setup, step by step

You paste two things in total: your token into Cloudflare, and one snippet into your website.

1. Open the [builder](https://hospitable-widget.adhityoagam.com/) and pick a widget, colors, fonts and layout. Your design is saved in your browser.
2. In Hospitable, go to Apps → API access → Access tokens and add a token with Read permission. Tokens last one year, and the API is available on Hospitable's Host plan and up.
3. Click Deploy to Cloudflare, here or in the builder. Sign in to Cloudflare and GitHub (both accept Google sign-in), paste your token into `HOSPITABLE_PAT` and click Deploy. Cloudflare creates the Worker, its KV storage and the hourly refresh.
4. Click your Worker's address (`https://hospitable-widgets.<you>.workers.dev`) on Cloudflare's success page or in the dashboard. It opens the builder in a new tab, already connected, and the builder tab you came from connects too.
5. Pick a property and check the preview, which now shows your real data.
6. Copy the snippet and paste it into an Embed HTML element (in Wix: Add Elements → Embed Code → Embed HTML). Wix doesn't resize embeds by itself, so set the element's height to the one the builder suggests.

> Hospitable's API only returns photos that are enabled for the Direct channel (Property → Details in Hospitable). If your gallery only shows the cover photo, turn that on.

## The 16 widgets

| Widget | Shows | Data |
| --- | --- | --- |
| Description | Name, summary, description | property |
| Key facts | Guests, bedrooms, beds, baths, type, check-in and check-out | property |
| Amenities | A top few, with a pop-up for the full list | property |
| Photo gallery | Photos and captions in your order, with a full-screen viewer | property |
| House rules | Pets, smoking, events, children, your additional rules | property |
| Sleeping arrangements | Each room and its beds | property |
| The space and the area | Space, neighborhood, getting around (city level only) | property |
| Reviews | Picked or filtered reviews, with your responses | reviews |
| Rating summary | Average rating and review count | reviews |
| Availability calendar | Open and booked dates, nightly prices, minimum stay | calendar |
| Price from | Lowest upcoming nightly price | calendar |
| Policies and fees | Cancellation, payment terms, fees, deposit, discounts | property |
| Local guide | Knowledge Hub topics you make public | guide |
| Also listed on | Links to Airbnb, Vrbo and your direct booking site | property |
| Meet your host | Your or your company's name and picture | host |
| Property list | A card per listed property, with price from | properties |

Bookings stay with Hospitable's own booking widget; a template can link to it.

## Try it with sample data

Set `HOSPITABLE_PAT` to exactly `dummy` and everything runs on the sample data in [`src/fixtures/dummy.json`](src/fixtures/dummy.json): two listed properties and one unlisted, a year of calendar that always starts today, reviews, Knowledge Hub topics and a host profile. Hospitable is never called, the cron does nothing, and every response carries `X-Hosp-Mode: dummy`.

Open `https://<your-worker>/demo` to see all 16 widgets working, or load that address in any online iframe tester. The builder connects to a dummy Worker like any other, so you can walk through the whole flow without a Hospitable account.

The sample data has the same shape as Hospitable's API:

- Every response follows the response schemas of Hospitable's [OpenAPI spec](https://developer.hospitable.com), copied into [`test/fixtures/hospitable-openapi.json`](test/fixtures/hospitable-openapi.json). A test checks every sample response against them and fails on any field the spec doesn't list, any wrong type and any missing required field. `npm run openapi` refreshes the copy from Hospitable's published spec.
- Values come from the spec's own examples wherever they work in a widget: the "Relaxing Villa near the sea" (ID `550e8400-e29b-41d4-a716-446655440000`), its policies, fees and deposits, the Berlin address and Airbnb listing of the second property, the user (Johny Doe & Co), the review "Great place we will be back!" and the "Arrival information" topic. Photo URLs (the spec's don't load), `"string"` placeholders and dates are the only replaced values.
- Private fields (Wi-Fi, door codes, street addresses, private feedback, iCal links) hold `SECRET` values. The data goes through the same code as real data, and the tests check that none of these values comes out of any endpoint or reaches KV.

## Snippet and template syntax

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

`data-hosp` names one of the starter templates in [`widget/templates/`](widget/templates/), which load from jsDelivr next to `widget.js`. `data-hosp-options` and `data-hosp-style` hold only what you changed from the template's defaults, URL-encoded. Template fixes therefore reach every website through jsDelivr, the same way `widget.js` fixes do.

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

Each widget's last data stays in the visitor's browser. If the Worker can't be reached, a returning visitor sees that copy, and a first-time visitor sees a short "can't be shown right now" message. Snippets made before v1.1 carry a data snapshot in a `<script type="application/json">`, which still works.

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

`data-hosp-data` and `data-hosp-modules` say what the widget needs, and `widget.js` fetches exactly that: a page with only an Amenities widget never downloads a year of calendar or the calendar code. The builder writes both attributes. If a hand-written snippet leaves them out, `widget.js` loads `modules/analyze.js` to work them out from the fields the template uses.

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
| Description, Key facts, Amenities, House rules, Sleeping, The space, Policies, Local guide, Also listed on, Meet your host, Property list, Rating summary | 8.1 KB: `widget.js` + `templates` |
| Photo gallery | 10.7 KB: + `lightbox` (viewer with filmstrip) |
| Availability calendar | 10.1 KB: + `calendar`, `pager` |
| Reviews carousel | 9.8 KB: + `reviews`, `pager` |

`npm run size` prints the current numbers and writes `widget/sizes.json`, which the builder shows hosts. Modules and templates load from the same folder and the exact same version as `widget.js` (`@1` becomes `@1.1.0`), so a cached `widget.js` never meets newer ones. Widgets mount as they come within 400 px of the screen, so a widget nobody scrolls to costs no Worker request, and widgets that show the same property share one request.

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

Each file in [`widget/templates/`](widget/templates/) starts with a header that describes the widget and its options for the builder:

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

`GET /api/properties/:id?include=calendar,reviews,guide,host` returns the property merged with those data sets in one response. `widget.js` asks for this, so each widget costs one request, and `updated_at` is the oldest of the merged sets.

## Privacy

The Worker's endpoints are public: anyone who knows the address can read them. The Worker therefore builds every response from an allowlist, and never stores or serves the following, whatever a template asks for:

- street address, postcode and coordinates
- Wi-Fi name and password, guest access and check-in instructions, the house manual, "other details"
- iCal import and export URLs, calendar notes
- private review feedback and detailed comments, guest last names
- your email, billing address and tax details, listing emails, internal property names and tags
- anything from reservations, guests, messages, transactions or payouts (the Worker never calls those endpoints)

Knowledge Hub topics often hold door codes, so the Worker serves none of them until you list the safe ones in `PUBLIC_GUIDE_TOPICS`. Add that variable in Cloudflare after deploying (see Settings); the deploy page doesn't ask for it.

## Settings

The deploy page asks for `HOSPITABLE_PAT`. Change it, or add the optional variables, later in Cloudflare under Workers & Pages → your Worker → Settings → Variables and Secrets. Variables added there survive redeploys (`keep_vars` in `wrangler.jsonc`).

| Name | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `HOSPITABLE_PAT` | secret | | Your token (Read permission), or `dummy` |
| `PUBLIC_GUIDE_TOPICS` | variable | not set | Knowledge Hub topic names allowed in public, comma-separated, for example `Local attractions, Where to eat`. Not set (or blank) shows none. |
| `BUILDER_URL` | variable | the builder | Where the Worker's home page sends you |
| `SUBREQUEST_BUDGET` | variable | `45` | Hospitable calls per run; raise to `900` on the Workers Paid plan |
| `WIDGET_URL` | variable | `/widget.js` | `widget.js` used by `/demo` |

## Limits and what happens when something fails

On the free plan, one page view costs at most one Worker request per widget, and a visitor's browser keeps the data for an hour, so their next page views within that hour cost nothing. `widget.js`, its modules and the templates come from jsDelivr and don't count. Cloudflare's CDN can't cache in front of a Worker, because a Worker always runs before the cache.

| Free plan limit | Value | What this kit uses |
| --- | --- | --- |
| Worker requests | 100,000 / day | One per widget per visitor per hour, only once it nears the screen; widgets showing the same property share it |
| KV reads | 100,000 / day | Fewer than requests, thanks to the 60-second memory cache |
| KV writes | 1,000 / day | Only when data actually changed, plus one status write per hour |
| Subrequests | 50 per run | 1 list call, plus up to 4 calls per property (photos, calendar, reviews, guide) |
| Cron triggers | 5 per account | 1 |

With every widget type in use, about 10 properties fit in one hourly run. Beyond that, the cron works through your properties in rotating batches, so each one still refreshes several times a day, and the builder tells you when this is happening. For 40 or more properties, the Workers Paid plan ($5/month) lifts the limits (set `SUBREQUEST_BUDGET` to `900`).

| Situation | What happens |
| --- | --- |
| Hospitable is down or rejects the token | The Worker keeps serving the last good data from KV and logs the error. |
| The token expires (after a year) | Same, and the builder shows how to paste a new one. |
| The Worker is unreachable, or the daily limit is hit (error 1027) | Returning visitors see their browser's last copy; first-time visitors see a short message. Requests work again after the limit resets at 00:00 UTC. |
| A property is unlisted | Its data is deleted on the next run and its endpoints return 404. |

## Updating your Worker

The Deploy button copies this repository into your GitHub account, and Cloudflare redeploys whenever that copy changes. Most improvements ship in `widget.js` through jsDelivr and reach your website without you doing anything. To pull in Worker fixes too:

```sh
git clone https://github.com/<you>/hospitable-widgets && cd hospitable-widgets
git pull https://github.com/agmadt/hospitable-widgets main
git push
```

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

### Releasing widget.js

Set the same version in `package.json`, `VERSION` and the header of `widget/widget.js` (a test checks they match), run `npm run size`, and tag `v1.x.y`. Snippets load `@1`, which jsDelivr resolves to the newest 1.x within a few hours; purging `https://purge.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js` speeds that up. Modules then load from `@1.x.y`, so the tag must exist. A breaking change ships as `v2`, and existing snippets keep working.

## License

[MIT](LICENSE). Not affiliated with or endorsed by Hospitable.
