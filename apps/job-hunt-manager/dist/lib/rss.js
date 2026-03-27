function decodeXmlEntities(s) {
    return s
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1");
}
function extractTag(block, tag) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const m = block.match(re);
    if (!m)
        return null;
    return decodeXmlEntities(m[1].trim());
}
export function parseRssItems(xml) {
    const items = [];
    const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
        const block = m[1];
        const title = extractTag(block, "title") ?? "";
        const link = extractTag(block, "link") ??
            extractTag(block, "guid") ??
            "";
        const pubDate = extractTag(block, "pubDate") ?? extractTag(block, "updated");
        const description = extractTag(block, "description") ??
            extractTag(block, "summary") ??
            "";
        if (title || link) {
            items.push({
                title,
                link,
                pubDate: pubDate ? pubDate.trim() : null,
                description,
            });
        }
    }
    return items;
}
export async function fetchRssFeed(url, timeoutMs = 15000) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                Accept: "application/rss+xml, application/xml, text/xml, */*",
                "User-Agent": "MyAssist-JobHuntManager/0.1 (local; respectful fetch)",
            },
        });
        if (!res.ok) {
            throw new Error(`RSS ${res.status} for ${url}`);
        }
        const xml = await res.text();
        return parseRssItems(xml);
    }
    finally {
        clearTimeout(t);
    }
}
