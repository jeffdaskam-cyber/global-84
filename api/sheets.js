// Vercel serverless function that proxies the Google Sheets CSV fetch.
// This avoids CORS issues when the Google Sheet is in an organization
// (e.g. Google Workspace) that restricts direct browser access.

export default async function handler(req, res) {
  const url = process.env.VITE_EXPLORE_SHEET_URL;

  if (!url) {
    return res.status(500).json({ error: "VITE_EXPLORE_SHEET_URL not configured." });
  }

  try {
    const response = await fetch(url, { redirect: "follow" });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Google Sheets returned HTTP ${response.status}` });
    }

    const csv = await response.text();

    // Check if Google returned an HTML login page instead of CSV
    if (csv.trimStart().startsWith("<!") || csv.trimStart().startsWith("<html")) {
      return res.status(403).json({
        error: "Google returned a login page. The sheet may not be published or shared publicly.",
      });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store");
    return res.status(200).send(csv);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
