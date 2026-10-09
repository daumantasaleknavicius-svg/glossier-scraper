// Access the Glossier website using Chromium through Playwright
const { chromium } = require("playwright");
const fs = require("fs");

const csv = value => `"${String(value ?? "").replace(/"/g, '""')}"`;

async function main() {
    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext({
            locale: "lt-LT",
            timezoneId: "Europe/Vilnius",
            extraHTTPHeaders: {
                "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8"
            }
        });

        const page = await context.newPage();

        await page.goto("https://www.glossier.com/en-lt/collections/all", {
            waitUntil: "domcontentloaded",
            timeout: 45000
        });
// Scroll through the page to load all products
        const cards = page.locator(".pi.js-product-item");
        await cards.first().waitFor();
        await page.waitForTimeout(3000);

        let previousCount = 0;

        for (let i = 0; i < 20; i++) {
            const count = await cards.count();

            for (let j = 0; j < count; j++) {
                await cards.nth(j).scrollIntoViewIfNeeded();
                await page.waitForTimeout(100);
            }

            await page.evaluate(() =>
                window.scrollTo(0, document.body.scrollHeight)
            );

            await page.waitForTimeout(1500);

            const currentCount = await cards.count();

            if (currentCount === previousCount && currentCount === count) break;
            previousCount = currentCount;
        }
// Extract product information from the collection page
        const products = await page.evaluate(() =>
            [...document.querySelectorAll(".pi.js-product-item")].map(card => {
                const image = card.querySelector("img");

                return {
                    name: card.querySelector(".js-product-title")?.textContent.trim() || "",
                    url: card.querySelector("a.js-product-item-link")?.href || "",
                    image: image?.getAttribute("src")?.replace("{width}", "800")
                        || image?.getAttribute("srcset")?.split(",")[0].trim().split(/\s+/)[0]
                        || "",
                    price: card.querySelector(".pi__price--current")
                        ?.textContent.replace("Sale price", "").trim() || "",
                    id: "",
                    description: "",
                    descriptionSource: "missing",
                    scrapedAt: new Date().toISOString()
                };
            })
        );

        console.log("Products found:", products.length);

        const invalidPrices = products.filter(product => !product.price.includes("€"));

        if (invalidPrices.length) {
            console.log("\nProducts with invalid prices:");

            for (const product of invalidPrices) {
                console.log(product.name, product.price, product.url);
            }

            console.log("CSV was not created.");
            return;
        }

        const detailPage = await context.newPage();
// Visit each product page to collect descriptions and variant IDs
        for (const [index, product] of products.entries()) {
            if (!product.url) continue;

            const url = new URL(product.url);
            product.id = url.searchParams.get("variant") || "";

            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await detailPage.goto(product.url, {
                        waitUntil: "domcontentloaded",
                        timeout: 30000
                    });

                    await detailPage.waitForTimeout(1500);

                    const result = await detailPage.evaluate(() => {
                        const clean = text =>
                            (text || "").replace(/\s+/g, " ").trim();

                        const htmlDescription = clean(document.querySelector(
                            ".pv-details__info-item:not(.pv-details__tagline)"
                        )?.innerText);

                        const metaDescription = clean(document.querySelector(
                            'meta[name="description"]'
                        )?.content);

                        const variantId =
                            document.querySelector('[name="id"]')?.value ||
                            document.querySelector('[data-variant-id]')?.getAttribute("data-variant-id") ||
                            "";

                        return {
                            description: htmlDescription || metaDescription,
                            source: htmlDescription ? "html" : metaDescription ? "meta" : "missing",
                            variantId
                        };
                    });

                    if (!product.id) product.id = result.variantId;

                    product.description = result.description;
                    product.descriptionSource = result.source;

                    if (product.description && product.id) break;
                } catch (error) {
                    console.log(`${product.name}: ${error.message.split("\n")[0]}`);
                }

                await detailPage.waitForTimeout(1500);
            }

            console.log(
                `${index + 1}/${products.length}: ${product.name} | ID: ${product.id || "NOT FOUND"} | ${product.descriptionSource}`
            );
// Check for missing or duplicate IDs
            await detailPage.waitForTimeout(400);
        }

        const ids = products.map(product => product.id);
        const seen = new Set();
        const duplicates = [];

        for (const product of products) {
            if (seen.has(product.id)) duplicates.push(product);
            seen.add(product.id);
        }

        if (products.some(product => !product.id) || duplicates.length) {
            console.log("\nID issues:");

            products.filter(product => !product.id).forEach(product =>
                console.log("Missing ID:", product.name, product.url)
            );

            duplicates.forEach(product =>
                console.log("Duplicate ID:", product.name, product.id)
            );

            console.log("CSV was not created.");
            return;
        }
// Save the collected data to a CSV file
        const headers = [
            "name", "id", "url", "image", "price",
            "description", "descriptionSource", "scrapedAt"
        ];

        const lines = [
            headers.join(","),
            ...products.map(product =>
                headers.map(header => csv(product[header])).join(",")
            )
        ];

        fs.writeFileSync(
            "products_final.csv",
            "\uFEFF" + lines.join("\r\n"),
            "utf8"
        );

        console.log("\nRESULTS");
        console.log("Products:", products.length);
        console.log("Unique IDs:", new Set(ids).size);
        console.log("Prices in EUR:", products.filter(product => product.price.includes("€")).length);
        console.log("HTML descriptions:", products.filter(product => product.descriptionSource === "html").length);
        console.log("Meta descriptions:", products.filter(product => product.descriptionSource === "meta").length);
        console.log("Missing descriptions:", products.filter(product => !product.description).length);
        console.log("File created: products_final.csv");
    } finally {
        await browser.close();
    }
}

main().catch(console.error);
