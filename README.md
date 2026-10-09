Glossier Product Scraper

A simple JavaScript scraper that uses Playwright to collect product data from the Glossier website.

Features

Collects products from the Glossier website;

Gets: product names, IDs, prices, images, URLs, and descriptions;

Uses HTML selectors to extract data;

Saves the results in a CSV file;


Requirements

Node.js;

npm;

Installation

npm install
npx playwright install chromium

How to Run

npm start

The results will be saved in products_final.csv.

CSV Data

The CSV file contains:

name – Product name

id – Product variant ID

url – Product link

image – Image link

price – Price in EUR

description – Product description

descriptionSource – Where the description came from

scrapedAt – Date and time of scraping

Notes

Product prices and availability may change.

Some descriptions are taken from page metadata.

The scraper may need updates if the website changes.

IDs are variant IDs, not Shopify product IDs.

AI usage

Used for the code optimization suggestions, additionaly used for the CSV and ID handling issues.