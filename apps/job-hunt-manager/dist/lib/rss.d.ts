export type RssItem = {
    title: string;
    link: string;
    pubDate: string | null;
    description: string;
};
export declare function parseRssItems(xml: string): RssItem[];
export declare function fetchRssFeed(url: string, timeoutMs?: number): Promise<RssItem[]>;
