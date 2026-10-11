# Glossier Product Scraper

A simple JavaScript scraper that uses Playwright to collect product data from the Glossier website.

## Features

- Collects products from the Glossier website.
- Gets product names, variant IDs, prices, images, URLs, and descriptions.
- Uses HTML selectors to extract product information.
- Collects all available product variants as separate CSV rows.
- Scrapes products from both Lithuania (EUR) and the United States (USD).
- Saves the results in separate CSV files.
- Avoids saving incomplete results when scraping fails.

## Requirements

- Node.js
- npm

## Installation

```bash
npm install
npx playwright install chromium
```

## How to Run

```bash
npm start
```

The scraper collects Lithuanian products first, then US products.

The results are saved in:

- `products_lt.csv` – Lithuanian storefront, prices in EUR.
- `products_us.csv` – US storefront, prices in USD.

The US scraper uses a saved browser profile (`glossier-us-profile`) to remember the selected country.

## CSV Data

Both CSV files contain the following columns:

- name – Product name, including variant information where applicable.
- id – Unique Shopify product variant ID.
- url – Product link, including the variant ID.
- images – List of product image URLs.
- price – Product variant price in EUR or USD, depending on the storefront.
- description – Product description extracted from the product page or metadata.
- scraped_at – Date and time of scraping in ISO 8601 format.

## Notes

- Product prices and availability may change.
- Some descriptions are taken from page metadata.
- Each product variant is saved as a separate row, so the number of CSV rows is higher than the number of products.
- If Shopify returns a zero price, the scraper uses the price displayed on the collection page.
- Bundle prices may vary depending on the selected configuration.
- The scraper may need updates if the website structure changes.
- IDs are Shopify variant IDs, not Shopify product IDs.

## AI Usage

AI was used for code optimization suggestions, implementing product variant extraction and US storefront scraping, and resolving CSV formatting, product ID, and price-handling issues.