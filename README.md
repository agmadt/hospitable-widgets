# Hospitable Listing Widgets

Show your [Hospitable](https://hospitable.com) listings on your own website: photos, amenities, reviews, an availability calendar and more. When you edit a listing in Hospitable, your website follows by itself. You don't write code or rent a server, and Cloudflare's free plan covers the cost.

<p align="center"><img src="docs/widgets.jpg" width="820" alt="Five widgets showing sample data: a photo gallery, a guest review, key facts, amenities and a price from box"></p>

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/agmadt/hospitable-widgets)

You can start in the [builder](https://hospitable-widget.adhityoagam.com/) right away and design every widget with sample data before you set anything up.

Hosts: [How it works](#how-it-works) · [What you need](#what-you-need) · [Set it up](#set-it-up) · [If something doesn't work](#if-something-doesnt-work) · [The 16 widgets](#the-16-widgets) · [Several widgets on one site](#several-widgets-on-one-site) · [How fresh the data is](#how-fresh-the-data-is) · [What it costs](#what-it-costs) · [Privacy](#privacy) · [What visitors see when something fails](#what-visitors-see-when-something-fails) · [Settings](#settings) · [Use your own domain](#use-your-own-domain) · [Try it without a Hospitable account](#try-it-without-a-hospitable-account) · [Keep your Worker up to date](#keep-your-worker-up-to-date)

Developers: [How the parts fit](#how-the-parts-fit) · [Snippet format](#snippet-format) · [Widget data reference](#widget-data-reference) · [Sample data](#sample-data) · [Limits in detail](#limits-in-detail) · [Development](#development)

## How it works

You set up three parts, once:

1. The [builder](https://hospitable-widget.adhityoagam.com/), a web page where you design a widget and copy its snippet, the two lines of code that go on your website.
2. Your Worker, a small program that runs in your own Cloudflare account. It keeps your Hospitable access token, collects your listings from Hospitable every hour, and gives your website only the parts meant for guests.
3. The snippet on your website. It asks your Worker for the listing and shows it in your colors and fonts.

Your token stays in your Cloudflare account. The builder, your website and your visitors never see it.

## What you need

- A Hospitable plan with API access (the Host plan or higher).
- A free Cloudflare account and a free GitHub account. You can sign up for both with Google.
- A website that lets you add your own HTML. Wix, Squarespace, WordPress and Webflow do, though some of their plans don't: Squarespace needs a plan that allows JavaScript, and WordPress.com needs the Business plan or higher.

## Set it up

You paste two things in total: your Hospitable token into Cloudflare, and a snippet into your website.

1. Open the [builder](https://hospitable-widget.adhityoagam.com/) and design your widget: choose one of the 16, then its colors, fonts and layout. The builder remembers your design in your browser.
2. In Hospitable, go to Apps → API access → Access tokens. Add a token with Read permission and copy it. A token lasts one year.
3. Click Deploy to Cloudflare, at the top of this page or in the builder. Sign in to Cloudflare and GitHub, paste your token into the `HOSPITABLE_PAT` box and click Deploy. Cloudflare then sets up your Worker, its storage and the hourly refresh.
4. When Cloudflare is done, click your Worker's address. It looks like `https://hospitable-widgets.<your-name>.workers.dev`, and you'll find it on the success page and in your Cloudflare dashboard. It opens the builder in a new tab, connected to your Worker, and the builder tab you started in connects as well.
5. Pick one of your properties. The preview now shows your real listing.
6. Copy the snippet and paste it into your website. The builder's last step shows how for Wix, Squarespace, WordPress, Webflow and other sites.

On Wix, that means Add Elements (+) → Embed Code → Embed HTML, then Enter Code, paste and Update. Wix doesn't resize embeds by itself, so drag the element to the height the builder suggests, both in the desktop and in the mobile view.

## If something doesn't work

| What you see | What to do |
| --- | --- |
| The photo gallery only shows the cover photo | Hospitable only shares photos that are turned on for the Direct channel. Turn them on under Property → Details in Hospitable. |
| Right after your first deploy, your Worker's address shows a security error such as `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` | On a new Cloudflare account, Cloudflare needs time to prepare the security certificate for your `workers.dev` address. In one test it took more than half an hour. Wait, then open the address again. |
| Your Worker's address doesn't open at all, on your connection or for some visitors | Some internet providers block every `workers.dev` address (XL in Indonesia, for one). Give your Worker an address on your own domain: see [Use your own domain](#use-your-own-domain). |
| The local guide widget is empty | It only shows the Knowledge Hub topics you chose to make public. Add them in `PUBLIC_GUIDE_TOPICS` (see [Settings](#settings)). |
| The builder says Hospitable rejected your token | Tokens expire after a year. Create a new one in Hospitable and replace `HOSPITABLE_PAT` (see [Settings](#settings)). |

## The 16 widgets

| Widget | What it shows |
| --- | --- |
| Description | Name, summary and description |
| Key facts | Guests, bedrooms, beds, baths, type, check-in and check-out |
| Amenities | A few amenities, and a button that opens the full list |
| Photo gallery | Your photos and captions in your order, with a full-screen viewer |
| House rules | Pets, smoking, events, children and your own rules |
| Sleeping arrangements | Each room and its beds |
| The space and the area | The space, the neighborhood and getting around, at city level only |
| Reviews | Reviews you pick or filter, with your responses |
| Rating summary | Average rating and number of reviews |
| Availability calendar | Open and booked dates, nightly prices, minimum stay |
| Price from | The lowest upcoming nightly price |
| Policies and fees | Cancellation, payment terms, fees, deposit and discounts |
| Local guide | The Knowledge Hub topics you make public |
| Also listed on | Links to Airbnb, Vrbo and your direct booking site |
| Meet your host | Your name, or your company's, and picture |
| Property list | A card for each listed property, with its lowest price |

Guests still book through Hospitable, on its booking widget or your direct booking site. A widget can link there, like the Check availability button in the picture above.

## Several widgets on one site

Design each widget in the builder and copy its snippet. Where the snippets go depends on your website builder.

On WordPress, Squarespace, Webflow or a site you code yourself, a snippet becomes part of the page. Put each widget's `<div>` line where the widget should appear. The `<script>` line is needed once per page, and pasting it twice does no harm.

On Wix, every Embed HTML element is a separate little page that can't see the others. So each embed needs its whole snippet, both lines. Two widgets that sit one under the other can share an embed: put their `<div>` lines together, with the `<script>` line once.

More widgets don't cost more. All widgets of one property share a single request to your Worker, and the visitor's browser reuses it on your other pages and embeds. That request carries everything about the property, so a page with only a Description widget also downloads the calendar and the reviews: about 4.5 KB instead of 2 KB with the sample data, and more for a listing with hundreds of reviews. The Property list widget asks for a different list, so it makes one request of its own.

## How fresh the data is

Your Worker collects your listings from Hospitable once an hour. When someone visits your site, their browser keeps what it got for 4 hours, so moving between your pages doesn't ask your Worker again.

When you change something in Hospitable, such as a price, a photo or a booked night, a first-time visitor sees it within about an hour. Someone who visited in the last 4 hours may see the old version for up to about 5 hours. Bookings themselves happen in Hospitable, which always has the current calendar.

To show changes to returning visitors sooner, lower `CACHE_MINUTES` (see [Settings](#settings)). Each visitor then uses your Worker allowance more often.

With more than about 10 properties, one hourly refresh can't cover all of them, so they take turns, and each one still refreshes several times a day. The builder tells you when this happens.

## What it costs

On Cloudflare's free plan it costs nothing, as long as you stay under 100,000 Worker requests a day. Every Cloudflare account has its own allowance, so yours isn't shared with anyone.

A request is one visitor getting one property's data. Their browser then reuses it for 4 hours, however many pages and widgets they look at, and a widget nobody scrolls down to never asks. In practice the free plan covers about 100,000 different visitors a day. The widget code comes from jsDelivr, a free public network, and doesn't count; a page downloads 8 to 11 KB of it.

If you ever go over, nothing is billed. Your Worker stops answering until the allowance resets at midnight UTC; meanwhile returning visitors see the copy saved in their browser, and new visitors see a short "can't be shown right now" message. For more traffic, Cloudflare's Workers Paid plan costs $5 a month and includes 10 million requests a month. It's also the plan to use from about 40 properties up, with `SUBREQUEST_BUDGET` set to `900`.

## Privacy

Anyone who knows your Worker's address can read what it hands out, just as anyone can read your website. So the Worker only stores and hands out what is meant for guests. Whatever a widget asks for, it never stores or shares:

- your street address, postcode or map coordinates
- Wi-Fi name and password, guest access and check-in instructions, the house manual and "other details"
- iCal import and export links, and calendar notes
- private review feedback, detailed review comments and guests' last names
- your email, billing address and tax details, listing emails, and internal property names and tags
- anything from reservations, guests, messages, transactions or payouts (the Worker never even asks Hospitable for those)

Knowledge Hub topics often hold door codes, so the Worker shares none of them until you name the safe ones in `PUBLIC_GUIDE_TOPICS` (see [Settings](#settings)). The deploy page doesn't ask for it; you add it afterwards.

## What visitors see when something fails

| If | Then |
| --- | --- |
| Hospitable is down, or your token stops working or expires | Your Worker keeps serving the last data it got, and the builder shows how to replace the token. |
| One part of a listing, say the reviews, can't be loaded | The property's other widgets show as usual. The reviews widget shows the visitor's saved copy, or a short message. |
| Your Worker can't be reached, or the day's allowance is used up | Returning visitors see the copy saved in their browser, and first-time visitors see a short message. A used-up allowance comes back at midnight UTC. |
| You unlist a property | Its data is deleted at the next hourly refresh, and your Worker stops serving it. |

## Settings

You change these in Cloudflare under Workers & Pages → your Worker → Settings → Variables and Secrets. The deploy page only asks for `HOSPITABLE_PAT`; add the others there whenever you need them. They stay in place when your Worker is redeployed.

| Name | What it does | If you leave it out |
| --- | --- | --- |
| `HOSPITABLE_PAT` | Your Hospitable token, with Read permission. It is a secret, so Cloudflare hides its value. Type `dummy` instead to run on sample data. | Required |
| `PUBLIC_GUIDE_TOPICS` | The Knowledge Hub topics the local guide widget may show, by name and separated by commas, for example `Local attractions, Where to eat`. | No topics are shown |
| `CACHE_MINUTES` | How long a visitor's browser keeps widget data, from `0` (not at all) to `1440` (a day). Lower shows your changes to returning visitors sooner and uses more of your allowance. The builder shows the value your Worker uses. | `240` (4 hours) |
| `SUBREQUEST_BUDGET` | How many calls to Hospitable one hourly refresh may make. Raise it to `900` on the Workers Paid plan. | `45` |
| `BUILDER_URL` | Where your Worker's home page sends you. | This project's builder |
| `WIDGET_URL` | The `widget.js` your Worker's `/demo` page uses. | `/widget.js` |

The hourly schedule isn't a variable: it lives in `wrangler.jsonc` (`triggers.crons`). If you change it in the Cloudflare dashboard instead, the next redeploy from GitHub puts it back to hourly.

## Use your own domain

Your Worker can also answer on an address of your own, such as `widgets.yourvilla.com`, which helps when an internet provider blocks `workers.dev` addresses. The domain has to be managed in the same Cloudflare account as your Worker.

1. In Cloudflare, open Workers & Pages → hospitable-widgets → Settings → Domains & Routes, click Add and choose Custom domain.
2. Enter the address and add it. Cloudflare creates the DNS record and the security certificate.
3. In the builder's Connect step, enter the new address. Then copy your snippets again and replace the ones on your website, because those still point to the `workers.dev` address.

## Try it without a Hospitable account

Type `dummy` as your `HOSPITABLE_PAT` and your Worker runs on sample data: two listed properties and one unlisted, a year of calendar that always starts today, reviews, Knowledge Hub topics and a host profile. It never contacts Hospitable. Open `https://<your-worker>/demo` to see all 16 widgets, or connect the builder to it and try every step. When you're ready, replace `dummy` with your real token.

## Keep your Worker up to date

Most improvements are in the widget code, which your website loads from jsDelivr, so they reach your site without you doing anything.

Improvements to the Worker itself take one more step. The Deploy button made a copy of this project in your GitHub account, and Cloudflare redeploys your Worker whenever that copy changes. To bring the copy up to date, run this on a computer with Git, or ask someone who uses Git to do it:

```sh
git clone https://github.com/<you>/hospitable-widgets && cd hospitable-widgets
git pull https://github.com/agmadt/hospitable-widgets main
git push
```

## For developers

### How the parts fit

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

### Snippet format

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

`widget.js` keeps each property's last data in the visitor's browser (localStorage). If the Worker can't be reached, a returning visitor sees that copy and a first-time visitor sees a short "can't be shown right now" message. Snippets made before v1.1 carry a data snapshot in a `<script type="application/json">`, which still works.

#### Template tags

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

#### Display choices

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

#### Behaviors

A template can switch on two behaviors with attributes:

- `data-hosp-lightbox` on a container makes its images open a full-screen viewer (arrow keys, swipe, Esc). `data-hosp-open="0"` on a button opens it at a given photo.
- `data-hosp-pager` goes on a container of `data-hosp-page` children, with `data-hosp-prev`, `data-hosp-next` and an optional `data-hosp-page-label`. `data-hosp-per-view="auto"` shows as many pages side by side as fit (minimum width from `data-hosp-min-width`, default 280), and puts the count in the CSS variable `--hosp-per-view`.

#### What a page downloads

Formatting is built into `widget.js`. Starter templates come through the `templates` module, and everything else is a module loaded only when a widget on the page uses it. JavaScript sizes as jsDelivr serves them, minified and compressed; each template file adds 1 to 3 KB:

| Widget | JavaScript |
| --- | --- |
| Description, Key facts, Amenities, House rules, Sleeping, The space, Policies, Local guide, Also listed on, Meet your host, Property list, Rating summary | 8.2 KB: `widget.js` + `templates` |
| Photo gallery | 10.8 KB: + `lightbox` (viewer with filmstrip) |
| Availability calendar | 10.2 KB: + `calendar`, `pager` |
| Reviews carousel | 9.9 KB: + `reviews`, `pager` |

`npm run size` prints the current numbers and writes `widget/sizes.json`, which the builder shows hosts. Modules and templates load from the same folder and the exact same version as `widget.js` (`@1` becomes, say, `@1.1.1`), so a cached `widget.js` never meets newer ones. Widgets mount as they come within 400 px of the screen, so a page whose widgets nobody scrolls to costs no Worker request, and widgets of the same property share one request (see [Several widgets on one site](#several-widgets-on-one-site)).

#### Events and API

Each render fires a `hosp:render` event on the element; `detail.state` is `live`, `cached` (the visitor's last copy) or `snapshot` (a pre-v1.1 snippet's own data), and `data-hosp-state` on the element says the same, or `unavailable`. For builders and tests, `window.HospWidgets` has `render`, `renderTo`, `derive`, `fetchData`, `need`, `module` and `scan`, plus `analyze` and `plan` once `need(['analyze'])` has loaded.

#### Writing a module

A module is a plain script that registers itself:

```js
HospWidgets.define('mymodule', ['calendar'], function (api) {
  return {
    derive: function (data, opts, ctx) { /* add fields to data */ },
    wire: function (shadowRoot, data) { /* add behavior after each render */ },
  };
});
```

#### Starter templates

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

### Widget data reference

Field names are snake case. A template can use any field of the data sets it touches. `widget.js` also adds the formatted fields listed after each table, in the visitor's language.

Which widget reads which data set: `property` for Description, Key facts, Amenities, Photo gallery, House rules, Sleeping arrangements, The space and the area, Policies and fees and Also listed on; `reviews` for Reviews and Rating summary; `calendar` for Availability calendar and Price from; `guide` for Local guide; `host` for Meet your host; `properties` for Property list.

#### `GET /api/properties/:id`: property

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

#### `GET /api/properties/:id/calendar`

| Field | Type | Notes |
| --- | --- | --- |
| `currency` | string | |
| `calendar` | `{date, available, price, min_stay}[]` | 12 months from today; `price` only on open nights |

Added by `widget.js`: `price_from`, `price_from_formatted`, `min_stay`, `min_stay_label`, `next_available`, `available_nights`, and `months`: `{label, month, year, weekdays: {label}[], weeks: {days: {day, date, label, state, available, booked, past, today, unknown, blank, price, price_formatted, min_stay}[]}[]}[]`. `state` is `available`, `booked`, `past`, `unknown` or `blank`, which works as a class name.

#### `GET /api/properties/:id/reviews`

| Field | Type | Notes |
| --- | --- | --- |
| `reviews` | `{id, rating, text, host_response, guest_name, date, platform}[]` | Newest 50; first names only |
| `rating_average` | number | Average of those reviews, out of 5 |
| `review_count` | number | All public reviews |

Added by `widget.js`: per review `stars` (`★★★★☆`), `date_formatted`, `guest_initial`, `platform_label`; and `rating_average_formatted`, `rating_stars`, `rating_percent`, `review_count_label`, `reviews_shown`.

#### `GET /api/properties/:id/guide`

`guide`: `{title, items: {title, body}[]}[]`, only for topics named in `PUBLIC_GUIDE_TOPICS`. An item written as `Name: text` is split into `title` and `body`.

#### `GET /api/host`

`host_name` (your company name if your Hospitable account is a business, otherwise your name) and `host_picture`. Added: `host_initial`.

#### `GET /api/properties`

`properties`: `{id, property_name, photo, city, country, max_guests, bedrooms, currency, price_from}[]`, listed properties only. Added per card: `price_from_formatted`, `guests_label`, `bedrooms_label`; and `property_count`.

Every response also has `mode` (`live` or `dummy`) and `updated_at`. Unknown and unlisted properties return 404.

`GET /api/properties/:id?include=calendar,reviews,guide,host` returns the property merged with those data sets in one response, and `updated_at` is the oldest of the merged sets. `widget.js` always asks for all four, so every widget of a property uses the same URL. If one set can't be loaded, the response still has the others, lists the failed ones in `missing` (for example `["reviews"]`) and isn't cached; `widget.js` shows the widgets that need a missing set from the visitor's last copy.

### Sample data

With `HOSPITABLE_PAT` set to exactly `dummy`, everything runs on [`src/fixtures/dummy.json`](src/fixtures/dummy.json). Hospitable is never called, the cron does nothing, and every response carries `X-Hosp-Mode: dummy`. `/demo` shows all 16 starters as one-line snippets; it also works in any online iframe tester.

The sample data has the same shape as Hospitable's API:

- Every response follows the response schemas of Hospitable's [OpenAPI spec](https://developer.hospitable.com), copied into [`test/fixtures/hospitable-openapi.json`](test/fixtures/hospitable-openapi.json). A test checks every sample response against them and fails on any field the spec doesn't list, any wrong type and any missing required field. `npm run openapi` refreshes the copy from Hospitable's published spec.
- Values come from the spec's own examples wherever they work in a widget: the "Relaxing Villa near the sea" (ID `550e8400-e29b-41d4-a716-446655440000`), its policies, fees and deposits, the Berlin address and Airbnb listing of the second property, the user (Johny Doe & Co), the review "Great place we will be back!" and the "Arrival information" topic. Photo URLs (the spec's don't load), `"string"` placeholders and dates are the only replaced values.
- Private fields (Wi-Fi, door codes, street addresses, private feedback, iCal links) hold `SECRET` values. The data goes through the same code as real data, and the tests check that none of these values comes out of any endpoint or reaches KV.

### Limits in detail

`widget.js`, its modules and the templates come from jsDelivr and don't count against the Worker. Cloudflare's CDN can't cache in front of a Worker, because a Worker always runs before the cache, so the browser cache (`Cache-Control: public, max-age` from `CACHE_MINUTES`) is what keeps requests down.

| Free plan limit | Value | What this kit uses |
| --- | --- | --- |
| Worker requests | 100,000 / day | One per property per visitor every 4 hours (`CACHE_MINUTES`), once a widget nears the screen; all widgets of that property share it, across pages |
| KV reads | 100,000 / day | Up to 7 per request when the 60-second memory cache is cold; under steady traffic most requests read none |
| KV writes | 1,000 / day | Only when data actually changed, plus one status write per hour |
| Subrequests | 50 per run | 1 list call, plus up to 4 calls per property (photos, calendar, reviews, guide) |
| Cron triggers | 5 per account | 1 |

With every widget type in use, about 10 properties fit in one hourly run. Beyond that, the cron works through the properties in rotating batches, and the builder's status says so. For 40 or more properties, use the Workers Paid plan and set `SUBREQUEST_BUDGET` to `900`. When the daily request limit is hit, Cloudflare answers with error 1027 until 00:00 UTC; `widget.js` treats that like an unreachable Worker.

### Development

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

#### Releasing widget.js

Set the same version in `package.json`, `VERSION` and the header of `widget/widget.js` (a test checks they match), run `npm run size`, and push a `v1.x.y` tag. The Release workflow then runs `scripts/warm.mjs`, which requests every file once so jsDelivr has minified and cached it before the first visitor asks, and purges `@1` so snippets move to the new release right away (otherwise jsDelivr takes up to a few hours). Modules and templates load from `@1.x.y`, so the tag must exist. A breaking change ships as `v2`, and existing snippets keep working.

## License

[MIT](LICENSE). Not affiliated with or endorsed by Hospitable.
