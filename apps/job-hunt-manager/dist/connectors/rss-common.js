import { fetchRssFeed } from "../lib/rss.js";
function splitEnvList(v) {
    if (!v?.trim())
        return [];
    return v
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
export function rssUrlsFor(sourceEnvKey) {
    return splitEnvList(process.env[sourceEnvKey]);
}
export async function jobsFromRssUrls(urls, source, delayMs) {
    const out = [];
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (i > 0 && delayMs > 0) {
            await new Promise((r) => setTimeout(r, delayMs));
        }
        try {
            const items = await fetchRssFeed(url);
            for (const it of items) {
                out.push(rssItemToRaw(it, source));
            }
        }
        catch {
            /* skip failed feed */
        }
    }
    return out;
}
function rssItemToRaw(item, source) {
    const { company, title } = guessCompanyTitle(item.title);
    return {
        title,
        company,
        location: "",
        remote: /\bremote\b/i.test(`${item.title} ${item.description}`),
        type: "unknown",
        source,
        url: item.link || "",
        posted_date: item.pubDate,
        salary: null,
        description: item.description.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
        tags: [],
    };
}
function guessCompanyTitle(rawTitle) {
    const t = rawTitle.trim();
    const at = /\s+at\s+/i.exec(t);
    if (at && at.index !== undefined) {
        return {
            title: t.slice(0, at.index).trim(),
            company: t.slice(at.index + at[0].length).trim() || "Unknown",
        };
    }
    const dash = t.match(/\s[-\u2013]\s/);
    if (dash && dash.index !== undefined) {
        return {
            title: t.slice(0, dash.index).trim(),
            company: t.slice(dash.index + dash[0].length).trim() || "Unknown",
        };
    }
    return { title: t, company: "Unknown" };
}
