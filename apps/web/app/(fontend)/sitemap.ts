/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * sitemap.ts
 * Copyright (C) 2025 Nextify Limited
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */

/**
 * Sitemap Generator for Libra Website
 *
 * This module generates a unified sitemap for the E2B website by aggregating sitemaps
 * from multiple sources including the main landing page, blog, documentation, and Framer sites.
 * It handles fetching, parsing, deduplication, and proper URL formatting to ensure all content
 * is discoverable by search engines.
 */

import type { MetadataRoute } from 'next'
import { XMLParser } from 'fast-xml-parser'
import { siteConfig } from '@/configs/site'

// Cache the sitemap for 15 minutes (in seconds)
const SITEMAP_CACHE_TIME = 15 * 60

/**
 * Valid change frequency values for sitemap entries
 * @see https://www.sitemaps.org/protocol.html
 */
type ChangeFrequency =
    | 'always'
    | 'hourly'
    | 'daily'
    | 'weekly'
    | 'monthly'
    | 'yearly'
    | 'never'

/**
 * Configuration for a site whose sitemap should be included
 */
type Site = {
    sitemapUrl: string // URL to the site's sitemap.xml
    lastModified?: string | Date // Default last modified date for entries
    changeFrequency?: ChangeFrequency // Default change frequency for entries
    priority?: number // Default priority for entries (0.0 to 1.0)
    baseUrl?: string // Base URL to use for final sitemap entries
}

/**
 * List of sites to include in the unified sitemap
 * Each site has its own sitemap.xml that will be fetched and processed
 */
const sites: Site[] = [
    {
        sitemapUrl: `${siteConfig.url}/sitemap.xml`,
        priority: 1.0,
        changeFrequency: 'weekly',
        baseUrl: siteConfig.url,
    },
    {
        sitemapUrl: `${siteConfig.url}/docs/sitemap.xml`,
        priority: 0.9,
        changeFrequency: 'weekly',
        baseUrl: siteConfig.url,
    },
]

/**
 * Structure of a single URL entry in a sitemap
 */
type SitemapData = {
    loc: string // URL location
    lastmod?: string | Date // Last modified date
    changefreq?: ChangeFrequency // Change frequency
    priority?: number // Priority (0.0 to 1.0)
}

/**
 * Structure of a sitemap XML document
 */
type Sitemap = {
    urlset: {
        url: SitemapData | SitemapData[] // Single URL or array of URLs
    }
}

/**
 * Fetches and parses a sitemap XML file from a given URL
 *
 * @param url The URL of the sitemap.xml file to fetch
 * @returns Parsed sitemap data or empty sitemap on error
 */
async function getXmlData(url: string): Promise<Sitemap> {
    const parser = new XMLParser()

    try {
        const response = await fetch(url, {
            next: { revalidate: SITEMAP_CACHE_TIME },
            headers: {
                Accept: 'application/xml',
            },
        })

        if (!response.ok) {
            return { urlset: { url: [] } }
        }

        const text = await response.text()
        return parser.parse(text) as Sitemap
    } catch (error) {
        return { urlset: { url: [] } }
    }
}

/**
 * Processes a site's sitemap and converts it to Next.js sitemap format
 * Applies path preprocessing based on ROUTE_REWRITE_CONFIG.
 *
 * @param site The site configuration to process
 * @returns Array of sitemap entries in Next.js format
 */
async function getSitemap(site: Site): Promise<MetadataRoute.Sitemap> {
    const data = await getXmlData(site.sitemapUrl)

    if (!data || !site.baseUrl) {
        // Ensure baseUrl is defined, as it's crucial for constructing final URLs
        return []
    }

    /**
     * Processes a single URL entry from the sitemap
     */
    const processUrl = (
        line: SitemapData
    ): MetadataRoute.Sitemap[number] | null => {
        try {
            // Construct the final URL based on the path and baseUrl
            const urlObj = new URL(line.loc)
            const finalUrl = new URL(urlObj.pathname, site.baseUrl).toString()

            return {
                url: finalUrl,
                priority: line?.priority ?? site.priority, // Use nullish coalescing for defaults
                changeFrequency: line?.changefreq ?? site.changeFrequency, // Use nullish coalescing
                lastModified: line?.lastmod ?? site.lastModified, // Use nullish coalescing
            }
        } catch (error) {
            return null // Return null if URL processing fails
        }
    }

    // Handle both array and single-item sitemaps
    if (!data.urlset?.url) {
        return []
    }

    if (Array.isArray(data.urlset.url)) {
        // Filter out any potential null results from processUrl if errors occurred
        return data.urlset.url
            .map(processUrl)
            .filter((entry) => entry !== null) as MetadataRoute.Sitemap
    }
    if (typeof data.urlset.url === 'object' && data.urlset.url !== null) {
        const entry = processUrl(data.urlset.url)
        return entry ? [entry] : [] // Return array with the entry or empty array if null
    }
    // If structure is unexpected, return empty
    return []
}

/**
 * Main sitemap generation function that Next.js calls
 *
 * Fetches and merges sitemaps from all configured sites,
 * deduplicates entries, and returns a sorted list of URLs
 *
 * @returns Complete sitemap for the E2B website
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {

    let mergedSitemap: MetadataRoute.Sitemap = []

    // Fetch sitemaps from all configured sites (Webflow & Framer sites + docs)
    for (const site of sites) {
        const urls = await getSitemap(site)
        mergedSitemap = mergedSitemap.concat(urls)
    }

    // Deduplicate URLs, keeping the one with the highest priority
    const urlMap = new Map<string, MetadataRoute.Sitemap[number]>()
    for (const entry of mergedSitemap) {
        const existingEntry = urlMap.get(entry.url)
        // Keep the entry with the highest priority (lower number means higher priority in sitemaps typically, but the code uses higher number = higher priority)
        // Ensure priority is treated as a number, defaulting to 0 if undefined
        const currentPriority = entry.priority ?? 0
        const existingPriority = existingEntry?.priority ?? 0

        if (!existingEntry || currentPriority > existingPriority) {
            urlMap.set(entry.url, entry)
        }
    }

    // Convert the map values back to an array
    const uniqueSitemap = Array.from(urlMap.values())

    // Sort all unique URLs alphabetically
    return uniqueSitemap.sort((a, b) => a.url.localeCompare(b.url))
}
