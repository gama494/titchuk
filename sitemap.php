<?php
header('Content-Type: application/xml');
echo '<?xml version="1.0" encoding="UTF-8"?>';
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
echo '<url><loc>https://titchuke.com/</loc><lastmod>' . date('Y-m-d') . '</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>';
