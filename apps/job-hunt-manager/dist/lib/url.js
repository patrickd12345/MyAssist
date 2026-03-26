export function normalizeUrl(url) {
    try {
        const u = new URL(url);
        u.hash = "";
        let path = u.pathname.replace(/\/+$/, "");
        if (!path)
            path = "";
        return `${u.hostname.toLowerCase()}${path}${u.search}`;
    }
    catch {
        return url.toLowerCase().trim();
    }
}
