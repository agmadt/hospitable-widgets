# Hospitable Listing Widgets

Show always-current listing content from [Hospitable](https://hospitable.com) on your own website: photos, amenities, reviews, an availability calendar and more. No code, and no server for you to look after.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/agmadt/hospitable-widgets)

**Design your widget in the [builder](https://hospitable.adhityoagam.com/widgets/)**, deploy your own Worker with the button above, and paste one snippet into Wix, Squarespace, WordPress, Webflow or any website. When you change your listing in Hospitable, your website catches up within the hour.

- **Free to run.** The Worker runs on Cloudflare's free plan, which covers about 100,000 page views a day.
- **Your token stays yours.** Your Hospitable token lives only in your own Cloudflare account. The builder, the snippet and website visitors never see it.
- **Nothing private leaks.** Wi-Fi details, door codes, the house manual, guest names and your address are filtered out before anything is stored.
- **Never broken.** If Hospitable is down, your site shows the last good data. If the Worker is down, it shows a snapshot saved in the snippet.

---

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
 │ snippet              │ ─────────▶ │ Worker                   │ ────────▶ │ Public API   │
 │  <template> design   │  public    │  holds HOSPITABLE_PAT    │  read     │              │
 │  fallback snapshot   │  JSON      │  KV: last good data      │  only     │              │
 │  widget.js ◀─ jsDelivr            │  cron: refresh every hour│           │              │
 └──────────────────────┘            └──────────────────────────┘           └──────────────┘
```

1. `widget.js` (loaded from jsDelivr, so it costs your Worker nothing) finds each widget on the page. As a widget nears the screen, it asks your Worker for its data in one request, and loads the small modules the widget needs (calendar, reviews, photo viewer, pager) at the same time.
2. The Worker answers from a 60-second memory cache, then from KV. Only the very first request for a data set calls Hospitable; after that, the hourly cron keeps it fresh.
3. `widget.js` fills your template and renders it in a shadow root, so your website's CSS and the widget's CSS never clash.

## Setup, step by step

You paste two things in total: your token into Cloudflare, and one snippet into your website.

1. **Design.** Open the [builder](https://hospitable.adhityoagam.com/widgets/) and pick a widget, colors, fonts and layout. It's saved in your browser.
2. **Get a token.** In Hospitable, go to **Apps → API access → Access tokens** and add a token with **Read** permission. Tokens last one year. (The API is available on Hospitable's Host plan and up.)
3. **Deploy.** Click **Deploy to Cloudflare** (here or in the builder). Sign in to Cloudflare and GitHub (both accept Google sign-in), paste your token into `HOSPITABLE_PAT` and click **Deploy**. Cloudflare creates the Worker, its KV storage and the hourly refresh.
4. **Return.** Click your Worker's link (`https://hospitable-widgets.<you>.workers.dev`) in the Cloudflare dashboard. It sends you back to the builder, already connected.
5. **Pick a property** and check the preview, now with your real data.
6. **Copy** the snippet and paste it into an Embed HTML element (Wix: **Add Elements → Embed Code → Embed HTML**). Set the element's height to the one the builder suggests: Wix does not resize embeds by itself.

> **Photos:** Hospitable's API only returns photos that are enabled for the **Direct** channel (Property → Details in Hospitable). If your gallery only shows the cover photo, turn that on.

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

The sample data is shaped exactly like Hospitable's API:

- Every response follows the response schemas of Hospitable's [OpenAPI spec](https://developer.hospitable.com), copied into [`test/fixtures/hospitable-openapi.json`](test/fixtures/hospitable-openapi.json). A test checks every sample response against them and fails on any field the spec doesn't list, any wrong type and any missing required field.
- Values come from the spec's own examples wherever they work in a widget: the "Relaxing Villa near the sea" (ID `550e8400-e29b-41d4-a716-446655440000`), its policies, fees and deposits, the Berlin address and Airbnb listing of the second property, the user (Johny Doe & Co), the review "Great place we will be back!" and the "Arrival information" topic. Only photo URLs (the spec's don't load), `"string"` placeholders and dates were replaced.
- Private fields (Wi-Fi, door codes, street addresses, private feedback, iCal links) hold `SECRET` values, and the tests check that none of them comes out of any endpoint or reaches KV.

`npm run openapi` refreshes the copied schemas from Hospitable's published spec.

- Open `https://<your-worker>/demo` to see ten widgets working, or load that address in any online iframe tester.
- The builder connects to a dummy Worker like any other, so you can walk through the whole flow without a Hospitable account.

The sample data has the exact shape of Hospitable's API, including private fields such as Wi-Fi passwords and door codes, and goes through the same code as real data. The tests check that none of it comes out.

## Snippet and template syntax

The builder writes the snippet for you. This is what it contains:

```html
<template id="hosp-amenities-x7k2">
  <style>:host { --hw-accent: #2e7d32; } h2 { color: var(--hw-accent); }</style>
  <h2>{property_name}</h2>
  <ul>{#amenities}<li>{.}</li>{/amenities}</ul>
</template>
<script type="application/json" id="hosp-amenities-x7k2-fallback">
  {"property_name": "Relaxing Villa near the sea", "amenities": ["Shower", "Oven", "Wi-Fi"]}
</script>
<div data-hosp-template="hosp-amenities-x7k2"
     data-hosp-worker="https://hospitable-widgets.you.workers.dev"
     data-hosp-property="PROPERTY_ID"
     data-hosp-data="property" data-hosp-modules=""
     data-hosp-amenities-limit="8"></div>
<script src="https://cdn.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js" defer></script>
```

**Template tags**

| Tag | Does |
| --- | --- |
| `{field}` | Inserts a value, HTML-escaped. Unknown fields render as nothing, never as `{braces}`. |
| `{a.b}` | A nested value, for example `{photo_1.url}`. |
| `{#list}…{/list}` | Repeats for each item. `{.}` is the item itself; `{url}` reads an item's field. Inside a list: `{_number}` (1, 2, …), `{_index}` (0, 1, …), `{_first}`, `{_last}`. |
| `{#flag}…{/flag}` | Shows only when the value is true or not empty. |
| `{^flag}…{/flag}` | Shows only when the value is false or empty. |
| `{#list.0}…{/list.0}` | Shows once when a list has items (a heading above a list, say). |
| `<!--{#rows}-->` | A tag may sit in an HTML comment. Use this between table rows, where the browser would otherwise move the text out of the table. |

`data-hosp-data` and `data-hosp-modules` say what the widget needs, so `widget.js` fetches exactly that: a page with only an Amenities widget never downloads a year of calendar, nor the calendar code. The builder writes both. Leave them out of a hand-written snippet and `widget.js` loads `modules/analyze.js` to work them out from the fields the template uses.

**Display choices** go on the `<div>` as attributes. The data behind them is public anyway, and `widget.js` applies them in the browser:

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

**Behaviors** a template can switch on with attributes:

- `data-hosp-lightbox` on a container: its images open a full-screen viewer (arrow keys, swipe, Esc). `data-hosp-open="0"` on a button opens it at a given photo.
- `data-hosp-pager` on a container of `data-hosp-page` children, with `data-hosp-prev`, `data-hosp-next` and an optional `data-hosp-page-label`. `data-hosp-per-view="auto"` shows as many pages side by side as fit (minimum width from `data-hosp-min-width`, default 280); the count is in the CSS variable `--hosp-per-view`.

**What a page downloads.** Formatting is built into `widget.js`; everything else is a module next to it, loaded only when a widget on the page uses it. As jsDelivr serves them (minified, compressed):

| Widget | JavaScript |
| --- | --- |
| Description, Key facts, Amenities, House rules, Sleeping, The space, Policies, Local guide, Also listed on, Meet your host, Property list, Rating summary | 5.3 KB: `widget.js` |
| Photo gallery | 7.9 KB: + `lightbox` (viewer with filmstrip) |
| Availability calendar | 7.3 KB: + `calendar`, `pager` |
| Reviews carousel | 7.0 KB: + `reviews`, `pager` |

`npm run size` prints the current numbers and writes `widget/sizes.json`, which the builder shows hosts. Modules load from the same folder and the exact same version as `widget.js` (`@1` becomes `@1.0.0`), so a cached `widget.js` never meets newer modules. Widgets mount as they near the screen (400 px ahead), so a widget nobody scrolls to costs no Worker request; widgets that show the same property share one request.

**Events and API.** Each render fires a `hosp:render` event on the element (`detail.state` is `live` or `snapshot`). `window.HospWidgets` offers `render`, `renderTo`, `derive`, `fetchData`, `need`, `scan`, and, once `need(['analyze'])` has loaded, `analyze` and `plan`, for builders and tests.

**Writing a module.** A module is a plain script that registers itself:

```js
HospWidgets.define('mymodule', ['calendar'], function (api) {
  return {
    derive: function (data, opts, ctx) { /* add fields to data */ },
    wire: function (shadowRoot, data) { /* add behavior after each render */ },
  };
});
```

## Widget data reference

Field names are snake case. A template can use any field of the data sets it touches; `widget.js` also adds the *formatted* fields listed after each table, in the visitor's language.

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

Added by `widget.js`: `price_from`, `price_from_formatted`, `min_stay`, `min_stay_label`, `next_available`, `available_nights`, and `months`: `{label, month, year, weekdays: {label}[], weeks: {days: {day, date, label, state, available, booked, past, today, unknown, blank, price, price_formatted, min_stay}[]}[]}[]`. `state` is `available`, `booked`, `past`, `unknown` or `blank`, handy as a class name.

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

`GET /api/properties/:id?include=calendar,reviews,guide,host` returns the property merged with those data sets in one response; this is what `widget.js` asks for, so each widget costs one request. `updated_at` is then the oldest of them.

## Privacy

The Worker's endpoints are public: anyone who knows the address can read them. So the Worker builds every response from an allowlist, and these are **never** stored or served, whatever a template asks for:

- street address, postcode and coordinates
- Wi-Fi name and password, guest access and check-in instructions, the house manual, "other details"
- iCal import and export URLs, calendar notes
- private review feedback and detailed comments, guest last names
- your email, billing address and tax details, listing emails, internal property names and tags
- anything from reservations, guests, messages, transactions or payouts (the Worker never calls those endpoints)

**Knowledge Hub** topics often hold door codes, so the Worker serves none of them until you list the safe ones in `PUBLIC_GUIDE_TOPICS`.

## Settings

Set these on the deploy page, or later in Cloudflare under **Workers & Pages → your Worker → Settings → Variables and Secrets**.

| Name | Kind | Default | Meaning |
| --- | --- | --- | --- |
| `HOSPITABLE_PAT` | secret | | Your token (Read permission), or `dummy` |
| `PUBLIC_GUIDE_TOPICS` | variable | empty | Knowledge Hub topic names allowed in public, comma-separated |
| `BUILDER_URL` | variable | the builder | Where the Worker's home page sends you |
| `SUBREQUEST_BUDGET` | variable | `45` | Hospitable calls per run; raise to `900` on the Workers Paid plan |
| `WIDGET_URL` | variable | `/widget.js` | `widget.js` used by `/demo` |

## Limits and what happens when something fails

On the free plan, one page view costs one Worker request per widget at most (`widget.js` and its modules come from jsDelivr and don't count).

| Free plan limit | Value | What this kit uses |
| --- | --- | --- |
| Worker requests | 100,000 / day | One per widget per page view, only once it nears the screen; widgets showing the same property share it |
| KV reads | 100,000 / day | Fewer than requests, thanks to the 60-second memory cache |
| KV writes | 1,000 / day | Only when data actually changed, plus one status write per hour |
| Subrequests | 50 per run | 1 list call, plus up to 4 calls per property (photos, calendar, reviews, guide) |
| Cron triggers | 5 per account | 1 |

With every widget type in use, about 10 properties fit in one hourly run. Beyond that the cron works through your properties in rotating batches, so each still refreshes several times a day; the builder tells you when this is happening. For 40 or more properties, the Workers Paid plan ($5/month) lifts the limits (set `SUBREQUEST_BUDGET` to `900`).

| When… | Then… |
| --- | --- |
| Hospitable is down or rejects the token | The Worker keeps serving the last good data from KV and logs the error. |
| The token expires (after a year) | Same, and the builder shows how to paste a new one. |
| The Worker is unreachable, or the daily limit is hit (error 1027) | `widget.js` renders the snapshot saved in the snippet. Visitors never see a broken widget. |
| A property is unlisted | Its data is deleted on the next run and its endpoints return 404. |

## Updating your Worker

The Deploy button copies this repository into your GitHub account, and Cloudflare redeploys whenever that copy changes. Most improvements ship in `widget.js` through jsDelivr, so your website gets them without you doing anything. To pull in Worker fixes too:

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
| `src/amenities.js` | Amenity labels and groups |
| `src/dummy.js`, `src/fixtures/dummy.json` | Dummy mode |
| `src/demo.js` | The `/demo` page |
| `src/store.js` | Memory cache, change detection, in-memory KV |
| `widget/widget.js` | The script on the host's page: template engine, formatting, data, rendering, module loader |
| `widget/modules/*.js` | Loaded on demand: `calendar`, `reviews`, `lightbox`, `pager`, and `analyze` for hand-written snippets |
| `widget/sizes.json` | Download size of each file, written by `npm run size`, checked by CI |

**Releasing `widget.js`:** set the same version in `package.json`, `VERSION` and the header of `widget/widget.js` (a test checks they match), run `npm run size`, and tag `v1.x.y`. Snippets load `@1`, which jsDelivr resolves to the newest 1.x within a few hours (purge `https://purge.jsdelivr.net/gh/agmadt/hospitable-widgets@1/widget/widget.min.js` to speed that up); modules then load from `@1.x.y`, which is why the tag must exist. A breaking change ships as `v2`, so existing snippets keep working.

## License

[MIT](LICENSE). Not affiliated with or endorsed by Hospitable.
