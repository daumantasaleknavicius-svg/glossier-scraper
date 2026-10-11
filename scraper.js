
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = "https://www.glossier.com";
const csv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
const clean = s => String(s ?? "").replace(/\s+/g, " ").trim();

async function scrape(context, market, url) {
    const page = await context.newPage();

    try {
        await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000
        });

        const cards = page.locator(".pi.js-product-item");
        await cards.first().waitFor({ timeout: 30000 });
        await page.waitForTimeout(3000);

        // Original working scrolling method
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

            if (currentCount === previousCount &&
                currentCount === count) break;

            previousCount = currentCount;
        }

        // Allow additional products to load
        for (let i = 0; i < 10 && await cards.count() < 97; i++) {
            await page.evaluate(() =>
                window.scrollTo(0, document.body.scrollHeight)
            );
            await page.waitForTimeout(1500);
        }

        // Extract collection products
        const products = await page.evaluate(() =>
            [...document.querySelectorAll(".pi.js-product-item")].map(card => {
                const image = card.querySelector("img");
                const imageUrl = image?.currentSrc || image?.src || "";

                return {
                    name: card.querySelector(".js-product-title")
                        ?.textContent.trim() || "",
                    url: card.querySelector("a.js-product-item-link")
                        ?.href || "",
                    images: imageUrl
                        ? [new URL(imageUrl, document.baseURI).origin +
                           new URL(imageUrl, document.baseURI).pathname]
                        : [],
                    price: card.querySelector(".pi__price--current")
                        ?.textContent.replace("Sale price", "").trim() || ""
                };
            }).filter(p => p.url)
        );

        const unique = [...new Map(products.map(p => [
            new URL(p.url).pathname.split("/products/")[1] || p.url,
            p
        ])).values()];

        console.log(
            `${market.toUpperCase()}: ${products.length} cards, ` +
            `${unique.length} products`
        );

        // Don't overwrite a good CSV with incomplete data
        if (unique.length < 90) {
            console.log("Too few products. Existing CSV preserved.");
            return;
        }

        const symbol = market === "lt" ? "€" : "$";

        if (!unique[0].price.includes(symbol)) {
            console.log("Wrong currency. Existing CSV preserved.");
            return;
        }

        const detailPage = await context.newPage();
        const rows = [];
        let failed = 0;

        for (const [index, product] of unique.entries()) {
            const productUrl = new URL(product.url);
            productUrl.search = "";

            let data;

            // Stretch Task 4: retrieve all product variants
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const response = await context.request.get(
                        `${productUrl.href}.js`,
                        { timeout: 25000 }
                    );

                    if (!response.ok()) {
                        throw Error("Product unavailable");
                    }

                    data = await response.json();

                    if (!data.variants?.length) {
                        throw Error("No variants");
                    }

                    break;
                } catch {
                    await page.waitForTimeout(1000);
                }
            }

            if (!data) {
                failed++;
                console.log(`Failed: ${product.name}`);
                continue;
            }

            // Original product-page description extraction
            let description = "";

            try {
                await detailPage.goto(productUrl.href, {
                    waitUntil: "domcontentloaded",
                    timeout: 30000
                });

                await detailPage.waitForTimeout(1000);

                description = await detailPage.evaluate(() => {
                    const clean = s =>
                        (s || "").replace(/\s+/g, " ").trim();

                    return clean(document.querySelector(
                        ".pv-details__info-item:not(.pv-details__tagline)"
                    )?.innerText) ||
                    clean(document.querySelector(
                        'meta[name="description"]'
                    )?.content);
                });
            } catch {
                description = clean(
                    (data.description || "").replace(/<[^>]*>/g, " ")
                );
            }

            const timestamp = new Date().toISOString();

            for (const variant of data.variants) {
                if (!variant.id || variant.price == null) continue;

                const title = clean(
                    variant.public_title || variant.title
                );

                const variantName =
                    title.toLowerCase() === "default title"
                        ? "" : title;

                const images = [
                    variant.featured_image,
                    ...product.images,
                    ...(data.images || [])
                ].map(image => {
                    try {
                        const src = typeof image === "string"
                            ? image : image?.src;

                        if (!src) return "";

                        const u = new URL(src, BASE);
                        return u.origin + u.pathname;
                    } catch {
                        return "";
                    }
                }).filter(Boolean);

                const variantUrl = new URL(productUrl.href);
                variantUrl.searchParams.set("variant", variant.id);

                // Use collection price if Shopify reports zero
                const price = Number(variant.price) > 0
                    ? new Intl.NumberFormat(
                        market === "lt" ? "lt-LT" : "en-US",
                        {
                            style: "currency",
                            currency: market === "lt" ? "EUR" : "USD"
                        }
                    ).format(Number(variant.price) / 100)
                    : product.price;

                rows.push({
                    name: variantName
                        ? `${data.title} - ${variantName}`
                        : data.title,
                    id: String(variant.id),
                    url: variantUrl.href,
                    images: [...new Set(images)],
                    price,
                    description,
                    scraped_at: timestamp
                });
            }

            console.log(`${index + 1}/${unique.length}: ${product.name}`);
        }

        await detailPage.close();

        const finalRows = [...new Map(
            rows.map(row => [row.id, row])
        ).values()];

        if (failed || finalRows.length < unique.length) {
            console.log(
                `${failed} products failed. Existing CSV preserved.`
            );
            return;
        }

        const headers = [
            "name", "id", "url", "images",
            "price", "description", "scraped_at"
        ];

        fs.writeFileSync(`products_${market}.csv`, "\uFEFF" + [
            headers.join(","),
            ...finalRows.map(p => headers.map(h =>
                csv(h === "images"
                    ? JSON.stringify(p.images)
                    : p[h])
            ).join(","))
        ].join("\r\n"), "utf8");

        console.log(
            `${market.toUpperCase()}: ${finalRows.length} variants saved`
        );
        console.log(
            "Zero prices:",
            finalRows.filter(p =>
                /(?:€\s*0[,.]00|0[,.]00\s*€|\$\s*0[,.]00)/.test(p.price)
            ).length
        );
    } finally {
        await page.close();
    }
}

async function main() {
    // Lithuania: original working browser configuration
    const browser = await chromium.launch({ headless: true });

    try {
        const lt = await browser.newContext({
            locale: "lt-LT",
            timezoneId: "Europe/Vilnius",
            extraHTTPHeaders: {
                "Accept-Language": "lt-LT,lt;q=0.9,en;q=0.8"
            }
        });

        try {
            await scrape(
                lt,
                "lt",
                `${BASE}/en-lt/collections/all`
            );
        } finally {
            await lt.close();
        }
    } finally {
        await browser.close();
    }

    // US: reuse saved browser profile and country selection
    const us = await chromium.launchPersistentContext(
        "./glossier-us-profile",
        {
            headless: false,
            locale: "en-US",
            timezoneId: "America/New_York"
        }
    );

    try {
        await scrape(
            us,
            "us",
            `${BASE}/collections/all`
        );
    } finally {
        await us.close();
    }
}

main().catch(error => console.log(error.message));
