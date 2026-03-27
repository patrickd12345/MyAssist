function tokenize(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9+.#/]+/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}
export function rankJobs(jobs, keywordQuery, trackKeywords) {
    const qTokens = new Set([...tokenize(keywordQuery), ...trackKeywords.flatMap(tokenize)]);
    const scored = jobs.map((j) => {
        const hay = `${j.title} ${j.company} ${j.description} ${j.tags.join(" ")}`;
        const hTokens = tokenize(hay);
        let hits = 0;
        for (const t of hTokens) {
            if (qTokens.has(t))
                hits += 2;
        }
        for (const q of qTokens) {
            if (q.length >= 4 && hay.includes(q))
                hits += 1;
        }
        const seniorBoost = /\b(senior|staff|principal|lead|director)\b/i.test(j.title) ? 8 : 0;
        const recencyBoost = j.posted_date ? 2 : 0;
        const score = hits + seniorBoost + recencyBoost;
        return { ...j, _score: score };
    });
    return scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0));
}
