#!/bin/bash
#############                                                                                            
# DESCRIPTION
#############
# Automatically generates a sitemap at the given file location. 
# 
# Note that this function will map out your site using the specified location as the root of its mapping crawl. If you define a sitemap location in a subdirectory of your website, it will only map subfolders of that location.
#
#############
# Usage:
# build_sitemap /path/to/sitemap.xml

build_sitemap() (

# Switch to sitemap directory
touch $1
sitemap=$(basename $1)
cd $(dirname $1)

# Wipe out the existing sitemap, if there is one, and declare our new sitemap
echo '<?xml version="1.0" encoding="UTF-8"?>' > $sitemap
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' >> $sitemap

# List every directory in our sitemap (except config). This makes up our sitemap since Arise is built to use directory roots as page URLs
find . -type d -not \( -path ./config -prune \) | while read fname; do
        
        # Rewrite the local path from the find command as the live web URL as the <loc> tag for the sitemap standard
        echo -e '<url>\n<loc>'"$base_url"'/'"$(echo $fname | sed -n -e 's|\.\/||p')"'</loc>' >> $sitemap
        
        # If this page contains a Arise-style index page with a date modified, include that as a <lastmod> for the sitemap standard
        modified_date=''
        get_page_metadata $fname/index.md
        if [ -n "$modified_date" ]; then
                echo '<lastmod>'"$modified_date"'</lastmod>' >> $sitemap
        fi
        clear_metadata

        # Close the <url> tag for the current URL being looped through
        echo '</url>' >> $sitemap
done

# Close up the sitemap
echo '</urlset>' >> $sitemap
)
