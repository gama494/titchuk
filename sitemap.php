<?php
header('Content-Type: application/xml');
echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
echo '<url><loc>https://titchuke.com/</loc><lastmod>' . date('Y-m-d') . '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>';

// Replace with your song data (e.g., from database or array)
$songs = [
    ['title' => 'SI INE', 'artist' => 'JAY FRO2'],
    // Add more songs
];
foreach ($songs as $song) {
    $url = urlencode("title={$song['title']}&artist={$song['artist']}");
    echo "<url><loc>https://titchuke.com/download.html?{$url}</loc><lastmod>2025-10-05</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>";
}
echo '</urlset>';
?>
